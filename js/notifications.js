/**
 * js/notifications.js  (v1.0)
 * In-App Notification Bell: fetch from API, render dropdown, mark read.
 *
 * API Endpoints:
 *   GET  /api/notifications/             → { data: { results: [...], unread_count: N } }
 *   PATCH /api/notifications/<id>/read/  → mark single as read
 *   PATCH /api/notifications/read-all/   → mark all as read
 */

(function () {
    'use strict';

    // ── Universal Top-Center Toaster System ──────────────────────────────────
    let toastContainer = null;
    let knownNotifIds = new Set();
    let isInitialNotifLoad = true;

    function getOrCreateToastContainer() {
        if (!toastContainer || !document.body || !document.body.contains(toastContainer)) {
            toastContainer = document.getElementById('etmsToastContainer');
            if (!toastContainer && document.body) {
                toastContainer = document.createElement('div');
                toastContainer.id = 'etmsToastContainer';
                toastContainer.className = 'toast-container-top-center';
                document.body.appendChild(toastContainer);
            }
        }
        return toastContainer;
    }

    window.showToast = function (message, type = 'info', duration = 3800) {
        if (!message) return;
        const container = getOrCreateToastContainer();
        if (!container) return;

        const str = String(message).trim();

        // Auto-detect type if default
        if (type === 'info') {
            if (/✓|🎉|success|completed|saved|updated|created|accepted/i.test(str)) {
                type = 'success';
            } else if (/fail|error|could not|cannot|invalid|wrong|disabled|denied/i.test(str)) {
                type = 'error';
            } else if (/⚠️|warning|caution|must|please/i.test(str)) {
                type = 'warning';
            }
        }

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠️',
            info: '🔔',
        };
        const icon = icons[type] || '🔔';

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;
        toast.innerHTML = `
            <span class="toast-item-icon">${icon}</span>
            <span class="toast-item-text">${escapeHtml(str)}</span>
            <button type="button" class="toast-item-close" aria-label="Close">&times;</button>
        `;

        const removeToast = () => {
            if (toast.classList.contains('toast-leaving')) return;
            toast.classList.add('toast-leaving');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 260);
        };

        const closeBtn = toast.querySelector('.toast-item-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeToast();
            });
        }

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
    };

    // Override browser native alert() to display top-center toast
    window.alert = function (message) {
        window.showToast(message);
    };

    // ── Universal Top-Center Confirm Dialog ──────────────────────────────────
    window.showConfirm = function (message, options = {}) {
        return new Promise((resolve) => {
            const existing = document.getElementById('etmsConfirmOverlay');
            if (existing) existing.remove();

            const opts = typeof options === 'string' ? { confirmText: options } : (options || {});
            const confirmText = opts.confirmText || 'OK';
            const cancelText = opts.cancelText || 'Cancel';
            const isDelete = /delete|remove|abort/i.test(message);
            const isComplete = /complet/i.test(message);
            const confirmBtnClass = isDelete ? 'confirm-btn-danger' : 'confirm-btn-primary';
            const icon = isDelete ? '🗑️' : (isComplete ? '✅' : (opts.icon || '❓'));

            const overlay = document.createElement('div');
            overlay.id = 'etmsConfirmOverlay';
            overlay.className = 'confirm-modal-overlay';
            overlay.innerHTML = `
                <div class="confirm-modal-card" role="dialog" aria-modal="true">
                    <div class="confirm-modal-body">
                        <span class="confirm-modal-icon">${icon}</span>
                        <div class="confirm-modal-text">${escapeHtml(message)}</div>
                    </div>
                    <div class="confirm-modal-actions">
                        <button type="button" class="confirm-btn-cancel" id="etmsConfirmCancelBtn">${escapeHtml(cancelText)}</button>
                        <button type="button" class="${confirmBtnClass}" id="etmsConfirmOkBtn">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;

            let resolved = false;
            function cleanup(result) {
                if (resolved) return;
                resolved = true;
                document.removeEventListener('keydown', onKeyDown);
                overlay.classList.add('confirm-leaving');
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    resolve(result);
                }, 180);
            }

            function onKeyDown(e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    cleanup(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    cleanup(true);
                }
            }

            document.addEventListener('keydown', onKeyDown);

            overlay.querySelector('#etmsConfirmCancelBtn').addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(false);
            });
            overlay.querySelector('#etmsConfirmOkBtn').addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup(true);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup(false);
            });

            document.body.appendChild(overlay);
            const okBtn = overlay.querySelector('#etmsConfirmOkBtn');
            if (okBtn) okBtn.focus();
        });
    };
    window.customConfirm = window.showConfirm;

    // ── Config ──────────────────────────────────────────────────────────────
    const POLL_INTERVAL_MS = 30000;   // re-fetch every 30 seconds
    let   pollTimer        = null;
    let   isDropdownOpen   = false;

    // ── Init (called once DOM is ready) ────────────────────────────────────
    function initNotifications() {
        injectBellHTML();
        bindEvents();
        fetchAndRender();
        pollTimer = setInterval(fetchAndRender, POLL_INTERVAL_MS);
    }

    // ── Inject Bell into Navbar ─────────────────────────────────────────────
    function injectBellHTML() {
        const nav = document.querySelector('.navbar-links');
        if (!nav || document.getElementById('notifBellWrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id        = 'notifBellWrapper';
        wrapper.className = 'notif-bell-wrapper';
        wrapper.innerHTML = `
            <button class="notif-bell-btn" id="notifBellBtn" aria-label="Notifications" title="Notifications">
                <svg class="bell-icon" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span class="notif-badge" id="notifBadge" style="display:none;">0</span>
            </button>

            <div class="notif-dropdown" id="notifDropdown" style="display:none;">
                <div class="notif-dropdown-header">
                    <span class="notif-dropdown-title">🔔 Notifications</span>
                    <button class="notif-mark-all-btn" id="notifMarkAllBtn">Mark all as read</button>
                </div>
                <div class="notif-list" id="notifList">
                    <div class="notif-empty">Loading…</div>
                </div>
                <div class="notif-dropdown-footer">
                    <span id="notifFooterText" style="font-size:0.78rem; color:var(--color-text-muted);">
                        Pull to refresh
                    </span>
                </div>
            </div>
        `;

        // Insert before the first <a> in navbar-links
        nav.insertBefore(wrapper, nav.firstChild);
    }

    // ── Bind UI Events ──────────────────────────────────────────────────────
    function bindEvents() {
        // Toggle dropdown on bell click
        document.addEventListener('click', (e) => {
            const btn      = document.getElementById('notifBellBtn');
            const dropdown = document.getElementById('notifDropdown');
            const wrapper  = document.getElementById('notifBellWrapper');
            if (!btn || !dropdown) return;

            if (wrapper && wrapper.contains(e.target)) {
                isDropdownOpen = !isDropdownOpen;
                dropdown.style.display = isDropdownOpen ? 'block' : 'none';
                if (isDropdownOpen) fetchAndRender();
            } else {
                // Click outside → close
                isDropdownOpen = false;
                dropdown.style.display = 'none';
            }
        });

        // Mark-all-read button
        document.addEventListener('click', async (e) => {
            if (e.target && e.target.id === 'notifMarkAllBtn') {
                await markAllRead();
            }
        });
    }

    // ── Fetch Notifications from API ────────────────────────────────────────
    async function fetchAndRender() {
        if (typeof apiRequest !== 'function') return;

        try {
            const res = await apiRequest('/notifications/');
            if (!res.ok) return;

            // Response shape: { success, data: { results: [...], unread_count: N } }
            const payload      = res.data?.data || res.data || {};
            const notifications= Array.isArray(payload.results) ? payload.results
                               : Array.isArray(payload)         ? payload
                               : [];
            const unreadCount  = typeof payload.unread_count === 'number'
                               ? payload.unread_count
                               : notifications.filter(n => !n.is_read).length;

            renderBadge(unreadCount);
            renderList(notifications);
        } catch (err) {
            console.warn('[Notifications] fetch error:', err);
        }
    }

    // ── Render Unread Badge ─────────────────────────────────────────────────
    function renderBadge(count) {
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // ── Render Notification List ─────────────────────────────────────────────
    function renderList(notifications) {
        const list    = document.getElementById('notifList');
        const footer  = document.getElementById('notifFooterText');
        if (!list) return;

        // If background polling found new unread notifications, show top-center toaster
        if (!isInitialNotifLoad) {
            notifications.forEach(n => {
                if (!n.is_read && !knownNotifIds.has(n.id)) {
                    const text = n.title ? `${n.title}: ${n.message}` : n.message;
                    window.showToast(text, 'info');
                }
            });
        }
        knownNotifIds = new Set(notifications.map(n => n.id));
        isInitialNotifLoad = false;

        if (notifications.length === 0) {
            list.innerHTML = `
                <div class="notif-empty">
                    <span style="font-size:1.8rem;">🎉</span>
                    <span>You're all caught up!</span>
                </div>`;
            if (footer) footer.textContent = 'No notifications yet';
            return;
        }

        const unread = notifications.filter(n => !n.is_read).length;
        if (footer) footer.textContent = `${unread} unread · ${notifications.length} total`;

        list.innerHTML = notifications.slice(0, 20).map(n => {
            const icon    = getTypeIcon(n.notification_type);
            const timeAgo = formatTimeAgo(n.created_at);
            return `
                <div class="notif-item ${n.is_read ? 'notif-read' : 'notif-unread'}"
                     data-id="${n.id}" onclick="window._notifMarkRead(${n.id}, this)">
                    <div class="notif-item-icon">${icon}</div>
                    <div class="notif-item-body">
                        <div class="notif-item-title">${escapeHtml(n.title || '')}</div>
                        <div class="notif-item-msg">${escapeHtml(n.message || '')}</div>
                        <div class="notif-item-time">${timeAgo}</div>
                    </div>
                    ${!n.is_read ? '<div class="notif-unread-dot"></div>' : ''}
                </div>`;
        }).join('');
    }

    // ── Mark Single as Read ─────────────────────────────────────────────────
    window._notifMarkRead = async function (id, el) {
        if (!el || el.classList.contains('notif-read')) return;
        if (typeof apiRequest !== 'function') return;

        try {
            await apiRequest(`/notifications/${id}/read/`, { method: 'PATCH' });
            el.classList.remove('notif-unread');
            el.classList.add('notif-read');
            const dot = el.querySelector('.notif-unread-dot');
            if (dot) dot.remove();
            // Update badge
            await fetchAndRender();
        } catch (err) {
            console.warn('[Notifications] mark read error:', err);
        }
    };

    // ── Mark All as Read ────────────────────────────────────────────────────
    async function markAllRead() {
        if (typeof apiRequest !== 'function') return;
        const btn = document.getElementById('notifMarkAllBtn');
        if (btn) { btn.textContent = 'Marking…'; btn.disabled = true; }

        try {
            await apiRequest('/notifications/read-all/', { method: 'PATCH' });
            await fetchAndRender();
        } catch (err) {
            console.warn('[Notifications] mark-all error:', err);
        } finally {
            if (btn) { btn.textContent = 'Mark all as read'; btn.disabled = false; }
        }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────
    function getTypeIcon(type) {
        const icons = {
            TASK_ASSIGNED:   '📋',
            TASK_UPDATED:    '✏️',
            TASK_COMPLETED:  '✅',
            TASK_DEADLINE:   '⏰',
            TASK_REASSIGNED: '🔄',
        };
        return icons[type] || '🔔';
    }

    function formatTimeAgo(isoStr) {
        if (!isoStr) return '';
        const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
        if (diff < 60)     return 'Just now';
        if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(isoStr).toLocaleDateString();
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotifications);
    } else {
        initNotifications();
    }

})();
