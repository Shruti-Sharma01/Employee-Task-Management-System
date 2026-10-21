/**
 * js/tasks.js
 * Full controller for Task Management page: CRUD, Search, Filter, Sort, Kanban & Table views
 */

document.addEventListener('DOMContentLoaded', () => {
    if (typeof checkAuth === 'function' && !checkAuth()) return;

    let taskToDeleteId = null;
    let draggedTaskId = null;
    let currentViewMode = localStorage.getItem('etms_tasks_view_mode') || 'table';

    // ─── DOM: Nav ────────────────────────────────────────────────────────────
    const navToggle            = document.getElementById('navToggle');
    const sidebar              = document.getElementById('sidebar');

    // ─── DOM: Form & Controls ────────────────────────────────────────────────
    const openAddTaskBtn       = document.getElementById('openAddTaskBtn');
    const taskFormContainer    = document.getElementById('taskFormContainer');
    const taskForm             = document.getElementById('taskForm');
    const formHeading          = document.getElementById('formHeading');
    const cancelTaskBtn        = document.getElementById('cancelTaskBtn');

    // ─── DOM: Inputs ─────────────────────────────────────────────────────────
    const taskIdInput          = document.getElementById('taskId');
    const taskTitleInput       = document.getElementById('taskTitle');
    const taskDescriptionInput = document.getElementById('taskDescription');
    const taskPriorityInput    = document.getElementById('taskPriority');
    const taskCategoryInput    = document.getElementById('taskCategory');
    const taskDueDateInput     = document.getElementById('taskDueDate');
    const taskStatusInput      = document.getElementById('taskStatus');
    const taskAssignToInput    = document.getElementById('taskAssignTo');
    const assignToGroup        = document.getElementById('assignToGroup');
    const taskTitleError       = document.getElementById('taskTitleError');
    const taskDueDateError     = document.getElementById('taskDueDateError');
    const taskAssignToError    = document.getElementById('taskAssignToError');

    // ─── DOM: File Upload & Attachments ───────────────────────────────────────
    const taskFormFiles        = document.getElementById('taskFormFiles');
    const formFileDropzone     = document.getElementById('formFileDropzone');
    const formFilesPreviewList = document.getElementById('formFilesPreviewList');
    const formAttachmentsGroup = document.getElementById('formAttachmentsGroup');
    let selectedFormFiles      = [];

    // ─── DOM: Filters ────────────────────────────────────────────────────────
    const searchInput          = document.getElementById('searchInput');
    const statusFilter         = document.getElementById('statusFilter');
    const priorityFilter       = document.getElementById('priorityFilter');
    const categoryFilter       = document.getElementById('categoryFilter');
    const sortBy               = document.getElementById('sortBy');

    // ─── DOM: Table ──────────────────────────────────────────────────────────
    const tasksTableBody       = document.getElementById('tasksTableBody');
    const deleteModal          = document.getElementById('deleteModal');
    const confirmDeleteBtn     = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn      = document.getElementById('cancelDeleteBtn');

    // ─── DOM: View Toggle ────────────────────────────────────────────────────
    const tableViewBtn         = document.getElementById('tableViewBtn');
    const kanbanViewBtn        = document.getElementById('kanbanViewBtn');
    const tableViewContainer   = document.getElementById('tableViewContainer');
    const kanbanViewContainer  = document.getElementById('kanbanViewContainer');

    // ─── DOM: Kanban Wrappers ─────────────────────────────────────────────────
    const kanbanPending        = document.getElementById('kanbanPending');
    const kanbanInProgress     = document.getElementById('kanbanInProgress');
    const kanbanCompleted      = document.getElementById('kanbanCompleted');
    const kanbanCancelled      = document.getElementById('kanbanCancelled');

    const countPending         = document.getElementById('countPending');
    const countInProgress      = document.getElementById('countInProgress');
    const countCompleted       = document.getElementById('countCompleted');
    const countCancelled       = document.getElementById('countCancelled');

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Keep Delete Modal closed on load
    // ─────────────────────────────────────────────────────────────────────────
    if (deleteModal) {
        deleteModal.hidden = true;
        deleteModal.style.display = 'none';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Mobile Sidebar
    // ─────────────────────────────────────────────────────────────────────────
    if (navToggle && sidebar) {
        navToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2b. Load Employees into "Assign To" dropdown (Admin/Manager only)
    // ─────────────────────────────────────────────────────────────────────────
    const role = (typeof getRole === 'function') ? getRole() : 'EMPLOYEE';

    // EMPLOYEE cannot assign — hide the dropdown entirely
    if (assignToGroup) {
        assignToGroup.style.display = (role === 'EMPLOYEE') ? 'none' : 'block';
    }

    async function loadEmployeeOptions(selectedEmployeeId = null) {
        if (!taskAssignToInput) return;
        const currentRole = (typeof getRole === 'function') ? getRole() : (window._userRole || 'EMPLOYEE');
        if (currentRole === 'EMPLOYEE') return;   // employees don't assign

        try {
            const res = await apiRequest('/employees/?page_size=200');
            if (!res.ok) return;

            const payload  = res.data?.data || res.data || {};
            const empList  = Array.isArray(payload.results) ? payload.results
                           : Array.isArray(payload)         ? payload : [];

            // Clear and rebuild
            taskAssignToInput.innerHTML = '<option value="">— Select Employee —</option>';

            // For managers, filter out Admins and other Managers so only employees appear
            let filteredList = empList.filter(e => e.is_active !== false);
            if (currentRole === 'MANAGER') {
                filteredList = filteredList.filter(e => !e.user || e.user.role === 'EMPLOYEE');
            }

            filteredList.forEach(emp => {
                const opt  = document.createElement('option');
                opt.value  = emp.id;                         // Employee.pk
                opt.textContent = `${emp.full_name} (${emp.employee_id || emp.department || ''})`;
                if (String(emp.id) === String(selectedEmployeeId)) opt.selected = true;
                taskAssignToInput.appendChild(opt);
            });
        } catch (err) {
            console.warn('[Tasks] Could not load employees:', err);
        }
    }

    // Load employees when form is about to open
    // ─────────────────────────────────────────────────────────────────────────
    // 3. Form Open / Close / Reset
    // ─────────────────────────────────────────────────────────────────────────
    function openAddForm() {
        resetForm();
        formHeading.textContent = 'Add New Task';

        const currentRole = (typeof getRole === 'function') ? getRole() : (window._userRole || 'EMPLOYEE');
        if (assignToGroup) {
            assignToGroup.style.display = (currentRole === 'EMPLOYEE') ? 'none' : 'block';
        }
        if (taskAssignToInput) {
            taskAssignToInput.value = '';
        }
        if (currentRole !== 'EMPLOYEE') {
            loadEmployeeOptions();   // fetch fresh employee list for Admin/Manager
        }

        // Enable all inputs for creating a new task
        [taskTitleInput, taskDescriptionInput, taskPriorityInput,
         taskCategoryInput, taskDueDateInput, taskStatusInput].forEach(el => {
            if (el) el.disabled = false;
        });

        if (formAttachmentsGroup) formAttachmentsGroup.style.display = 'block';

        const existingNote = document.getElementById('employeeEditNote');
        if (existingNote) existingNote.remove();

        showForm(true);
        taskTitleInput.focus();
    }

    function closeForm() {
        resetForm();
        showForm(false);
    }

    function showForm(show) {
        if (show) {
            taskFormContainer.removeAttribute('hidden');
            taskFormContainer.style.display = 'block';
            taskFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            taskFormContainer.setAttribute('hidden', '');
            taskFormContainer.style.display = 'none';
        }
    }

    function resetForm() {
        taskForm.reset();
        taskIdInput.value = '';
        selectedFormFiles = [];
        if (formFilesPreviewList) formFilesPreviewList.innerHTML = '';
        clearErrors();
    }

    function clearErrors() {
        if (taskTitleError)    taskTitleError.textContent = '';
        if (taskDueDateError)  taskDueDateError.textContent = '';
        if (taskAssignToError) taskAssignToError.textContent = '';
    }

    // ── Task Form Attachments Preview & Selection Handlers ────────────
    function handleFormFilesSelected(files) {
        if (!files || files.length === 0) return;
        const validExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.png', '.jpg', '.jpeg'];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();

            if (!validExtensions.includes(ext)) {
                alert(`File "${file.name}" is not supported. Supported: Images, PDF, Word, Excel, Text.`);
                continue;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert(`File "${file.name}" exceeds the 5MB size limit.`);
                continue;
            }
            // Avoid exact duplicates
            if (!selectedFormFiles.some(f => f.name === file.name && f.size === file.size)) {
                selectedFormFiles.push(file);
            }
        }
        renderFormFilesPreview();
    }

    function renderFormFilesPreview() {
        if (!formFilesPreviewList) return;
        formFilesPreviewList.innerHTML = '';

        selectedFormFiles.forEach((file, index) => {
            const chip = document.createElement('div');
            chip.className = 'form-file-chip';
            const isImg = file.type.startsWith('image/');
            const isPdf = file.name.toLowerCase().endsWith('.pdf');
            const sizeStr = (file.size / 1024).toFixed(1) + ' KB';

            const chipLeft = document.createElement('div');
            chipLeft.className = 'form-file-chip-left';

            if (isImg) {
                const img = document.createElement('img');
                img.className = 'form-file-thumb';
                img.src = URL.createObjectURL(file);
                chipLeft.appendChild(img);
            } else {
                const icon = document.createElement('span');
                icon.style.fontSize = '1.3rem';
                icon.textContent = isPdf ? '📕' : '📄';
                chipLeft.appendChild(icon);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'form-file-name';
            nameSpan.textContent = file.name;
            chipLeft.appendChild(nameSpan);

            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'form-file-size';
            sizeSpan.textContent = `(${sizeStr})`;
            chipLeft.appendChild(sizeSpan);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'form-file-remove-btn';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove file';
            removeBtn.onclick = () => {
                selectedFormFiles.splice(index, 1);
                renderFormFilesPreview();
            };

            chip.appendChild(chipLeft);
            chip.appendChild(removeBtn);
            formFilesPreviewList.appendChild(chip);
        });
    }

    if (taskFormFiles) {
        taskFormFiles.addEventListener('change', (e) => {
            handleFormFilesSelected(e.target.files);
            taskFormFiles.value = '';
        });
    }

    if (formFileDropzone) {
        formFileDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            formFileDropzone.classList.add('dragover');
        });
        formFileDropzone.addEventListener('dragleave', () => {
            formFileDropzone.classList.remove('dragover');
        });
        formFileDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            formFileDropzone.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files) {
                handleFormFilesSelected(e.dataTransfer.files);
            }
        });
    }

    openAddTaskBtn.addEventListener('click', openAddForm);
    cancelTaskBtn.addEventListener('click', closeForm);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Form Submission (Create / Edit)
    // ─────────────────────────────────────────────────────────────────────────
    const taskSubmitBtn = taskForm.querySelector('button[type="submit"]');

    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        let isValid = true;
        const titleVal   = taskTitleInput.value.trim();
        const dueDateVal = taskDueDateInput.value;

        if (!titleVal) {
            taskTitleError.textContent = 'Task title is required.';
            isValid = false;
        }
        if (!dueDateVal) {
            taskDueDateError.textContent = 'Please select a valid due date.';
            isValid = false;
        }

        const editingId = taskIdInput.value;
        const currentRole = (typeof getRole === 'function') ? getRole() : (window._userRole || 'EMPLOYEE');
        if ((currentRole === 'MANAGER' || currentRole === 'ADMIN') && !editingId && (!taskAssignToInput || !taskAssignToInput.value)) {
            if (taskAssignToError) taskAssignToError.textContent = 'Please select an employee to assign this task to.';
            isValid = false;
        }
        if (!isValid) return;

        // When creating a task as manager/admin, initial status must be pending awaiting employee acceptance
        let initialStatus = taskStatusInput.value;
        if (!editingId && (currentRole === 'MANAGER' || currentRole === 'ADMIN')) {
            initialStatus = 'pending';
        }

        const taskData = {
            title:       titleVal,
            description: taskDescriptionInput.value.trim(),
            priority:    taskPriorityInput.value,
            category:    taskCategoryInput.value,
            dueDate:     dueDateVal,
            status:      initialStatus,
            assignedTo:  taskAssignToInput ? (taskAssignToInput.value || null) : null
        };
        const origText  = taskSubmitBtn ? taskSubmitBtn.textContent : 'Save Task';

        if (taskSubmitBtn) {
            taskSubmitBtn.disabled     = true;
            taskSubmitBtn.textContent  = 'Saving to Database…';
        }

        try {
            let savedTask = null;
            if (editingId) {
                savedTask = await updateTask(editingId, taskData);
            } else {
                savedTask = await addTask(taskData);
            }

            // Upload any attached files to the task
            const targetId = editingId || (savedTask && savedTask.id);
            if (targetId && selectedFormFiles.length > 0) {
                const token = localStorage.getItem('etm_access_token');
                const baseUrl = (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '/api') + `/tasks/${targetId}/attachments/`;

                for (let i = 0; i < selectedFormFiles.length; i++) {
                    const file = selectedFormFiles[i];
                    if (taskSubmitBtn) {
                        taskSubmitBtn.textContent = `Uploading files (${i + 1}/${selectedFormFiles.length})…`;
                    }
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        await fetch(baseUrl, {
                            method: 'POST',
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                            body: formData
                        });
                    } catch (uploadErr) {
                        console.warn('[Tasks] Failed to upload attachment:', uploadErr);
                    }
                }
            }

            closeForm();
            if (typeof fetchTasksFromAPI === 'function') {
                try { await fetchTasksFromAPI(); } catch (e) {}
            }
            renderTasks();

            // Refresh drawer if it's currently displaying this task
            if (typeof window._drawerReloadAttachments === 'function' && targetId) {
                window._drawerReloadAttachments(targetId);
            }
        } catch (err) {
            alert('Please accept the assigned task from the Notes section before proceeding.');
        } finally {
            if (taskSubmitBtn) {
                taskSubmitBtn.disabled    = false;
                taskSubmitBtn.textContent = origText;
            }
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Edit Task
    // ─────────────────────────────────────────────────────────────────────────
    window.editTaskHandler = function (id) {
        const task = getTaskById(id);
        if (!task) return;

        resetForm();
        formHeading.textContent = 'Edit Task';

        taskIdInput.value          = task.id;
        taskTitleInput.value       = task.title || '';
        taskDescriptionInput.value = task.description || '';
        taskPriorityInput.value    = (task.priority || 'medium').toLowerCase();
        taskCategoryInput.value    = (task.category || 'development').toLowerCase();
        taskDueDateInput.value     = task.dueDate || '';
        taskStatusInput.value      = (task.status || 'pending').toLowerCase();

        // ── Check permissions: creator vs assigned employee ───────
        const editRole    = (typeof getRole === 'function') ? getRole() : (window._userRole || 'EMPLOYEE');
        const isEmp       = editRole === 'EMPLOYEE';
        const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const isCreator   = currentUser && task.assignedBy && (String(currentUser.id) === String(task.assignedBy.id));
        const canOnlyEditStatus = isEmp && !isCreator;

        const employeeNote = document.getElementById('employeeEditNote');

        [taskTitleInput, taskDescriptionInput, taskPriorityInput,
         taskCategoryInput, taskDueDateInput].forEach(el => {
            if (el) el.disabled = canOnlyEditStatus;
        });

        // Assign To: only Admin and Manager can reassign. Employees can never assign to anyone.
        if (!isEmp && assignToGroup) {
            assignToGroup.style.display = 'block';
            const currentAssigneeId = task.assignedTo?.id || task.assigned_to?.id || null;
            loadEmployeeOptions(currentAssigneeId);
        } else if (assignToGroup) {
            assignToGroup.style.display = 'none';
            if (taskAssignToInput) taskAssignToInput.value = '';
        }

        if (canOnlyEditStatus) {
            formHeading.textContent = 'Update Task Status';
            if (formAttachmentsGroup) formAttachmentsGroup.style.display = 'none';
            if (!employeeNote) {
                const note = document.createElement('p');
                note.id    = 'employeeEditNote';
                note.style.cssText = 'font-size:0.8rem;color:#8e44ad;margin-bottom:12px;'
                                   + 'background:rgba(142,68,173,0.08);padding:8px 12px;'
                                   + 'border-radius:6px;border-left:3px solid #8e44ad;';
                note.innerHTML = '👤 <strong>Employee:</strong> This task was assigned by manager. You can only update the task status.';
                taskForm.prepend(note);
            }
        } else {
            formHeading.textContent = isCreator ? 'Edit My Task' : 'Edit Task';
            if (formAttachmentsGroup) formAttachmentsGroup.style.display = 'block';
            const existingNote = document.getElementById('employeeEditNote');
            if (existingNote) existingNote.remove();
            [taskTitleInput, taskDescriptionInput, taskPriorityInput,
             taskCategoryInput, taskDueDateInput].forEach(el => {
                if (el) el.disabled = false;
            });
        }

        showForm(true);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Delete Task & Modal
    // ─────────────────────────────────────────────────────────────────────────
    window.openDeleteModalHandler = function (id) {
        taskToDeleteId = id;
        deleteModal.hidden = false;
        deleteModal.removeAttribute('hidden');
        deleteModal.style.display = 'flex';
    };

    function closeDeleteModal() {
        taskToDeleteId = null;
        deleteModal.hidden = true;
        deleteModal.setAttribute('hidden', '');
        deleteModal.style.display = 'none';
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!taskToDeleteId) return;
            const origText = confirmDeleteBtn.textContent;
            confirmDeleteBtn.disabled    = true;
            confirmDeleteBtn.textContent = 'Deleting…';
            try {
                await deleteTask(taskToDeleteId);
                closeDeleteModal();
                if (typeof fetchTasksFromAPI === 'function') {
                    try { await fetchTasksFromAPI(); } catch (e) {}
                }
                renderTasks();
            } catch (err) {
                alert('Error deleting task: ' + (err.message || err));
            } finally {
                confirmDeleteBtn.disabled    = false;
                confirmDeleteBtn.textContent = origText;
            }
        });
    }

    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);

    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) closeDeleteModal();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Filter & Sort Logic
    // ─────────────────────────────────────────────────────────────────────────
    function getFilteredTasks() {
        let tasks = getTasks();

        const query            = (searchInput.value || '').toLowerCase().trim();
        const selectedStatus   = statusFilter.value;
        const selectedPriority = priorityFilter.value;
        const selectedCategory = categoryFilter.value;
        const sortDirection    = sortBy.value;

        if (query) {
            tasks = tasks.filter(t =>
                (t.title       && t.title.toLowerCase().includes(query)) ||
                (t.description && t.description.toLowerCase().includes(query))
            );
        }
        if (selectedStatus   !== 'all') tasks = tasks.filter(t => (t.status   || '').toLowerCase() === selectedStatus);
        if (selectedPriority !== 'all') tasks = tasks.filter(t => (t.priority || '').toLowerCase() === selectedPriority);
        if (selectedCategory !== 'all') tasks = tasks.filter(t => (t.category || '').toLowerCase() === selectedCategory);

        tasks.sort((a, b) => {
            const dA = new Date(a.dueDate || '9999-12-31').getTime();
            const dB = new Date(b.dueDate || '9999-12-31').getTime();
            return sortDirection === 'desc' ? dB - dA : dA - dB;
        });

        return tasks;
    }

    // Kanban always shows ALL tasks (no status filter applied)
    function getAllTasksSorted() {
        let tasks = getTasks();

        const query            = (searchInput.value || '').toLowerCase().trim();
        const selectedPriority = priorityFilter.value;
        const selectedCategory = categoryFilter.value;
        const sortDirection    = sortBy.value;

        if (query) {
            tasks = tasks.filter(t =>
                (t.title       && t.title.toLowerCase().includes(query)) ||
                (t.description && t.description.toLowerCase().includes(query))
            );
        }
        if (selectedPriority !== 'all') tasks = tasks.filter(t => (t.priority || '').toLowerCase() === selectedPriority);
        if (selectedCategory !== 'all') tasks = tasks.filter(t => (t.category || '').toLowerCase() === selectedCategory);

        tasks.sort((a, b) => {
            const dA = new Date(a.dueDate || '9999-12-31').getTime();
            const dB = new Date(b.dueDate || '9999-12-31').getTime();
            return sortDirection === 'desc' ? dB - dA : dA - dB;
        });

        return tasks;
    }

    searchInput.addEventListener('input',    renderTasks);
    statusFilter.addEventListener('change',  renderTasks);
    priorityFilter.addEventListener('change',renderTasks);
    categoryFilter.addEventListener('change',renderTasks);
    sortBy.addEventListener('change',        renderTasks);

    // ─────────────────────────────────────────────────────────────────────────
    // 8. View Toggle
    // ─────────────────────────────────────────────────────────────────────────
    function setViewMode(mode) {
        currentViewMode = mode;
        localStorage.setItem('etms_tasks_view_mode', mode);

        if (mode === 'kanban') {
            tableViewBtn.classList.remove('active');
            kanbanViewBtn.classList.add('active');
            tableViewContainer.style.display  = 'none';
            kanbanViewContainer.style.display  = 'grid';
            renderKanban();
        } else {
            kanbanViewBtn.classList.remove('active');
            tableViewBtn.classList.add('active');
            kanbanViewContainer.style.display  = 'none';
            tableViewContainer.style.display   = 'block';
            renderTableTasks();
        }
    }

    function renderTasks() {
        if (currentViewMode === 'kanban') renderKanban();
        else                              renderTableTasks();
    }

    if (tableViewBtn)  tableViewBtn.addEventListener('click',  () => setViewMode('table'));
    if (kanbanViewBtn) kanbanViewBtn.addEventListener('click', () => setViewMode('kanban'));

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Render: Table View
    // ─────────────────────────────────────────────────────────────────────────
    function renderTableTasks() {
        const tasks = getFilteredTasks();
        tasksTableBody.innerHTML = '';

        if (tasks.length === 0) {
            tasksTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:2rem;color:var(--color-text-muted);">
                        No tasks match your filter criteria.
                    </td>
                </tr>`;
            return;
        }

        tasks.forEach(task => {
            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const currentRole = (typeof getRole === 'function') ? getRole() : (window._userRole || 'EMPLOYEE');
            const isEmp       = currentRole === 'EMPLOYEE';
            const isCreator   = currentUser && task.assignedBy && (String(currentUser.id) === String(task.assignedBy.id));
            const canDelete   = !isEmp || isCreator;
            const editLabel   = (isEmp && !isCreator) ? 'Update Status' : 'Edit';

            // Check if current user is the assigned employee
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
            const taskRawStatus = (task.status || '').toLowerCase().replace('_', '-');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight:600;color:var(--color-primary);cursor:pointer;display:inline-flex;align-items:center;gap:6px;"
                         onclick="openTaskDrawer('${escapeHtml(task.id)}')" title="Click to open discussion and attachments">
                        <span>${escapeHtml(task.title)}</span>
                        <span style="font-size:0.85rem;" title="Discussion & Notes">💬</span>
                    </div>
                    ${task.description ? `<div style="font-size:0.8rem;color:var(--color-text-muted);margin-top:2px;">${escapeHtml(task.description)}</div>` : ''}
                </td>
                <td>${escapeHtml(capitalize(task.category || 'General'))}</td>
                <td>${getPriorityBadge(task.priority)}</td>
                <td>${escapeHtml(task.dueDate || '-')}</td>
                <td>${getStatusBadge(task.status)}</td>
                <td>
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                        <button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:0.78rem;"
                            onclick="openTaskDrawer('${escapeHtml(task.id)}')" title="Discussion & Attachments">💬 Notes</button>
                        <button type="button" class="btn btn-secondary" style="padding:4px 8px;font-size:0.78rem;"
                            onclick="editTaskHandler('${escapeHtml(task.id)}')">${editLabel}</button>
                        ${canDelete ? `
                        <button type="button" class="btn btn-danger" style="padding:4px 8px;font-size:0.78rem;"
                            onclick="openDeleteModalHandler('${escapeHtml(task.id)}')">Delete</button>
                        ` : ''}
                    </div>
                </td>`;
            tasksTableBody.appendChild(tr);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Render: Kanban Board
    // ─────────────────────────────────────────────────────────────────────────
    const KANBAN_CONTAINERS = {
        'pending':     kanbanPending,
        'in-progress': kanbanInProgress,
        'completed':   kanbanCompleted,
        'cancelled':   kanbanCancelled
    };

    function renderKanban() {
        if (!kanbanViewContainer) return;

        // Clear all card wrappers
        Object.values(KANBAN_CONTAINERS).forEach(c => { if (c) c.innerHTML = ''; });

        const counts = { 'pending': 0, 'in-progress': 0, 'completed': 0, 'cancelled': 0 };

        // Kanban respects all active filters (including status filter)
        const tasks = getFilteredTasks();

        tasks.forEach(task => {
            const rawStatus = (task.status || 'pending').toLowerCase().replace('_', '-');
            const statusKey = KANBAN_CONTAINERS[rawStatus] ? rawStatus : 'pending';
            counts[statusKey]++;

            const card = document.createElement('div');
            card.className  = 'kanban-card';
            card.draggable  = true;
            card.setAttribute('data-id',     task.id);
            card.setAttribute('data-status', statusKey);

            const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const currentRole = (typeof getRole === 'function') ? getRole() : (window._userRole || 'EMPLOYEE');
            const isEmp       = currentRole === 'EMPLOYEE';
            const isCreator   = currentUser && task.assignedBy && (String(currentUser.id) === String(task.assignedBy.id));
            const canDelete   = !isEmp || isCreator;
            const editLabel   = (isEmp && !isCreator) ? 'Update Status' : 'Edit';

            // Check if current user is the assigned employee
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
            const taskRawStatus = (task.status || '').toLowerCase().replace('_', '-');

            card.innerHTML = `
                <div class="kanban-card-title" onclick="openTaskDrawer('${escapeHtml(task.id)}')" 
                     style="cursor:pointer;" title="Click to view details & discussion">
                    <span>${escapeHtml(task.title)}</span>
                    <span style="font-size:0.85rem;margin-left:4px;color:var(--color-primary);">💬</span>
                </div>
                ${task.description ? `<div class="kanban-card-desc">${escapeHtml(task.description)}</div>` : ''}
                <div class="kanban-card-meta">
                    <span class="kanban-card-category">${escapeHtml(capitalize(task.category || 'General'))}</span>
                    <span>${getPriorityBadge(task.priority)}</span>
                </div>
                <div class="kanban-card-meta" style="border-top:none;padding-top:4px;">
                    <span title="Due Date">📅 ${escapeHtml(task.dueDate || 'No due date')}</span>
                </div>
                <div class="kanban-card-actions">
                    <button type="button" class="btn btn-secondary" style="font-size:0.75rem;padding:3px 8px;"
                        onclick="openTaskDrawer('${escapeHtml(task.id)}')" title="Discussion & Attachments">💬 Notes</button>
                    <button type="button" class="btn btn-secondary" style="font-size:0.75rem;padding:3px 8px;"
                        onclick="editTaskHandler('${escapeHtml(task.id)}')">${editLabel}</button>
                    ${canDelete ? `
                    <button type="button" class="btn btn-danger" style="font-size:0.75rem;padding:3px 8px;"
                        onclick="openDeleteModalHandler('${escapeHtml(task.id)}')">Delete</button>
                    ` : ''}
                </div>`;

            // Drag events
            card.addEventListener('dragstart', function (e) {
                draggedTaskId = this.getAttribute('data-id');
                this.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggedTaskId);
            });
            card.addEventListener('dragend', function () {
                this.classList.remove('dragging');
                document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
            });

            KANBAN_CONTAINERS[statusKey].appendChild(card);
        });

        // Update count badges
        if (countPending)    countPending.textContent    = counts['pending'];
        if (countInProgress) countInProgress.textContent = counts['in-progress'];
        if (countCompleted)  countCompleted.textContent  = counts['completed'];
        if (countCancelled)  countCancelled.textContent  = counts['cancelled'];

        // Show placeholder in empty columns
        Object.entries(KANBAN_CONTAINERS).forEach(([, cont]) => {
            if (cont && cont.children.length === 0) {
                const empty = document.createElement('div');
                empty.className   = 'kanban-empty-placeholder';
                empty.textContent = 'Drop tasks here';
                cont.appendChild(empty);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Drag-and-Drop: Column Drop Zones
    //     Attached once to the column DIVs (not the card wrappers)
    // ─────────────────────────────────────────────────────────────────────────
    document.querySelectorAll('.kanban-column').forEach(column => {

        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', (e) => {
            // Only remove highlight when truly leaving the column (not entering a child)
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        });

        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');

            const targetStatus = column.getAttribute('data-status');
            const taskId       = draggedTaskId || e.dataTransfer.getData('text/plain');
            draggedTaskId      = null;

            if (!taskId || !targetStatus) return;

            // Find task in cache
            const tasks       = getTasks();
            const taskIndex   = tasks.findIndex(t => String(t.id) === String(taskId));
            if (taskIndex === -1) return;

            const oldStatus   = (tasks[taskIndex].status || 'pending').toLowerCase().replace('_', '-');
            if (oldStatus === targetStatus) return;   // no change

            // ── Optimistic update directly in cache ──
            tasks[taskIndex].status = targetStatus;
            saveTasks(tasks);           // persist to localStorage immediately
            renderKanban();             // re-render with new position

            // ── Persist to PostgreSQL ──
            try {
                await updateTask(taskId, { status: targetStatus });
                // After backend confirms, re-fetch for consistency
                if (typeof fetchTasksFromAPI === 'function') {
                    await fetchTasksFromAPI();
                    renderKanban();
                }
            } catch (err) {
                console.error('[Kanban] Status update failed:', err);
                alert('Could not update task status in database. Reverting.');
                // Revert in cache
                tasks[taskIndex].status = oldStatus;
                saveTasks(tasks);
                renderKanban();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Badge Helpers
    // ─────────────────────────────────────────────────────────────────────────
    function getPriorityBadge(priority = '') {
        const p = priority.toLowerCase();
        let cls = 'badge-info';
        if (p === 'high')   cls = 'badge-danger';
        else if (p === 'medium') cls = 'badge-warning';
        return `<span class="badge ${cls}">${escapeHtml(capitalize(priority || 'Normal'))}</span>`;
    }

    function getStatusBadge(status = '') {
        const s = status.toLowerCase();
        let cls   = 'badge-warning';
        let label = 'Pending';
        if (s === 'in-progress' || s === 'in progress') { cls = 'badge-info';    label = 'In Progress'; }
        else if (s === 'completed')                      { cls = 'badge-success'; label = 'Completed'; }
        else if (s === 'cancelled')                      { cls = 'badge-danger';  label = 'Cancelled'; }
        else if (s === 'rejected')                       { cls = 'badge-danger';  label = 'Rejected'; }
        return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
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

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Quick Action Handlers (Automated status transitions)
    // ─────────────────────────────────────────────────────────────────────────
    window.quickAcceptTask = async function(taskId) {
        const currentRole = (typeof getRole === 'function') ? getRole() : (window._userRole || '');
        if (currentRole === 'MANAGER' || currentRole === 'ADMIN') {
            alert('Managers and Admins cannot accept tasks. Only the assigned employee can accept this task.');
            return;
        }

        try {
            if (typeof acceptTask === 'function') {
                await acceptTask(taskId);
            } else {
                await apiRequest(`/tasks/${taskId}/accept/`, { method: 'POST' });
            }
            if (typeof fetchTasksFromAPI === 'function') {
                await fetchTasksFromAPI();
            }
            renderTasks();
        } catch (err) {
            alert('Could not accept task: ' + (err.message || err));
        }
    };

    window.quickCompleteTask = async function(taskId) {
        if (!confirm('Are you sure you want to mark this task as completed?')) return;
        try {
            if (typeof completeTask === 'function') {
                await completeTask(taskId);
            } else {
                await apiRequest(`/tasks/${taskId}/complete/`, { method: 'POST' });
            }
            if (typeof fetchTasksFromAPI === 'function') {
                await fetchTasksFromAPI();
            }
            renderTasks();
        } catch (err) {
            alert('Could not complete task: ' + (err.message || err));
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Initial Load
    // ─────────────────────────────────────────────────────────────────────────
    setViewMode(currentViewMode);   // show correct view from localStorage

    if (typeof fetchTasksFromAPI === 'function') {
        fetchTasksFromAPI()
            .then(() => renderTasks())
            .catch(err => console.warn('API sync deferred:', err));
    }
});