/**
 * js/dashboard.js
 * Controls Dashboard stats, progress calculations, recent tasks, and sidebar toggle.
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadDashboard();
});

/**
 * Handle mobile navigation / sidebar toggle
 */
function initNavigation() {
    const navToggle = document.getElementById('navToggle');
    const sidebar = document.getElementById('sidebar');

    if (navToggle && sidebar) {
        navToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }
}

/**
 * Main dashboard data loader
 */
function loadDashboard() {
    // 1. Fetch tasks from storage.js
    const tasks = typeof getTasks === 'function' ? getTasks() : [];

    // 2. Calculate task counts
    const total = tasks.length;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;

    tasks.forEach(task => {
        const status = (task.status || '').toLowerCase().trim();
        if (status === 'pending') {
            pending++;
        } else if (status === 'in progress' || status === 'in-progress') {
            inProgress++;
        } else if (status === 'completed') {
            completed++;
        }
    });

    // 3. Update Stat Cards in the UI
    updateText('totalTasks', total);
    updateText('pendingTasks', pending);
    updateText('progressTasks', inProgress);
    updateText('completedTasks', completed);

    // 4. Calculate and Update Overall Progress
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');

    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
    }
    if (progressPercent) {
        progressPercent.textContent = `${percentage}% completed`;
    }

    // 5. Render Recent Tasks (latest 5 tasks)
    renderRecentTasks(tasks.slice(0, 5));
}

/**
 * Update text content safely
 */
function updateText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = value;
    }
}

/**
 * Populate Recent Tasks Table (#recentTasksBody)
 */
function renderRecentTasks(recentTasks) {
    const tbody = document.getElementById('recentTasksBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Handle empty state
    if (!recentTasks || recentTasks.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `
            <td colspan="3" style="text-align:center; padding: 1.5rem; color: var(--color-text-muted, #777);">
                No tasks found.
            </td>
        `;
        tbody.appendChild(emptyRow);
        return;
    }

    // Create a row for each task
    recentTasks.forEach(task => {
        const tr = document.createElement('tr');

        const priorityClass = getPriorityClass(task.priority);
        const statusClass = getStatusClass(task.status);

        tr.innerHTML = `
            <td><strong>${escapeHtml(task.title || 'Untitled Task')}</strong></td>
            <td><span class="badge ${priorityClass}">${escapeHtml(task.priority || 'Normal')}</span></td>
            <td><span class="badge ${statusClass}">${escapeHtml(task.status || 'Pending')}</span></td>
        `;

        tbody.appendChild(tr);
    });
}

function getPriorityClass(priority = '') {
    const p = priority.toLowerCase().trim();
    if (p === 'high') return 'badge-high';
    if (p === 'medium') return 'badge-medium';
    if (p === 'low') return 'badge-low';
    return '';
}

function getStatusClass(status = '') {
    const s = status.toLowerCase().trim();
    if (s === 'completed') return 'badge-completed';
    if (s === 'in progress' || s === 'in-progress') return 'badge-progress';
    return 'badge-pending';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}