/**
 * js/role-ui.js  (v1.0)
 * Role-based UI controller — reads role from localStorage and
 * shows/hides elements on Dashboard, Tasks, and Profile pages.
 *
 * Usage: include AFTER api.js. All logic runs on DOMContentLoaded.
 *
 * Role values stored in localStorage:
 *   etm_current_user.role → "ADMIN" | "MANAGER" | "EMPLOYEE"
 */

(function () {
    'use strict';

    // ── Helper: get current user from localStorage ───────────────
    function getCurrentUser() {
        try {
            const raw = localStorage.getItem('etm_current_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    // ── Helper: get role (always uppercase) ──────────────────────
    function getRole() {
        const user = getCurrentUser();
        return (user?.role || 'EMPLOYEE').toUpperCase();
    }

    // ── Expose helpers globally ───────────────────────────────────
    window.getCurrentUser = getCurrentUser;
    window.getRole        = getRole;
    window.isAdmin        = () => getRole() === 'ADMIN';
    window.isManager      = () => getRole() === 'MANAGER';
    window.isEmployee     = () => getRole() === 'EMPLOYEE';
    window.isAdminOrManager = () => ['ADMIN', 'MANAGER'].includes(getRole());

    // ── CSS class helpers ─────────────────────────────────────────
    // Elements with [data-role-show="ADMIN"]  → visible only to ADMIN
    // Elements with [data-role-show="MANAGER,ADMIN"] → comma-separated
    // Elements with [data-role-hide="EMPLOYEE"] → hidden from EMPLOYEE
    function applyRoleVisibility() {
        const role = getRole();

        // data-role-show: show only if role matches
        document.querySelectorAll('[data-role-show]').forEach(el => {
            const allowed = el.getAttribute('data-role-show')
                              .split(',').map(r => r.trim().toUpperCase());
            el.style.display = allowed.includes(role) ? '' : 'none';
        });

        // data-role-hide: hide if role matches
        document.querySelectorAll('[data-role-hide]').forEach(el => {
            const hidden = el.getAttribute('data-role-hide')
                             .split(',').map(r => r.trim().toUpperCase());
            if (hidden.includes(role)) el.style.display = 'none';
        });
    }

    // ── Inject role badge into navbar ─────────────────────────────
    function injectRoleBadge() {
        const brand = document.querySelector('.navbar-brand');
        if (!brand || document.getElementById('roleBadge')) return;

        const role  = getRole();
        const user  = getCurrentUser();
        const name  = user?.fullName || user?.username || 'User';

        const colors = {
            ADMIN:    { bg: '#e74c3c', label: '👑 Admin' },
            MANAGER:  { bg: '#8e44ad', label: '🏢 Manager' },
            EMPLOYEE: { bg: '#27ae60', label: '👤 Employee' },
        };
        const cfg = colors[role] || colors.EMPLOYEE;

        const badge = document.createElement('div');
        badge.id        = 'roleBadge';
        badge.className = 'role-badge';
        badge.style.cssText = `
            display:inline-flex; align-items:center; gap:6px;
            background:${cfg.bg}; color:#fff;
            font-size:0.72rem; font-weight:700;
            padding:3px 10px; border-radius:999px;
            margin-left:10px; white-space:nowrap;
        `;
        badge.innerHTML = `${cfg.label}`;
        brand.appendChild(badge);

        // Also inject user name in navbar (after links)
        const nav = document.querySelector('.navbar-links');
        if (nav && !document.getElementById('navUserGreet')) {
            const greet = document.createElement('span');
            greet.id        = 'navUserGreet';
            greet.className = 'nav-user-greet';
            greet.style.cssText = `
                font-size:0.82rem; color:rgba(255,255,255,0.82);
                padding:0 6px; white-space:nowrap; display:flex;
                align-items:center; font-weight:500; letter-spacing:0.01em;
            `;
            greet.textContent = `Hi, ${name.split(' ')[0]} 👋`;
            nav.insertBefore(greet, nav.firstChild);
        }
    }

    // ── Page-specific role rules ──────────────────────────────────

    // TASKS PAGE
    function applyTasksPageRules() {
        const role = getRole();

        // Only Manager and Admin can add tasks. Hide for Employee.
        const addBtn = document.getElementById('openAddTaskBtn');
        if (addBtn) {
            addBtn.style.display = (role === 'EMPLOYEE') ? 'none' : '';
        }

        // We set role flag on window for tasks.js
        window._userRole = role;
    }

    // DASHBOARD PAGE
    function applyDashboardRules() {
        const role = getRole();
        const user = getCurrentUser();

        // Welcome heading
        const h1 = document.querySelector('.dashboard-page-header h1');
        if (h1) {
            const name = user?.fullName?.split(' ')[0] || user?.username || 'there';
            const roleLabel = role === 'ADMIN' ? '(Admin)'
                            : role === 'MANAGER' ? '(Manager)' : '';
            h1.textContent = `Welcome back, ${name} ${roleLabel}`.trim();
        }

        // Role-specific info banner
        injectRoleInfoBanner(role);
    }

    function injectRoleInfoBanner(role) {
        const main = document.querySelector('.main-content');
        if (!main || document.getElementById('roleInfoBanner')) return;

        const banners = {
            ADMIN: {
                color: '#e74c3c',
                bg:    'rgba(231,76,60,0.08)',
                icon:  '👑',
                text:  'You have <strong>Admin</strong> access — you can view and manage all tasks, users, and settings.'
            },
            MANAGER: {
                color: '#8e44ad',
                bg:    'rgba(142,68,173,0.08)',
                icon:  '🏢',
                text:  'You have <strong>Manager</strong> access — you can assign tasks to your team and track their progress.'
            },
            EMPLOYEE: {
                color: '#27ae60',
                bg:    'rgba(39,174,96,0.08)',
                icon:  '👤',
                text:  'You have <strong>Employee</strong> access — view assigned tasks, accept them, update progress and upload attachments.'
            }
        };

        const cfg = banners[role];
        if (!cfg) return;

        const banner = document.createElement('div');
        banner.id    = 'roleInfoBanner';
        banner.style.cssText = `
            display:flex; align-items:center; gap:10px;
            background:${cfg.bg}; border-left:4px solid ${cfg.color};
            border-radius:8px; padding:10px 16px; margin-bottom:20px;
            font-size:0.85rem; color:var(--color-text);
        `;
        banner.innerHTML = `<span style="font-size:1.4rem;">${cfg.icon}</span><span>${cfg.text}</span>`;

        // Insert at top of main content
        const header = main.querySelector('.dashboard-page-header');
        if (header && header.nextSibling) {
            main.insertBefore(banner, header.nextSibling);
        } else {
            main.prepend(banner);
        }
    }

    // ── Boot ──────────────────────────────────────────────────────
    function init() {
        applyRoleVisibility();
        injectRoleBadge();

        const path = window.location.pathname.toLowerCase();
        if (path.includes('tasks'))     applyTasksPageRules();
        if (path.includes('dashboard')) applyDashboardRules();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
