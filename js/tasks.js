/**
 * js/tasks.js
 * Full controller for Task Management page: CRUD, Search, Filter, Sort, & Modals
 */

document.addEventListener('DOMContentLoaded', () => {
    // Current task ID tracked for deletion
    let taskToDeleteId = null;

    // DOM Elements - Navigation
    const navToggle = document.getElementById('navToggle');
    const sidebar = document.getElementById('sidebar');

    // DOM Elements - Form & Controls
    const openAddTaskBtn = document.getElementById('openAddTaskBtn');
    const taskFormContainer = document.getElementById('taskFormContainer');
    const taskForm = document.getElementById('taskForm');
    const formHeading = document.getElementById('formHeading');
    const cancelTaskBtn = document.getElementById('cancelTaskBtn');

    // DOM Elements - Inputs & Errors
    const taskIdInput = document.getElementById('taskId');
    const taskTitleInput = document.getElementById('taskTitle');
    const taskDescriptionInput = document.getElementById('taskDescription');
    const taskPriorityInput = document.getElementById('taskPriority');
    const taskCategoryInput = document.getElementById('taskCategory');
    const taskDueDateInput = document.getElementById('taskDueDate');
    const taskStatusInput = document.getElementById('taskStatus');

    const taskTitleError = document.getElementById('taskTitleError');
    const taskDueDateError = document.getElementById('taskDueDateError');

    // DOM Elements - Search, Filters & Sorting
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const priorityFilter = document.getElementById('priorityFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const sortBy = document.getElementById('sortBy');

    // DOM Elements - Table & Modal
    const tasksTableBody = document.getElementById('tasksTableBody');
    const deleteModal = document.getElementById('deleteModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

    // -------------------------------------------------------------
    // IMPORTANT: Ensure Delete Modal stays closed on initial load
    // -------------------------------------------------------------
    if (deleteModal) {
        deleteModal.hidden = true;
        deleteModal.style.display = 'none';
    }

    // -------------------------------------------------------------
    // 1. Mobile Sidebar Navigation
    // -------------------------------------------------------------
    if (navToggle && sidebar) {
        navToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // -------------------------------------------------------------
    // 2. Form Open / Close / Reset
    // -------------------------------------------------------------
    function openAddForm() {
        resetForm();
        formHeading.textContent = 'Add New Task';
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
        clearErrors();
    }

    function clearErrors() {
        if (taskTitleError) taskTitleError.textContent = '';
        if (taskDueDateError) taskDueDateError.textContent = '';
    }

    openAddTaskBtn.addEventListener('click', openAddForm);
    cancelTaskBtn.addEventListener('click', closeForm);

    // -------------------------------------------------------------
    // 3. Form Validation & Submission (Create / Edit)
    // -------------------------------------------------------------
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors();

        let isValid = true;
        const titleVal = taskTitleInput.value.trim();
        const dueDateVal = taskDueDateInput.value;

        if (!titleVal) {
            taskTitleError.textContent = 'Task title is required.';
            isValid = false;
        }

        if (!dueDateVal) {
            taskDueDateError.textContent = 'Please select a valid due date.';
            isValid = false;
        }

        if (!isValid) return;

        const taskData = {
            title: titleVal,
            description: taskDescriptionInput.value.trim(),
            priority: taskPriorityInput.value,
            category: taskCategoryInput.value,
            dueDate: dueDateVal,
            status: taskStatusInput.value
        };

        const editingId = taskIdInput.value;

        if (editingId) {
            updateTask(editingId, taskData);
        } else {
            addTask(taskData);
        }

        closeForm();
        renderTasks();
    });

    // -------------------------------------------------------------
    // 4. Edit Task Flow
    // -------------------------------------------------------------
    window.editTaskHandler = function (id) {
        const task = getTaskById(id);
        if (!task) return;

        resetForm();
        formHeading.textContent = 'Edit Task';

        taskIdInput.value = task.id;
        taskTitleInput.value = task.title || '';
        taskDescriptionInput.value = task.description || '';
        taskPriorityInput.value = (task.priority || 'medium').toLowerCase();
        taskCategoryInput.value = (task.category || 'development').toLowerCase();
        taskDueDateInput.value = task.dueDate || '';
        taskStatusInput.value = (task.status || 'pending').toLowerCase();

        showForm(true);
    };

    // -------------------------------------------------------------
    // 5. Delete Task Flow & Modal
    // -------------------------------------------------------------
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
        confirmDeleteBtn.addEventListener('click', () => {
            if (taskToDeleteId) {
                deleteTask(taskToDeleteId);
                closeDeleteModal();
                renderTasks();
            }
        });
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    }

    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                closeDeleteModal();
            }
        });
    }

    // -------------------------------------------------------------
    // 6. Search, Filtering, and Sorting Logic
    // -------------------------------------------------------------
    function getProcessedTasks() {
        let tasks = getTasks();

        const query = (searchInput.value || '').toLowerCase().trim();
        const selectedStatus = statusFilter.value;
        const selectedPriority = priorityFilter.value;
        const selectedCategory = categoryFilter.value;
        const sortDirection = sortBy.value;

        // Text Search Filter
        if (query) {
            tasks = tasks.filter(task =>
                (task.title && task.title.toLowerCase().includes(query)) ||
                (task.description && task.description.toLowerCase().includes(query))
            );
        }

        // Status Filter
        if (selectedStatus !== 'all') {
            tasks = tasks.filter(task => (task.status || '').toLowerCase() === selectedStatus);
        }

        // Priority Filter
        if (selectedPriority !== 'all') {
            tasks = tasks.filter(task => (task.priority || '').toLowerCase() === selectedPriority);
        }

        // Category Filter
        if (selectedCategory !== 'all') {
            tasks = tasks.filter(task => (task.category || '').toLowerCase() === selectedCategory);
        }

        // Sort by Due Date
        tasks.sort((a, b) => {
            const dateA = new Date(a.dueDate || '9999-12-31').getTime();
            const dateB = new Date(b.dueDate || '9999-12-31').getTime();
            return sortDirection === 'desc' ? dateB - dateA : dateA - dateB;
        });

        return tasks;
    }

    // Attach real-time filter listeners
    searchInput.addEventListener('input', renderTasks);
    statusFilter.addEventListener('change', renderTasks);
    priorityFilter.addEventListener('change', renderTasks);
    categoryFilter.addEventListener('change', renderTasks);
    sortBy.addEventListener('change', renderTasks);

    // -------------------------------------------------------------
    // 7. Render Table Rows
    // -------------------------------------------------------------
    function renderTasks() {
        const tasks = getProcessedTasks();
        tasksTableBody.innerHTML = '';

        if (tasks.length === 0) {
            const emptyTr = document.createElement('tr');
            emptyTr.innerHTML = `
                <td colspan="6" style="text-align:center; padding: 2rem; color: var(--color-text-muted);">
                    No tasks match your filter criteria.
                </td>
            `;
            tasksTableBody.appendChild(emptyTr);
            return;
        }

        tasks.forEach(task => {
            const tr = document.createElement('tr');

            const priorityBadge = getPriorityBadge(task.priority);
            const statusBadge = getStatusBadge(task.status);
            const formattedCategory = capitalize(task.category || 'General');

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600; color: var(--color-text);">${escapeHtml(task.title)}</div>
                    ${task.description ? `<div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">${escapeHtml(task.description)}</div>` : ''}
                </td>
                <td>${escapeHtml(formattedCategory)}</td>
                <td>${priorityBadge}</td>
                <td>${escapeHtml(task.dueDate || '-')}</td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="editTaskHandler('${escapeHtml(task.id)}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.8rem;" onclick="openDeleteModalHandler('${escapeHtml(task.id)}')">Delete</button>
                    </div>
                </td>
            `;

            tasksTableBody.appendChild(tr);
        });
    }

    // -------------------------------------------------------------
    // 8. Badge Helpers
    // -------------------------------------------------------------
    function getPriorityBadge(priority = '') {
        const p = priority.toLowerCase();
        let badgeClass = 'badge-info';
        if (p === 'high') badgeClass = 'badge-danger';
        else if (p === 'medium') badgeClass = 'badge-warning';

        return `<span class="badge ${badgeClass}">${escapeHtml(capitalize(priority || 'Normal'))}</span>`;
    }

    function getStatusBadge(status = '') {
        const s = status.toLowerCase();
        let badgeClass = 'badge-warning';
        let label = 'Pending';

        if (s === 'in-progress' || s === 'in progress') {
            badgeClass = 'badge-info';
            label = 'In Progress';
        } else if (s === 'completed') {
            badgeClass = 'badge-success';
            label = 'Completed';
        }

        return `<span class="badge ${badgeClass}">${escapeHtml(label)}</span>`;
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

    // Initial render
    renderTasks();
});