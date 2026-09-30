// navbar.js
async function loadPremiumLayout() {
    if (document.getElementById('sys-sidebar')) return;

    try {
        const { data: userData, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !userData || !userData.user) {
            window.location.replace('index.html');
            return;
        }

        const { data: profile } = await supabaseClient.from('user_profiles').select('role, shop_id').eq('id', userData.user.id).single();
        const isAdmin = profile && profile.role === 'admin';

        let shopName = "BEAUTY SPORTS"; 
        if (profile && profile.shop_id) {
            const { data: shop } = await supabaseClient.from('shops').select('name').eq('id', profile.shop_id).single();
            if (shop && shop.name) shopName = shop.name;
        }

        if (!document.getElementById('bs-css')) {
            const font = document.createElement('link'); font.href = 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700;800&display=swap'; font.rel = 'stylesheet'; document.head.appendChild(font);
            const bs = document.createElement('link'); bs.id = 'bs-css'; bs.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'; bs.rel = 'stylesheet'; document.head.appendChild(bs);
        }

        const style = document.createElement('style');
        style.innerHTML = `
            :root { --creme-bg: #FDFBF7; --sidebar-dark: #2C2C2C; --sidebar-hover: #383838; --accent-gold: #C5A059; --glass: rgba(253, 251, 247, 0.85); }
            body { font-family: 'Public Sans', sans-serif !important; background-color: var(--creme-bg) !important; color: #3A3A3A; margin: 0 !important; overflow-x: hidden; }
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: #EAE0D5; border-radius: 10px; }
            ::-webkit-scrollbar-thumb:hover { background: var(--accent-gold); }
            
            .sidebar { height: 100vh; width: 80px; position: fixed; top:0; left:0; background: var(--sidebar-dark); color: white; z-index: 1001; border-right: 1px solid rgba(255,255,255,0.05); box-shadow: 4px 0 20px rgba(0,0,0,0.05); transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow-x: hidden; white-space: nowrap; }
            .sidebar-brand { padding: 2rem 0; justify-content: center; font-weight: 800; letter-spacing: 1px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 1.15rem; display: flex; align-items: center; text-transform: uppercase; }
            .sidebar-brand .brand-text { display: none; opacity: 0; transition: opacity 0.3s ease; margin-left: 10px; }
            .sidebar-nav-link { color: rgba(255, 255, 255, 0.6); padding: 1.25rem 0; justify-content: center; transition: all 0.3s ease; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; border-left: 4px solid transparent; display: flex; align-items: center; text-decoration: none; }
            .sidebar-nav-link svg { transition: all 0.3s ease; opacity: 0.7; min-width: 18px; }
            .sidebar-nav-link .nav-text { display: none; opacity: 0; transition: opacity 0.3s ease; margin-left: 12px; }
            .sidebar-nav-link:hover { color: white; background: var(--sidebar-hover); }
            .sidebar-nav-link.active { color: white; background: var(--sidebar-hover); border-left: 4px solid var(--accent-gold); }
            .sidebar-nav-link.active svg { opacity: 1; color: var(--accent-gold); }

            body.sidebar-expanded .sidebar { width: 260px; }
            body.sidebar-expanded .sidebar-brand { padding: 2rem 1.5rem; justify-content: flex-start; }
            body.sidebar-expanded .sidebar-brand .brand-text { display: inline; opacity: 1; }
            body.sidebar-expanded .sidebar-nav-link { padding: 1rem 1.5rem; justify-content: flex-start; }
            body.sidebar-expanded .sidebar-nav-link .nav-text { display: inline; opacity: 1; }
            body.sidebar-expanded .sidebar-nav-link:hover { transform: translateX(4px); }

            .status-bar { margin-left: 80px; padding: 1.25rem 2.5rem; background: var(--glass); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(197, 160, 89, 0.2); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.02); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 999; transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            .main-content-wrapper { margin-left: 80px; padding: 2.5rem; transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            body.sidebar-expanded .status-bar, body.sidebar-expanded .main-content-wrapper { margin-left: 260px; }

            .btn-outline-danger { border-color: #dc3545; color: #dc3545; }
            .btn-outline-danger:hover { background-color: #dc3545; color: white; }

            .mobile-toggle-btn { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; color: #2C2C2C; padding: 5px; cursor: pointer; border-radius: 6px; transition: 0.2s; }
            .mobile-toggle-btn:hover { background: rgba(0,0,0,0.05); }
            .sidebar-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); z-index: 1000; opacity: 0; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s; }
            .sidebar-overlay.active { opacity: 1; visibility: visible; }

            @media (max-width: 768px) {
                .sidebar { transform: translateX(-100%); width: 260px; }
                .sidebar-brand { padding: 2rem 1.5rem; justify-content: flex-start; }
                .sidebar-brand .brand-text { display: inline; opacity: 1; }
                .sidebar-nav-link { padding: 1rem 1.5rem; justify-content: flex-start; }
                .sidebar-nav-link .nav-text { display: inline; opacity: 1; }
                body.sidebar-mobile-open .sidebar { transform: translateX(0); }
                .status-bar, .main-content-wrapper { margin-left: 0 !important; }
                .status-bar { padding: 1rem; }
                .main-content-wrapper { padding: 1.5rem 1rem; }
            }
        `;
        document.head.appendChild(style);

        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
        const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        const sidebar = document.createElement('div');
        sidebar.id = 'sys-sidebar';
        sidebar.className = 'sidebar';
        
        let navLinks = `
            <a class="sidebar-nav-link ${currentPage === 'dashboard.html' || currentPage === '' ? 'active' : ''}" href="dashboard.html" title="Dashboard">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                <span class="nav-text">Dashboard</span>
            </a>
        `;

        if (isAdmin) {
            navLinks += `
                <a class="sidebar-nav-link ${currentPage === 'master-ledger.html' ? 'active' : ''}" href="master-ledger.html" title="Master Vault">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    <span class="nav-text">Master Vault</span>
                </a>
                <a class="sidebar-nav-link ${currentPage === 'accounts.html' ? 'active' : ''}" href="accounts.html" title="Entity Accounts">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <span class="nav-text">Accounts</span>
                </a>
                <a class="sidebar-nav-link ${currentPage === 'staff.html' ? 'active' : ''}" href="staff.html" title="Staff Management">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                    <span class="nav-text">Staff</span>
                </a>
                <a class="sidebar-nav-link ${currentPage === 'summary.html' ? 'active' : ''}" href="summary.html" title="Business Analytics">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                    <span class="nav-text">Analytics</span>
                </a>
            `;
        }

        let shopNameArr = shopName.split(' ');
        let firstWord = shopNameArr[0] || '';
        let restWords = shopNameArr.slice(1).join(' ') || '';

        sidebar.innerHTML = `
            <div class="sidebar-brand">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="min-width: 24px;">
                    <path d="M20.2 7.8l-7.7 7.7-4-4-5.7 5.7"/><path d="M15 7h6v6"/>
                </svg>
                <span class="brand-text"><span style="color: var(--accent-gold)">${firstWord}</span> ${restWords}</span>
            </div>
            <nav class="nav flex-column mt-4">${navLinks}</nav>
        `;
        document.body.prepend(sidebar);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebar-overlay';
        document.body.appendChild(overlay);

        const statusBar = document.createElement('div');
        statusBar.className = 'status-bar';
        
        let badgeHtml = isAdmin 
            ? `<span class="badge bg-danger text-white px-3 py-2 rounded-pill fw-bold shadow-sm d-none d-md-inline-block" style="font-size: 0.65rem; letter-spacing: 1px;">ADMIN ACTIVE</span>`
            : `<span class="badge bg-success text-white px-3 py-2 rounded-pill fw-bold shadow-sm d-none d-md-inline-block" style="font-size: 0.65rem; letter-spacing: 1px;">STANDARD MODE</span>`;

        // INJECT VERSION BADGE IF AVAILABLE
        const versionBadge = window.APP_VERSION 
            ? `<span class="badge border border-secondary text-secondary ms-2 px-2 py-1 fw-bold rounded-2" style="font-size: 0.65rem; background: rgba(0,0,0,0.03);">${window.APP_VERSION}</span>` 
            : '';

        statusBar.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <button id="mobile-menu-btn" class="mobile-toggle-btn me-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                ${badgeHtml}
                ${versionBadge}
            </div>
            <div class="d-flex align-items-center gap-3">
                <span class="small fw-bold text-muted text-uppercase d-none d-sm-inline" style="letter-spacing: 1px;">${todayStr}</span>
                <button id="sys-logout-btn" class="btn btn-sm btn-outline-danger fw-bold rounded-pill px-4 shadow-sm" style="background: transparent;">LOGOUT</button>
            </div>
        `;
        
        const mainContent = document.querySelector('main');
        if(mainContent) {
            mainContent.classList.remove('main-content');
            mainContent.classList.add('main-content-wrapper');
            sidebar.insertAdjacentElement('afterend', statusBar);
        }

        document.getElementById('mobile-menu-btn').addEventListener('click', () => {
            if (window.innerWidth > 768) document.body.classList.toggle('sidebar-expanded');
            else { document.body.classList.add('sidebar-mobile-open'); overlay.classList.add('active'); }
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
            document.getElementById('sys-logout-btn').innerText = 'Exiting...';
            try { await supabaseClient.auth.signOut(); } catch(e) {} 
            finally { window.location.replace('index.html'); }
        });

    } catch (error) { console.error("Layout failed to load:", error); }
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', loadPremiumLayout); } 
else { loadPremiumLayout(); }
