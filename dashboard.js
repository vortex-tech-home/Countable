let currentShopId = null;
let isAdmin = false;
const DATE_STORAGE_KEY = 'daybook-active-date';

/* ---------- Date persistence across tabs ---------- */
function getLocalDateString(d = new Date()) {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().split('T')[0];
}

function initActiveDate() {
    const saved = localStorage.getItem(DATE_STORAGE_KEY);
    const today = getLocalDateString();
    const dateInput = document.getElementById('active-date');
    dateInput.value = (saved && saved <= today) ? saved : today;
}

function onDateChanged() {
    const val = document.getElementById('active-date').value;
    if (val) localStorage.setItem(DATE_STORAGE_KEY, val);
    loadDashboardData();
}

window.addEventListener('storage', (e) => {
    if (e.key === DATE_STORAGE_KEY && e.newValue) {
        const input = document.getElementById('active-date');
        if (input.value !== e.newValue) {
            input.value = e.newValue;
            loadDashboardData();
        }
    }
});

/* ---------- Initialization ---------- */
window.onload = async () => {
    initActiveDate();
    
    try {
        const { data: userData } = await supabaseClient.auth.getUser();
        if (userData && userData.user) {
            const { data: profile } = await supabaseClient.from('user_profiles').select('role, shop_id').eq('id', userData.user.id).single();
            if (profile) {
                currentShopId = profile.shop_id;
                isAdmin = (profile.role === 'admin');
                
                if (isAdmin) {
                    document.getElementById('edit-col-header').classList.remove('d-none');
                    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('d-none'));
                }

                await loadDropdowns(currentShopId);
                await loadDashboardData();
            }
        }
    } catch (err) {
        console.error("Dashboard Init Error:", err);
    }
};

/* ---------- UI Helpers ---------- */
function toggleExpenseFields() {
    const cat = document.getElementById('expense-category').value;
    document.getElementById('vendor-group').classList.add('d-none');
    document.getElementById('staff-group').classList.add('d-none');
    document.getElementById('finance-group').classList.add('d-none');
    
    if (cat === 'vendor') document.getElementById('vendor-group').classList.remove('d-none');
    if (cat === 'staff') document.getElementById('staff-group').classList.remove('d-none');
    if (cat === 'finance') document.getElementById('finance-group').classList.remove('d-none');
}

