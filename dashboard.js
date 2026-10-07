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
    vSelect.innerHTML = '<option value="" selected disabled>Choose vendor...</option>';
    if (vendors) vendors.forEach(v => vSelect.innerHTML += `<option value="${v.id}">${v.name}</option>`);

    const { data: staff } = await supabaseClient.from('staff').select('id, name').eq('shop_id', shopId);
    const sSelect = document.getElementById('staff-select');
    sSelect.innerHTML = '<option value="" selected disabled>Choose staff...</option>';
    if (staff) staff.forEach(s => sSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`);

    const { data: finances } = await supabaseClient.from('vendors').select('id, name').eq('shop_id', shopId).eq('account_type', 'finance');
    const fSelect = document.getElementById('finance-select');
    fSelect.innerHTML = '<option value="" selected disabled>Choose finance / kuri...</option>';
    if (finances) finances.forEach(f => fSelect.innerHTML += `<option value="${f.id}">${f.name}</option>`);
}

function getLocalDayBounds(dateString) {
    const start = new Date(`${dateString}T00:00:00`).toISOString();
    const end = new Date(`${dateString}T23:59:59.999`).toISOString();
    return { start, end };
}

function animateMetric(id, newValue) {
    const el = document.getElementById(id);
    const from = parseFloat(el.dataset.val || 0);
    const to = parseFloat(newValue) || 0;
    el.dataset.val = to;
    if (from === to) { el.innerText = to.toFixed(2); return; }

    const duration = 450;
    const startTime = performance.now();
    function tick(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.innerText = (from + (to - from) * eased).toFixed(2);
        if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function renderSkeleton() {
    const colSpan = isAdmin ? 7 : 6;
    let rows = '';
    for (let i = 0; i < 5; i++) {
        const w1 = 40 + Math.round(Math.abs(Math.sin(i * 7)) * 30);
        const w2 = 50 + Math.round(Math.abs(Math.sin(i * 13)) * 30);
        rows += `
            <tr style="animation: fadeIn 0.3s forwards; animation-delay: ${i * 0.05}s; opacity: 0;">
                <td data-label="Time"><span class="skeleton" style="width: 45px;"></span></td>
                <td data-label="Details">
                    <span class="skeleton d-block mb-2" style="width: ${w1}%;"></span>
                    <span class="skeleton" style="width: ${w2}%; height: 10px;"></span>
                </td>
                <td data-label="Mode" class="text-center"><span class="skeleton" style="width: 44px;"></span></td>
                <td data-label="Credit" class="text-end"><span class="skeleton" style="width: 60px;"></span></td>
                <td data-label="Debit" class="text-end"><span class="skeleton" style="width: 60px;"></span></td>
                <td data-label="Drawer Bal" class="text-end"><span class="skeleton" style="width: 70px;"></span></td>
                ${isAdmin ? '<td data-label="Action"></td>' : ''}
            </tr>`;
    }
    document.getElementById('txn-body').innerHTML = rows;
}

async function loadDashboardData() {
    if (!currentShopId) return;
    const selectedDate = document.getElementById('active-date').value;
    if (!selectedDate) return;

    renderSkeleton();

    const { start, end } = getLocalDayBounds(selectedDate);

    const shopPromise = supabaseClient.from('shops').select('master_ledger_balance').eq('id', currentShopId).single();
    const txnPromise = supabaseClient.from('daily_transactions')
        .select(`*, vendors ( name ), staff ( name )`)
        .eq('shop_id', currentShopId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });

    const [{ data: shopData }, { data: txns, error }] = await Promise.all([shopPromise, txnPromise]);

    animateMetric('display-vault', parseFloat(shopData?.master_ledger_balance || 0));

    if (error) return console.error("Fetch Error:", error);

    let cashSales = 0, upiSales = 0, totalExpense = 0, drawerCash = 0;
    let runningCashBalance = 0;
    const processedTxns = [];

    if (txns && txns.length > 0) {
        txns.forEach(txn => {
            const amt = parseFloat(txn.amount);
            const isLegacySweep = txn.reference_note && txn.reference_note.includes('Transferred to Master Vault');

            if (txn.transaction_type === 'INCOME') {
                if (txn.payment_method === 'CASH') cashSales += amt;
                else upiSales += amt;
            }
            if (txn.transaction_type === 'EXPENSE' && !isLegacySweep) totalExpense += amt;

            if (txn.payment_method === 'CASH') {
                if (txn.transaction_type === 'INCOME') { drawerCash += amt; runningCashBalance += amt; }
                if (txn.transaction_type === 'EXPENSE') { drawerCash -= amt; runningCashBalance -= amt; }
            }

            let mainGroup = (txn.category || 'OTHER').toUpperCase();
            let partyName = txn.reference_note || '-';

            if (txn.category === 'vendor' && txn.vendors) { mainGroup = 'VENDOR PAYOUT'; partyName = txn.vendors.name; }
            else if (txn.category === 'finance' && txn.vendors) { mainGroup = 'FINANCE / EMI'; partyName = txn.vendors.name; }
            else if (txn.category === 'staff' && txn.staff) { mainGroup = 'STAFF WAGE'; partyName = txn.staff.name; }

            let refNote = txn.reference_note ? `<div class="tx-ref">Ref: ${txn.reference_note}</div>` : '';
            if (partyName === txn.reference_note) refNote = '';

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

    processedTxns.reverse();
    const tbody = document.getElementById('txn-body');
    tbody.innerHTML = '';

    if (processedTxns.length > 0) {
        processedTxns.forEach((txn, idx) => {
            const timeStr = new Date(txn.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            const isIncome = txn.transaction_type === 'INCOME';

            const creditHtml = isIncome ? `<span class="amount-credit">₹ ${txn.amt.toFixed(2)}</span>` : '<span style="color: var(--line-strong);">—</span>';
            const debitHtml = !isIncome ? `<span class="amount-debit">₹ ${txn.amt.toFixed(2)}</span>` : '<span style="color: var(--line-strong);">—</span>';

            const badgeHtml = txn.payment_method === 'UPI'
                ? `<span class="mode-badge mode-upi">UPI</span>`
                : `<span class="mode-badge mode-cash">Cash</span>`;

            // BUG FIX: vendor_id/type/category are passed through again so edit/delete
            // can keep vendors.outstanding_balance correct. There is no database trigger
            // for this table (only the vault balance is trigger-maintained) — see the
            // note above editTransaction()/deleteTransaction() below.
            let safeVendorId = txn.vendor_id ? txn.vendor_id : 'null';
            let safeCategory = txn.category ? txn.category : 'none';

            let adminEditBtn = isAdmin ? `
                <td data-label="Action" class="text-center admin-only align-middle">
                    <div class="d-flex justify-content-end justify-content-md-center gap-1">
                        <button class="action-btn" onclick="editTransaction('${txn.id}', ${txn.amt}, '${safeVendorId}', '${txn.transaction_type}', '${safeCategory}')" title="Edit"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                        <button class="action-btn danger" onclick="deleteTransaction('${txn.id}', ${txn.amt}, '${safeVendorId}', '${txn.transaction_type}', '${safeCategory}')" title="Delete"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                    </div>
                </td>
            ` : '';

            const delay = Math.min(idx * 30, 450);

            // Added data-labels for mobile CSS targeting
            tbody.innerHTML += `
                <tr style="animation-delay: ${delay}ms;">
                    <td data-label="Time" class="tx-time text-start">${timeStr}</td>
                    <td data-label="Details" class="text-start">
                        <div class="tx-group">${txn.mainGroup}</div>
                        <div class="tx-party">${txn.partyName}</div>
                        ${txn.refNote}
                    </td>
                    <td data-label="Mode" class="text-end text-md-center">${badgeHtml}</td>
                    <td data-label="Credit" class="text-end">${creditHtml}</td>
                    <td data-label="Debit" class="text-end">${debitHtml}</td>
                    <td data-label="Drawer Bal" class="text-end drawer-balance">
                        ${txn.payment_method === 'CASH' ? '₹ ' + txn.currentBalance.toFixed(2) : '<span style="color: var(--ink-muted); font-weight: 500;">Digital</span>'}
                    </td>
                    ${adminEditBtn}
                </tr>
            `;
        });
    } else {
        const colSpanCount = isAdmin ? 7 : 6;
        tbody.innerHTML = `<tr style="animation: fadeIn 0.4s forwards;"><td colspan="${colSpanCount}" class="text-center py-5" style="color: var(--ink-muted); font-weight: 500;">No transactions logged for this date.</td></tr>`;
    }

    animateMetric('display-sales-cash', cashSales);
    animateMetric('display-sales-upi', upiSales);
    animateMetric('display-expense', totalExpense);
    animateMetric('display-drawer', drawerCash);
}

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

    if(!amount || amount <= 0) return Swal.fire('Invalid Amount', 'Please enter a valid amount.', 'error');

    // Vault balance needs no manual handling here — a database trigger on
    // daily_transactions (see vault_triggers.sql) credits shops.master_ledger_balance
    // automatically for CASH income the moment this row is inserted.
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
    Swal.fire({ title: 'Logged!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadDashboardData();
}

async function submitExpense() {
    if(!currentShopId) return;
    const category = document.getElementById('expense-category').value;
    const method = document.getElementById('expense-method').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const note = document.getElementById('expense-note').value;

    if(category === 'none') return Swal.fire('Missing Category', 'Please select an expense class.', 'warning');
    if(!amount || amount <= 0) return Swal.fire('Invalid Amount', 'Please enter a valid amount.', 'error');

    let vendor_id = null, staff_id = null;
    if (category === 'vendor') {
        vendor_id = document.getElementById('vendor-select').value;
        if (!vendor_id) return Swal.fire('Missing Vendor', 'Please select a vendor.', 'warning');
    } else if (category === 'staff') {
        staff_id = document.getElementById('staff-select').value;
        if (!staff_id) return Swal.fire('Missing Staff', 'Please select a staff member.', 'warning');
    } else if (category === 'finance') {
        vendor_id = document.getElementById('finance-select').value;
        if (!vendor_id) return Swal.fire('Missing Finance Account', 'Please select a Finance / Kuri account.', 'warning');
    }

    // Vault balance: handled automatically by the same trigger noted in submitIncome().
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

    if (insertErr) return Swal.fire('Ledger Error', insertErr.message, 'error');

    // BUG FIX: this block was missing entirely. vendors.outstanding_balance has no
    // database trigger (only the vault balance does), so without this, a vendor or
    // finance expense logged here would never reduce what that vendor is owed.
    if (vendor_id) {
        const { data: vData } = await supabaseClient.from('vendors').select('outstanding_balance').eq('id', vendor_id).single();
        if (vData) {
            const newBal = parseFloat(vData.outstanding_balance || 0) - amount;
            await supabaseClient.from('vendors').update({ outstanding_balance: newBal }).eq('id', vendor_id);
        }
    }

    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-note').value = '';
    Swal.fire({ title: 'Logged!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadDashboardData();
}

// BUG FIX: previously took only (txnId, currentAmount) — with no vendor_id/type/category,
// editing a vendor or finance expense's amount silently stopped updating that vendor's
// outstanding balance. The vault itself needs no handling here (trigger-covered), but
// vendor balances are still JS-maintained, matching accounts.js and master-ledger.js.
async function editTransaction(txnId, currentAmount, vendorIdStr, type, category) {
    const { value: newAmountStr } = await Swal.fire({
        title: 'Modify Transaction Amount',
        input: 'number',
        inputValue: currentAmount,
        showCancelButton: true,
        confirmButtonColor: '#161d2b',
        confirmButtonText: 'Update'
    });

    if (!newAmountStr) return;
    const newAmount = parseFloat(newAmountStr);
    if (isNaN(newAmount) || newAmount <= 0) return Swal.fire('Error', 'Invalid amount.', 'error');
    const difference = newAmount - currentAmount;
    if (difference === 0) return;

    const { error } = await supabaseClient.from('daily_transactions').update({ amount: newAmount }).eq('id', txnId);
    if (error) return Swal.fire('Database Error', error.message, 'error');

    if (vendorIdStr !== 'null' && type === 'EXPENSE' && (category === 'vendor' || category === 'finance')) {
        const { data: vData } = await supabaseClient.from('vendors').select('outstanding_balance').eq('id', vendorIdStr).single();
        if (vData) {
            const updatedBal = parseFloat(vData.outstanding_balance || 0) - difference;
            await supabaseClient.from('vendors').update({ outstanding_balance: updatedBal }).eq('id', vendorIdStr);
        }
    }

    Swal.fire({ title: 'Updated!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadDashboardData();
}

// BUG FIX: previously took only (txnId) and claimed "balances will be reversed
// automatically by the database" — true for the vault (trigger-covered), not true
// for vendor balances (no trigger exists for that table). Restored the params and
// the actual reversal, and corrected the confirmation copy to not overclaim.
async function deleteTransaction(txnId, amount, vendorIdStr, type, category) {
    const result = await Swal.fire({
        title: 'Wipe Record?',
        text: "The vault balance updates automatically. If this was a vendor or finance payment, its outstanding balance will be adjusted too.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#b42318',
        cancelButtonColor: '#161d2b',
        confirmButtonText: 'Yes, Delete'
    });

    if (result.isConfirmed) {
        const { error: delError } = await supabaseClient.from('daily_transactions').delete().eq('id', txnId);
        if (delError) return Swal.fire('Error', delError.message, 'error');

        if (vendorIdStr !== 'null' && type === 'EXPENSE' && (category === 'vendor' || category === 'finance')) {
            const { data: vData } = await supabaseClient.from('vendors').select('outstanding_balance').eq('id', vendorIdStr).single();
            if (vData) {
                const restoredBal = parseFloat(vData.outstanding_balance || 0) + amount;
                await supabaseClient.from('vendors').update({ outstanding_balance: restoredBal }).eq('id', vendorIdStr);
            }
        }

        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadDashboardData();
    }
}
