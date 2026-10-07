let currentShopId = null;
let currentShopName = 'Enterprise Shop';
let isAdmin = false;
let masterTransactions = [];
let currentFilteredData = [];
let currentViewMode = localStorage.getItem('master-ledger-view') || 'TABLE';

window.onload = async () => {
    try {
        const { data: userData, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !userData || !userData.user) return window.location.replace('index.html');

        const { data: profile } = await supabaseClient.from('user_profiles').select('role, shop_id').eq('id', userData.user.id).single();
        if (profile) {
            if (profile.role !== 'admin') return window.location.replace('dashboard.html');
            currentShopId = profile.shop_id;
            isAdmin = true;

            document.getElementById('admin-content').classList.remove('d-none');

            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const today = now.toISOString().split('T')[0];
            document.getElementById('filter-date-start').value = firstDay;
            document.getElementById('filter-date-end').value = today;

            syncViewButtons();
            await loadMasterLedgerData();
        }
    } catch (err) { console.error(err); }
};

function setLedgerView(mode) {
    currentViewMode = mode;
    localStorage.setItem('master-ledger-view', mode);
    syncViewButtons();
    renderLedger(currentFilteredData);
}

function syncViewButtons() {
    const tableBtn = document.getElementById('btn-view-table');
    const gridBtn = document.getElementById('btn-view-grid');
    const tableContainer = document.getElementById('ledger-table-container');
    const gridContainer = document.getElementById('ledger-grid-container');

    if (currentViewMode === 'GRID') {
        gridBtn.classList.add('active');
        tableBtn.classList.remove('active');
        tableContainer.classList.add('d-none');
        gridContainer.classList.remove('d-none');
    } else {
        tableBtn.classList.add('active');
        gridBtn.classList.remove('active');
        gridContainer.classList.add('d-none');
        tableContainer.classList.remove('d-none');
    }
}

