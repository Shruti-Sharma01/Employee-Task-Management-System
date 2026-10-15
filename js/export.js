/**
 * js/export.js
 * Export tasks as CSV / Excel / PDF — works from Tasks page and Dashboard.
 * Active filters from the Tasks page are automatically passed as query params.
 */

// ── Collect active filter params (tasks page only) ────────────────────────────
function _getFilterParams() {
    const params = new URLSearchParams();
    const statusEl   = document.getElementById('statusFilter');
    const priorityEl = document.getElementById('priorityFilter');
    const searchEl   = document.getElementById('searchInput');
    if (statusEl   && statusEl.value   !== 'all') params.set('status',   statusEl.value.replace('-', '_').toUpperCase());
    if (priorityEl && priorityEl.value !== 'all') params.set('priority', priorityEl.value.toUpperCase());
    if (searchEl   && searchEl.value.trim())       params.set('search',   searchEl.value.trim());
    return params.toString() ? `?${params.toString()}` : '';
}

// ── Generic download helper ───────────────────────────────────────────────────
async function _doExport(format) {
    const btn = document.getElementById('exportDropdownBtn');
    const menu = document.getElementById('exportDropdownMenu');
    if (menu) menu.style.display = 'none';           // close dropdown

    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:etm-spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>&nbsp;Exporting…`;
    }

    try {
        const qs  = _getFilterParams();
        const url = `${API_BASE_URL}/tasks/export/${format}/${qs}`;
        const token = localStorage.getItem('etm_access_token');

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

        const blob = await response.blob();
        const today = new Date().toISOString().slice(0, 10);
        const ext   = format === 'csv' ? 'csv' : format === 'excel' ? 'xlsx' : 'pdf';
        const filename = `ETMS_Tasks_${today}.${ext}`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);

        // ── Brief success flash ───────────────────────────────────────────
        if (btn) {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>&nbsp;Downloaded!`;
            btn.style.background = '#22c55e';
            btn.style.color      = '#fff';
            setTimeout(() => {
                btn.innerHTML  = originalHTML;
                btn.style.background = '';
                btn.style.color      = '';
                btn.disabled = false;
            }, 2200);
        }

    } catch (err) {
        console.error('Export error:', err);
        alert('Export failed.\n' + err.message);
        if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
    }
}

// ── Public functions called by HTML buttons ───────────────────────────────────
function exportTasksToCSV()   { _doExport('csv');   }
function exportTasksToExcel() { _doExport('excel'); }
function exportTasksToPDF()   { _doExport('pdf');   }

// ── Dropdown toggle ───────────────────────────────────────────────────────────
function toggleExportDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('exportDropdownMenu');
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
}

// Close dropdown when clicking elsewhere
document.addEventListener('click', function () {
    const menu = document.getElementById('exportDropdownMenu');
    if (menu) menu.style.display = 'none';
});

// ── Inject CSS once ───────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('etm-export-style')) return;
    const s = document.createElement('style');
    s.id = 'etm-export-style';
    s.textContent = `
        @keyframes etm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .export-dropdown-wrap {
            position: relative;
            display: inline-flex;
        }
        .export-dropdown-menu {
            display: none;
            position: absolute;
            top: calc(100% + 6px);
            right: 0;
            z-index: 999;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.12);
            min-width: 175px;
            overflow: hidden;
        }
        .export-dropdown-menu button {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            padding: 10px 16px;
            background: none;
            border: none;
            text-align: left;
            font-size: 0.88rem;
            font-family: inherit;
            color: #1e293b;
            cursor: pointer;
            transition: background 0.15s, color 0.15s;
        }
        .export-dropdown-menu button:hover { background: #f1f5f9; }
        .export-dropdown-menu .divider { height: 1px; background: #e2e8f0; margin: 2px 0; }
        .export-dropdown-menu .menu-label {
            font-size: 0.72rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #64748b;
            padding: 8px 16px 4px;
        }

        /* ── Dark theme overrides ── */
        html.dark-theme .export-dropdown-menu {
            background: #141F38 !important;
            border-color: #233554 !important;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
        }
        html.dark-theme .export-dropdown-menu button {
            color: #F1F5F9 !important;
        }
        html.dark-theme .export-dropdown-menu button:hover {
            background: #1E293B !important;
            color: #388BFD !important;
        }
        html.dark-theme .export-dropdown-menu .menu-label {
            color: #94A3B8 !important;
        }
        html.dark-theme .export-dropdown-menu .divider {
            background: #233554 !important;
        }
    `;
    document.head.appendChild(s);
})();
