/**
 * js/drawer.js (v1.0)
 * Slide-over Side Drawer for Task Details, Attachments, and Live Discussion / Comments.
 * Integrates with ETMS API:
 *   GET    /api/tasks/<id>/             → Task Details
 *   GET    /api/tasks/<id>/comments/    → List comments
 *   POST   /api/tasks/<id>/comments/    → Add comment
 *   DELETE /api/comments/<id>/          → Delete comment
 *   GET    /api/tasks/<id>/attachments/ → List attachments
 *   POST   /api/tasks/<id>/attachments/ → Upload attachment
 *   DELETE /api/attachments/<id>/       → Delete attachment
 */

(function () {
    'use strict';

    let currentDrawerTaskId = null;
    let isDrawerOpen = false;

    // ── Inject Drawer HTML into Document ─────────────────────────
    function injectDrawerHTML() {
        if (document.getElementById('taskDrawer')) return;

        const overlay = document.createElement('div');
        overlay.id = 'drawerOverlay';
        overlay.className = 'drawer-overlay';

        const drawer = document.createElement('aside');
        drawer.id = 'taskDrawer';
        drawer.className = 'task-drawer';
        drawer.setAttribute('aria-label', 'Task Details and Discussion');
        drawer.innerHTML = `
            <!-- Drawer Header -->
            <div class="drawer-header">
                <div class="drawer-header-top">
                    <div class="drawer-badges" id="drawerBadges">
                        <!-- Badges injected dynamically -->
                    </div>
                    <button type="button" class="drawer-close-btn" id="drawerCloseBtn" aria-label="Close Drawer">✕</button>
                </div>
                <h2 class="drawer-title" id="drawerTitle">Loading task…</h2>
                <div class="drawer-subtitle" id="drawerSubtitle"></div>
            </div>

            <!-- Drawer Scrollable Body -->
            <div class="drawer-body">
                <!-- Section: Details & Meta -->
                <div class="drawer-section">
                    <div class="drawer-section-title">
                        <span>📝 Description</span>
                    </div>
                    <p class="drawer-desc-text" id="drawerDescription">No description provided.</p>

                    <div class="drawer-meta-grid">
                        <div class="drawer-meta-item">
                            <div class="drawer-meta-label">Assigned To</div>
                            <div class="drawer-meta-val" id="drawerAssignedTo">—</div>
                        </div>
                        <div class="drawer-meta-item">
                            <div class="drawer-meta-label">Assigned By</div>
                            <div class="drawer-meta-val" id="drawerAssignedBy">—</div>
                        </div>
                        <div class="drawer-meta-item">
                            <div class="drawer-meta-label">Category</div>
                            <div class="drawer-meta-val" id="drawerCategory">—</div>
                        </div>
                        <div class="drawer-meta-item">
                            <div class="drawer-meta-label">Due Date</div>
                            <div class="drawer-meta-val" id="drawerDueDate">—</div>
                        </div>
                    </div>

                    <!-- Quick Action Panel: Accept / Reject / Complete Task -->
                    <div class="drawer-action-panel" id="drawerActionPanel" style="display:none;margin-top:14px;">
                        <div class="drawer-action-btns" id="drawerActionBtns">
                            <button type="button" class="btn-drawer-action btn-drawer-accept" id="drawerAcceptBtn"
                                    onclick="window._drawerAcceptCurrentTask()" style="display:none;">
                                🚀 Accept Task
                            </button>
                            <button type="button" class="btn-drawer-action btn-drawer-reject" id="drawerRejectBtn"
                                    onclick="window._drawerOpenRejectForm()" style="display:none;">
                                ❌ Reject Task
                            </button>
                            <button type="button" class="btn-drawer-action btn-drawer-complete" id="drawerCompleteBtn"
                                    onclick="window._drawerCompleteCurrentTask()" style="display:none;">
                                ✅ Mark as Completed
                            </button>
                        </div>
                        <div id="drawerRejectForm" style="display:none;margin-top:10px;padding:12px;border-radius:8px;background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.25);">
                            <label style="font-size:0.8rem;font-weight:600;color:#dc2626;display:block;margin-bottom:5px;">Reason for Rejection</label>
                            <input type="text" id="drawerRejectReason" class="drawer-reassign-input" placeholder="e.g. Current workload too high, skill mismatch..." style="margin-bottom:8px;width:100%;box-sizing:border-box;" />
                            <div style="display:flex;gap:8px;justify-content:flex-end;">
                                <button type="button" class="drawer-reassign-cancel-btn" style="padding:4px 10px;font-size:0.75rem;" onclick="window._drawerCloseRejectForm()">Cancel</button>
                                <button type="button" class="btn-drawer-action btn-drawer-reject" id="drawerConfirmRejectBtn" style="padding:4px 12px;font-size:0.75rem;width:auto;" onclick="window._drawerSubmitRejectCurrentTask()">Confirm Rejection</button>
                            </div>
                        </div>
                        <div id="drawerActionNotice" style="font-size:0.8rem;color:var(--color-text-muted);display:none;margin-top:6px;"></div>
                    </div>

                    <!-- Section: Automatic Time Tracking -->
                    <div class="drawer-section" id="drawerTimeTrackingSection" style="margin-top:14px;border-top:1px solid var(--color-border,#e2e8f0);padding-top:14px;">
                        <div class="drawer-section-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <span style="display:flex;align-items:center;gap:6px;font-weight:700;">⏱️ Automatic Work Timer</span>
                            <span id="drawerTotalTimeBadge" class="time-pill-badge">
                                0h 00m
                            </span>
                        </div>
                        <div class="drawer-timer-box-modern">
                            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div class="timer-display-wrap">
                                        <span id="drawerTimerDisplay" class="timer-digital-clock">00:00:00</span>
                                    </div>
                                </div>
                                <div style="display:flex;gap:8px;">
                                    <button type="button" id="drawerTimerStartBtn" class="btn-timer-action btn-timer-resume" onclick="window._drawerStartTimer()">
                                        ▶ Resume Timer
                                    </button>
                                    <button type="button" id="drawerTimerStopBtn" class="btn-timer-action btn-timer-pause" style="display:none;" onclick="window._drawerStopTimer()">
                                        ⏸ Pause Timer
                                    </button>
                                </div>
                            </div>
                            <div style="font-size:0.75rem;color:var(--color-text-muted,#64748b);margin-top:8px;display:flex;align-items:center;gap:6px;">
                                <span>⚡</span> Timer automatically starts when you accept the task and pauses when completed.
                            </div>
                        </div>
                        <div id="drawerTimeEntriesList" class="drawer-time-logs-list">
                            <div style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;padding:10px;">No work sessions logged yet.</div>
                        </div>
                    </div>

                    <!-- Reassign Panel (Manager / Admin only) -->
                    <div class="drawer-reassign-panel" id="drawerReassignPanel" style="display:none;">
                        <div class="drawer-reassign-header">
                            <span>🔄 Reassign Task</span>
                            <button type="button" class="drawer-reassign-toggle-btn" id="drawerReassignToggleBtn"
                                    onclick="window._drawerToggleReassign()">
                                Reassign
                            </button>
                        </div>
                        <div class="drawer-reassign-form" id="drawerReassignForm" style="display:none;">
                            <div class="drawer-reassign-field">
                                <label class="drawer-reassign-label">Assign To</label>
                                <select id="drawerReassignSelect" class="drawer-reassign-select">
                                    <option value="">— Loading employees… —</option>
                                </select>
                            </div>
                            <div class="drawer-reassign-field">
                                <label class="drawer-reassign-label">Reason <span style="font-weight:400;opacity:0.6;">(optional)</span></label>
                                <input type="text" id="drawerReassignNote" class="drawer-reassign-input"
                                       placeholder="e.g. Employee on leave, workload balancing…" maxlength="200">
                            </div>
                            <div class="drawer-reassign-actions">
                                <button type="button" class="drawer-reassign-cancel-btn"
                                        onclick="window._drawerToggleReassign()">Cancel</button>
                                <button type="button" class="drawer-reassign-submit-btn" id="drawerReassignSubmitBtn"
                                        onclick="window._drawerSubmitReassign()">
                                    ✅ Confirm Reassign
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section: Attachments -->
                <div class="drawer-section">
                    <div class="drawer-section-title">
                        <span>📎 Attachments (<span id="drawerAttachmentCount">0</span>)</span>
                        <label class="drawer-upload-btn" for="drawerFileInput">
                            + Upload
                        </label>
                        <input type="file" id="drawerFileInput" style="display:none;" 
                               accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg">
                    </div>
                    <div class="drawer-attachments-list" id="drawerAttachmentsList">
                        <div style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;padding:10px;">
                            No files attached yet.
                        </div>
                    </div>
                </div>

                <!-- Section: Tabs (Discussion & Activity) -->
                <div class="drawer-section drawer-feed-wrap">
                    <div class="drawer-tabs-nav">
                        <button type="button" class="drawer-tab-btn active" id="drawerTabComments">
                            💬 Discussion (<span id="drawerCommentCount">0</span>)
                        </button>
                        <button type="button" class="drawer-tab-btn" id="drawerTabActivities">
                            📜 Activity (<span id="drawerActivityCount">0</span>)
                        </button>
                    </div>

                    <!-- Pane 1: Comments -->
                    <div class="drawer-tab-pane active" id="paneComments">
                        <div class="drawer-comments-list" id="drawerCommentsList">
                            <div class="drawer-comment-empty">Loading discussion…</div>
                        </div>
                    </div>

                    <!-- Pane 2: Activities -->
                    <div class="drawer-tab-pane" id="paneActivities" style="display:none;">
                        <div class="drawer-activities-list" id="drawerActivitiesList">
                            <div class="drawer-activity-empty">Loading activity history…</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Drawer Footer (Comment Box) -->
            <div class="drawer-footer">
                <form id="drawerCommentForm" class="drawer-input-row">
                    <textarea id="drawerCommentInput" class="drawer-comment-textarea" rows="2" 
                              placeholder="Write a note, update or reply… (Press Enter to send, Shift+Enter for newline)" required></textarea>
                    <button type="submit" class="drawer-send-btn" id="drawerSendBtn">
                        <span>Send</span> ✈️
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(drawer);

        bindDrawerEvents();
    }

    // ── Event Listeners ──────────────────────────────────────────
    function bindDrawerEvents() {
        const overlay = document.getElementById('drawerOverlay');
        const closeBtn = document.getElementById('drawerCloseBtn');
        const form = document.getElementById('drawerCommentForm');
        const fileInput = document.getElementById('drawerFileInput');
        const commentInput = document.getElementById('drawerCommentInput');

        if (overlay) overlay.addEventListener('click', closeTaskDrawer);
        if (closeBtn) closeBtn.addEventListener('click', closeTaskDrawer);

        // Keyboard Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isDrawerOpen) {
                closeTaskDrawer();
            }
        });

        // Comment form submit
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await handleCommentSubmit();
            });
        }

        // Enter key in textarea submits form (Shift+Enter allows newline)
        if (commentInput) {
            commentInput.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    await handleCommentSubmit();
                }
            });
        }

        // File upload trigger
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    await handleFileUpload(file);
                    fileInput.value = ''; // reset so same file can be uploaded again if needed
                }
            });
        }

        // Tab Switching (Comments vs Activity)
        const tabComments = document.getElementById('drawerTabComments');
        const tabActivities = document.getElementById('drawerTabActivities');
        if (tabComments) {
            tabComments.addEventListener('click', () => switchDrawerTab('comments'));
        }
        if (tabActivities) {
            tabActivities.addEventListener('click', () => switchDrawerTab('activities'));
        }
    }

    // ── Tab Switcher ─────────────────────────────────────────────
    function switchDrawerTab(tabName) {
        const tabComments = document.getElementById('drawerTabComments');
        const tabActivities = document.getElementById('drawerTabActivities');
        const paneComments = document.getElementById('paneComments');
        const paneActivities = document.getElementById('paneActivities');
        const footer = document.querySelector('.drawer-footer');

        if (tabName === 'activities') {
            if (tabComments) tabComments.classList.remove('active');
            if (tabActivities) tabActivities.classList.add('active');
            if (paneComments) paneComments.style.display = 'none';
            if (paneActivities) paneActivities.style.display = 'block';
            if (footer) footer.style.display = 'none';
            if (currentDrawerTaskId) loadActivities(currentDrawerTaskId);
        } else {
            if (tabActivities) tabActivities.classList.remove('active');
            if (tabComments) tabComments.classList.add('active');
            if (paneActivities) paneActivities.style.display = 'none';
            if (paneComments) paneComments.style.display = 'block';
            if (footer) footer.style.display = '';
            if (currentDrawerTaskId) loadComments(currentDrawerTaskId);
        }
    }

    // ── Open Drawer ──────────────────────────────────────────────
    window.openTaskDrawer = async function (taskId) {
        if (!taskId) return;
        injectDrawerHTML();

        currentDrawerTaskId = taskId;
        isDrawerOpen = true;

        // Reset to Comments tab on open
        switchDrawerTab('comments');

        const overlay = document.getElementById('drawerOverlay');
        const drawer = document.getElementById('taskDrawer');

        if (overlay) overlay.classList.add('active');
        if (drawer) drawer.classList.add('open');

        // Prevent background body scroll
        document.body.style.overflow = 'hidden';

        // Load Task Data & Render
        await loadTaskData(taskId);
        loadComments(taskId);
        loadAttachments(taskId);
        loadActivities(taskId);
        loadTimeEntries(taskId);
    };

    // ── Close Drawer ─────────────────────────────────────────────
    window.closeTaskDrawer = function () {
        const overlay = document.getElementById('drawerOverlay');
        const drawer = document.getElementById('taskDrawer');

        if (overlay) overlay.classList.remove('active');
        if (drawer) drawer.classList.remove('open');

        document.body.style.overflow = '';
        stopDrawerTimerTicker();
        currentDrawerTaskId = null;
        isDrawerOpen = false;
    };

    // ── Load Task Details ────────────────────────────────────────
    async function loadTaskData(taskId) {
        const titleEl = document.getElementById('drawerTitle');
        const descEl = document.getElementById('drawerDescription');
        const badgesEl = document.getElementById('drawerBadges');
        const subtitleEl = document.getElementById('drawerSubtitle');
        const assignedToEl = document.getElementById('drawerAssignedTo');
        const assignedByEl = document.getElementById('drawerAssignedBy');
        const categoryEl = document.getElementById('drawerCategory');
        const dueDateEl = document.getElementById('drawerDueDate');

        let task = null;

        // Try getting task from local cache first for instant render
        if (typeof getTaskById === 'function') {
            task = getTaskById(taskId);
        }

        // Render cached data immediately
        if (task) renderTaskDetails(task);

        // Fetch fresh details from API
        if (typeof apiRequest === 'function') {
            try {
                const res = await apiRequest(`/tasks/${taskId}/`);
                if (res.ok && res.data) {
                    const freshTask = res.data?.data || res.data;
                    renderTaskDetails(freshTask);
                }
            } catch (err) {
                console.warn('[Drawer] Could not fetch fresh task details:', err);
            }
        }
    }

    function renderTaskDetails(task) {
        const titleEl = document.getElementById('drawerTitle');
        const descEl = document.getElementById('drawerDescription');
        const badgesEl = document.getElementById('drawerBadges');
        const subtitleEl = document.getElementById('drawerSubtitle');
        const assignedToEl = document.getElementById('drawerAssignedTo');
        const assignedByEl = document.getElementById('drawerAssignedBy');
        const categoryEl = document.getElementById('drawerCategory');
        const dueDateEl = document.getElementById('drawerDueDate');
        const reassignPanel = document.getElementById('drawerReassignPanel');

        if (titleEl) titleEl.textContent = task.title || 'Untitled Task';
        if (descEl) descEl.textContent = task.description || 'No description provided.';

        // Priority & Status Badges
        const priority = (task.priority || 'medium').toLowerCase();
        const status = (task.status || 'pending').toLowerCase().replace('_', '-');
        const category = task.category || 'Development';

        if (badgesEl) {
            let statusCls = 'badge-warning';
            if (status === 'in-progress') statusCls = 'badge-info';
            else if (status === 'completed') statusCls = 'badge-success';
            else if (status === 'cancelled' || status === 'rejected') statusCls = 'badge-danger';

            let priorityCls = 'badge-info';
            if (priority === 'high') priorityCls = 'badge-danger';
            else if (priority === 'medium') priorityCls = 'badge-warning';

            badgesEl.innerHTML = `
                <span class="badge ${priorityCls}">${capitalize(priority)} Priority</span>
                <span class="badge ${statusCls}">${formatStatusName(status)}</span>
            `;
        }

        // Subtitle / Created info
        if (subtitleEl) {
            const created = task.createdAt || task.created_at;
            const timeAgo = created ? formatTimeAgo(created) : '';
            subtitleEl.innerHTML = `Created ${timeAgo}`;
        }

        // Meta Grid
        const assignedToName = task.assignedTo?.full_name || task.assigned_to?.full_name || 'Unassigned';
        const assignedByName = task.assignedBy?.username || task.assigned_by?.username || 'System';

        if (assignedToEl) assignedToEl.innerHTML = `👤 <span>${escapeHtml(assignedToName)}</span>`;
        if (assignedByEl) assignedByEl.innerHTML = `👑 <span>${escapeHtml(assignedByName)}</span>`;
        if (categoryEl) categoryEl.textContent = capitalize(category);

        const dueDate = task.dueDate || task.deadline;
        if (dueDateEl) {
            const isOverdue = task.is_overdue || (dueDate && new Date(dueDate) < new Date() && status !== 'completed');
            dueDateEl.innerHTML = dueDate 
                ? `📅 ${escapeHtml(dueDate)} ${isOverdue ? '<span style="color:#ef4444;font-size:0.75rem;">(Overdue)</span>' : ''}`
                : 'No due date';
        }

        // Show Reassign panel for Manager or Admin only
        if (reassignPanel) {
            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const role = (currentUser?.role || '').toUpperCase();
            if (role === 'ADMIN' || role === 'MANAGER') {
                reassignPanel.style.display = 'block';
                // Pre-load employees list in background
                _drawerLoadEmployees();
            } else {
                reassignPanel.style.display = 'none';
            }
        }

        // Action Panel (Accept / Reject / Complete)
        const actionPanel = document.getElementById('drawerActionPanel');
        const acceptBtn   = document.getElementById('drawerAcceptBtn');
        const rejectBtn   = document.getElementById('drawerRejectBtn');
        const completeBtn = document.getElementById('drawerCompleteBtn');
        const noticeEl    = document.getElementById('drawerActionNotice');
        const rejectForm  = document.getElementById('drawerRejectForm');

        if (rejectForm) rejectForm.style.display = 'none';

        if (actionPanel && acceptBtn && completeBtn) {
            const rawStatus = (task.status || 'pending').toLowerCase().replace('_', '-');
            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const role = (currentUser?.role || '').toUpperCase();

            // Strict check: Is current logged-in user the assigned employee?
            let isAssignee = false;
            const assignedUserObj = task.assignedTo || task.assigned_to;
            if (currentUser && assignedUserObj) {
                if (assignedUserObj.user_id && String(assignedUserObj.user_id) === String(currentUser.id)) {
                    isAssignee = true;
                } else {
                    const userFullName = (currentUser.fullName || currentUser.username || '').toLowerCase().trim();
                    const assigneeFullName = (assignedUserObj.full_name || '').toLowerCase().trim();
                    if (assigneeFullName && userFullName && (assigneeFullName === userFullName || assigneeFullName.includes(userFullName))) {
                        isAssignee = true;
                    }
                }
            }

            // ONLY an assigned EMPLOYEE can Accept or Reject a pending task!
            // Manager and Admin must never see the Accept/Reject buttons.
            const isManagerOrAdmin = (role === 'ADMIN' || role === 'MANAGER');
            if (rawStatus === 'pending') {
                if (isAssignee && !isManagerOrAdmin) {
                    actionPanel.style.display = 'block';
                    acceptBtn.style.display   = 'inline-flex';
                    if (rejectBtn) rejectBtn.style.display = 'inline-flex';
                    completeBtn.style.display = 'none';
                    if (noticeEl) {
                        noticeEl.style.display = 'block';
                        noticeEl.textContent = '⏳ This task was assigned to you. You can Accept to start working or Reject if unable to take it.';
                    }
                } else {
                    // For manager / creator: show status that employee hasn't accepted yet
                    actionPanel.style.display = 'block';
                    acceptBtn.style.display   = 'none';
                    if (rejectBtn) rejectBtn.style.display = 'none';
                    completeBtn.style.display = 'none';
                    if (noticeEl) {
                        noticeEl.style.display = 'block';
                        const assigneeName = assignedUserObj?.full_name || 'the employee';
                        noticeEl.textContent = `⏳ Waiting for ${assigneeName} to accept or reject this task.`;
                    }
                }
            } else if (rawStatus === 'in-progress') {
                // In progress: ONLY the assigned employee can mark complete!
                // Manager and Admin cannot mark complete; they only see the status notice.
                if (isAssignee && !isManagerOrAdmin) {
                    actionPanel.style.display = 'block';
                    acceptBtn.style.display   = 'none';
                    if (rejectBtn) rejectBtn.style.display = 'none';
                    completeBtn.style.display = 'inline-flex';
                    if (noticeEl) {
                        noticeEl.style.display = 'block';
                        noticeEl.textContent = '⚡ Task is in progress. Click "Mark as Completed" when work is done.';
                    }
                } else {
                    // For manager / creator: show status that employee is working on it
                    actionPanel.style.display = 'block';
                    acceptBtn.style.display   = 'none';
                    if (rejectBtn) rejectBtn.style.display = 'none';
                    completeBtn.style.display = 'none';
                    if (noticeEl) {
                        noticeEl.style.display = 'block';
                        const assigneeName = assignedUserObj?.full_name || 'the employee';
                        noticeEl.textContent = `⚡ Task is currently In Progress by ${assigneeName}.`;
                    }
                }
            } else if (rawStatus === 'rejected') {
                actionPanel.style.display = 'block';
                acceptBtn.style.display   = 'none';
                if (rejectBtn) rejectBtn.style.display = 'none';
                completeBtn.style.display = 'none';
                if (noticeEl) {
                    noticeEl.style.display = 'block';
                    const assigneeName = assignedUserObj?.full_name || 'The employee';
                    if (isManagerOrAdmin) {
                        noticeEl.textContent = `❌ ${assigneeName} rejected this task. You can reassign it to another employee below.`;
                    } else if (isAssignee) {
                        noticeEl.textContent = '❌ You rejected this task.';
                    } else {
                        noticeEl.textContent = `❌ Task was rejected by ${assigneeName}.`;
                    }
                }
            } else {
                actionPanel.style.display = 'none';
                acceptBtn.style.display   = 'none';
                if (rejectBtn) rejectBtn.style.display = 'none';
                completeBtn.style.display = 'none';
                if (noticeEl) noticeEl.style.display = 'none';
            }
        }
    }

    // ── Load Comments ────────────────────────────────────────────
    async function loadComments(taskId) {
        const listEl = document.getElementById('drawerCommentsList');
        const countEl = document.getElementById('drawerCommentCount');
        if (!listEl) return;

        try {
            const res = await apiRequest(`/tasks/${taskId}/comments/`);
            if (!res.ok) {
                listEl.innerHTML = `<div class="drawer-comment-empty">Could not load comments.</div>`;
                return;
            }

            const payload = res.data?.data || res.data || {};
            const comments = Array.isArray(payload.results) ? payload.results
                           : Array.isArray(payload) ? payload : [];

            if (countEl) countEl.textContent = comments.length;

            if (comments.length === 0) {
                listEl.innerHTML = `
                    <div class="drawer-comment-empty">
                        <span style="font-size:1.5rem;display:block;margin-bottom:4px;">💬</span>
                        No notes or updates yet.<br>Be the first to leave a comment!
                    </div>`;
                return;
            }

            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const currentUserId = currentUser?.id;
            const isAdminUser = currentUser?.role === 'ADMIN';

            listEl.innerHTML = comments.map(c => {
                const user = c.user || {};
                const authorName = user.username || 'User';
                const authorRole = (user.role || 'EMPLOYEE').toLowerCase();
                const isOwn = currentUserId && String(user.id) === String(currentUserId);
                const canDelete = isOwn || isAdminUser;
                const timeStr = formatTimeAgo(c.created_at);
                const initial = authorName.charAt(0).toUpperCase();

                return `
                    <div class="drawer-comment-card ${isOwn ? 'is-own' : ''}" data-comment-id="${c.id}">
                        <div class="drawer-comment-header">
                            <div class="drawer-comment-author-wrap">
                                <div class="drawer-comment-avatar">${escapeHtml(initial)}</div>
                                <span class="drawer-comment-author">${escapeHtml(authorName)}</span>
                                <span class="drawer-comment-role role-${escapeHtml(authorRole)}">${capitalize(authorRole)}</span>
                            </div>
                            <div>
                                <span class="drawer-comment-time">${escapeHtml(timeStr)}</span>
                                ${canDelete ? `
                                <button type="button" class="drawer-comment-del-btn" title="Delete comment"
                                        onclick="window._drawerDeleteComment(${taskId}, ${c.id})">🗑️</button>
                                ` : ''}
                            </div>
                        </div>
                        <div class="drawer-comment-text">${escapeHtml(c.comment)}</div>
                    </div>
                `;
            }).join('');

            // Scroll to bottom of comments list
            listEl.scrollTop = listEl.scrollHeight;

        } catch (err) {
            console.warn('[Drawer] Error loading comments:', err);
            listEl.innerHTML = `<div class="drawer-comment-empty">Failed to load discussion.</div>`;
        }
    }

    // ── Load Activities ──────────────────────────────────────────
    async function loadActivities(taskId) {
        const listEl = document.getElementById('drawerActivitiesList');
        const countEl = document.getElementById('drawerActivityCount');
        if (!listEl) return;

        try {
            const res = await apiRequest(`/tasks/${taskId}/activities/`);
            if (!res.ok) {
                listEl.innerHTML = `<div class="drawer-activity-empty">Could not load activity history.</div>`;
                return;
            }

            const payload = res.data?.data || res.data || {};
            const activities = Array.isArray(payload.results) ? payload.results
                              : Array.isArray(payload) ? payload : [];

            if (countEl) countEl.textContent = activities.length;

            if (activities.length === 0) {
                listEl.innerHTML = `
                    <div class="drawer-activity-empty">
                        <div style="font-size:2rem;margin-bottom:8px;">📜</div>
                        <div>No activity recorded yet for this task.</div>
                    </div>`;
                return;
            }

            listEl.innerHTML = `<div class="activity-timeline">` +
                activities.map(act => renderActivityItem(act)).join('') +
                `</div>`;
        } catch (err) {
            console.warn('[Drawer] Error loading activities:', err);
            listEl.innerHTML = `<div class="drawer-activity-empty">Error loading activity history.</div>`;
        }
    }

    function renderActivityItem(act) {
        const action = act.action || 'UPDATED';
        let icon = '✏️';
        let badgeClass = 'activity-type-edit';

        if (action === 'CREATED') {
            icon = '✨';
            badgeClass = 'activity-type-created';
        } else if (action === 'STATUS_CHANGED') {
            icon = '🔄';
            badgeClass = 'activity-type-status';
        } else if (action === 'REASSIGNED' || action === 'ASSIGNED') {
            icon = '👤';
            badgeClass = 'activity-type-assign';
        } else if (action === 'DEADLINE_CHANGED') {
            icon = '📅';
            badgeClass = 'activity-type-deadline';
        } else if (action === 'PRIORITY_CHANGED') {
            icon = '⚡';
            badgeClass = 'activity-type-priority';
        } else if (action === 'COMMENT' || action === 'COMMENT_ADDED') {
            icon = '💬';
            badgeClass = 'activity-type-comment';
        } else if (action === 'ATTACHMENT' || action === 'ATTACHMENT_ADDED') {
            icon = '📎';
            badgeClass = 'activity-type-attachment';
        }

        const timeAgo = formatTimeAgo(act.created_at);
        const fullDate = act.created_at ? new Date(act.created_at).toLocaleString() : '';

        return `
            <div class="activity-timeline-item">
                <div class="activity-timeline-marker ${badgeClass}">
                    <span>${icon}</span>
                </div>
                <div class="activity-timeline-body">
                    <div class="activity-timeline-text">
                        ${escapeHtml(act.message || 'Updated task')}
                    </div>
                    <div class="activity-timeline-time" title="${fullDate}">
                        ${timeAgo}
                    </div>
                </div>
            </div>
        `;
    }

    // ── Submit New Comment ───────────────────────────────────────
    async function handleCommentSubmit() {
        if (!currentDrawerTaskId) return;

        const input = document.getElementById('drawerCommentInput');
        const sendBtn = document.getElementById('drawerSendBtn');
        const text = input ? input.value.trim() : '';

        if (!text) return;

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span>Sending…</span>';
        }

        try {
            const res = await apiRequest(`/tasks/${currentDrawerTaskId}/comments/`, {
                method: 'POST',
                body: JSON.stringify({ comment: text })
            });

            if (res.ok) {
                if (input) input.value = '';
                await loadComments(currentDrawerTaskId);
                loadActivities(currentDrawerTaskId);
            } else {
                alert('Could not post comment: ' + (res.data?.message || 'Please try again.'));
            }
        } catch (err) {
            alert('Error posting comment: ' + (err.message || err));
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<span>Send</span> ✈️';
            }
            if (input) input.focus();
        }
    }

    // ── Delete Comment ───────────────────────────────────────────
    window._drawerDeleteComment = async function (taskId, commentId) {
        const ok = typeof window.showConfirm === 'function'
            ? await window.showConfirm('Are you sure you want to delete this comment?')
            : confirm('Are you sure you want to delete this comment?');
        if (!ok) return;

        try {
            const res = await apiRequest(`/comments/${commentId}/`, {
                method: 'DELETE'
            });

            if (res.ok || res.status === 204) {
                await loadComments(taskId);
            } else {
                alert('Could not delete comment: ' + (res.data?.message || 'Permission denied.'));
            }
        } catch (err) {
            alert('Error deleting comment: ' + (err.message || err));
        }
    };

    // ── Load Attachments ─────────────────────────────────────────
    async function loadAttachments(taskId) {
        const listEl = document.getElementById('drawerAttachmentsList');
        const countEl = document.getElementById('drawerAttachmentCount');
        if (!listEl) return;

        try {
            const res = await apiRequest(`/tasks/${taskId}/attachments/`);
            if (!res.ok) {
                listEl.innerHTML = `<div style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;">Could not load attachments.</div>`;
                return;
            }

            const payload = res.data?.data || res.data || {};
            const attachments = Array.isArray(payload.results) ? payload.results
                              : Array.isArray(payload) ? payload : [];

            if (countEl) countEl.textContent = attachments.length;

            if (attachments.length === 0) {
                listEl.innerHTML = `
                    <div style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;padding:12px;">
                        No files attached yet.
                    </div>`;
                return;
            }

            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const currentUserId = currentUser?.id;
            const isAdminUser = currentUser?.role === 'ADMIN';

            listEl.innerHTML = `<div class="attachments-grid">` + attachments.map(att => {
                const uploader = att.uploaded_by || {};
                const canDelete = isAdminUser || (currentUserId && String(uploader.id) === String(currentUserId));
                const fileName = att.file_name || 'Download File';
                const fileUrl = att.file || '#';
                const timeStr = formatTimeAgo(att.uploaded_at);
                const ext = (fileName.split('.').pop() || '').toLowerCase();
                const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
                const isPdf = ext === 'pdf';
                const isSheet = ['xls', 'xlsx', 'csv'].includes(ext);
                const isDoc = ['doc', 'docx'].includes(ext);

                if (isImage) {
                    return `
                        <div class="att-card-image" data-att-id="${att.id}">
                            <div class="att-image-thumb-wrap" onclick="window.openFilePreview('${fileUrl}', '${escapeHtml(fileName)}', true, false)" title="Click to view full preview">
                                <img src="${fileUrl}" class="att-image-thumb" alt="${escapeHtml(fileName)}" loading="lazy">
                                <div class="att-thumb-zoom-icon">🔍</div>
                            </div>
                            <div class="att-card-details">
                                <span class="att-card-name" onclick="window.openFilePreview('${fileUrl}', '${escapeHtml(fileName)}', true, false)" title="Click to preview">
                                    ${escapeHtml(fileName)}
                                </span>
                                <div class="att-card-meta">
                                    Uploaded by ${escapeHtml(uploader.username || 'User')} · ${escapeHtml(timeStr)}
                                </div>
                                <div class="att-card-actions">
                                    <button type="button" class="btn-att-preview" onclick="window.openFilePreview('${fileUrl}', '${escapeHtml(fileName)}', true, false)">
                                        👁️ Preview
                                    </button>
                                    <a href="${fileUrl}" target="_blank" download="${escapeHtml(fileName)}" class="btn-att-download">
                                        ⬇️ Download
                                    </a>
                                    ${canDelete ? `
                                    <button type="button" class="btn-att-delete" title="Delete file"
                                            onclick="window._drawerDeleteAttachment(${taskId}, ${att.id})">🗑️</button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }

                if (isPdf) {
                    return `
                        <div class="att-card-pdf" data-att-id="${att.id}">
                            <div class="att-pdf-icon-badge" onclick="window.openFilePreview('${fileUrl}', '${escapeHtml(fileName)}', false, true)" style="cursor:pointer;" title="Click to read PDF">
                                <span>📕</span>
                                <div>PDF</div>
                            </div>
                            <div class="att-card-details">
                                <span class="att-card-name" onclick="window.openFilePreview('${fileUrl}', '${escapeHtml(fileName)}', false, true)" title="Click to read PDF">
                                    ${escapeHtml(fileName)}
                                </span>
                                <div class="att-card-meta">
                                    Uploaded by ${escapeHtml(uploader.username || 'User')} · ${escapeHtml(timeStr)}
                                </div>
                                <div class="att-card-actions">
                                    <button type="button" class="btn-att-preview" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;"
                                            onclick="window.openFilePreview('${fileUrl}', '${escapeHtml(fileName)}', false, true)">
                                        👁️ Preview PDF
                                    </button>
                                    <a href="${fileUrl}" target="_blank" download="${escapeHtml(fileName)}" class="btn-att-download">
                                        ⬇️ Download
                                    </a>
                                    ${canDelete ? `
                                    <button type="button" class="btn-att-delete" title="Delete file"
                                            onclick="window._drawerDeleteAttachment(${taskId}, ${att.id})">🗑️</button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }

                // General Document / Sheet
                const icon = isSheet ? '📊' : isDoc ? '📄' : '📝';
                return `
                    <div class="att-card-doc" data-att-id="${att.id}">
                        <div class="att-doc-icon-badge">
                            ${icon}
                        </div>
                        <div class="att-card-details">
                            <a href="${fileUrl}" target="_blank" download="${escapeHtml(fileName)}" class="att-card-name" title="Click to download">
                                ${escapeHtml(fileName)}
                            </a>
                            <div class="att-card-meta">
                                Uploaded by ${escapeHtml(uploader.username || 'User')} · ${escapeHtml(timeStr)}
                            </div>
                            <div class="att-card-actions">
                                <a href="${fileUrl}" target="_blank" download="${escapeHtml(fileName)}" class="btn-att-download">
                                    ⬇️ Download
                                </a>
                                ${canDelete ? `
                                <button type="button" class="btn-att-delete" title="Delete file"
                                        onclick="window._drawerDeleteAttachment(${taskId}, ${att.id})">🗑️</button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('') + `</div>`;

        } catch (err) {
            console.warn('[Drawer] Error loading attachments:', err);
            listEl.innerHTML = `<div style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;">Failed to load attachments.</div>`;
        }
    }

    // ── Global File Lightbox & PDF Viewer Modal ───────────────────
    function ensurePreviewModalHTML() {
        if (document.getElementById('filePreviewModal')) return;

        const modal = document.createElement('div');
        modal.id = 'filePreviewModal';
        modal.className = 'preview-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="preview-modal-backdrop" id="previewModalBackdrop"></div>
            <div class="preview-modal-container">
                <div class="preview-modal-header">
                    <div class="preview-modal-title-wrap">
                        <span class="preview-modal-icon" id="previewModalIcon">📄</span>
                        <h3 class="preview-modal-title" id="previewModalTitle">File Preview</h3>
                    </div>
                    <div class="preview-modal-actions">
                        <a href="#" target="_blank" download class="btn-preview-action" id="previewModalDownloadBtn" title="Download File">
                            ⬇️ Download
                        </a>
                        <button type="button" class="btn-preview-close" id="previewModalCloseBtn" aria-label="Close Preview">✕</button>
                    </div>
                </div>
                <div class="preview-modal-body" id="previewModalBody"></div>
            </div>
        `;

        document.body.appendChild(modal);

        // Bind modal close events
        const backdrop = modal.querySelector('#previewModalBackdrop');
        const closeBtn = modal.querySelector('#previewModalCloseBtn');
        if (backdrop) backdrop.addEventListener('click', window.closeFilePreview);
        if (closeBtn) closeBtn.addEventListener('click', window.closeFilePreview);
    }

    window.openFilePreview = function (fileUrl, fileName, isImage, isPdf) {
        if (!fileUrl) return;
        ensurePreviewModalHTML();

        const modal = document.getElementById('filePreviewModal');
        const titleEl = document.getElementById('previewModalTitle');
        const iconEl = document.getElementById('previewModalIcon');
        const downloadBtn = document.getElementById('previewModalDownloadBtn');
        const bodyEl = document.getElementById('previewModalBody');

        if (titleEl) titleEl.textContent = fileName || 'File Preview';
        if (downloadBtn) {
            downloadBtn.href = fileUrl;
            downloadBtn.download = fileName || 'download';
        }

        if (iconEl) {
            iconEl.textContent = isImage ? '🖼️' : isPdf ? '📕' : '📄';
        }

        if (bodyEl) {
            if (isImage) {
                bodyEl.className = 'preview-modal-body';
                bodyEl.innerHTML = `<img src="${fileUrl}" alt="${escapeHtml(fileName)}" class="preview-full-img">`;
            } else if (isPdf) {
                bodyEl.className = 'preview-modal-body light-bg';
                bodyEl.innerHTML = `<iframe src="${fileUrl}" class="preview-pdf-iframe" title="${escapeHtml(fileName)}"></iframe>`;
            } else {
                bodyEl.className = 'preview-modal-body light-bg';
                bodyEl.innerHTML = `
                    <div class="preview-fallback-wrap dark-text">
                        <span style="font-size:3rem;display:block;margin-bottom:12px;">📄</span>
                        <h4>${escapeHtml(fileName)}</h4>
                        <p style="color:var(--color-text-muted);font-size:0.85rem;margin:8px 0 16px;">
                            Preview is not directly available for this file type.
                        </p>
                        <a href="${fileUrl}" target="_blank" download class="btn-preview-action">
                            ⬇️ Download File
                        </a>
                    </div>
                `;
            }
        }

        if (modal) modal.style.display = 'flex';
    };

    window.closeFilePreview = function () {
        const modal = document.getElementById('filePreviewModal');
        if (modal) {
            modal.style.display = 'none';
            const bodyEl = document.getElementById('previewModalBody');
            if (bodyEl) bodyEl.innerHTML = ''; // clear iframe or image
        }
    };

    // Close preview modal on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('filePreviewModal');
            if (modal && modal.style.display !== 'none') {
                window.closeFilePreview();
            }
        }
    });

    // ── Upload Attachment ────────────────────────────────────────
    async function handleFileUpload(file) {
        if (!currentDrawerTaskId || !file) return;

        // Size check (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('File is too large! Maximum allowed size is 5 MB.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem('etm_access_token');
        const url = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '/api') + `/tasks/${currentDrawerTaskId}/attachments/`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: formData
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                await loadAttachments(currentDrawerTaskId);
                loadActivities(currentDrawerTaskId);
            } else {
                alert('File upload failed: ' + (data?.message || 'Unsupported file type or server error.'));
            }
        } catch (err) {
            alert('Upload error: ' + (err.message || err));
        }
    }

    // ── Delete Attachment ────────────────────────────────────────
    window._drawerDeleteAttachment = async function (taskId, attachmentId) {
        const ok = typeof window.showConfirm === 'function'
            ? await window.showConfirm('Are you sure you want to delete this attachment?')
            : confirm('Are you sure you want to delete this attachment?');
        if (!ok) return;

        try {
            const res = await apiRequest(`/attachments/${attachmentId}/`, {
                method: 'DELETE'
            });

            if (res.ok || res.status === 204) {
                await loadAttachments(taskId);
                loadActivities(taskId);
            } else {
                alert('Could not delete attachment: ' + (res.data?.message || 'Permission denied.'));
            }
        } catch (err) {
            alert('Error deleting attachment: ' + (err.message || err));
        }
    };

    window._drawerReloadAttachments = function (taskId) {
        if (currentDrawerTaskId && String(currentDrawerTaskId) === String(taskId)) {
            loadAttachments(taskId);
            loadActivities(taskId);
        }
    };

    // ── Helper Utilities ─────────────────────────────────────────
    function capitalize(str) {
        if (!str) return '';
        return String(str).charAt(0).toUpperCase() + String(str).slice(1);
    }

    function formatStatusName(status) {
        const map = {
            'pending': 'Pending',
            'in-progress': 'In Progress',
            'completed': 'Completed',
            'cancelled': 'Cancelled',
            'rejected': 'Rejected'
        };
        return map[status] || capitalize(status);
    }

    function formatTimeAgo(isoStr) {
        if (!isoStr) return '';
        const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
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

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectDrawerHTML);
    } else {
        injectDrawerHTML();
    }

    // ── Reassign Task ─────────────────────────────────────────────────────────

    // Cache employees list so we don't fetch on every open
    let _employeesCache = null;

    // Toggle the reassign form open/closed
    window._drawerToggleReassign = function () {
        const form = document.getElementById('drawerReassignForm');
        const btn  = document.getElementById('drawerReassignToggleBtn');
        if (!form) return;
        const isOpen = form.style.display !== 'none';
        form.style.display = isOpen ? 'none' : 'block';
        if (btn) btn.textContent = isOpen ? 'Reassign' : '✕ Close';

        // Populate select when opening
        if (!isOpen) {
            _drawerLoadEmployees();
            const note = document.getElementById('drawerReassignNote');
            if (note) note.value = '';
        }
    };

    // Load employees into the select dropdown
    async function _drawerLoadEmployees() {
        const select = document.getElementById('drawerReassignSelect');
        if (!select) return;

        // Use cache if available
        if (_employeesCache) {
            _populateReassignSelect(select, _employeesCache);
            return;
        }

        select.innerHTML = '<option value="">— Loading… —</option>';

        try {
            const res = await apiRequest('/employees/?page_size=200');
            if (!res.ok) {
                select.innerHTML = '<option value="">— Could not load employees —</option>';
                return;
            }
            const payload = res.data?.data || res.data || {};
            const employees = Array.isArray(payload.results) ? payload.results
                            : Array.isArray(payload) ? payload : [];
            _employeesCache = employees;
            _populateReassignSelect(select, employees);
        } catch (err) {
            select.innerHTML = '<option value="">— Error loading employees —</option>';
        }
    }

    function _populateReassignSelect(select, employees) {
        if (!employees || employees.length === 0) {
            select.innerHTML = '<option value="">— No employees found —</option>';
            return;
        }

        const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const currentRole = (currentUser?.role || '').toUpperCase();

        let validList = employees.filter(e => e.is_active !== false);
        if (currentRole === 'MANAGER') {
            // Managers assign/reassign to employees, not admins or other managers
            validList = validList.filter(e => !e.user || e.user.role === 'EMPLOYEE');
        }

        if (validList.length === 0) {
            select.innerHTML = '<option value="">— No available employees —</option>';
            return;
        }

        select.innerHTML = '<option value="">— Select employee —</option>' +
            validList.map(e =>
                `<option value="${e.id}">${escapeHtml(e.full_name || e.employee_id)} (${escapeHtml(e.department || '')})</option>`
            ).join('');
    }

    // Submit the reassign
    window._drawerSubmitReassign = async function () {
        const select  = document.getElementById('drawerReassignSelect');
        const note    = document.getElementById('drawerReassignNote');
        const submitBtn = document.getElementById('drawerReassignSubmitBtn');
        const newEmployeeId = select ? select.value : '';

        if (!newEmployeeId) {
            alert('Please select an employee to reassign the task to.');
            return;
        }
        if (!currentDrawerTaskId) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Reassigning…';
        }

        try {
            const body = { assigned_to: parseInt(newEmployeeId, 10) };
            const noteVal = note ? note.value.trim() : '';
            if (noteVal) body.note = noteVal;

            const res = await apiRequest(`/tasks/${currentDrawerTaskId}/reassign/`, {
                method: 'PATCH',
                body: JSON.stringify(body),
            });

            if (res.ok) {
                // Close form & refresh drawer
                window._drawerToggleReassign();
                _employeesCache = null; // clear cache so it refreshes next time
                await loadTaskData(currentDrawerTaskId);
                await loadActivities(currentDrawerTaskId);
                // Refresh task list in background if function exists
                if (typeof loadTasks === 'function') loadTasks();
            } else {
                const msg = res.data?.message || res.data?.detail || 'Reassignment failed. Please try again.';
                alert('Error: ' + msg);
            }
        } catch (err) {
            alert('Network error: ' + (err.message || err));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '✅ Confirm Reassign';
            }
        }
    };

    // ── Quick Task Actions: Accept & Complete ────────────────────────────────
    window._drawerAcceptCurrentTask = async function () {
        if (!currentDrawerTaskId) return;

        const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const role = (currentUser?.role || '').toUpperCase();
        if (role === 'MANAGER' || role === 'ADMIN') {
            alert('Managers and Admins cannot accept tasks. Only the assigned employee can accept this task.');
            return;
        }

        const btn = document.getElementById('drawerAcceptBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Accepting…';
        }
        try {
            if (typeof acceptTask === 'function') {
                await acceptTask(currentDrawerTaskId);
            } else {
                await apiRequest(`/tasks/${currentDrawerTaskId}/accept/`, { method: 'POST' });
            }
            await loadTaskData(currentDrawerTaskId);
            await loadActivities(currentDrawerTaskId);
            await loadTimeEntries(currentDrawerTaskId);
            await loadTimeEntries(currentDrawerTaskId);
            if (typeof renderTasks === 'function') renderTasks();
            else if (typeof fetchTasksFromAPI === 'function') {
                await fetchTasksFromAPI();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof renderDashboardStats === 'function') renderDashboardStats();
            }
        } catch (err) {
            alert('Could not accept task: ' + (err.message || err));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🚀 Accept Task';
            }
        }
    };

    // ── Reject Task Handlers ────────────────────────────────────────────────
    window._drawerOpenRejectForm = function () {
        const form = document.getElementById('drawerRejectForm');
        const reasonInput = document.getElementById('drawerRejectReason');
        if (form) {
            form.style.display = 'block';
            if (reasonInput) {
                reasonInput.value = '';
                reasonInput.focus();
            }
        }
    };

    window._drawerCloseRejectForm = function () {
        const form = document.getElementById('drawerRejectForm');
        if (form) form.style.display = 'none';
    };

    window._drawerSubmitRejectCurrentTask = async function () {
        if (!currentDrawerTaskId) return;

        const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const role = (currentUser?.role || '').toUpperCase();
        if (role === 'MANAGER' || role === 'ADMIN') {
            alert('Managers and Admins cannot reject tasks. Only the assigned employee can reject this task.');
            return;
        }

        const reasonInput = document.getElementById('drawerRejectReason');
        const confirmBtn = document.getElementById('drawerConfirmRejectBtn');
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Rejecting…';
        }

        try {
            if (typeof rejectTask === 'function') {
                await rejectTask(currentDrawerTaskId, reason);
            } else {
                await apiRequest(`/tasks/${currentDrawerTaskId}/reject/`, {
                    method: 'POST',
                    body: JSON.stringify({ reason })
                });
            }
            window._drawerCloseRejectForm();
            await loadTaskData(currentDrawerTaskId);
            await loadActivities(currentDrawerTaskId);
            if (typeof renderTasks === 'function') renderTasks();
            else if (typeof fetchTasksFromAPI === 'function') {
                await fetchTasksFromAPI();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof renderDashboardStats === 'function') renderDashboardStats();
            }
        } catch (err) {
            alert('Could not reject task: ' + (err.message || err));
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirm Rejection';
            }
        }
    };


    // ── Time Tracking Functions ──────────────────────────────────
    let drawerTimerInterval = null;

    function formatTimeDuration(seconds) {
        if (!seconds || seconds <= 0) return '0h 00m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m < 10 ? '0' : ''}${m}m`;
        if (m > 0) return `${m}m ${s < 10 ? '0' : ''}${s}s`;
        return `${s}s`;
    }

    function formatTimerClock(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const pad = (n) => (n < 10 ? '0' : '') + n;
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    function startDrawerTimerTicker(startTimeIso, completedSecs = 0, badgeEl = null) {
        stopDrawerTimerTicker();
        const startMs = new Date(startTimeIso).getTime();

        const updateClock = () => {
            const displayEl = document.getElementById('drawerTimerDisplay');
            const diffSecs = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            const currentTotal = completedSecs + diffSecs;
            if (displayEl) {
                displayEl.textContent = formatTimerClock(currentTotal);
            }
            if (badgeEl) {
                badgeEl.textContent = formatTimeDuration(currentTotal);
            }
        };

        updateClock();
        drawerTimerInterval = setInterval(updateClock, 1000);
    }

    function stopDrawerTimerTicker() {
        if (drawerTimerInterval) {
            clearInterval(drawerTimerInterval);
            drawerTimerInterval = null;
        }
    }

    async function loadTimeEntries(taskId) {
        const badgeEl = document.getElementById('drawerTotalTimeBadge');
        const startBtn = document.getElementById('drawerTimerStartBtn');
        const stopBtn = document.getElementById('drawerTimerStopBtn');
        const listEl = document.getElementById('drawerTimeEntriesList');

        if (!badgeEl || !startBtn || !stopBtn || !listEl) return;

        try {
            const res = await apiRequest(`/tasks/${taskId}/time-entries/`);
            if (!res.ok) return;

            const payload = res.data?.data || res.data || {};
            const totalSecs = payload.total_duration_seconds || 0;
            const completedSecs = payload.completed_duration_seconds || 0;
            const entriesData = payload.entries || [];
            const entries = Array.isArray(entriesData.results) ? entriesData.results : (Array.isArray(entriesData) ? entriesData : []);

            badgeEl.textContent = formatTimeDuration(totalSecs);

            // Check if there is an active timer for this task
            const activeEntry = entries.find(e => !e.end_time);
            if (activeEntry) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-flex';
                startDrawerTimerTicker(activeEntry.start_time, completedSecs, badgeEl);
            } else {
                startBtn.style.display = 'inline-flex';
                startBtn.innerHTML = '▶ Resume Timer';
                stopBtn.style.display = 'none';
                stopDrawerTimerTicker();
                const displayEl = document.getElementById('drawerTimerDisplay');
                if (displayEl) {
                    displayEl.textContent = formatTimerClock(totalSecs);
                }
            }

            // Render entries list
            const completedEntries = entries.filter(e => e.end_time);
            if (completedEntries.length === 0) {
                listEl.innerHTML = '<div style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;padding:8px;">No time logged yet.</div>';
                return;
            }

            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const role = (currentUser?.role || '').toUpperCase();

            listEl.innerHTML = completedEntries.map(e => {
                const dateStr = new Date(e.start_time).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const durStr = formatTimeDuration(e.duration_seconds);
                const descStr = e.description ? ` &middot; <em>${escapeHtml(e.description)}</em>` : '';
                const uName = e.user?.full_name || e.user?.username || 'User';
                const canDelete = role === 'ADMIN' || (currentUser && String(currentUser.id) === String(e.user?.id));

                return `
                    <div class="time-entry-item">
                        <div>
                            <span class="time-entry-dur">${durStr}</span>
                            <span style="color:var(--color-text-muted);margin-left:6px;font-size:0.76rem;">${dateStr} (${escapeHtml(uName)})${descStr}</span>
                        </div>
                        ${canDelete ? `
                            <button type="button" onclick="window._drawerDeleteTimeEntry(${e.id})" title="Delete entry"
                                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:0.85rem;padding:2px 6px;">
                                &times;
                            </button>
                        ` : ''}
                    </div>
                `;
            }).join('');

        } catch (err) {
            console.warn('[Drawer] Could not load time entries:', err);
        }
    }

    window._drawerStartTimer = async function () {
        if (!currentDrawerTaskId) return;
        const btn = document.getElementById('drawerTimerStartBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await apiRequest(`/tasks/${currentDrawerTaskId}/timer/start/`, {
                method: 'POST',
                body: JSON.stringify({})
            });

            if (res.ok) {
                await loadTimeEntries(currentDrawerTaskId);
                await loadActivities(currentDrawerTaskId);
                if (typeof fetchTasksFromAPI === 'function') {
                    await fetchTasksFromAPI();
                    if (typeof renderTasks === 'function') renderTasks();
                }
            } else {
                alert(res.data?.message || 'Could not start timer.');
            }
        } catch (err) {
            alert('Failed to start timer: ' + (err.message || err));
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    window._drawerStopTimer = async function () {
        if (!currentDrawerTaskId) return;
        const btn = document.getElementById('drawerTimerStopBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await apiRequest(`/tasks/${currentDrawerTaskId}/timer/stop/`, {
                method: 'POST',
                body: JSON.stringify({})
            });

            if (res.ok) {
                stopDrawerTimerTicker();
                await loadTimeEntries(currentDrawerTaskId);
                await loadActivities(currentDrawerTaskId);
                if (typeof fetchTasksFromAPI === 'function') {
                    await fetchTasksFromAPI();
                    if (typeof renderTasks === 'function') renderTasks();
                }
            } else {
                alert(res.data?.message || 'Could not stop timer.');
            }
        } catch (err) {
            alert('Failed to stop timer: ' + (err.message || err));
        } finally {
            if (btn) btn.disabled = false;
        }
    };

    window._drawerToggleManualTime = function () {
        const form = document.getElementById('drawerManualTimeForm');
        if (!form) return;
        form.style.display = (form.style.display === 'none' || !form.style.display) ? 'block' : 'none';
    };

    window._drawerSubmitManualTime = async function () {
        if (!currentDrawerTaskId) return;
        const minInput = document.getElementById('drawerManualMinutes');
        const descInput = document.getElementById('drawerManualDesc');

        const mins = parseInt(minInput?.value, 10);
        if (!mins || mins <= 0) {
            alert('Please enter a valid number of minutes (at least 1).');
            return;
        }

        const desc = descInput?.value?.trim() || '';

        try {
            const res = await apiRequest(`/tasks/${currentDrawerTaskId}/time-entries/`, {
                method: 'POST',
                body: JSON.stringify({
                    duration_minutes: mins,
                    description: desc
                })
            });

            if (res.ok) {
                if (minInput) minInput.value = '';
                if (descInput) descInput.value = '';
                window._drawerToggleManualTime();
                await loadTimeEntries(currentDrawerTaskId);
                await loadActivities(currentDrawerTaskId);
                if (typeof fetchTasksFromAPI === 'function') {
                    await fetchTasksFromAPI();
                    if (typeof renderTasks === 'function') renderTasks();
                }
            } else {
                alert(res.data?.message || 'Could not save manual time entry.');
            }
        } catch (err) {
            alert('Error logging time: ' + (err.message || err));
        }
    };

    window._drawerDeleteTimeEntry = async function (entryId) {
        const ok = typeof window.showConfirm === 'function'
            ? await window.showConfirm('Are you sure you want to delete this time entry?')
            : confirm('Are you sure you want to delete this time entry?');
        if (!ok) return;
        try {
            const res = await apiRequest(`/time-entries/${entryId}/`, {
                method: 'DELETE'
            });
            if (res.ok) {
                await loadTimeEntries(currentDrawerTaskId);
                await loadActivities(currentDrawerTaskId);
                if (typeof fetchTasksFromAPI === 'function') {
                    await fetchTasksFromAPI();
                    if (typeof renderTasks === 'function') renderTasks();
                }
            } else {
                alert(res.data?.message || 'Could not delete time entry.');
            }
        } catch (err) {
            alert('Error deleting entry: ' + (err.message || err));
        }
    };

    window._drawerCompleteCurrentTask = async function () {
        if (!currentDrawerTaskId) return;

        const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const role = (currentUser?.role || '').toUpperCase();
        if (role === 'MANAGER' || role === 'ADMIN') {
            alert('Managers and Admins cannot complete tasks. Only the assigned employee can mark this task completed.');
            return;
        }

        const ok = typeof window.showConfirm === 'function'
            ? await window.showConfirm('Are you sure you want to mark this task as completed?')
            : confirm('Are you sure you want to mark this task as completed?');
        if (!ok) return;
        const btn = document.getElementById('drawerCompleteBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Completing…';
        }
        try {
            if (typeof completeTask === 'function') {
                await completeTask(currentDrawerTaskId);
            } else {
                await apiRequest(`/tasks/${currentDrawerTaskId}/complete/`, { method: 'POST' });
            }
            await loadTaskData(currentDrawerTaskId);
            await loadActivities(currentDrawerTaskId);
            if (typeof renderTasks === 'function') renderTasks();
            else if (typeof fetchTasksFromAPI === 'function') {
                await fetchTasksFromAPI();
                if (typeof renderTasks === 'function') renderTasks();
                if (typeof renderDashboardStats === 'function') renderDashboardStats();
            }
        } catch (err) {
            alert('Could not complete task: ' + (err.message || err));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '✅ Mark as Completed';
            }
        }
    };

})();
