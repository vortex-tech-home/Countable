let currentShopId = null;
let allStaff = [];
let activeStaff = null;

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let originalAttendanceMap = {};

const STATES = ['NONE', 'FULL', 'LEAVE', 'HALF'];

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

        if (profile && profile.role === 'admin') {
            currentShopId = profile.shop_id;
            document.getElementById('admin-content').classList.remove('d-none');
            await loadStaffList();
        } else {
            window.location.replace('dashboard.html');
        }
    } catch (err) {
        console.error('Staff Init Error:', err);
    }
});

async function loadStaffList() {
    if (!currentShopId) return;

    const { data: staff, error } = await supabaseClient
        .from('staff')
        .select('id, name, phone')
        .eq('shop_id', currentShopId);

    const list = document.getElementById('staff-list');
    if (error) {
        list.innerHTML = `<div class="empty-state text-danger">Error: ${error.message}</div>`;
        return;
    }

    const sortByName = (a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase());
    allStaff = (staff || []).sort(sortByName);

    document.getElementById('staff-count').innerText = allStaff.length;
    renderStaffList();
}

function renderStaffList() {
    const list = document.getElementById('staff-list');
    list.innerHTML = '';

    const query = (document.getElementById('staff-search')?.value || '').trim().toLowerCase();
    const filtered = query
        ? allStaff.filter(s => (s.name || '').toLowerCase().includes(query) || (s.phone || '').toLowerCase().includes(query))
        : allStaff;

    if (filtered.length === 0) {
        list.innerHTML = `<div class="empty-state">No staff members found.</div>`;
        return;
    }

    filtered.forEach(s => {
        const isSelected = activeStaff && activeStaff.id === s.id ? 'active' : '';
        const item = document.createElement('div');
        item.className = `staff-item ${isSelected}`;
        item.dataset.id = s.id;
        item.onclick = () => openStaff(s.id);
        item.innerHTML = `
            <div>
                <div class="staff-name">${s.name}</div>
                ${s.phone ? `<div class="staff-sub fin-math">${s.phone}</div>` : ''}
            </div>
            <span style="font-size: 0.75rem; opacity: 0.6;">&rarr;</span>
        `;
        list.appendChild(item);
    });
}

async function openStaff(staffId) {
    const found = allStaff.find(s => s.id === staffId);
    if (!found) return;
    activeStaff = found;

    document.querySelectorAll('.staff-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === staffId);
    });

    document.getElementById('empty-pane').classList.add('d-none');
    const dashPane = document.getElementById('dashboard-pane');
    dashPane.classList.remove('d-none');
    dashPane.classList.add('d-flex');

    document.getElementById('selected-staff-name').innerText = activeStaff.name.toUpperCase();
    document.getElementById('selected-staff-phone').innerText = `Phone: ${activeStaff.phone || '-'}`;

    await Promise.all([
        generateCalendar(),
        loadPaymentHistory()
    ]);

    if (window.innerWidth < 992) {
        dashPane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    if (activeStaff) generateCalendar();
}

