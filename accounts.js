let currentShopId = null;
        let isAdmin = false;
        let activeTab = 'vendors';
        
        let allVendors = [];
        let allFinances = [];
        
        let activeAccount = null; 
        let rawHistoryData = []; 

        window.onload = async () => {
            try {
                const { data: userData, error: authError } = await supabaseClient.auth.getUser();
                if (authError || !userData || !userData.user) {
                    window.location.replace('index.html');
                    return;
                }

                const { data: profile } = await supabaseClient.from('user_profiles').select('role, shop_id').eq('id', userData.user.id).single();
                if (profile) {
                    currentShopId = profile.shop_id;
                    isAdmin = (profile.role === 'admin');

                    if (isAdmin) {
                        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('d-none'));
                    }

                    document.getElementById('admin-content').classList.remove('d-none');
                    await fetchDirectory();
                }
            } catch (err) {
                console.error(err);
            }
        };

        function switchTab(tabName) {
            activeTab = tabName;
            document.getElementById('tab-vendors').classList.remove('active');
            document.getElementById('tab-finances').classList.remove('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
            
            activeAccount = null;
            document.getElementById('passbook-pane').classList.add('d-none');
            document.getElementById('empty-pane').classList.remove('d-none');
            
            renderList();
        }

        function filterAccounts() {
            const query = document.getElementById('account-search').value.toLowerCase();
            const items = document.querySelectorAll('.account-item');
            items.forEach(item => {
                const name = item.querySelector('.acc-name').innerText.toLowerCase();
                item.style.display = name.includes(query) ? 'block' : 'none';
            });
        }

        async function fetchDirectory() {
            if (!currentShopId) return;
            
            const { data: accounts, error } = await supabaseClient
                .from('vendors')
                .select('*')
                .eq('shop_id', currentShopId);

            // Case-insensitive ascending sort by name. Doing this client-side (rather than
            // relying solely on the DB query's .order()) guarantees correct A-Z ordering
            // even for older records that were saved in mixed/lower case.
            const sortByName = (a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase());

            if (!error && accounts) {
                allVendors = accounts.filter(a => a.account_type === 'vendor' || !a.account_type).sort(sortByName);
                allFinances = accounts.filter(a => a.account_type === 'finance').sort(sortByName);
            }
            renderList();
        }

        function renderList() {
            const list = document.getElementById('account-list');
            list.innerHTML = '';
            
            const activeData = activeTab === 'vendors' ? allVendors : allFinances;

            if (activeData.length === 0) {
                list.innerHTML = `<div class="empty-state">No accounts found.</div>`;
                return;
            }

            activeData.forEach(v => {
                const balNum = parseFloat(v.outstanding_balance || 0);
                const bal = balNum.toFixed(2);
                const isSelected = activeAccount && activeAccount.id === v.id ? 'active' : '';
                let balClass = '';
                if (balNum === 0) balClass = 'zero';
                else if (balNum < 0) balClass = 'credit';
                const balSign = balNum < 0 ? '-' : '';
                list.innerHTML += `
                    <div class="account-item ${isSelected}" onclick="selectVendor('${v.id}', this)">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="acc-name">${v.name}</span>
                            <span class="acc-bal ${balClass}">${balSign}₹ ${Math.abs(balNum).toFixed(2)}</span>
                        </div>
                    </div>
                `;
            });
        }

        async function selectVendor(vendorId, element) {
            const { data: refreshedVendor } = await supabaseClient.from('vendors').select('*').eq('id', vendorId).single();
            if (!refreshedVendor) return;
            activeAccount = refreshedVendor;

            document.querySelectorAll('.account-item').forEach(el => el.classList.remove('active'));
            if (element) element.classList.add('active');

            document.getElementById('empty-pane').classList.add('d-none');
            document.getElementById('passbook-pane').classList.remove('d-none');

            document.getElementById('pb-name').innerText = activeAccount.name;
            document.getElementById('pb-bal').innerText = parseFloat(activeAccount.outstanding_balance || 0).toFixed(2);
            document.getElementById('pb-type').innerText = activeAccount.account_type === 'finance' ? 'Finance / EMI Account' : 'Vendor Account';
            
            const metaText = activeAccount.account_type === 'finance' ? 
                `Acct/Phone: ${activeAccount.phone || '-'} | Ref: ${activeAccount.gst_number || '-'}` : 
                `Phone: ${activeAccount.phone || '-'} | GST: ${activeAccount.gst_number || '-'}`;
            document.getElementById('pb-meta').innerText = metaText;

            await loadVendorHistory(activeAccount.id);
        }

        async function loadVendorHistory(vendorId) {
            const tbody = document.getElementById('pb-history');
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-muted fw-semibold">Loading history...</td></tr>`;

            const { data: bills } = await supabaseClient.from('vendor_bills').select('*').eq('vendor_id', vendorId);

            // Vault payments made going forward carry a real vendor_id (reliable).
            // Vault payments logged before this fix have no vendor_id, so they're only
            // findable via the old free-text name match — kept here purely as a fallback
            // for that historical data, never applied to new entries.
            const { data: reserveById } = await supabaseClient.from('master_ledger_logs').select('*').eq('shop_id', currentShopId).eq('vendor_id', vendorId);
            const { data: reserveLegacyByName } = await supabaseClient.from('master_ledger_logs').select('*').eq('shop_id', currentShopId).is('vendor_id', null).ilike('reference_note', `%${activeAccount.name}%`);
            const reservePayouts = [...(reserveById || []), ...(reserveLegacyByName || [])];

            const { data: floorPayouts } = await supabaseClient.from('daily_transactions').select('*').eq('vendor_id', vendorId);

            rawHistoryData = [];
            
            if (bills) {
                bills.forEach(b => {
                    rawHistoryData.push({
                        id: b.id,
                        dateStr: new Date(b.bill_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                        ref: b.bill_number ? `Bill Ref #${b.bill_number}` : 'Due Bill',
                        type: 'DUE',
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
                            dateStr: new Date(p.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                            ref: p.reference_note || 'Vault Payment',
                            type: 'VAULT',
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
                        dateStr: new Date(fp.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                        ref: fp.reference_note || `${fp.payment_method} Payment`,
                        type: fp.payment_method, // CASH or UPI
                        amount: parseFloat(Math.abs(fp.amount)),
                        rawDate: new Date(fp.created_at).getTime()
                    });
                });
            }

            // MATHEMATICAL AUDIT: Sort Oldest to Newest to calculate accurate running balance
            rawHistoryData.sort((a, b) => a.rawDate - b.rawDate);
            
            let runningBalance = parseFloat(activeAccount.opening_balance || 0);

            rawHistoryData.forEach(item => {
                if (item.type === 'DUE') {
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

            // UI RENDER: Sort Newest to Oldest so most recent is at the top
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
                    
                    let badgeClass = 'bg-secondary-subtle text-secondary border-secondary-subtle'; // default CASH
                    if (item.type === 'DUE') badgeClass = 'bg-danger-subtle text-danger border-danger-subtle';
                    else if (item.type === 'VAULT') badgeClass = 'bg-gold-subtle text-gold border';
                    else if (item.type === 'UPI') badgeClass = 'bg-primary-subtle text-primary border-primary-subtle';

                    let adminEditBtn = isAdmin && item.type === 'DUE' ? `
                        <td class="text-center pe-4 no-print align-middle admin-only">
                            <div class="d-flex justify-content-center gap-2">
                                <button class="action-btn text-dark" onclick="editBill('${item.id}', ${item.amount})">Edit</button>
                                <button class="action-btn text-danger" onclick="deleteBill('${item.id}', ${item.amount})">Del</button>
                            </div>
                        </td>
                    ` : `<td class="text-center pe-4 no-print align-middle admin-only"></td>`;

                    tbody.innerHTML += `
                        <tr style="transition: background 0.2s;" onmouseover="this.style.background='#FDFBF7'" onmouseout="this.style.background='transparent'">
                            <td class="ps-4 py-3 fw-bold small text-muted">
                                ${item.dateStr}
                                <span class="badge border ${badgeClass} ms-2 px-1 py-0 d-md-none" style="font-size: 0.6rem;">${item.type}</span>
                            </td>
                            <td class="py-3 fw-semibold text-dark" style="font-size: 0.9em;">
                                ${item.ref}
                                <span class="badge border ${badgeClass} ms-2 px-2 py-1 d-none d-md-inline-block" style="font-size: 0.65rem;">${item.type}</span>
                            </td>
                            <td class="text-end py-3 fw-bold text-success fs-6">${drHtml}</td>
                            <td class="text-end py-3 fw-bold text-danger fs-6">${crHtml}</td>
                            <td class="text-end py-3 fw-bold text-dark fs-6">₹ ${item.balance.toFixed(2)}</td>
                            ${adminEditBtn}
                        </tr>
                    `;
                });
            } 
            
            // ALWAYS RENDER OPENING BALANCE AT THE BOTTOM
            const ob = parseFloat(activeAccount.opening_balance || 0);
            tbody.innerHTML += `
                <tr class="bg-light border-top">
                    <td class="ps-4 py-3 fw-bold small text-muted">-</td>
                    <td class="py-3 fw-bold text-dark" style="font-size: 0.9em;">Opening Balance</td>
                    <td class="text-end py-3 fw-bold text-success fs-6">-</td>
                    <td class="text-end py-3 fw-bold text-danger fs-6">${ob > 0 ? '₹ ' + ob.toFixed(2) : '-'}</td>
                    <td class="text-end py-3 fw-bold text-dark fs-6">₹ ${ob.toFixed(2)}</td>
                    <td class="text-center pe-4 no-print admin-only"></td>
                </tr>
            `;

            if (data.length === 0 && ob === 0) {
                tbody.innerHTML += `<tr><td colspan="6" class="text-center py-4 text-muted fw-semibold">No transactions found.</td></tr>`;
            }
        }

        // --- EDIT VENDOR DETAILS & OPENING BALANCE ---
        async function editVendorDetails() {
            if (!activeAccount) return;

            const { value: formValues } = await Swal.fire({
                title: 'Edit Account Details',
                html: `
                    <label class="field-label text-start px-1">Account Name</label>
                    <input id="swal-edit-name" class="swal2-input form-control mb-3" value="${activeAccount.name}">
                    <label class="field-label text-start px-1">Phone / Acct No.</label>
                    <input id="swal-edit-phone" class="swal2-input form-control mb-3" value="${activeAccount.phone || ''}">
                    <label class="field-label text-start px-1">GST / Ref ID</label>
                    <input id="swal-edit-gst" class="swal2-input form-control mb-3" value="${activeAccount.gst_number || ''}">
                    <label class="field-label text-start px-1">Opening Balance (₹)</label>
                    <input id="swal-edit-ob" class="swal2-input form-control fw-bold" type="number" value="${activeAccount.opening_balance || 0}">
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Save Changes',
                confirmButtonColor: '#2C2C2C',
                preConfirm: () => {
                    const name = document.getElementById('swal-edit-name').value;
                    if (!name || !name.trim()) { Swal.showValidationMessage('Account Name is required'); return false; }
                    return {
                        name: name.trim().toUpperCase(),
                        phone: document.getElementById('swal-edit-phone').value || null,
                        gst: document.getElementById('swal-edit-gst').value || null,
                        newOB: parseFloat(document.getElementById('swal-edit-ob').value) || 0
                    };
                }
            });

            if (formValues) {
                const oldOB = parseFloat(activeAccount.opening_balance || 0);
                const currentOutstanding = parseFloat(activeAccount.outstanding_balance || 0);
                
                const diff = formValues.newOB - oldOB;
                const newOutstanding = currentOutstanding + diff;

                const { error } = await supabaseClient.from('vendors').update({
                    name: formValues.name,
                    phone: formValues.phone,
                    gst_number: formValues.gst,
                    opening_balance: formValues.newOB,
                    outstanding_balance: newOutstanding
                }).eq('id', activeAccount.id);

                if (error) return Swal.fire('Error', error.message, 'error');

                Swal.fire({ title: 'Updated!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                await fetchDirectory();
                selectVendor(activeAccount.id, document.querySelector('.account-item.active'));
            }
        }

        // --- EDIT / DELETE BILLS ---
        async function editBill(billId, currentAmount) {
            const { value: newAmountStr } = await Swal.fire({
                title: 'Modify Bill Amount',
                input: 'number',
                inputValue: currentAmount,
                showCancelButton: true,
                confirmButtonColor: '#2C2C2C',
                confirmButtonText: 'Update'
            });

            if (!newAmountStr) return; 
            const newAmount = parseFloat(newAmountStr);
            if (isNaN(newAmount) || newAmount <= 0) return Swal.fire('Error', 'Invalid amount.', 'error');
            
            const diff = newAmount - currentAmount;
            if (diff === 0) return;

            const { error: updateErr } = await supabaseClient.from('vendor_bills').update({ amount: newAmount }).eq('id', billId);
            if (updateErr) return Swal.fire('Database Error', updateErr.message, 'error');

            const currentOutstanding = parseFloat(activeAccount.outstanding_balance || 0);
            const newOutstanding = currentOutstanding + diff;
            await supabaseClient.from('vendors').update({ outstanding_balance: newOutstanding }).eq('id', activeAccount.id);

            Swal.fire({ title: 'Updated!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
            await fetchDirectory();
            selectVendor(activeAccount.id, document.querySelector('.account-item.active'));
        }

        async function deleteBill(billId, amount) {
            const result = await Swal.fire({
                title: 'Delete Due Bill?',
                text: "This will remove the bill and reverse its impact on the outstanding balance.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#dc3545',
                cancelButtonColor: '#2C2C2C',
                confirmButtonText: 'Yes, Delete'
            });

            if (result.isConfirmed) {
                const { error: delError } = await supabaseClient.from('vendor_bills').delete().eq('id', billId);
                if (delError) return Swal.fire('Error', delError.message, 'error');

                const currentOutstanding = parseFloat(activeAccount.outstanding_balance || 0);
                const newOutstanding = currentOutstanding - amount;
                await supabaseClient.from('vendors').update({ outstanding_balance: newOutstanding }).eq('id', activeAccount.id);

                Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                await fetchDirectory();
                selectVendor(activeAccount.id, document.querySelector('.account-item.active'));
            }
        }

        async function openAddAccountModal() {
            const isFin = activeTab === 'finances' ? 'selected' : '';
            const isVen = activeTab === 'vendors' ? 'selected' : '';

            const { value: formValues } = await Swal.fire({
                title: 'Create New Account',
                html: `
                    <select id="swal-type" class="swal2-input form-select mb-3">
                        <option value="vendor" ${isVen}>Vendor / Supplier</option>
                        <option value="finance" ${isFin}>Finance / Kuri / Bank</option>
                    </select>
                    <input id="swal-name" class="swal2-input form-control mb-3" placeholder="Account Name (Required)">
                    <input id="swal-phone" class="swal2-input form-control mb-3" placeholder="Phone or Acct No. (Optional)">
                    <input id="swal-gst" class="swal2-input form-control mb-3" placeholder="GST or Ref ID (Optional)">
                    <input id="swal-bal" class="swal2-input form-control" type="number" placeholder="Opening Balance Owed (₹)">
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Save Account',
                confirmButtonColor: '#2C2C2C',
                preConfirm: () => {
                    const name = document.getElementById('swal-name').value;
                    if (!name || !name.trim()) { Swal.showValidationMessage('Account Name is required'); return false; }
                    const initBal = parseFloat(document.getElementById('swal-bal').value) || 0;
                    return {
                        type: document.getElementById('swal-type').value,
                        name: name.trim().toUpperCase(),
                        phone: document.getElementById('swal-phone').value || null,
                        gst: document.getElementById('swal-gst').value || null,
                        openingBalance: initBal,
                        balance: initBal // Initial outstanding is same as opening
                    };
                }
            });

            if (formValues) {
                const { error } = await supabaseClient.from('vendors').insert([{
                    shop_id: currentShopId,
                    account_type: formValues.type,
                    name: formValues.name,
                    phone: formValues.phone,
                    gst_number: formValues.gst,
                    opening_balance: formValues.openingBalance,
                    outstanding_balance: formValues.balance
                }]);

                if (error) Swal.fire('Error', error.message, 'error');
                else {
                    Swal.fire({ title: 'Success!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                    await fetchDirectory();
                }
            }
        }

        async function openAddBillModal() {
            if (!activeAccount) return;
            const titleLabel = activeAccount.account_type === 'finance' ? 'Add Installment Due' : 'Add Due Bill';

            const { value: billData } = await Swal.fire({
                title: `${titleLabel}`,
                text: activeAccount.name.toUpperCase(),
                html: `
                    <input id="swal-bill-no" class="swal2-input form-control mb-3" placeholder="Reference / Invoice No.">
                    <input id="swal-bill-amt" class="swal2-input form-control mb-3 fw-bold text-danger" type="number" placeholder="Amount (₹) (Required)">
                    <input id="swal-bill-date" class="swal2-input form-control" type="date" value="${new Date().toISOString().split('T')[0]}">
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Save Entry',
                confirmButtonColor: '#C5A059',
                preConfirm: () => {
                    const amount = parseFloat(document.getElementById('swal-bill-amt').value);
                    if (!amount || amount <= 0) { Swal.showValidationMessage('Enter a valid amount'); return false; }
                    return {
                        billNumber: document.getElementById('swal-bill-no').value || null,
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

                const newBalance = parseFloat(activeAccount.outstanding_balance || 0) + billData.amount;
                await supabaseClient.from('vendors').update({ outstanding_balance: newBalance }).eq('id', activeAccount.id);

                Swal.fire({ title: 'Logged!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                await fetchDirectory();
                selectVendor(activeAccount.id, document.querySelector('.account-item.active'));
            }
        }

        async function openPayModal() {
            if (!activeAccount) return;

            const { value: payData } = await Swal.fire({
                title: `Record Payment`,
                text: activeAccount.name.toUpperCase(),
                html: `
                    <input id="swal-pay-amt" class="swal2-input form-control mb-3 fw-bold text-success" type="number" placeholder="Amount (₹) (Required)">
                    <select id="swal-pay-source" class="swal2-input form-select mb-3">
                        <option value="DRAWER">Cash (Daily Drawer)</option>
                        <option value="RESERVE">Cash (Master Vault)</option>
                        <option value="UPI">Digital (Bank / UPI)</option>
                    </select>
                    <input id="swal-pay-note" class="swal2-input form-control mb-3" placeholder="Reference Note">
                    <label class="field-label text-start px-1">Payment Date</label>
                    <input id="swal-pay-date" class="swal2-input form-control" type="date" value="${new Date().toISOString().split('T')[0]}" max="${new Date().toISOString().split('T')[0]}">
                `,
                focusConfirm: false,
                showCancelButton: true,
                confirmButtonText: 'Confirm Payment',
                confirmButtonColor: '#2C2C2C',
                preConfirm: () => {
                    const amount = parseFloat(document.getElementById('swal-pay-amt').value);
                    if (!amount || amount <= 0) { Swal.showValidationMessage('Enter a valid amount'); return false; }
                    const date = document.getElementById('swal-pay-date').value;
                    if (!date) { Swal.showValidationMessage('Please select a payment date'); return false; }
                    return {
                        amount: amount,
                        source: document.getElementById('swal-pay-source').value,
                        note: document.getElementById('swal-pay-note').value || null,
                        date: date
                    };
                }
            });

            if (payData) {
                const paymentTimestamp = getManualTimestamp(payData.date);

                const { data: shopData } = await supabaseClient.from('shops').select('master_ledger_balance').eq('id', currentShopId).single();
                let currentReserve = parseFloat(shopData.master_ledger_balance || 0);

                if (payData.source === 'RESERVE' && payData.amount > currentReserve) {
                    return Swal.fire('Insufficient Funds', 'Not enough balance in the Reserve Vault.', 'error');
                }

                if (payData.source === 'RESERVE') {
                    const newReserve = currentReserve - payData.amount;
                    await supabaseClient.from('shops').update({ master_ledger_balance: newReserve }).eq('id', currentShopId);
                    
                    await supabaseClient.from('master_ledger_logs').insert([{
                        shop_id: currentShopId,
                        vendor_id: activeAccount.id,
                        transaction_type: 'VENDOR_PAYOUT',
                        reference_note: payData.note || `Paid ${activeAccount.name}`,
                        amount: -payData.amount,
                        created_at: paymentTimestamp
                    }]);
                } 
                else {
                    await supabaseClient.from('daily_transactions').insert([{
                        shop_id: currentShopId,
                        transaction_type: 'EXPENSE',
                        category: activeAccount.account_type === 'finance' ? 'finance' : 'vendor',
                        payment_method: payData.source === 'UPI' ? 'UPI' : 'CASH',
                        amount: payData.amount,
                        vendor_id: activeAccount.id,
                        reference_note: payData.note || null,
                        status: 'open',
                        created_at: paymentTimestamp
                    }]);
                }

                const newBalance = parseFloat(activeAccount.outstanding_balance || 0) - payData.amount;
                await supabaseClient.from('vendors').update({ outstanding_balance: newBalance }).eq('id', activeAccount.id);

                Swal.fire({ title: 'Payment Recorded!', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                await fetchDirectory();
                selectVendor(activeAccount.id, document.querySelector('.account-item.active'));
            }
        }

        function getManualTimestamp(dateStr) {
            // Keeps the current time-of-day but applies the admin-selected date,
            // matching the same convention used on the Dashboard and Master Ledger pages.
            const now = new Date();
            const localString = `${dateStr}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            return new Date(localString).toISOString();
        }

        async function promptPDFDownload() {
            if (!activeAccount) return;

            const btn = document.getElementById('pdf-btn');
            const originalLabel = btn.innerText;
            btn.innerText = 'GENERATING...';
            btn.disabled = true;

            document.querySelectorAll('.no-print').forEach(el => el.classList.add('d-none'));
            const element = document.getElementById('pdf-export-area');

            // The transaction table normally scrolls horizontally on narrow screens
            // (.table-responsive). html2canvas captures the DOM as laid out, so a
            // scrollable, clipped container produces a cut-off / blank PDF. Force it
            // fully visible just for the capture, then restore it afterwards.
            const tableWrap = element.querySelector('.table-responsive');
            const prevOverflow = tableWrap ? tableWrap.style.overflowX : null;
            if (tableWrap) tableWrap.style.overflowX = 'visible';

            // Force the export area itself to a fixed, comfortable width for the capture.
            // This uses the browser's REAL layout engine (not html2canvas's simulated
            // "window", which caused a previous version of this to clip content) so the
            // PDF comes out identical whether generated from a phone or a desktop.
            const prevWidth = element.style.width;
            const prevMaxWidth = element.style.maxWidth;
            element.style.width = '800px';
            element.style.maxWidth = '800px';

            const opt = {
                margin: [12, 8, 12, 8],
                filename: `${activeAccount.name.trim().toUpperCase().replace(/\s+/g, '_')}_Statement_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'thead', 'img'] }
            };

            try {
                await html2pdf().from(element).set(opt).save();
            } catch (err) {
                console.error('PDF generation failed:', err);
                Swal.fire('PDF Error', 'Could not generate the statement PDF. Please try again.', 'error');
            } finally {
                if (tableWrap) tableWrap.style.overflowX = prevOverflow;
                element.style.width = prevWidth;
                element.style.maxWidth = prevMaxWidth;
                document.querySelectorAll('.no-print').forEach(el => el.classList.remove('d-none'));
                btn.innerText = originalLabel;
                btn.disabled = false;
            }
        }
