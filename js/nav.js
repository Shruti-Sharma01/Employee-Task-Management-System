/**
 * js/nav.js
 * Universal Navigation Controller
 * Manages responsive off-canvas drawer, backdrop dimming, active links, and logout
 */

document.addEventListener('DOMContentLoaded', () => {
    initSidebarDrawer();
    initActiveNavLinks();
    initLogoutLinks();
});

/**
 * 1. Mobile Sidebar Drawer & Backdrop
 */
function initSidebarDrawer() {
    const navToggle = document.getElementById('navToggle');
    const sidebar = document.getElementById('sidebar');

    if (!navToggle || !sidebar) return;

    // Check for or dynamically inject .sidebar-backdrop (used by responsive.css)
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }

    // Toggle Drawer Open / Close
    function toggleSidebar(forceState) {
        const isOpen = typeof forceState === 'boolean' 
            ? forceState 
            : !sidebar.classList.contains('open');

        if (isOpen) {
            sidebar.classList.add('open');
            backdrop.classList.add('open');
            navToggle.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden'; // Prevent page scrolling while drawer is open
        } else {
            sidebar.classList.remove('open');
            backdrop.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }
    }

    // Toggle on Hamburger button click
    navToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });

    // Close when tapping on dim backdrop
    backdrop.addEventListener('click', () => {
        toggleSidebar(false);
    });

    // Close when clicking any link inside the sidebar
    const sidebarLinks = sidebar.querySelectorAll('a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleSidebar(false);
        });
    });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            toggleSidebar(false);
        }
    });

    // Auto-close mobile drawer when window resized back to desktop (> 640px)
    window.addEventListener('resize', () => {
        if (window.innerWidth > 640 && sidebar.classList.contains('open')) {
            toggleSidebar(false);
        }
    });
}

/**
 * 2. Auto-Highlight Active Page Link in Navbar & Sidebar
 */
function initActiveNavLinks() {
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    const allNavLinks = document.querySelectorAll('.navbar-links a, .sidebar a');
    allNavLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href === currentPage) {
            link.classList.add('active');
        } else if (href && !href.includes(currentPage)) {
            // Keep manually assigned active classes accurate
            if (href !== 'login.html') {
                link.classList.remove('active');
            }
        }
    });
}

/**
 * 3. Handle Logout Link
 */
function initLogoutLinks() {
    const logoutLinks = document.querySelectorAll('a[href="login.html"]');
    logoutLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Clear current login session
            localStorage.removeItem('etm_current_user');
        });
    });
}