async function loadMasterLedgerData() {
    if (!currentShopId) return;

    masterTransactions = [];
    let dynamicVaultBalance = 0;

    // Fetch shop metadata for PDF header
    const { data: shopData } = await supabaseClient.from('shops').select('name').eq('id', currentShopId).single();
    if (shopData && shopData.name) currentShopName = shopData.name;

    const { data: reserveLogs } = await supabaseClient.from('master_ledger_logs').select('*').eq('shop_id', currentShopId).order('created_at', { ascending: false });
    
    if (reserveLogs) {
        reserveLogs.forEach(log => {
            const isLegacySweep = log.reference_note && log.reference_note.includes('Daily Cash Closing');
            if (isLegacySweep) return;

            const rawAmt = parseFloat(log.amount);
            dynamicVaultBalance += rawAmt;

            masterTransactions.push({
                id: log.id,
                rawDate: new Date(log.created_at),
                dateStr: new Date(log.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                timeStr: new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                source: 'RESERVE',
                badge: 'CAPITAL',
                ref: log.reference_note || 'Manual Adjustment',
                isPositive: rawAmt >= 0,
                amount: Math.abs(rawAmt),
                isGrouped: false
            });
        });
    }

    const { data: dailyTxns } = await supabaseClient.from('daily_transactions').select('*').eq('shop_id', currentShopId);
    
    let dailyAggregates = {};

    if (dailyTxns) {
        dailyTxns.forEach(txn => {
            if (txn.payment_method !== 'CASH') return;

            const isLegacySweepExp = txn.reference_note && txn.reference_note.includes('Transferred to Master Vault');
            if (isLegacySweepExp) return;

            const dateKey = txn.created_at.split('T')[0];
            if (!dailyAggregates[dateKey]) dailyAggregates[dateKey] = { net: 0, dateRaw: new Date(dateKey + 'T12:00:00') };

            const amt = parseFloat(txn.amount);
            if (txn.transaction_type === 'INCOME') dailyAggregates[dateKey].net += amt;
            else if (txn.transaction_type === 'EXPENSE') dailyAggregates[dateKey].net -= amt;
        });
    }

    for (let dateKey in dailyAggregates) {
        let netFlow = dailyAggregates[dateKey].net;
        dynamicVaultBalance += netFlow;

        if (netFlow !== 0) {
            masterTransactions.push({
                id: 'agg_' + dateKey,
                rawDate: dailyAggregates[dateKey].dateRaw,
                dateStr: new Date(dateKey).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
                timeStr: 'EOD Sync',
                source: 'DAILY',
                badge: 'CONSOLIDATED BALANCE',
                ref: 'Daily Floor Cash Consolidation',
                isPositive: netFlow > 0,
                amount: Math.abs(netFlow),
                isGrouped: true
            });
        }
    }

    document.getElementById('vault-balance').innerText = dynamicVaultBalance.toFixed(2);

    masterTransactions.sort((a, b) => b.rawDate - a.rawDate);
    applyFilters();
}

function applyFilters() {
    const sourceFilter = document.getElementById('ledger-source-filter').value;
    const startDateStr = document.getElementById('filter-date-start').value;
    const endDateStr = document.getElementById('filter-date-end').value;

    let startTimestamp = startDateStr ? new Date(`${startDateStr}T00:00:00`).getTime() : null;
    let endTimestamp = endDateStr ? new Date(`${endDateStr}T23:59:59.999`).getTime() : null;

    currentFilteredData = masterTransactions.filter(item => {
        if (sourceFilter !== 'ALL' && item.source !== sourceFilter) return false;
        const itemTime = item.rawDate.getTime();
        if (startTimestamp && itemTime < startTimestamp) return false;
        if (endTimestamp && itemTime > endTimestamp) return false;
        return true;
    });

    renderLedger(currentFilteredData);
}

function renderLedger(data) {
    document.getElementById('record-count').innerText = `${data.length} Records`;
    if (currentViewMode === 'GRID') {
        renderGrid(data);
    } else {
        renderTable(data);
    }
}

function renderTable(data) {
    const tbody = document.getElementById('ledger-body');
    tbody.innerHTML = '';

    if (data.length > 0) {
        data.forEach(item => {
            const colorClass = item.isPositive ? 'text-success' : 'text-danger';
            const sign = item.isPositive ? '+' : '-';
            
            let badgeClass = 'bg-light text-dark';
            if (item.badge === 'CAPITAL') badgeClass = 'bg-light text-primary border-primary';

            let adminEditBtn = item.isGrouped ? `
                <td data-label="Action" class="text-center pe-md-4 no-print align-middle"><span class="text-muted small">Auto-Synced</span></td>
            ` : `
                <td data-label="Action" class="text-center pe-md-4 no-print align-middle">
                    <div class="d-flex justify-content-end justify-content-md-center gap-2">
                        <button class="action-btn text-dark" onclick="editTransaction('${item.id}', '${item.source}', ${item.amount}, ${item.isPositive})">Edit</button>
                        <button class="action-btn danger" onclick="deleteTransaction('${item.id}', '${item.source}')">Del</button>
                    </div>
                </td>
            `;

            tbody.innerHTML += `
                <tr>
                    <td data-label="Date" class="ps-md-4 py-3">
                        <div class="fw-bold text-dark small">${item.dateStr}</div>
                        <div class="text-muted mobile-hide fin-math" style="font-size: 0.75rem;">${item.timeStr}</div>
                    </td>
                    <td data-label="Type" class="text-end text-md-center py-3">
                        <span class="badge-mode ${badgeClass}">${item.badge}</span>
                    </td>
                    <td data-label="Details" class="py-3 fw-semibold text-dark mobile-hide" style="font-size: 0.85rem;">${item.ref}</td>
                    <td data-label="Amount" class="text-end py-3 fw-bold ${colorClass} fin-math fs-6">${sign} ₹ ${item.amount.toFixed(2)}</td>
                    ${adminEditBtn}
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No transactions found matching filters.</td></tr>`;
    }
}

function renderGrid(data) {
    const grid = document.getElementById('ledger-grid-container');
    grid.innerHTML = '';

    if (data.length > 0) {
        data.forEach(item => {
            const colorClass = item.isPositive ? 'text-success' : 'text-danger';
            const sign = item.isPositive ? '+' : '-';
            
            let badgeClass = 'bg-light text-dark';
            if (item.badge === 'CAPITAL') badgeClass = 'bg-light text-primary border-primary';

            const actionsHtml = item.isGrouped
                ? `<span class="text-muted" style="font-size: 0.7rem; font-weight: 600;">Auto-Synced</span>`
                : `<div class="d-flex gap-1">
                        <button class="action-btn" onclick="editTransaction('${item.id}', '${item.source}', ${item.amount}, ${item.isPositive})">Edit</button>
                        <button class="action-btn danger" onclick="deleteTransaction('${item.id}', '${item.source}')">Del</button>
                   </div>`;

            grid.innerHTML += `
                <div class="grid-tile">
                    <div class="grid-tile-top">
                        <div>
                            <div class="fw-bold text-dark" style="font-size: 0.82rem;">${item.ref}</div>
                            <div class="text-muted fin-math" style="font-size: 0.72rem; font-weight: 600;">${item.dateStr} &bull; ${item.timeStr}</div>
                        </div>
                        <div class="fw-bold ${colorClass} fin-math" style="font-size: 0.95rem; white-space: nowrap;">
                            ${sign} ₹ ${item.amount.toFixed(2)}
                        </div>
                    </div>
                    <div class="grid-tile-bottom">
                        <span class="badge-mode ${badgeClass}">${item.badge}</span>
                        ${actionsHtml}
                    </div>
                </div>
            `;
        });
    } else {
        grid.innerHTML = `<div class="empty-state w-100" style="grid-column: 1 / -1;">No transactions found matching filters.</div>`;
    }
}

/* ---------- Direct PDF File Generator ---------- */
function downloadLedgerPDF() {
    if (!currentFilteredData || currentFilteredData.length === 0) {
        return Swal.fire('No Data', 'There are no records in the current filter range to export.', 'warning');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const startDate = document.getElementById('filter-date-start').value || 'Start';
    const endDate = document.getElementById('filter-date-end').value || 'Present';
    const currentVault = document.getElementById('vault-balance').innerText;

    // Calculate Filtered Period Summary
    let periodCredit = 0;
    let periodDebit = 0;
    currentFilteredData.forEach(item => {
        if (item.isPositive) periodCredit += item.amount;
        else periodDebit += item.amount;
    });
    const periodNet = periodCredit - periodDebit;

    // Document Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`${currentShopName.toUpperCase()} - UNIFIED CASH LEDGER`, 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Statement Period: ${startDate} to ${endDate}`, 14, 24);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 29);

    // Summary Box
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(248, 250, 252);
    doc.rect(14, 34, 182, 16, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('PERIOD INFLOW (+)', 18, 40);
    doc.text('PERIOD OUTFLOW (-)', 65, 40);
    doc.text('PERIOD NET FLOW', 115, 40);
    doc.text('MASTER VAULT BALANCE', 155, 40);

    doc.setFontSize(10);
    doc.setTextColor(22, 163, 74);
    doc.text(`Rs. ${periodCredit.toFixed(2)}`, 18, 46);

    doc.setTextColor(220, 38, 38);
    doc.text(`Rs. ${periodDebit.toFixed(2)}`, 65, 46);

    doc.setTextColor(15, 23, 42);
    doc.text(`${periodNet >= 0 ? '+' : '-'} Rs. ${Math.abs(periodNet).toFixed(2)}`, 115, 46);
    doc.text(`Rs. ${currentVault}`, 155, 46);

    // Build Table Rows
    const tableRows = currentFilteredData.map(item => [
        `${item.dateStr} (${item.timeStr})`,
        item.badge,
        item.ref,
        item.isPositive ? `+ Rs. ${item.amount.toFixed(2)}` : '-',
        !item.isPositive ? `- Rs. ${item.amount.toFixed(2)}` : '-'
    ]);

    doc.autoTable({
        startY: 55,
        head: [['Date & Time', 'Classification', 'Reference Details', 'Credit (In)', 'Debit (Out)']],
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
            0: { cellWidth: 38 },
            1: { cellWidth: 38, fontStyle: 'bold' },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 28, halign: 'right', textColor: [22, 163, 74], fontStyle: 'bold' },
            4: { cellWidth: 28, halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' }
        },
        alternateRowStyles: {
            fillColor: [249, 250, 251]
        },
        margin: { left: 14, right: 14 }
    });

    const cleanFileName = `Unified_Ledger_${startDate}_to_${endDate}.pdf`;
    doc.save(cleanFileName);
}

/* ---------- Manual Adjustments & Actions ---------- */
function getManualTimestamp(dateStr) {
    const now = new Date();
    const localString = `${dateStr}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    return new Date(localString).toISOString(); 
}

async function openAddFundsModal() {
    const defaultDate = document.getElementById('filter-date-end').value || new Date().toISOString().split('T')[0];
    const { value: formValues } = await Swal.fire({
        title: 'Capital Deposit',
        html: `
            <label class="ent-label text-start">Entry Date</label>
            <input id="swal-date" class="swal2-input form-control mb-3 fw-bold text-dark" type="date" value="${defaultDate}">
            <label class="ent-label text-start">Amount (₹)</label>
            <input id="swal-amt" class="swal2-input form-control mb-3 fw-bold text-success fin-math" type="number" placeholder="Required">
            <label class="ent-label text-start">Reference Note</label>
            <input id="swal-note" class="swal2-input form-control" placeholder="Optional Note">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Deposit',
        confirmButtonColor: '#0f172a',
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('swal-amt').value);
            const dateVal = document.getElementById('swal-date').value;
            if (!amount || amount <= 0) { Swal.showValidationMessage('Enter a valid amount'); return false; }
            return { amount: amount, note: document.getElementById('swal-note').value || 'Manual Vault Deposit', dateVal: dateVal };
        }
    });

    if (formValues) {
        const submissionTime = getManualTimestamp(formValues.dateVal);
        await supabaseClient.from('master_ledger_logs').insert([{ 
            shop_id: currentShopId, 
            transaction_type: 'DEPOSIT', 
            reference_note: formValues.note, 
            amount: formValues.amount,
            created_at: submissionTime 
        }]);
        
        Swal.fire({ title: 'Success', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadMasterLedgerData();
    }
}

async function openWithdrawModal() {
    const defaultDate = document.getElementById('filter-date-end').value || new Date().toISOString().split('T')[0];
    const { value: formValues } = await Swal.fire({
        title: 'Capital Withdrawal',
        html: `
            <label class="ent-label text-start">Entry Date</label>
            <input id="swal-date" class="swal2-input form-control mb-3 fw-bold text-dark" type="date" value="${defaultDate}">
            <label class="ent-label text-start">Amount (₹)</label>
            <input id="swal-amt" class="swal2-input form-control mb-3 fw-bold text-danger fin-math" type="number" placeholder="Required">
            <label class="ent-label text-start">Reference Note</label>
            <input id="swal-note" class="swal2-input form-control" placeholder="Optional Note">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Withdraw',
        confirmButtonColor: '#dc2626',
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('swal-amt').value);
            const dateVal = document.getElementById('swal-date').value;
            if (!amount || amount <= 0) { Swal.showValidationMessage('Enter a valid amount'); return false; }
            return { amount: amount, note: document.getElementById('swal-note').value || 'Manual Vault Withdrawal', dateVal: dateVal };
        }
    });

    if (formValues) {
        const submissionTime = getManualTimestamp(formValues.dateVal);
        await supabaseClient.from('master_ledger_logs').insert([{ 
            shop_id: currentShopId, 
            transaction_type: 'WITHDRAWAL', 
            reference_note: formValues.note, 
            amount: -formValues.amount,
            created_at: submissionTime 
        }]);
        
        Swal.fire({ title: 'Success', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadMasterLedgerData();
    }
}

async function editTransaction(id, source, absAmount, isPositive) {
    const { value: newAmountStr } = await Swal.fire({
        title: 'Edit Amount',
        input: 'number',
        inputValue: absAmount,
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        confirmButtonText: 'Update'
    });

    if (!newAmountStr) return; 
    const newAbsAmount = parseFloat(newAmountStr);
    if (isNaN(newAbsAmount) || newAbsAmount <= 0) return Swal.fire('Error', 'Invalid amount.', 'error');
    if (newAbsAmount === absAmount) return; 

    if (source === 'RESERVE') {
        const newSignedAmount = isPositive ? newAbsAmount : -Math.abs(newAbsAmount);
        const { error: updateErr } = await supabaseClient.from('master_ledger_logs').update({ amount: newSignedAmount }).eq('id', id);
        if (updateErr) return Swal.fire('Error', updateErr.message, 'error');
    }

    Swal.fire({ title: 'Updated', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadMasterLedgerData();
}

async function deleteTransaction(id, source) {
    const result = await Swal.fire({
        title: 'Delete Record?',
        text: "Balances will auto-correct.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Delete'
    });

    if (!result.isConfirmed) return;

    if (source === 'RESERVE') {
        const { error: delError } = await supabaseClient.from('master_ledger_logs').delete().eq('id', id);
        if (delError) return Swal.fire('Error', delError.message, 'error');
    }

    Swal.fire({ title: 'Deleted', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    await loadMasterLedgerData();
}
