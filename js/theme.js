/**
 * js/theme.js  (v1.3)
 * Dark / Light Mode Toggle with Persistence (localStorage)
 * Supports all pages (index, dashboard, tasks, profile, auth).
 * Includes rapid-fire cooldown guard to prevent duplicate triggers.
 */

(function () {
    'use strict';

    const THEME_STORAGE_KEY = 'etm_theme';
    let lastToggleTimestamp = 0;

    // ── Check Current Theme ──────────────────────────────────────
    function getSavedTheme() {
        try {
            return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        } catch (_) {
            return 'light';
        }
    }

    function isDarkMode() {
        return document.documentElement.classList.contains('dark-theme');
    }

    // ── Apply Theme ──────────────────────────────────────────────
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark-theme');
            if (document.body) document.body.classList.add('dark-theme');
        } else {
            document.documentElement.classList.remove('dark-theme');
            if (document.body) document.body.classList.remove('dark-theme');
        }

        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (_) {}

        updateToggleButtonUI(theme === 'dark');
        updateDashboardCharts(theme === 'dark');
    }

    // ── Toggle Theme (With 350ms Rapid-Fire Protection) ──────────
    window.toggleDarkMode = function (e) {
        if (e && e.preventDefault) e.preventDefault();

        const now = Date.now();
        // Ignore duplicate triggers within 350ms (stops onclick + addEventListener double flip)
        if (now - lastToggleTimestamp < 350) {
            return;
        }
        lastToggleTimestamp = now;

        const nextTheme = isDarkMode() ? 'light' : 'dark';
        applyTheme(nextTheme);
    };

    // ── Update Button UI (☀️ vs 🌙) ──────────────────────────────
    function updateToggleButtonUI(isDark) {
        const btns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn');
        btns.forEach(btn => {
            btn.innerHTML = isDark ? '☀️' : '🌙';
            btn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
            btn.setAttribute('title', isDark ? 'Switch to Light Mode (☀️)' : 'Switch to Dark Mode (🌙)');
        });
    }

    // ── Inject or Bind Toggle Button in Navbar ───────────────────
    function injectThemeToggle() {
        const existingBtns = document.querySelectorAll('#themeToggleBtn, .theme-toggle-btn');
        if (existingBtns.length > 0) {
            existingBtns.forEach(btn => {
                // If button doesn't have an inline onclick attribute, attach click listener
                if (!btn.getAttribute('onclick')) {
                    btn.addEventListener('click', window.toggleDarkMode);
                }
            });
            updateToggleButtonUI(isDarkMode());
            return;
        }

        const nav = document.querySelector('.navbar-links, .landing-nav-actions');
        if (!nav) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'themeToggleBtn';
        btn.className = 'theme-toggle-btn';
        btn.addEventListener('click', window.toggleDarkMode);

        const notifWrapper = document.getElementById('notifBellWrapper');
        const logoutLink = nav.querySelector('a[href*="login"], a[onclick*="logout"]');

        if (notifWrapper) {
            nav.insertBefore(btn, notifWrapper);
        } else if (logoutLink) {
            nav.insertBefore(btn, logoutLink);
        } else {
            nav.appendChild(btn);
        }

        updateToggleButtonUI(isDarkMode());
    }

    // ── Update Chart.js if present on Dashboard ──────────────────
    function updateDashboardCharts(isDark) {
        if (typeof Chart === 'undefined') return;

        const tickColor = isDark ? '#94A3B8' : '#888888';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';

        if (typeof weeklyProductivityChart !== 'undefined' && weeklyProductivityChart) {
            try {
                if (weeklyProductivityChart.options?.scales?.x) {
                    weeklyProductivityChart.options.scales.x.ticks.color = tickColor;
                }
                if (weeklyProductivityChart.options?.scales?.y) {
                    weeklyProductivityChart.options.scales.y.ticks.color = tickColor;
                    weeklyProductivityChart.options.scales.y.grid.color = gridColor;
                }
                weeklyProductivityChart.update();
            } catch (_) {}
        }
    }

    // ── Sync Across Tabs ─────────────────────────────────────────
    window.addEventListener('storage', (e) => {
        if (e.key === THEME_STORAGE_KEY && e.newValue) {
            applyTheme(e.newValue);
        }
    });

    // ── Initial Apply ────────────────────────────────────────────
    const saved = getSavedTheme();
    if (saved === 'dark') {
        document.documentElement.classList.add('dark-theme');
        if (document.body) document.body.classList.add('dark-theme');
    } else {
        document.documentElement.classList.remove('dark-theme');
        if (document.body) document.body.classList.remove('dark-theme');
    }

    // Bind when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectThemeToggle();
            updateDashboardCharts(isDarkMode());
        });
    } else {
        injectThemeToggle();
        updateDashboardCharts(isDarkMode());
    }

})();