async function loadDropdowns(shopId) {
    const { data: vendors } = await supabaseClient.from('vendors').select('id, name').eq('shop_id', shopId).or('account_type.eq.vendor,account_type.is.null');
    const vSelect = document.getElementById('vendor-select');
    vSelect.innerHTML = '<option value="" selected disabled>Choose Vendor...</option>';
    if (vendors) vendors.forEach(v => vSelect.innerHTML += `<option value="${v.id}">${v.name}</option>`);

    const { data: staff } = await supabaseClient.from('staff').select('id, name').eq('shop_id', shopId);
    const sSelect = document.getElementById('staff-select');
    sSelect.innerHTML = '<option value="" selected disabled>Choose Staff...</option>';
    if (staff) staff.forEach(s => sSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`);

    const { data: finances } = await supabaseClient.from('vendors').select('id, name').eq('shop_id', shopId).eq('account_type', 'finance');
    const fSelect = document.getElementById('finance-select');
    fSelect.innerHTML = '<option value="" selected disabled>Choose Finance / Account...</option>';
    if (finances) finances.forEach(f => fSelect.innerHTML += `<option value="${f.id}">${f.name}</option>`);
}

function getLocalDayBounds(dateString) {
    const start = new Date(`${dateString}T00:00:00`).toISOString();
    const end = new Date(`${dateString}T23:59:59.999`).toISOString();
    return { start, end };
}

/* ---------- Smooth Numeric Animations ---------- */
function animateMetric(id, newValue) {
    const el = document.getElementById(id);
    const from = parseFloat(el.dataset.val || 0);
    const to = parseFloat(newValue) || 0;
    el.dataset.val = to;
    if (from === to) { el.innerText = to.toFixed(2); return; }

    const duration = 400;
    const startTime = performance.now();
    function tick(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.innerText = (from + (to - from) * eased).toFixed(2);
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

/* ---------- Core Data Engine ---------- */
async function loadDashboardData() {
    if (!currentShopId) return;
    const selectedDate = document.getElementById('active-date').value;
    if (!selectedDate) return;

    // Show loading text
    document.getElementById('txn-body').innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}" class="text-center py-4 text-muted fin-math fw-semibold">Fetching ledger...</td></tr>`;

    const { start, end } = getLocalDayBounds(selectedDate);

    // Fetch unified vault balance
    const { data: shopData } = await supabaseClient.from('shops').select('master_ledger_balance').eq('id', currentShopId).single();
    animateMetric('display-vault', parseFloat(shopData?.master_ledger_balance || 0));

    // Fetch day's transactions
    const { data: txns, error } = await supabaseClient.from('daily_transactions')
        .select(`*, vendors ( name ), staff ( name )`)
        .eq('shop_id', currentShopId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true }); 
    
    if (error) return console.error("Fetch Error:", error);

    let cashSales = 0, upiSales = 0, totalExpense = 0, drawerCash = 0;
    let runningCashBalance = 0;
    const processedTxns = [];

    if (txns && txns.length > 0) {
        txns.forEach(txn => {
            const amt = parseFloat(txn.amount);
            const isLegacySweep = txn.reference_note && txn.reference_note.includes('Transferred to Master Vault');

            // Calculate aggregations
            if (txn.transaction_type === 'INCOME') {
                if (txn.payment_method === 'CASH') cashSales += amt;
                else upiSales += amt;
            }
            if (txn.transaction_type === 'EXPENSE' && !isLegacySweep) totalExpense += amt;

            // Physical Drawer Logic
            if (txn.payment_method === 'CASH') {
                if (txn.transaction_type === 'INCOME') { drawerCash += amt; runningCashBalance += amt; }
                if (txn.transaction_type === 'EXPENSE') { drawerCash -= amt; runningCashBalance -= amt; }
            }

            // Clean up classification names
            let mainGroup = (txn.category || 'OTHER').toUpperCase();
            let partyName = txn.reference_note || '-';
            
            if (txn.category === 'vendor' && txn.vendors) { mainGroup = 'VENDOR PAYOUT'; partyName = txn.vendors.name; }
            else if (txn.category === 'finance' && txn.vendors) { mainGroup = 'FINANCE / EMI'; partyName = txn.vendors.name; }
            else if (txn.category === 'staff' && txn.staff) { mainGroup = 'STAFF WAGE'; partyName = txn.staff.name; }
            
            let refNote = txn.reference_note ? `<div class="text-muted" style="font-size: 0.7rem; margin-top: 2px;">Ref: ${txn.reference_note}</div>` : '';
            if (partyName === txn.reference_note) refNote = '';

            // HIDE LEGACY SWEEPS FROM THE UI
            if (!isLegacySweep) {
                processedTxns.push({
                    ...txn,
                    amt: amt,
                    mainGroup: mainGroup,
                    partyName: partyName,
                    refNote: refNote,
                    currentBalance: runningCashBalance
                });
            }
        });
    }

    // Render Table
    processedTxns.reverse(); // Newest first
    const tbody = document.getElementById('txn-body');
    tbody.innerHTML = '';

    if (processedTxns.length > 0) {
        processedTxns.forEach(txn => {
            const timeStr = new Date(txn.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const isIncome = txn.transaction_type === 'INCOME';
            
            const creditHtml = isIncome ? `₹ ${txn.amt.toFixed(2)}` : '-';
            const debitHtml = !isIncome ? `₹ ${txn.amt.toFixed(2)}` : '-';
            
            const badgeHtml = txn.payment_method === 'UPI' 
                ? `<span class="badge-mode bg-light text-secondary">UPI</span>` 
                : `<span class="badge-mode bg-light text-dark">CASH</span>`;

            let adminEditBtn = isAdmin ? `
                <td data-label="Action" class="text-center admin-only align-middle">
                    <div class="d-flex justify-content-end justify-content-md-center gap-2">
                        <button class="action-btn" onclick="editTransaction('${txn.id}', ${txn.amt})">Edit</button>
                        <button class="action-btn danger" onclick="deleteTransaction('${txn.id}')">Del</button>
                    </div>
                </td>
            ` : '';
            
            tbody.innerHTML += `
                <tr>
                    <td data-label="Time" class="mobile-hide text-muted fin-math small">${timeStr}</td>
                    <td data-label="Details">
                        <div class="tx-group small">${txn.mainGroup}</div>
                        <div class="tx-party">${txn.partyName}</div>
                        ${txn.refNote}
                    </td>
                    <td data-label="Mode" class="text-end text-md-center">${badgeHtml}</td>
                    <td data-label="Credit" class="text-end fw-bold text-success fin-math">${creditHtml}</td>
                    <td data-label="Debit" class="text-end fw-bold text-danger fin-math">${debitHtml}</td>
                    <td data-label="Drawer Bal" class="text-end mobile-hide fw-bold fin-math">
                        ${txn.payment_method === 'CASH' ? '₹ ' + txn.currentBalance.toFixed(2) : '<span class="text-muted fw-normal small" style="letter-spacing: 0;">N/A</span>'}
                    </td>
                    ${adminEditBtn}
                </tr>
            `;
        });
    } else {
        const colSpanCount = isAdmin ? 7 : 6;
        tbody.innerHTML = `<tr><td colspan="${colSpanCount}" class="text-center py-4 text-muted fin-math fw-semibold">No transactions found for this date.</td></tr>`;
    }

    animateMetric('display-sales-cash', cashSales);
    animateMetric('display-sales-upi', upiSales);
    animateMetric('display-expense', totalExpense);
    animateMetric('display-drawer', drawerCash);
}

/* ---------- Transaction Submissions ---------- */
function getSubmissionTimestamp() {
    const dateVal = document.getElementById('active-date').value;
    const now = new Date();
    const localString = `${dateVal}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    return new Date(localString).toISOString(); 
}

async function submitIncome() { 
    if(!currentShopId) return;
    const category = document.getElementById('income-category').value;
    const method = document.getElementById('income-method').value;
    const amount = parseFloat(document.getElementById('income-amount').value);
    const note = document.getElementById('income-note').value;
    
    if(!amount || amount <= 0) return Swal.fire('Invalid', 'Enter a valid amount.', 'error');

    const { error } = await supabaseClient.from('daily_transactions').insert([{
        shop_id: currentShopId, 
        transaction_type: 'INCOME', 
        category: category, 
        payment_method: method, 
        amount: amount,
        reference_note: note,
        status: 'open',
        created_at: getSubmissionTimestamp()
    }]);

    if (error) return Swal.fire('Error', error.message, 'error');
    
    document.getElementById('income-amount').value = '';
    document.getElementById('income-note').value = '';
    Swal.fire({ title: 'Logged', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadDashboardData();
}

async function submitExpense() { 
    if(!currentShopId) return;
    const category = document.getElementById('expense-category').value;
    const method = document.getElementById('expense-method').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const note = document.getElementById('expense-note').value;
    
    if(category === 'none') return Swal.fire('Missing', 'Select classification.', 'warning');
    if(!amount || amount <= 0) return Swal.fire('Invalid', 'Enter valid amount.', 'error');

    let vendor_id = null, staff_id = null;
    if (category === 'vendor') {
        vendor_id = document.getElementById('vendor-select').value;
        if (!vendor_id) return Swal.fire('Missing', 'Select vendor.', 'warning');
    } else if (category === 'staff') {
        staff_id = document.getElementById('staff-select').value;
        if (!staff_id) return Swal.fire('Missing', 'Select staff.', 'warning');
    } else if (category === 'finance') {
        vendor_id = document.getElementById('finance-select').value; 
        if (!vendor_id) return Swal.fire('Missing', 'Select account.', 'warning');
    }

    const { error: insertErr } = await supabaseClient.from('daily_transactions').insert([{
        shop_id: currentShopId, 
        transaction_type: 'EXPENSE', 
        category: category, 
        payment_method: method, 
        amount: amount, 
        reference_note: note, 
        vendor_id: vendor_id, 
        staff_id: staff_id,
        status: 'open',
        created_at: getSubmissionTimestamp()
    }]);

    if (insertErr) return Swal.fire('Error', insertErr.message, 'error');
    
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-note').value = '';
    Swal.fire({ title: 'Logged', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadDashboardData();
}

/* ---------- Admin Actions ---------- */
async function editTransaction(txnId, currentAmount) {
    const { value: newAmountStr } = await Swal.fire({
        title: 'Edit Amount',
        input: 'number',
        inputValue: currentAmount,
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        confirmButtonText: 'Update'
    });

    if (!newAmountStr) return; 
    const newAmount = parseFloat(newAmountStr);
    if (isNaN(newAmount) || newAmount <= 0) return Swal.fire('Error', 'Invalid amount.', 'error');
    if (newAmount - currentAmount === 0) return; 

    const { error } = await supabaseClient.from('daily_transactions').update({ amount: newAmount }).eq('id', txnId);
    if (error) return Swal.fire('Error', error.message, 'error');

    Swal.fire({ title: 'Updated', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadDashboardData();
}

async function deleteTransaction(txnId) {
    const result = await Swal.fire({
        title: 'Delete Record?',
        text: "Balances will auto-correct.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Delete'
    });

    if (result.isConfirmed) {
        const { error: delError } = await supabaseClient.from('daily_transactions').delete().eq('id', txnId);
        if (delError) return Swal.fire('Error', delError.message, 'error');
        
        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadDashboardData();
    }
}
