let currentShopId = null;
let currentShopName = 'Enterprise Shop';
let isAdmin = false;
let activeTab = 'vendors';

let allVendors = [];
let allFinances = [];

let activeAccount = null;
let rawHistoryData = [];

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: userData, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !userData || !userData.user) {
            window.location.replace('index.html');
            return;
        }

        const { data: profile } = await supabaseClient
            .from('user_profiles')
            .select('role, shop_id')
            .eq('id', userData.user.id)
            .single();

        if (profile) {
            currentShopId = profile.shop_id;
            isAdmin = (profile.role === 'admin');

            if (isAdmin) {
                document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('d-none'));
            }

            const { data: shopData } = await supabaseClient
                .from('shops')
                .select('name')
                .eq('id', currentShopId)
                .single();
            if (shopData && shopData.name) currentShopName = shopData.name;

            document.getElementById('admin-content').classList.remove('d-none');
            await fetchDirectory();
        }
    } catch (err) {
        console.error('Accounts Init Error:', err);
    }
});

function switchTab(tabName, preserveSelection = false) {
    activeTab = tabName;
    document.getElementById('tab-vendors').classList.toggle('active', tabName === 'vendors');
    document.getElementById('tab-finances').classList.toggle('active', tabName === 'finances');

    if (!preserveSelection) {
        activeAccount = null;
        document.getElementById('passbook-pane').classList.add('d-none');
        document.getElementById('empty-pane').classList.remove('d-none');
    }

    renderList();
}

function filterAccounts() {
    renderList();
}

async function fetchDirectory() {
    if (!currentShopId) return;

    const { data: accounts, error } = await supabaseClient
        .from('vendors')
        .select('*')
        .eq('shop_id', currentShopId);

    if (error) {
        console.error('Directory Fetch Error:', error);
        return;
    }

    const sortByName = (a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase());

    if (accounts) {
        allVendors = accounts
            .filter(a => {
                const t = String(a.account_type || 'vendor').trim().toLowerCase();
                return t !== 'finance';
            })
            .sort(sortByName);

        allFinances = accounts
            .filter(a => {
                const t = String(a.account_type || '').trim().toLowerCase();
                return t === 'finance';
            })
            .sort(sortByName);
    }

    document.getElementById('count-vendors').innerText = allVendors.length;
    document.getElementById('count-finances').innerText = allFinances.length;

    renderList();
}

function renderList() {
    const list = document.getElementById('account-list');
    list.innerHTML = '';

    const searchInput = document.getElementById('account-search');
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

    const sourceList = activeTab === 'vendors' ? allVendors : allFinances;
    const filteredList = query
        ? sourceList.filter(v => (v.name || '').toLowerCase().includes(query) || (v.phone || '').toLowerCase().includes(query))
        : sourceList;

    if (filteredList.length === 0) {
        const label = activeTab === 'vendors' ? 'vendor' : 'finance';
        list.innerHTML = `<div class="empty-state">No ${label} accounts found.</div>`;
        return;
    }

    filteredList.forEach(v => {
        const balNum = parseFloat(v.outstanding_balance || 0);
        const isSelected = activeAccount && activeAccount.id === v.id ? 'active' : '';
        
        let balClass = '';
        if (balNum === 0) balClass = 'zero';
        else if (balNum < 0) balClass = 'credit';
        
        const balSign = balNum < 0 ? '-' : '';
        const subText = v.phone ? v.phone : (v.gst_number || '');

        const itemDiv = document.createElement('div');
        itemDiv.className = `account-item ${isSelected}`;
        itemDiv.dataset.id = v.id;
        itemDiv.onclick = () => selectVendor(v.id);
        itemDiv.innerHTML = `
            <div>
                <div class="acc-name">${v.name}</div>
                ${subText ? `<div class="acc-sub fin-math">${subText}</div>` : ''}
            </div>
            <span class="acc-bal fin-math ${balClass}">${balSign}₹ ${Math.abs(balNum).toFixed(2)}</span>
        `;
        list.appendChild(itemDiv);
    });
}

