/**
 * js/dashboard.js  (v2.5)
 * Dashboard: Stats, Overdue Alerts, Doughnut Chart, Weekly Bar Chart, Recent Tasks
 */

// Chart instances (kept so we can destroy before re-creating on refresh)
let statusDoughnutChart = null;
let weeklyBarChart      = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkAuth === 'function' && !checkAuth()) return;

    initNavigation();
    loadDashboard();     // immediate render from cache

    if (typeof fetchTasksFromAPI === 'function') {
        try {
            await fetchTasksFromAPI();
            loadDashboard();  // re-render with fresh DB data
        } catch (e) {
            console.warn('Dashboard API sync deferred:', e);
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────
function initNavigation() {
    const navToggle = document.getElementById('navToggle');
    const sidebar   = document.getElementById('sidebar');
    if (navToggle && sidebar) {
        navToggle.addEventListener('click', () => sidebar.classList.toggle('active'));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loader
// ─────────────────────────────────────────────────────────────────────────────
function loadDashboard() {
    const tasks = typeof getTasks === 'function' ? getTasks() : [];

    // ── Counts ──────────────────────────────────────────────────
    let pending    = 0;
    let inProgress = 0;
    let completed  = 0;
    let cancelled  = 0;
    const overdueTasks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tasks.forEach(task => {
        const status = (task.status || '').toLowerCase().trim();
        if      (status === 'pending')                                  pending++;
        else if (status === 'in-progress' || status === 'in progress')  inProgress++;
        else if (status === 'completed')                                completed++;
        else if (status === 'cancelled')                                cancelled++;

        // Overdue: not completed/cancelled AND deadline in the past
        if (status !== 'completed' && status !== 'cancelled' && task.dueDate) {
            const due = new Date(task.dueDate);
            due.setHours(0, 0, 0, 0);
            if (due < today) {
                overdueTasks.push(task);
            }
        }
    });

    const total = tasks.length;

    // ── Stat Cards ───────────────────────────────────────────────
    updateText('totalTasks',     total);
    updateText('pendingTasks',   pending);
    updateText('progressTasks',  inProgress);
    updateText('completedTasks', completed);

    // ── Progress Bar ─────────────────────────────────────────────
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressBar = document.getElementById('progressBar');
    const progressPct = document.getElementById('progressPercent');
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent  = `${pct}%`;

    // ── Overdue Section ──────────────────────────────────────────
    renderOverdue(overdueTasks);

    // ── Charts ───────────────────────────────────────────────────
    renderDoughnutChart({ pending, inProgress, completed, cancelled });
    renderWeeklyBarChart(tasks);

    // ── Recent Tasks ─────────────────────────────────────────────
    renderRecentTasks(tasks.slice(0, 6));
}

// ─────────────────────────────────────────────────────────────────────────────
// Overdue Tasks Alert
// ─────────────────────────────────────────────────────────────────────────────
function renderOverdue(overdueTasks) {
    const section     = document.getElementById('overdueSection');
    const countBadge  = document.getElementById('overdueCount');
    const cardsWrap   = document.getElementById('overdueCards');
    if (!section || !cardsWrap) return;

    if (overdueTasks.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display  = 'block';
    if (countBadge) countBadge.textContent = overdueTasks.length;

    cardsWrap.innerHTML = '';
    overdueTasks.forEach(task => {
        const chip = document.createElement('div');
        chip.className = 'overdue-task-chip';
        const daysOverdue = Math.floor(
            (new Date().setHours(0,0,0,0) - new Date(task.dueDate).setHours(0,0,0,0))
            / (1000 * 60 * 60 * 24)
        );
        chip.innerHTML = `
            <strong>${escapeHtml(task.title || 'Untitled')}</strong>
            <span>📅 Due: ${escapeHtml(task.dueDate)} &nbsp;·&nbsp; ${daysOverdue}d overdue</span>
        `;
        cardsWrap.appendChild(chip);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Doughnut Chart — Task Status Distribution
// ─────────────────────────────────────────────────────────────────────────────
function renderDoughnutChart({ pending, inProgress, completed, cancelled }) {
    const canvas = document.getElementById('statusDoughnutChart');
    if (!canvas) return;

    const total = pending + inProgress + completed + cancelled;
    const centerLabel = document.getElementById('doughnutTotal');
    if (centerLabel) centerLabel.textContent = total;

    // Destroy old chart before re-creating
    if (statusDoughnutChart) {
        statusDoughnutChart.destroy();
        statusDoughnutChart = null;
    }

    const data    = [pending, inProgress, completed, cancelled];
    const labels  = ['Pending', 'In Progress', 'Completed', 'Cancelled'];
    const colors  = ['#E6A821', '#3498db', '#27AE60', '#e74c3c'];

    statusDoughnutChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            cutout: '68%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const val = ctx.parsed;
                            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return `  ${ctx.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    // Render custom legend
    const legendEl = document.getElementById('doughnutLegend');
    if (legendEl) {
        legendEl.innerHTML = labels.map((lbl, i) => `
            <div class="legend-item">
                <span class="legend-dot" style="background:${colors[i]};"></span>
                ${escapeHtml(lbl)} <strong style="color:var(--color-text);margin-left:4px;">${data[i]}</strong>
            </div>
        `).join('');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Bar Chart — Completed tasks per day (last 7 days)
// ─────────────────────────────────────────────────────────────────────────────
function renderWeeklyBarChart(tasks) {
    const canvas = document.getElementById('weeklyBarChart');
    if (!canvas) return;

    // Build labels: last 7 days (Mon–Sun style)
    const dayLabels = [];
    const dayCounts = [];
    const dayNames  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        dayLabels.push(dayNames[d.getDay()]);
        dayCounts.push(0);
    }

    // Count completed tasks whose dueDate falls in last 7 days
    // (We use dueDate as proxy since we don't store completedAt)
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    tasks.forEach(task => {
        const status = (task.status || '').toLowerCase();
        if (status !== 'completed') return;
        if (!task.dueDate) return;

        const due = new Date(task.dueDate);
        due.setHours(0, 0, 0, 0);
        if (due >= sevenDaysAgo && due <= today) {
            // Find which slot
            const diff = Math.round((due - sevenDaysAgo) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff < 7) dayCounts[diff]++;
        }
    });

    // Destroy old chart
    if (weeklyBarChart) {
        weeklyBarChart.destroy();
        weeklyBarChart = null;
    }

    weeklyBarChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: dayLabels,
            datasets: [{
                label: 'Completed',
                data: dayCounts,
                backgroundColor: 'rgba(39,174,96,0.75)',
                borderColor:     'rgba(39,174,96,1)',
                borderWidth: 1.5,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `  ${ctx.parsed.y} task${ctx.parsed.y !== 1 ? 's' : ''} completed`
                    }
                }
            },
            scales: {
                x: {
                    grid:  { display: false },
                    ticks: { color: '#888', font: { size: 11 } }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: '#888',
                        font:  { size: 11 }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Tasks Table
// ─────────────────────────────────────────────────────────────────────────────
function renderRecentTasks(recentTasks) {
    const tbody = document.getElementById('recentTasksBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!recentTasks || recentTasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center;padding:1.5rem;color:var(--color-text-muted);">
                    No tasks found. <a href="tasks.html">Add your first task →</a>
                </td>
            </tr>`;
        return;
    }

    recentTasks.forEach(task => {
        const tr = document.createElement('tr');
        const today = new Date(); today.setHours(0,0,0,0);
        const due   = task.dueDate ? new Date(task.dueDate) : null;
        if (due) due.setHours(0,0,0,0);

        const isOverdue = due && due < today &&
            !['completed','cancelled'].includes((task.status||'').toLowerCase());

        tr.innerHTML = `
            <td>
                <strong style="color:var(--color-primary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;"
                        onclick="if(typeof openTaskDrawer==='function')openTaskDrawer('${escapeHtml(task.id)}')"
                        title="Click to view details and discussion">
                    <span>${escapeHtml(task.title || 'Untitled')}</span>
                    <span style="font-size:0.8rem;">💬</span>
                </strong>
                ${task.description ? `<div style="font-size:0.78rem;color:var(--color-text-muted);margin-top:2px;">
                    ${escapeHtml(task.description.substring(0,60))}${task.description.length>60?'…':''}</div>` : ''}
            </td>
            <td style="${isOverdue ? 'color:#e74c3c;font-weight:600;' : 'color:var(--color-text-muted);'}">
                ${task.dueDate ? escapeHtml(task.dueDate) : '—'}
                ${isOverdue ? ' ⚠️' : ''}
            </td>
            <td><span class="badge ${getPriorityClass(task.priority)}">${escapeHtml(capitalize(task.priority || 'Normal'))}</span></td>
            <td><span class="badge ${getStatusClass(task.status)}">${escapeHtml(formatStatus(task.status))}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function updateText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function getPriorityClass(priority = '') {
    const p = priority.toLowerCase().trim();
    if (p === 'high')   return 'badge-danger';
    if (p === 'medium') return 'badge-warning';
    if (p === 'low')    return 'badge-info';
    return 'badge-info';
}

function getStatusClass(status = '') {
    const s = (status || '').toLowerCase().trim();
    if (s === 'completed')                              return 'badge-success';
    if (s === 'in-progress' || s === 'in progress')     return 'badge-info';
    if (s === 'cancelled')                              return 'badge-danger';
    return 'badge-warning';
}

function formatStatus(status = '') {
    const s = (status || '').toLowerCase().trim();
    if (s === 'in-progress') return 'In Progress';
    if (s === 'pending')     return 'Pending';
    if (s === 'completed')   return 'Completed';
    if (s === 'cancelled')   return 'Cancelled';
    return capitalize(status);
}

function capitalize(str = '') {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}