async function generateCalendar() {
    if (!activeStaff) return;

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    document.getElementById('save-attendance-btn').classList.add('d-none');

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    document.getElementById('calendar-month-title').innerText = `${monthNames[currentMonth]} ${currentYear}`;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => {
        grid.innerHTML += `<div class="cal-day-header">${d}</div>`;
    });

    // Calculate exact days in month FIRST so Postgres never receives an invalid date like Feb 31 or Apr 31
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const monthPadded = String(currentMonth + 1).padStart(2, '0');
    const startDate = `${currentYear}-${monthPadded}-01`;
    const endDate = `${currentYear}-${monthPadded}-${String(totalDaysInMonth).padStart(2, '0')}`;

    const { data: records, error } = await supabaseClient
        .from('staff_attendance')
        .select('record_date, status')
        .eq('shop_id', currentShopId)
        .eq('staff_id', activeStaff.id)
        .gte('record_date', startDate)
        .lte('record_date', endDate);

    if (error) {
        console.error('Attendance Fetch Error:', error);
        Swal.fire('Database Error', `Could not load attendance: ${error.message}`, 'error');
    }

    originalAttendanceMap = {};
    if (records) {
        records.forEach(r => {
            originalAttendanceMap[r.record_date] = r.status;
        });
    }

    for (let i = 0; i < firstDayIndex; i++) {
        grid.innerHTML += `<div class="cal-cell empty"></div>`;
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${currentYear}-${monthPadded}-${String(day).padStart(2, '0')}`;
        const savedStatus = originalAttendanceMap[dateStr] || 'NONE';
        const stateIdx = Math.max(0, STATES.indexOf(savedStatus));
        const colorClass = savedStatus !== 'NONE' ? `state-${savedStatus}` : '';
        const tagText = savedStatus !== 'NONE' ? savedStatus : '';

        grid.innerHTML += `
            <div class="cal-cell ${colorClass}" data-state="${stateIdx}" data-date="${dateStr}" onclick="toggleAttendance(this)">
                <span>${day}</span>
                <span class="cal-status-tag">${tagText}</span>
            </div>
        `;
    }

    updateAttendanceStats();
}

function toggleAttendance(element) {
    const currentStateIdx = parseInt(element.getAttribute('data-state'), 10);
    const nextStateIdx = (currentStateIdx + 1) % STATES.length;
    const stateName = STATES[nextStateIdx];

    element.setAttribute('data-state', nextStateIdx);
    element.classList.remove('state-FULL', 'state-LEAVE', 'state-HALF');
    if (stateName !== 'NONE') {
        element.classList.add(`state-${stateName}`);
    }

    const tagEl = element.querySelector('.cal-status-tag');
    if (tagEl) tagEl.innerText = stateName !== 'NONE' ? stateName : '';

    updateAttendanceStats();

    // Check if any cell differs from original DB state
    let hasChanges = false;
    document.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
        const dStr = cell.getAttribute('data-date');
        const sIdx = parseInt(cell.getAttribute('data-state'), 10);
        const sName = STATES[sIdx];
        const orig = originalAttendanceMap[dStr] || 'NONE';
        if (sName !== orig) hasChanges = true;
    });

    const btn = document.getElementById('save-attendance-btn');
    if (hasChanges) {
        btn.classList.remove('d-none');
        btn.innerText = 'Save Attendance';
        btn.disabled = false;
    } else {
        btn.classList.add('d-none');
    }
}

function updateAttendanceStats() {
    let fullCount = 0;
    let halfCount = 0;
    let leaveCount = 0;

    document.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
        const stateIdx = parseInt(cell.getAttribute('data-state'), 10);
        const stateName = STATES[stateIdx];
        if (stateName === 'FULL') fullCount++;
        else if (stateName === 'HALF') halfCount++;
        else if (stateName === 'LEAVE') leaveCount++;
    });

    const effective = fullCount + (halfCount * 0.5);

    document.getElementById('stat-full').innerText = fullCount;
    document.getElementById('stat-half').innerText = halfCount;
    document.getElementById('stat-leave').innerText = leaveCount;
    document.getElementById('stat-effective').innerText = effective.toFixed(1);
}

async function saveAttendance() {
    if (!activeStaff || !currentShopId) return;

    const btn = document.getElementById('save-attendance-btn');
    btn.innerText = 'Saving...';
    btn.disabled = true;

    const changedDates = [];
    const rowsToInsert = [];

    document.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
        const dateStr = cell.getAttribute('data-date');
        const stateIdx = parseInt(cell.getAttribute('data-state'), 10);
        const stateName = STATES[stateIdx];
        const originalState = originalAttendanceMap[dateStr] || 'NONE';

        if (stateName !== originalState) {
            changedDates.push(dateStr);
            if (stateName !== 'NONE') {
                rowsToInsert.push({
                    shop_id: currentShopId,
                    staff_id: activeStaff.id,
                    record_date: dateStr,
                    status: stateName
                });
            }
        }
    });

    try {
        // Atomic Delete-then-Insert on modified dates: works reliably even if UNIQUE constraint was omitted
        if (changedDates.length > 0) {
            const { error: delError } = await supabaseClient
                .from('staff_attendance')
                .delete()
                .eq('shop_id', currentShopId)
                .eq('staff_id', activeStaff.id)
                .in('record_date', changedDates);

            if (delError) throw delError;
        }

        if (rowsToInsert.length > 0) {
            const { error: insError } = await supabaseClient
                .from('staff_attendance')
                .insert(rowsToInsert);

            if (insError) throw insError;
        }

        Swal.fire({ title: 'Attendance Saved', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await generateCalendar();
    } catch (err) {
        console.error('Save Attendance Error:', err);
        Swal.fire('Save Failed', err.message || 'Could not update attendance.', 'error');
        btn.innerText = 'Save Attendance';
        btn.disabled = false;
    }
}

/* ---------- STAFF CRUD ---------- */
async function addNewStaff() {
    const { value: formValues } = await Swal.fire({
        title: 'Add Team Member',
        html: `
            <div class="mb-3">
                <label class="ent-label">Full Name *</label>
                <input id="swal-staff-name" class="form-control" placeholder="e.g. Rahul">
            </div>
            <div>
                <label class="ent-label">Phone Number</label>
                <input id="swal-staff-phone" class="form-control fin-math" placeholder="Optional contact number">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Save Staff',
        preConfirm: () => {
            const name = document.getElementById('swal-staff-name').value.trim();
            if (!name) {
                Swal.showValidationMessage('Staff name is required');
                return false;
            }
            return {
                name: name.toUpperCase(),
                phone: document.getElementById('swal-staff-phone').value.trim() || null
            };
        }
    });

    if (formValues && currentShopId) {
        const { data: inserted, error } = await supabaseClient
            .from('staff')
            .insert([{
                shop_id: currentShopId,
                name: formValues.name,
                phone: formValues.phone
            }])
            .select();

        if (error) {
            return Swal.fire('Error', error.message, 'error');
        }

        Swal.fire({ title: 'Staff Added', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadStaffList();
        if (inserted && inserted.length > 0) {
            await openStaff(inserted[0].id);
        }
    }
}

async function editStaffDetails() {
    if (!activeStaff) return;

    const { value: formValues } = await Swal.fire({
        title: 'Edit Team Member',
        html: `
            <div class="mb-3">
                <label class="ent-label">Full Name *</label>
                <input id="swal-edit-staff-name" class="form-control" value="${activeStaff.name}">
            </div>
            <div>
                <label class="ent-label">Phone Number</label>
                <input id="swal-edit-staff-phone" class="form-control fin-math" value="${activeStaff.phone || ''}">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Update',
        preConfirm: () => {
            const name = document.getElementById('swal-edit-staff-name').value.trim();
            if (!name) {
                Swal.showValidationMessage('Name is required');
                return false;
            }
            return {
                name: name.toUpperCase(),
                phone: document.getElementById('swal-edit-staff-phone').value.trim() || null
            };
        }
    });

    if (formValues) {
        const { error } = await supabaseClient
            .from('staff')
            .update({
                name: formValues.name,
                phone: formValues.phone
            })
            .eq('id', activeStaff.id);

        if (error) return Swal.fire('Error', error.message, 'error');

        Swal.fire({ title: 'Updated', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadStaffList();
        await openStaff(activeStaff.id);
    }
}

/* ---------- WAGE PAYMENTS ---------- */
async function loadPaymentHistory() {
    if (!activeStaff) return;

    const { data: txns, error } = await supabaseClient
        .from('daily_transactions')
        .select('id, created_at, amount, payment_method, reference_note')
        .eq('shop_id', currentShopId)
        .eq('staff_id', activeStaff.id)
        .eq('transaction_type', 'EXPENSE')
        .order('created_at', { ascending: false })
        .limit(25);

    const tbody = document.getElementById('payment-history');
    tbody.innerHTML = '';

    if (error) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-state text-danger">Error loading history</td></tr>`;
        return;
    }

    let totalPaid = 0;

    if (txns && txns.length > 0) {
        txns.forEach(txn => {
            const amt = parseFloat(txn.amount || 0);
            totalPaid += amt;

            const date = new Date(txn.created_at).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const badgeClass = txn.payment_method === 'UPI' ? 'bg-light text-secondary' : 'bg-light text-dark';
            const noteHtml = txn.reference_note && txn.reference_note !== 'Staff Payout'
                ? `<div class="text-muted" style="font-size: 0.7rem;">${txn.reference_note}</div>`
                : '';

            tbody.innerHTML += `
                <tr>
                    <td>
                        <div class="fw-bold small text-dark fin-math">${date}</div>
                        ${noteHtml}
                    </td>
                    <td class="text-center">
                        <span class="badge-mode ${badgeClass}">${txn.payment_method}</span>
                    </td>
                    <td class="text-end fw-bold text-danger fin-math">- ₹ ${amt.toFixed(2)}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No wage payments logged yet.</td></tr>`;
    }

    document.getElementById('wage-total-badge').innerText = `₹ ${totalPaid.toFixed(2)}`;
}

async function logStaffPayment() {
    if (!activeStaff) return;
    const todayStr = new Date().toISOString().split('T')[0];

    const { value: payData } = await Swal.fire({
        title: 'Record Staff Wage / Advance',
        html: `
            <div class="mb-3">
                <label class="ent-label">Team Member</label>
                <div class="fw-bold text-dark">${activeStaff.name}</div>
            </div>
            <div class="mb-3">
                <label class="ent-label">Payment Mode</label>
                <div class="segmented">
                    <input type="radio" class="btn-check" name="swal_wage_mode" id="wage_cash" value="CASH" checked>
                    <label for="wage_cash">Physical Cash (Drawer)</label>
                    <input type="radio" class="btn-check" name="swal_wage_mode" id="wage_upi" value="UPI">
                    <label for="wage_upi">UPI / Digital</label>
                </div>
            </div>
            <div class="row g-2 mb-3">
                <div class="col-6">
                    <label class="ent-label">Amount (₹) *</label>
                    <input id="swal-pay-amt" class="form-control fin-math fw-bold text-danger" type="number" step="0.01" placeholder="0.00">
                </div>
                <div class="col-6">
                    <label class="ent-label">Payment Date</label>
                    <input id="swal-pay-date" class="form-control" type="date" value="${todayStr}" max="${todayStr}">
                </div>
            </div>
            <div>
                <label class="ent-label">Reference Note</label>
                <input id="swal-pay-note" class="form-control" placeholder="e.g. Weekly Wage or Salary Advance">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Post Wage',
        preConfirm: () => {
            const amount = parseFloat(document.getElementById('swal-pay-amt').value);
            if (!amount || amount <= 0) {
                Swal.showValidationMessage('Enter a valid payment amount');
                return false;
            }
            const mode = document.querySelector('input[name="swal_wage_mode"]:checked')?.value || 'CASH';
            const dateVal = document.getElementById('swal-pay-date').value;
            const note = document.getElementById('swal-pay-note').value.trim() || 'Staff Payout';
            return { amount, source: mode, dateVal, note };
        }
    });

    if (payData) {
        const now = new Date();
        const timestamp = new Date(`${payData.dateVal}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`).toISOString();

        const { error } = await supabaseClient.from('daily_transactions').insert([{
            shop_id: currentShopId,
            staff_id: activeStaff.id,
            transaction_type: 'EXPENSE',
            category: 'staff',
            payment_method: payData.source,
            amount: payData.amount,
            reference_note: payData.note,
            status: 'open',
            created_at: timestamp
        }]);

        if (error) return Swal.fire('Error', error.message, 'error');

        Swal.fire({ title: 'Wage Logged', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
        await loadPaymentHistory();
    }
}
