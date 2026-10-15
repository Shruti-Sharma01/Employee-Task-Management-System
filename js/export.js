/**
 * js/export.js
 * Export tasks to CSV — works from both Tasks page and Dashboard.
 * Reads currently active filters (if on tasks page) and sends them
 * to GET /api/tasks/export/ which returns a ready-to-download CSV.
 */

async function exportTasksToCSV() {
    const btn = document.getElementById('exportCsvBtn') || event?.currentTarget;

    // ── Show loading state ────────────────────────────────────────────────
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Exporting...`;
    }

    try {
        // ── Collect active filters (only available on tasks.html) ─────────
        const params = new URLSearchParams();

        const statusEl   = document.getElementById('statusFilter');
        const priorityEl = document.getElementById('priorityFilter');
        const searchEl   = document.getElementById('searchInput');

        if (statusEl   && statusEl.value   !== 'all') params.set('status',   statusEl.value.replace('-', '_').toUpperCase());
        if (priorityEl && priorityEl.value !== 'all') params.set('priority', priorityEl.value.toUpperCase());
        if (searchEl   && searchEl.value.trim())       params.set('search',   searchEl.value.trim());

        const queryString = params.toString() ? `?${params.toString()}` : '';
        const url = `${API_BASE_URL}/tasks/export/${queryString}`;

        // ── Fetch the CSV with auth token ─────────────────────────────────
        const token = localStorage.getItem('etm_access_token');
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Export failed: ${response.status} ${response.statusText}`);
        }

        // ── Trigger browser download ──────────────────────────────────────
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');

        // Build filename with current date
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        a.download = `ETMS_Tasks_${dateStr}.csv`;
        a.href = downloadUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        // ── Brief success flash ───────────────────────────────────────────
        if (btn) {
            btn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                Downloaded!`;
            btn.style.background = 'var(--color-success, #22c55e)';
            btn.style.color = '#fff';
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = '';
                btn.style.color = '';
                btn.disabled = false;
            }, 2000);
        }

    } catch (err) {
        console.error('CSV Export error:', err);
        alert('Export failed. Please try again.\n' + err.message);
        if (btn) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// Add spin animation for loading state (injected once)
(function injectSpinStyle() {
    if (document.getElementById('export-spin-style')) return;
    const style = document.createElement('style');
    style.id = 'export-spin-style';
    style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
})();