async function selectVendor(vendorId) {
    const { data: refreshedVendor, error } = await supabaseClient
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

    if (error || !refreshedVendor) return;
    activeAccount = refreshedVendor;

    // Ensure directory tab matches the selected account's type
    const targetTab = String(activeAccount.account_type || 'vendor').trim().toLowerCase() === 'finance' ? 'finances' : 'vendors';
    if (activeTab !== targetTab) {
        switchTab(targetTab, true);
    } else {
        document.querySelectorAll('.account-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === vendorId);
        });
    }

    document.getElementById('empty-pane').classList.add('d-none');
    const pbPane = document.getElementById('passbook-pane');
    pbPane.classList.remove('d-none');
    pbPane.classList.add('d-flex');

    const isFinance = String(activeAccount.account_type || '').trim().toLowerCase() === 'finance';
    document.getElementById('pb-name').innerText = activeAccount.name;
    document.getElementById('pb-bal').innerText = parseFloat(activeAccount.outstanding_balance || 0).toFixed(2);
    document.getElementById('pb-type').innerText = isFinance ? 'FINANCE / KURI / EMI ACCOUNT' : 'VENDOR / SUPPLIER ACCOUNT';

    const metaText = isFinance
        ? `Account / Phone: ${activeAccount.phone || '-'}  |  Ref ID: ${activeAccount.gst_number || '-'}`
        : `Phone: ${activeAccount.phone || '-'}  |  GSTIN: ${activeAccount.gst_number || '-'}`;
    document.getElementById('pb-meta').innerText = metaText;

    await loadVendorHistory(activeAccount.id);

    // Smooth scroll to passbook on mobile screens
    if (window.innerWidth < 992) {
        pbPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function loadVendorHistory(vendorId) {
    const tbody = document.getElementById('pb-history');
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state fin-math">Loading account history...</td></tr>`;

    const billsPromise = supabaseClient.from('vendor_bills').select('*').eq('vendor_id', vendorId);
    const reserveByIdPromise = supabaseClient.from('master_ledger_logs').select('*').eq('shop_id', currentShopId).eq('vendor_id', vendorId);
    const reserveLegacyPromise = supabaseClient.from('master_ledger_logs').select('*').eq('shop_id', currentShopId).is('vendor_id', null).ilike('reference_note', `%${activeAccount.name}%`);
    const floorPayoutsPromise = supabaseClient.from('daily_transactions').select('*').eq('vendor_id', vendorId);

    const [
        { data: bills },
        { data: reserveById },
        { data: reserveLegacyByName },
        { data: floorPayouts }
    ] = await Promise.all([billsPromise, reserveByIdPromise, reserveLegacyPromise, floorPayoutsPromise]);

    const reservePayouts = [...(reserveById || []), ...(reserveLegacyByName || [])];
    rawHistoryData = [];

    if (bills) {
        bills.forEach(b => {
            rawHistoryData.push({
                id: b.id,
                sourceTable: 'vendor_bills',
                dateStr: new Date(b.bill_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                ref: b.bill_number ? `Invoice / Ref #${b.bill_number}` : 'Due Bill Logged',
                type: 'BILL DUE',
                amount: parseFloat(b.amount),
                rawDate: new Date(b.bill_date).getTime()
            });
        });
    }

    if (reservePayouts) {
        reservePayouts.forEach(p => {
            if (p.amount < 0) {
                rawHistoryData.push({
                    id: p.id,
                    sourceTable: 'master_ledger_logs',
                    dateStr: new Date(p.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                    ref: p.reference_note || 'Master Vault Payout',
                    type: 'VAULT CASH',
                    amount: parseFloat(Math.abs(p.amount)),
                    rawDate: new Date(p.created_at).getTime()
                });
            }
        });
    }

    if (floorPayouts) {
        floorPayouts.forEach(fp => {
            rawHistoryData.push({
                id: fp.id,
                sourceTable: 'daily_transactions',
                dateStr: new Date(fp.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                ref: fp.reference_note || `${fp.payment_method} Payout`,
                type: fp.payment_method === 'UPI' ? 'UPI / BANK' : 'DRAWER CASH',
                amount: parseFloat(Math.abs(fp.amount)),
                rawDate: new Date(fp.created_at).getTime()
            });
        });
    }

    // Sort Oldest to Newest to compute running balance
    rawHistoryData.sort((a, b) => a.rawDate - b.rawDate);

    let runningBalance = parseFloat(activeAccount.opening_balance || 0);

    rawHistoryData.forEach(item => {
        if (item.type === 'BILL DUE') {
            item.cr = item.amount;
            item.dr = 0;
            runningBalance += item.amount;
        } else {
            item.dr = item.amount;
            item.cr = 0;
            runningBalance -= item.amount;
        }
        item.balance = runningBalance;
    });

    // Sort Newest to Oldest for display
    rawHistoryData.sort((a, b) => b.rawDate - a.rawDate);
    renderTableHistory(rawHistoryData);
}

function renderTableHistory(data) {
    const tbody = document.getElementById('pb-history');
    tbody.innerHTML = '';

    if (data.length > 0) {
        data.forEach(item => {
            const drHtml = item.dr > 0 ? `₹ ${item.dr.toFixed(2)}` : '-';
            const crHtml = item.cr > 0 ? `₹ ${item.cr.toFixed(2)}` : '-';

            let badgeClass = 'bg-light text-dark';
            if (item.type === 'BILL DUE') badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
            else if (item.type === 'UPI / BANK') badgeClass = 'bg-light text-secondary';

            let adminActionCell = '';
            if (isAdmin) {
                if (item.sourceTable === 'vendor_bills') {
                    adminActionCell = `
                        <td data-label="Action" class="text-center pe-md-4 align-middle admin-only">
                            <div class="d-flex justify-content-end justify-content-md-center gap-1">
                                <button class="action-btn" onclick="editBill('${item.id}', ${item.amount})">Edit</button>
                                <button class="action-btn danger" onclick="deleteBill('${item.id}')">Del</button>
                            </div>
                        </td>
                    `;
                } else {
                    adminActionCell = `
                        <td data-label="Action" class="text-center pe-md-4 align-middle admin-only">
                            <span class="text-muted" style="font-size: 0.7rem; font-weight: 600;">Ledger Sync</span>
                        </td>
                    `;
                }
            }

            tbody.innerHTML += `
                <tr>
                    <td data-label="Date" class="ps-md-4 fw-bold small text-muted fin-math">${item.dateStr}</td>
                    <td data-label="Details" class="fw-semibold text-dark">${item.ref}</td>
                    <td data-label="Mode" class="text-end text-md-center">
                        <span class="badge-mode ${badgeClass}">${item.type}</span>
                    </td>
                    <td data-label="Dr (Paid)" class="text-end fw-bold text-success fin-math">${drHtml}</td>
                    <td data-label="Cr (Billed)" class="text-end fw-bold text-danger fin-math">${crHtml}</td>
                    <td data-label="Balance" class="text-end fw-bold text-dark fin-math">₹ ${item.balance.toFixed(2)}</td>
                    ${adminActionCell}
                </tr>
            `;
        });
    }

    // Opening Balance Row anchored at the bottom
    const ob = parseFloat(activeAccount.opening_balance || 0);
    tbody.innerHTML += `
        <tr style="background: var(--bg-color);">
            <td data-label="Date" class="ps-md-4 fw-bold small text-muted">-</td>
            <td data-label="Details" class="fw-bold text-dark">Opening Balance</td>
            <td data-label="Mode" class="text-end text-md-center"><span class="badge-mode bg-white text-muted">OPENING</span></td>
            <td data-label="Dr (Paid)" class="text-end fw-bold text-success fin-math">-</td>
            <td data-label="Cr (Billed)" class="text-end fw-bold text-danger fin-math">${ob > 0 ? '₹ ' + ob.toFixed(2) : '-'}</td>
            <td data-label="Balance" class="text-end fw-bold text-dark fin-math">₹ ${ob.toFixed(2)}</td>
            ${isAdmin ? '<td data-label="Action" class="text-center pe-md-4 admin-only">-</td>' : ''}
        </tr>
    `;
}

/* ---------- CREATE NEW ACCOUNT (VENDOR OR FINANCE) ---------- */
async function openAddAccountModal() {
    const defaultIsFinance = activeTab === 'finances';

    const { value: formValues } = await Swal.fire({
        title: 'Create New Account',
        html: `
            <div class="mb-3">
                <label class="ent-label">Account Classification</label>
                <div class="segmented">
                    <input type="radio" class="btn-check" name="swal_acc_type" id="type_vendor" value="vendor" ${!defaultIsFinance ? 'checked' : ''}>
                    <label for="type_vendor">Vendor / Supplier</label>
                    <input type="radio" class="btn-check" name="swal_acc_type" id="type_finance" value="finance" ${defaultIsFinance ? 'checked' : ''}>
                    <label for="type_finance">Finance / Kuri / EMI</label>
                </div>
            </div>
            <div class="mb-3">
                <label class="ent-label">Account / Party Name *</label>
                <input id="swal-name" class="form-control" placeholder="e.g. ABC Distributors or Bajaj Finance">
            </div>
            <div class="row g-2 mb-3">
                <div class="col-6">
                    <label class="ent-label">Phone / Acct No.</label>
                    <input id="swal-phone" class="form-control fin-math" placeholder="Optional">
                </div>
                <div class="col-6">
                    <label class="ent-label">GSTIN / Ref ID</label>
                    <input id="swal-gst" class="form-control fin-math" placeholder="Optional">
                </div>
            </div>
            <div>
                <label class="ent-label">Opening Balance Owed (₹)</label>
                <input id="swal-bal" class="form-control fin-math fw-bold" type="number" step="0.01" placeholder="0.00" value="0">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Create Account',
        preConfirm: () => {
            const nameEl = document.getElementById('swal-name');
            const name = nameEl ? nameEl.value.trim() : '';
            if (!name) {
                Swal.showValidationMessage('Account Name is required');
                return false;
            }
            const selectedType = document.querySelector('input[name="swal_acc_type"]:checked')?.value || 'vendor';
            const initBal = parseFloat(document.getElementById('swal-bal').value) || 0;

            return {
                type: selectedType,
                name: name.toUpperCase(),
                phone: document.getElementById('swal-phone').value.trim() || null,
                gst: document.getElementById('swal-gst').value.trim() || null,
                openingBalance: initBal
            };
        }
    });

    if (formValues) {
        const { data: insertedRows, error } = await supabaseClient
            .from('vendors')
            .insert([{
                shop_id: currentShopId,
                account_type: formValues.type,
                name: formValues.name,
                phone: formValues.phone,
                gst_number: formValues.gst,
                opening_balance: formValues.openingBalance,
                outstanding_balance: formValues.openingBalance
            }])
            .select();

        if (error) {
            return Swal.fire('Database Error', error.message, 'error');
        }

        // Clear search filter so the new account is never hidden
        const searchInput = document.getElementById('account-search');
        if (searchInput) searchInput.value = '';

        // Automatically switch to the tab where this account lives
        const targetTab = formValues.type === 'finance' ? 'finances' : 'vendors';
        activeTab = targetTab;
        document.getElementById('tab-vendors').classList.toggle('active', targetTab === 'vendors');
        document.getElementById('tab-finances').classList.toggle('active', targetTab === 'finances');

        await fetchDirectory();

        if (insertedRows && insertedRows.length > 0) {
            await selectVendor(insertedRows[0].id);
        }

        Swal.fire({ title: 'Account Created', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    }
}

/* ---------- EDIT ACCOUNT DETAILS & OPENING BALANCE ---------- */
async function editVendorDetails() {
    if (!activeAccount) return;
    const isFinance = String(activeAccount.account_type || 'vendor').trim().toLowerCase() === 'finance';

    const { value: formValues } = await Swal.fire({
        title: 'Edit Account Details',
        html: `
            <div class="mb-3">
                <label class="ent-label">Account Classification</label>
                <div class="segmented">
                    <input type="radio" class="btn-check" name="swal_edit_type" id="edit_type_vendor" value="vendor" ${!isFinance ? 'checked' : ''}>
                    <label for="edit_type_vendor">Vendor / Supplier</label>
                    <input type="radio" class="btn-check" name="swal_edit_type" id="edit_type_finance" value="finance" ${isFinance ? 'checked' : ''}>
                    <label for="edit_type_finance">Finance / Kuri / EMI</label>
                </div>
            </div>
            <div class="mb-3">
                <label class="ent-label">Account Name *</label>
                <input id="swal-edit-name" class="form-control" value="${activeAccount.name}">
            </div>
            <div class="row g-2 mb-3">
                <div class="col-6">
                    <label class="ent-label">Phone / Acct No.</label>
                    <input id="swal-edit-phone" class="form-control fin-math" value="${activeAccount.phone || ''}">
                </div>
                <div class="col-6">
                    <label class="ent-label">GSTIN / Ref ID</label>
                    <input id="swal-edit-gst" class="form-control fin-math" value="${activeAccount.gst_number || ''}">
                </div>
            </div>
            <div>
                <label class="ent-label">Opening Balance (₹)</label>
                <input id="swal-edit-ob" class="form-control fin-math fw-bold" type="number" step="0.01" value="${activeAccount.opening_balance || 0}">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save Changes',
        preConfirm: () => {
            const name = document.getElementById('swal-edit-name').value.trim();
            if (!name) {
                Swal.showValidationMessage('Account Name is required');
                return false;
            }
            const selectedType = document.querySelector('input[name="swal_edit_type"]:checked')?.value || 'vendor';
            return {
                type: selectedType,
                name: name.toUpperCase(),
                phone: document.getElementById('swal-edit-phone').value.trim() || null,
                gst: document.getElementById('swal-edit-gst').value.trim() || null,
                newOB: parseFloat(document.getElementById('swal-edit-ob').value) || 0
            };
        }
    });

    if (formValues) {
        const { error } = await supabaseClient
            .from('vendors')
            .update({
                account_type: formValues.type,
                name: formValues.name,
                phone: formValues.phone,
                gst_number: formValues.gst,
                opening_balance: formValues.newOB
            })
            .eq('id', activeAccount.id);

        if (error) return Swal.fire('Error', error.message, 'error');

        Swal.fire({ title: 'Updated', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await fetchDirectory();
        await selectVendor(activeAccount.id);
    }
}

/* ---------- ADD / EDIT / DELETE BILLS ---------- */
async function openAddBillModal() {
    if (!activeAccount) return;
    const isFinance = String(activeAccount.account_type || '').trim().toLowerCase() === 'finance';
    const titleLabel = isFinance ? 'Add Installment / EMI Due' : 'Add Vendor Due Bill';

    const { value: billData } = await Swal.fire({
        title: titleLabel,
        html: `
            <div class="mb-3">
                <label class="ent-label">Account</label>
                <div class="fw-bold text-dark">${activeAccount.name}</div>
            </div>
            <div class="mb-3">
                <label class="ent-label">Invoice / Reference No.</label>
                <input id="swal-bill-no" class="form-control" placeholder="Optional reference">
            </div>
            <div class="row g-2">
                <div class="col-6">
                    <label class="ent-label">Amount Due (₹) *</label>
                    <input id="swal-bill-amt" class="form-control fin-math fw-bold text-danger" type="number" step="0.01" placeholder="0.00">
                </div>
                <div class="col-6">
                    <label class="ent-label">Bill Date</label>
                    <input id="swal-bill-date" class="form-control" type="date" value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Post Due Bill',
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('swal-bill-amt').value);
            if (!amount || amount <= 0) {
                Swal.showValidationMessage('Enter a valid amount greater than 0');
                return false;
            }
            return {
                billNumber: document.getElementById('swal-bill-no').value.trim() || null,
                amount: amount,
                date: document.getElementById('swal-bill-date').value
            };
        }
    });

    if (billData) {
        const { error: billError } = await supabaseClient.from('vendor_bills').insert([{
            shop_id: currentShopId,
            vendor_id: activeAccount.id,
            bill_number: billData.billNumber,
            amount: billData.amount,
            bill_date: billData.date
        }]);

        if (billError) return Swal.fire('Error', billError.message, 'error');

        Swal.fire({ title: 'Bill Logged', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await fetchDirectory();
        await selectVendor(activeAccount.id);
    }
}

async function editBill(billId, currentAmount) {
    const { value: newAmountStr } = await Swal.fire({
        title: 'Edit Bill Amount',
        html: `
            <label class="ent-label">Updated Bill Amount (₹)</label>
            <input id="swal-edit-bill-amt" class="form-control fin-math fw-bold text-danger" type="number" step="0.01" value="${currentAmount}">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Update Bill',
        preConfirm: () => {
            const val = parseFloat(document.getElementById('swal-edit-bill-amt').value);
            if (isNaN(val) || val <= 0) {
                Swal.showValidationMessage('Enter a valid amount');
                return false;
            }
            return val;
        }
    });

    if (!newAmountStr || newAmountStr === currentAmount) return;

    const { error: updateErr } = await supabaseClient
        .from('vendor_bills')
        .update({ amount: newAmountStr })
        .eq('id', billId);

    if (updateErr) return Swal.fire('Database Error', updateErr.message, 'error');

    Swal.fire({ title: 'Updated', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await fetchDirectory();
    await selectVendor(activeAccount.id);
}

async function deleteBill(billId) {
    const result = await Swal.fire({
        title: 'Delete Due Bill?',
        html: `<p class="small text-muted m-0">This will remove the bill and automatically recalculate the account balance.</p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete Bill'
    });

    if (result.isConfirmed) {
        const { error: delError } = await supabaseClient.from('vendor_bills').delete().eq('id', billId);
        if (delError) return Swal.fire('Error', delError.message, 'error');

        Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await fetchDirectory();
        await selectVendor(activeAccount.id);
    }
}

/* ---------- RECORD PAYMENT ---------- */
async function openPayModal() {
    if (!activeAccount) return;
    const todayStr = new Date().toISOString().split('T')[0];

    const { value: payData } = await Swal.fire({
        title: 'Record Account Payment',
        html: `
            <div class="mb-3">
                <label class="ent-label">Payee Account</label>
                <div class="fw-bold text-dark">${activeAccount.name}</div>
            </div>
            <div class="mb-3">
                <label class="ent-label">Payment Source</label>
                <select id="swal-pay-source" class="form-select">
                    <option value="DRAWER">Physical Drawer Cash (Daily Daybook)</option>
                    <option value="RESERVE">Master Vault Cash (Unified Reserve)</option>
                    <option value="UPI">UPI / Bank Transfer (Digital)</option>
                </select>
            </div>
            <div class="row g-2 mb-3">
                <div class="col-6">
                    <label class="ent-label">Amount Paid (₹) *</label>
                    <input id="swal-pay-amt" class="form-control fin-math fw-bold text-success" type="number" step="0.01" placeholder="0.00">
                </div>
                <div class="col-6">
                    <label class="ent-label">Payment Date</label>
                    <input id="swal-pay-date" class="form-control" type="date" value="${todayStr}" max="${todayStr}">
                </div>
            </div>
            <div>
                <label class="ent-label">Reference Note</label>
                <input id="swal-pay-note" class="form-control" placeholder="Optional voucher or UTR ref">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Confirm Payment',
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('swal-pay-amt').value);
            if (!amount || amount <= 0) {
                Swal.showValidationMessage('Enter a valid payment amount');
                return false;
            }
            const date = document.getElementById('swal-pay-date').value;
            if (!date) {
                Swal.showValidationMessage('Select a payment date');
                return false;
            }
            return {
                amount: amount,
                source: document.getElementById('swal-pay-source').value,
                note: document.getElementById('swal-pay-note').value.trim() || null,
                date: date
            };
        }
    });

    if (payData) {
        const paymentTimestamp = getManualTimestamp(payData.date);

        if (payData.source === 'RESERVE') {
            const { data: shopData } = await supabaseClient
                .from('shops')
                .select('master_ledger_balance')
                .eq('id', currentShopId)
                .single();

            const currentReserve = parseFloat(shopData?.master_ledger_balance || 0);
            if (payData.amount > currentReserve) {
                return Swal.fire('Insufficient Vault Cash', 'Payment exceeds available balance in the Unified Cash Ledger.', 'error');
            }

            const { error: vaultErr } = await supabaseClient.from('master_ledger_logs').insert([{
                shop_id: currentShopId,
                vendor_id: activeAccount.id,
                transaction_type: 'VENDOR_PAYOUT',
                reference_note: payData.note || `Paid ${activeAccount.name}`,
                amount: -payData.amount,
                created_at: paymentTimestamp
            }]);

            if (vaultErr) return Swal.fire('Error', vaultErr.message, 'error');
        } else {
            const isFinance = String(activeAccount.account_type || '').trim().toLowerCase() === 'finance';
            const { error: dailyErr } = await supabaseClient.from('daily_transactions').insert([{
                shop_id: currentShopId,
                transaction_type: 'EXPENSE',
                category: isFinance ? 'finance' : 'vendor',
                payment_method: payData.source === 'UPI' ? 'UPI' : 'CASH',
                amount: payData.amount,
                vendor_id: activeAccount.id,
                reference_note: payData.note || null,
                status: 'open',
                created_at: paymentTimestamp
            }]);

            if (dailyErr) return Swal.fire('Error', dailyErr.message, 'error');
        }

        Swal.fire({ title: 'Payment Recorded', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await fetchDirectory();
        await selectVendor(activeAccount.id);
    }
}

function getManualTimestamp(dateStr) {
    const now = new Date();
    const localString = `${dateStr}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    return new Date(localString).toISOString();
}

/* ---------- ENTERPRISE VECTOR PDF STATEMENT ---------- */
function downloadAccountPDF() {
    if (!activeAccount) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const isFinance = String(activeAccount.account_type || '').trim().toLowerCase() === 'finance';
    const ob = parseFloat(activeAccount.opening_balance || 0);
    const currentBal = parseFloat(activeAccount.outstanding_balance || 0);

    let totalBilled = 0;
    let totalPaid = 0;
    rawHistoryData.forEach(item => {
        totalBilled += item.cr || 0;
        totalPaid += item.dr || 0;
    });

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currentShopName.toUpperCase()} - ACCOUNT STATEMENT`, 14, 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${activeAccount.name} (${isFinance ? 'FINANCE / EMI' : 'VENDOR'})`, 14, 25);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Contact / Acct: ${activeAccount.phone || '-'}   |   GST / Ref: ${activeAccount.gst_number || '-'}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 35);

    // Summary Box
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 40, 182, 16, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('OPENING BAL', 18, 46);
    doc.text('TOTAL BILLED (CR)', 62, 46);
    doc.text('TOTAL PAID (DR)', 110, 46);
    doc.text('CLOSING BALANCE', 155, 46);

    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Rs. ${ob.toFixed(2)}`, 18, 52);

    doc.setTextColor(220, 38, 38);
    doc.text(`Rs. ${totalBilled.toFixed(2)}`, 62, 52);

    doc.setTextColor(22, 163, 74);
    doc.text(`Rs. ${totalPaid.toFixed(2)}`, 110, 52);

    doc.setTextColor(15, 23, 42);
    doc.text(`Rs. ${currentBal.toFixed(2)}`, 155, 52);

    // Table Rows
    const tableRows = rawHistoryData.map(item => [
        item.dateStr,
        item.ref,
        item.type,
        item.dr > 0 ? `Rs. ${item.dr.toFixed(2)}` : '-',
        item.cr > 0 ? `Rs. ${item.cr.toFixed(2)}` : '-',
        `Rs. ${item.balance.toFixed(2)}`
    ]);

    // Append Opening Balance row
    tableRows.push([
        '-',
        'Opening Balance',
        'OPENING',
        '-',
        ob > 0 ? `Rs. ${ob.toFixed(2)}` : '-',
        `Rs. ${ob.toFixed(2)}`
    ]);

    doc.autoTable({
        startY: 62,
        head: [['Date', 'Reference Details', 'Mode', 'Dr (Paid)', 'Cr (Billed)', 'Balance']],
        body: tableRows,
        theme: 'grid',
        headStyles: {
            fillColor: [15, 23, 42],
            textColor: [255, 255, 255],
            fontSize: 8,
            fontStyle: 'bold'
        },
        bodyStyles: {
            fontSize: 8,
            textColor: [17, 24, 39]
        },
        columnStyles: {
            0: { cellWidth: 26 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 26, fontStyle: 'bold' },
            3: { cellWidth: 26, halign: 'right', textColor: [22, 163, 74], fontStyle: 'bold' },
            4: { cellWidth: 26, halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' },
            5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
        },
        alternateRowStyles: {
            fillColor: [249, 250, 251]
        },
        margin: { left: 14, right: 14 }
    });

    const cleanFileName = `${activeAccount.name.replace(/\s+/g, '_')}_Statement_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(cleanFileName);
}
