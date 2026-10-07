// navbar.js — Enterprise Layout & Navigation Controller (v1.9.2)
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

        const style = document.createElement('style');
        style.innerHTML = `
            :root {
                --ent-bg: #f3f4f6;
                --ent-surface: #ffffff;
                --ent-border: #d1d5db;
                --ent-border-light: #e5e7eb;
                --ent-ink: #111827;
                --ent-muted: #6b7280;
                --ent-navy: #0f172a;
                --ent-navy-hover: #1e293b;
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

            /* --- Enterprise Sidebar --- */
            .sidebar {
                height: 100vh;
                width: 68px;
                position: fixed;
                top: 0;
                left: 0;
                background: var(--ent-navy);
                color: #ffffff;
                z-index: 1001;
                border-right: 1px solid #1e293b;
                transition: width 0.2s ease, transform 0.2s ease;
                overflow-x: hidden;
                white-space: nowrap;
                display: flex;
                flex-direction: column;
            }

            .sidebar-brand {
                height: 60px;
                padding: 0;
                justify-content: center;
                font-weight: 800;
                letter-spacing: 0.04em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                text-transform: uppercase;
                color: #ffffff;
            }

            .sidebar-brand .brand-icon-box {
                width: 34px;
                height: 34px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.15);
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                color: #ffffff;
            }

            .sidebar-brand .brand-text {
                display: none;
                opacity: 0;
                margin-left: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .sidebar-nav-link {
                color: #94a3b8;
                padding: 14px 0;
                justify-content: center;
                font-size: 0.78rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                border-left: 3px solid transparent;
                display: flex;
                align-items: center;
                text-decoration: none;
                transition: background 0.15s ease, color 0.15s ease;
            }

            .sidebar-nav-link svg {
                opacity: 0.8;
                min-width: 18px;
                flex-shrink: 0;
            }

            .sidebar-nav-link .nav-text {
                display: none;
                opacity: 0;
                margin-left: 12px;
            }

            .sidebar-nav-link:hover {
                color: #ffffff;
                background: var(--ent-navy-hover);
            }

            .sidebar-nav-link.active {
                color: #ffffff;
                background: var(--ent-navy-hover);
                border-left: 3px solid #ffffff;
            }

            .sidebar-nav-link.active svg {
                opacity: 1;
                color: #ffffff;
            }

            /* --- Expanded Desktop State --- */
            body.sidebar-expanded .sidebar { width: 240px; }
            body.sidebar-expanded .sidebar-brand { padding: 0 18px; justify-content: flex-start; }
            body.sidebar-expanded .sidebar-brand .brand-text { display: inline-block; opacity: 1; }
            body.sidebar-expanded .sidebar-nav-link { padding: 14px 20px; justify-content: flex-start; }
            body.sidebar-expanded .sidebar-nav-link .nav-text { display: inline; opacity: 1; }

            /* --- Top Status Bar --- */
            .status-bar {
                height: 60px;
                margin-left: 68px;
                padding: 0 24px;
                background: var(--ent-surface);
                border-bottom: 1px solid var(--ent-border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 999;
                transition: margin-left 0.2s ease;
            }

            .main-content-wrapper {
                margin-left: 68px;
                padding: 24px;
                transition: margin-left 0.2s ease;
            }

            body.sidebar-expanded .status-bar,
            body.sidebar-expanded .main-content-wrapper {
                margin-left: 240px;
            }

            .nav-toggle-btn {
                width: 34px;
                height: 34px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: var(--ent-surface);
                border: 1px solid var(--ent-border);
                color: var(--ent-ink);
                cursor: pointer;
                border-radius: 4px;
            }
            .nav-toggle-btn:hover { background: var(--ent-bg); }

            .status-shop-title {
                font-size: 0.82rem;
                font-weight: 800;
                letter-spacing: 0.04em;
                color: var(--ent-ink);
                text-transform: uppercase;
                margin: 0;
            }

            .sys-badge {
                font-size: 0.65rem;
                font-weight: 800;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                padding: 3px 8px;
                border-radius: 3px;
                border: 1px solid var(--ent-border);
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
                background: var(--ent-bg);
                color: var(--ent-muted);
                font-variant-numeric: tabular-nums;
            }

            .btn-sys-logout {
                font-size: 0.72rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                padding: 6px 12px;
                border-radius: 4px;
                border: 1px solid var(--ent-border);
                background: var(--ent-surface);
                color: var(--ent-danger);
            }
            .btn-sys-logout:hover {
                background: #fef2f2;
                border-color: var(--ent-danger);
            }

            .sidebar-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(15, 23, 42, 0.55);
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
                .sidebar { transform: translateX(-100%); width: 240px; }
                .sidebar-brand { padding: 0 18px; justify-content: flex-start; }
                .sidebar-brand .brand-text { display: inline-block; opacity: 1; }
                .sidebar-nav-link { padding: 14px 20px; justify-content: flex-start; }
                .sidebar-nav-link .nav-text { display: inline; opacity: 1; }
                body.sidebar-mobile-open .sidebar { transform: translateX(0); }
                .status-bar, .main-content-wrapper { margin-left: 0 !important; }
                .status-bar { padding: 0 14px; }
                .main-content-wrapper { padding: 16px 12px; }
            }
        `;
        document.head.appendChild(style);

        // Restore desktop sidebar state
        if (window.innerWidth > 768 && localStorage.getItem('ent-sidebar-expanded') === 'true') {
            document.body.classList.add('sidebar-expanded');
        }

        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
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
            <a class="sidebar-nav-link ${currentPage === 'dashboard.html' || currentPage === '' ? 'active' : ''}" href="dashboard.html" title="Daybook Terminal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span class="nav-text">Daybook</span>
            </a>
        `;

        if (isAdmin) {
            navLinks += `
                <a class="sidebar-nav-link ${currentPage === 'master-ledger.html' ? 'active' : ''}" href="master-ledger.html" title="Unified Cash Ledger">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
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
                <a class="sidebar-nav-link ${currentPage === 'staff.html' ? 'active' : ''}" href="staff.html" title="Staff & Attendance">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span class="nav-text">Staff Roster</span>
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

        // Storefront / Retail Shop SVG Icon
        sidebar.innerHTML = `
            <div class="sidebar-brand" title="${shopName}">
                <div class="brand-icon-box">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l1.5-5h15L21 9"></path>
                        <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"></path>
                        <path d="M5 12v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"></path>
                        <path d="M10 15h4v7h-4z"></path>
                    </svg>
                </div>
                <span class="brand-text">${shopName}</span>
            </div>
            <nav class="nav flex-column mt-2">${navLinks}</nav>
        `;
        document.body.prepend(sidebar);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebar-overlay';
        document.body.appendChild(overlay);

        const statusBar = document.createElement('div');
        statusBar.className = 'status-bar';

        const roleBadgeHtml = isAdmin
            ? `<span class="sys-badge sys-badge-admin d-none d-md-inline-block">Admin Active</span>`
            : `<span class="sys-badge sys-badge-staff d-none d-md-inline-block">Staff Mode</span>`;

        const appVer = window.APP_VERSION || 'v1.9.2';
        const versionBadge = `<span class="sys-badge sys-badge-version d-none d-sm-inline-block">${appVer}</span>`;

        statusBar.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <button id="mobile-menu-btn" class="nav-toggle-btn" title="Toggle Navigation">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <span class="status-shop-title ms-1">${shopName}</span>
                ${roleBadgeHtml}
                ${versionBadge}
            </div>
            <div class="d-flex align-items-center gap-3">
                <span class="small fw-bold text-muted text-uppercase d-none d-md-inline" style="font-size: 0.72rem; letter-spacing: 0.05em;">${todayStr}</span>
                <button id="sys-logout-btn" class="btn-sys-logout">Logout</button>
            </div>
        `;

        const mainContent = document.querySelector('main');
        if (mainContent) {
            mainContent.classList.remove('main-content');
            mainContent.classList.add('main-content-wrapper');
            sidebar.insertAdjacentElement('afterend', statusBar);
        }

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
            btn.innerText = 'Exiting...';
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
