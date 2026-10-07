// navbar.js — Enterprise Command Shell & Version Controller (v1.9.2)
async function loadEnterpriseLayout() {
    if (document.getElementById('sys-sidebar')) return;

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

        const isAdmin = profile && profile.role === 'admin';

        let shopName = 'ENTERPRISE SHOP';
        if (profile && profile.shop_id) {
            const { data: shop } = await supabaseClient
                .from('shops')
                .select('name')
                .eq('id', profile.shop_id)
                .single();
            if (shop && shop.name) shopName = shop.name.toUpperCase();
        }

        if (!document.getElementById('ent-font-css')) {
            const font = document.createElement('link');
            font.id = 'ent-font-css';
            font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
            font.rel = 'stylesheet';
            document.head.appendChild(font);
        }

        if (!document.getElementById('bs-css')) {
            const bs = document.createElement('link');
            bs.id = 'bs-css';
            bs.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css';
            bs.rel = 'stylesheet';
            document.head.appendChild(bs);
        }

        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

        // Per-module version registry & breadcrumb titles
        const MODULE_META = {
            'dashboard.html':     { title: 'Daybook Terminal',   defaultVer: 'v1.8.1' },
            'master-ledger.html': { title: 'Master Vault',       defaultVer: 'v1.9.2' },
            'accounts.html':      { title: 'Accounts Ledger',    defaultVer: 'v1.8.2' },
            'staff.html':         { title: 'Staff',              defaultVer: 'v1.9.2' },
            'summary.html':       { title: 'Business Analytics', defaultVer: 'v1.9.2' }
        };

        const activeMeta = MODULE_META[currentPage] || { title: 'Daybook Terminal', defaultVer: 'v1.9.2' };
        const activeVersion = window.APP_VERSION || activeMeta.defaultVer;
        window.APP_VERSION = activeVersion;

        const style = document.createElement('style');
        style.innerHTML = `
            :root {
                --ent-bg: #f3f4f6;
                --ent-surface: #ffffff;
                --ent-border: #d1d5db;
                --ent-border-light: #e5e7eb;
                --ent-ink: #0f172a;
                --ent-muted: #64748b;
                --ent-sidebar-bg: #090d16;
                --ent-sidebar-surface: #111827;
                --ent-sidebar-border: rgba(255, 255, 255, 0.08);
                --ent-accent: #3b82f6;
                --ent-danger: #dc2626;
                --ent-success: #16a34a;
            }

            body {
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
                background-color: var(--ent-bg) !important;
                color: var(--ent-ink);
                margin: 0 !important;
                overflow-x: hidden;
                -webkit-font-smoothing: antialiased;
            }

            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

            /* --- Enterprise Command Sidebar --- */
            .sidebar {
                height: 100vh;
                width: 76px;
                position: fixed;
                top: 0;
                left: 0;
                background: linear-gradient(180deg, var(--ent-sidebar-bg) 0%, var(--ent-sidebar-surface) 100%);
                color: #ffffff;
                z-index: 1001;
                border-right: 1px solid var(--ent-sidebar-border);
                box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
                transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
                overflow-x: hidden;
                white-space: nowrap;
                display: flex;
                flex-direction: column;
            }

            .sidebar-brand {
                height: 64px;
                padding: 0 18px;
                display: flex;
                align-items: center;
                border-bottom: 1px solid var(--ent-sidebar-border);
                flex-shrink: 0;
            }

            .brand-icon-box {
                width: 38px;
                height: 38px;
                border-radius: 8px;
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                border: 1px solid rgba(255, 255, 255, 0.16);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                color: #ffffff;
            }

            .brand-meta {
                display: none;
                opacity: 0;
                margin-left: 12px;
                overflow: hidden;
            }

            .brand-title {
                font-weight: 800;
                font-size: 0.85rem;
                letter-spacing: 0.04em;
                color: #ffffff;
                text-transform: uppercase;
                line-height: 1.2;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .brand-sub {
                font-size: 0.62rem;
                font-weight: 700;
                letter-spacing: 0.08em;
                color: #64748b;
                text-transform: uppercase;
            }

            /* --- Navigation Links --- */
            .sidebar-nav-scroll {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 14px 10px;
            }

            .nav-section-label {
                display: none;
                font-size: 0.6rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                color: #475569;
                padding: 10px 12px 6px;
            }

            .sidebar-nav-link {
                color: #94a3b8;
                padding: 11px 0;
                margin-bottom: 4px;
                border-radius: 8px;
                justify-content: center;
                font-size: 0.8rem;
                font-weight: 600;
                letter-spacing: 0.02em;
                display: flex;
                align-items: center;
                text-decoration: none;
                position: relative;
                transition: all 0.15s ease;
                border: 1px solid transparent;
            }

            .sidebar-nav-link svg {
                opacity: 0.75;
                min-width: 18px;
                flex-shrink: 0;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }

            .sidebar-nav-link .nav-text {
                display: none;
                opacity: 0;
                margin-left: 12px;
            }

            .sidebar-nav-link:hover {
                color: #f8fafc;
                background: rgba(255, 255, 255, 0.05);
            }

            .sidebar-nav-link.active {
                color: #ffffff;
                font-weight: 700;
                background: rgba(59, 130, 246, 0.14);
                border-color: rgba(59, 130, 246, 0.3);
                box-shadow: inset 3px 0 0 var(--ent-accent);
            }

            .sidebar-nav-link.active svg {
                opacity: 1;
                color: #60a5fa;
            }

            /* --- Sidebar Footer Dock --- */
            .sidebar-footer {
                padding: 12px 10px;
                border-top: 1px solid var(--ent-sidebar-border);
                background: rgba(0, 0, 0, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .sidebar-version-pill {
                width: 100%;
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid var(--ent-sidebar-border);
                border-radius: 6px;
                padding: 8px;
                color: #94a3b8;
                font-size: 0.7rem;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: background 0.15s ease, border-color 0.15s ease;
            }
            .sidebar-version-pill:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
                color: #ffffff;
            }

            .status-dot-live {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #22c55e;
                box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
                flex-shrink: 0;
            }

            .footer-ver-details {
                display: none;
                justify-content: space-between;
                align-items: center;
                width: 100%;
            }

            /* --- Expanded Sidebar State --- */
            body.sidebar-expanded .sidebar { width: 248px; }
            body.sidebar-expanded .brand-meta { display: block; opacity: 1; }
            body.sidebar-expanded .nav-section-label { display: block; }
            body.sidebar-expanded .sidebar-nav-link { padding: 11px 14px; justify-content: flex-start; }
            body.sidebar-expanded .sidebar-nav-link .nav-text { display: inline; opacity: 1; }
            body.sidebar-expanded .footer-ver-details { display: flex; }

            /* --- Top Command Status Bar --- */
            .status-bar {
                height: 64px;
                margin-left: 76px;
                padding: 0 28px;
                background: rgba(255, 255, 255, 0.92);
                backdrop-filter: blur(12px);
                border-bottom: 1px solid var(--ent-border);
                box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 999;
                transition: margin-left 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .main-content-wrapper {
                margin-left: 76px;
                padding: 24px 28px;
                transition: margin-left 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            }

            body.sidebar-expanded .status-bar,
            body.sidebar-expanded .main-content-wrapper {
                margin-left: 248px;
            }

            .nav-toggle-btn {
                width: 36px;
                height: 36px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: var(--ent-surface);
                border: 1px solid var(--ent-border);
                color: var(--ent-ink);
                cursor: pointer;
                border-radius: 6px;
                transition: all 0.15s ease;
            }
            .nav-toggle-btn:hover {
                background: var(--ent-bg);
                border-color: var(--ent-ink);
            }

            .breadcrumb-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .bc-shop {
                font-size: 0.78rem;
                font-weight: 800;
                letter-spacing: 0.04em;
                color: var(--ent-ink);
                text-transform: uppercase;
            }

            .bc-sep {
                color: #cbd5e1;
                font-weight: 600;
            }

            .bc-page {
                font-size: 0.78rem;
                font-weight: 700;
                color: var(--ent-muted);
            }

            /* --- Status Bar Badges --- */
            .sys-badge {
                font-size: 0.65rem;
                font-weight: 800;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                padding: 4px 9px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border: 1px solid var(--ent-border);
                line-height: 1;
            }

            .sys-badge-admin {
                background: #fef2f2;
                color: var(--ent-danger);
                border-color: #fecaca;
            }

            .sys-badge-staff {
                background: #ecfdf3;
                color: var(--ent-success);
                border-color: #bbf7d0;
            }

            .sys-badge-version {
                background: var(--ent-ink);
                color: #ffffff;
                border-color: var(--ent-ink);
                font-variant-numeric: tabular-nums;
                cursor: pointer;
                transition: opacity 0.15s ease;
            }
            .sys-badge-version:hover { opacity: 0.85; }

            .date-chip {
                font-size: 0.72rem;
                font-weight: 700;
                color: var(--ent-muted);
                background: var(--ent-bg);
                border: 1px solid var(--ent-border-light);
                padding: 5px 10px;
                border-radius: 4px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }

            .btn-sys-logout {
                font-size: 0.72rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid var(--ent-border);
                background: var(--ent-surface);
                color: var(--ent-ink);
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.15s ease;
            }
            .btn-sys-logout:hover {
                background: #fef2f2;
                color: var(--ent-danger);
                border-color: #fecaca;
            }

            .sidebar-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(9, 13, 22, 0.6);
                backdrop-filter: blur(2px);
                z-index: 1000;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.2s ease, visibility 0.2s;
            }
            .sidebar-overlay.active {
                opacity: 1;
                visibility: visible;
            }

            @media (max-width: 768px) {
                .sidebar { transform: translateX(-100%); width: 248px; }
                .brand-meta { display: block; opacity: 1; }
                .nav-section-label { display: block; }
                .sidebar-nav-link { padding: 11px 14px; justify-content: flex-start; }
                .sidebar-nav-link .nav-text { display: inline; opacity: 1; }
                .footer-ver-details { display: flex; }
                body.sidebar-mobile-open .sidebar { transform: translateX(0); }
                .status-bar, .main-content-wrapper { margin-left: 0 !important; }
                .status-bar { padding: 0 14px; height: 58px; }
                .main-content-wrapper { padding: 16px 12px; }
                .bc-sep, .bc-page { display: none; }
            }
        `;
        document.head.appendChild(style);

        // Restore desktop sidebar state (default expanded on large screens)
        const savedSidebarState = localStorage.getItem('ent-sidebar-expanded');
        if (window.innerWidth > 768 && (savedSidebarState === null || savedSidebarState === 'true')) {
            document.body.classList.add('sidebar-expanded');
        }

        const todayStr = new Date().toLocaleDateString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const sidebar = document.createElement('div');
        sidebar.id = 'sys-sidebar';
        sidebar.className = 'sidebar';

        let navLinks = `
            <div class="nav-section-label">Operations</div>
            <a class="sidebar-nav-link ${currentPage === 'dashboard.html' || currentPage === '' ? 'active' : ''}" href="dashboard.html" title="Daybook Terminal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                </svg>
                <span class="nav-text">Daybook</span>
            </a>
        `;

        if (isAdmin) {
            navLinks += `
                <div class="nav-section-label mt-2">Treasury & Ledgers</div>
                <a class="sidebar-nav-link ${currentPage === 'master-ledger.html' ? 'active' : ''}" href="master-ledger.html" title="Master Vault">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M7 8h.01M17 8h.01M7 16h.01M17 16h.01"></path>
                    </svg>
                    <span class="nav-text">Master Vault</span>
                </a>
                <a class="sidebar-nav-link ${currentPage === 'accounts.html' ? 'active' : ''}" href="accounts.html" title="Accounts & Passbooks">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                        <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span class="nav-text">Accounts</span>
                </a>
                <div class="nav-section-label mt-2">Administration</div>
                <a class="sidebar-nav-link ${currentPage === 'staff.html' ? 'active' : ''}" href="staff.html" title="Staff">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span class="nav-text">Staff</span>
                </a>
                <a class="sidebar-nav-link ${currentPage === 'summary.html' ? 'active' : ''}" href="summary.html" title="Business Analytics">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                    <span class="nav-text">Analytics</span>
                </a>
            `;
        }

        sidebar.innerHTML = `
            <div class="sidebar-brand" title="${shopName}">
                <div class="brand-icon-box">
                    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l1.5-5h15L21 9"></path>
                        <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"></path>
                        <path d="M5 12v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"></path>
                        <path d="M10 15h4v7h-4z"></path>
                    </svg>
                </div>
                <div class="brand-meta">
                    <div class="brand-title">${shopName}</div>
                    <div class="brand-sub">Enterprise Ledger</div>
                </div>
            </div>
            <nav class="sidebar-nav-scroll">${navLinks}</nav>
            <div class="sidebar-footer">
                <button type="button" class="sidebar-version-pill" id="sidebar-ver-btn" title="View Build Manifest">
                    <span class="status-dot-live"></span>
                    <div class="footer-ver-details">
                        <span>BUILD</span>
                        <span style="color: #fff; font-variant-numeric: tabular-nums;">${activeVersion}</span>
                    </div>
                </button>
            </div>
        `;
        document.body.prepend(sidebar);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebar-overlay';
        document.body.appendChild(overlay);

        const statusBar = document.createElement('div');
        statusBar.className = 'status-bar';

        const roleBadgeHtml = isAdmin
            ? `<span class="sys-badge sys-badge-admin d-none d-md-inline-flex"><span style="width:5px;height:5px;border-radius:50%;background:currentColor;"></span>Admin Active</span>`
            : `<span class="sys-badge sys-badge-staff d-none d-md-inline-flex"><span style="width:5px;height:5px;border-radius:50%;background:currentColor;"></span>Staff Mode</span>`;

        // Version badge is visible on ALL screen sizes
        const versionBadge = `<span class="sys-badge sys-badge-version" id="topbar-ver-btn" title="Click for version details">${activeVersion}</span>`;

        statusBar.innerHTML = `
            <div class="d-flex align-items-center gap-2 gap-md-3">
                <button id="mobile-menu-btn" class="nav-toggle-btn" title="Toggle Sidebar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <div class="breadcrumb-wrap">
                    <span class="bc-shop">${shopName}</span>
                    <span class="bc-sep">/</span>
                    <span class="bc-page">${activeMeta.title}</span>
                </div>
                ${versionBadge}
                ${roleBadgeHtml}
            </div>
            <div class="d-flex align-items-center gap-2 gap-md-3">
                <span class="date-chip d-none d-lg-inline-block">${todayStr}</span>
                <button id="sys-logout-btn" class="btn-sys-logout">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>Logout</span>
                </button>
            </div>
        `;

        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.classList.remove('main-content');
            mainContent.classList.add('main-content-wrapper');
            sidebar.insertAdjacentElement('afterend', statusBar);
        }

        // Version Manifest Popup
        const showVersionManifest = () => {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Enterprise Ledger Build',
                    html: `
                        <div style="font-size: 0.8rem; color: #475569;">
                            <div class="d-flex justify-content-between py-2 border-bottom">
                                <span class="fw-bold text-dark">Active Module (${activeMeta.title})</span>
                                <span class="badge bg-dark">${activeVersion}</span>
                            </div>
                            <div class="d-flex justify-content-between py-2 border-bottom">
                                <span>Daybook Terminal</span>
                                <span class="fw-bold text-dark">v1.8.1</span>
                            </div>
                            <div class="d-flex justify-content-between py-2 border-bottom">
                                <span>Master Vault & Cash</span>
                                <span class="fw-bold text-dark">v1.9.2</span>
                            </div>
                            <div class="d-flex justify-content-between py-2 border-bottom">
                                <span>Accounts & Passbooks</span>
                                <span class="fw-bold text-dark">v1.8.2</span>
                            </div>
                            <div class="d-flex justify-content-between py-2 border-bottom">
                                <span>Staff & Attendance</span>
                                <span class="fw-bold text-dark">v1.9.2</span>
                            </div>
                            <div class="d-flex justify-content-between py-2">
                                <span>Business Analytics</span>
                                <span class="fw-bold text-dark">v1.9.2</span>
                            </div>
                        </div>
                    `,
                    confirmButtonText: 'Close',
                    confirmButtonColor: '#0f172a'
                });
            }
        };

        document.getElementById('topbar-ver-btn')?.addEventListener('click', showVersionManifest);
        document.getElementById('sidebar-ver-btn')?.addEventListener('click', showVersionManifest);

        document.getElementById('mobile-menu-btn').addEventListener('click', () => {
            if (window.innerWidth > 768) {
                const isExpanded = document.body.classList.toggle('sidebar-expanded');
                localStorage.setItem('ent-sidebar-expanded', isExpanded ? 'true' : 'false');
            } else {
                document.body.classList.add('sidebar-mobile-open');
                overlay.classList.add('active');
            }
        });

        overlay.addEventListener('click', () => {
            document.body.classList.remove('sidebar-mobile-open');
            overlay.classList.remove('active');
        });

        sidebar.querySelectorAll('.sidebar-nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    document.body.classList.remove('sidebar-mobile-open');
                    overlay.classList.remove('active');
                }
            });
        });

        document.getElementById('sys-logout-btn').addEventListener('click', async () => {
            const btn = document.getElementById('sys-logout-btn');
            btn.innerHTML = '<span>Exiting...</span>';
            btn.disabled = true;
            try {
                await supabaseClient.auth.signOut();
            } catch (e) {
                console.error(e);
            } finally {
                window.location.replace('index.html');
            }
        });

    } catch (error) {
        console.error('Layout failed to load:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadEnterpriseLayout);
} else {
    loadEnterpriseLayout();
}
