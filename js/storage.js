/**
 * js/storage.js
 * Handles Database API synchronization and local caching for Employee Task Manager.
 * All task creates, updates, and deletes are saved directly to the PostgreSQL database.
 */

const STORAGE_KEY = 'employee_tasks';

/**
 * Normalize Django API task representation to frontend model
 */
function normalizeTask(apiTask) {
    if (!apiTask) return null;
    return {
        id: String(apiTask.id),
        title: apiTask.title || '',
        description: apiTask.description || '',
        priority: (apiTask.priority || 'medium').toLowerCase(),
        category: (apiTask.category || 'development').toLowerCase(),
        dueDate: apiTask.deadline || '',
        status: (apiTask.status || 'pending').toLowerCase().replace('_', '-'),
        createdAt: apiTask.created_at || new Date().toISOString(),
        assignedTo: apiTask.assigned_to,
        assignedBy: apiTask.assigned_by
    };
}

/**
 * Retrieve cached tasks synchronously
 * @returns {Array} Array of task objects
 */
function getTasks() {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
        return [];
    }
    try {
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
            const filtered = parsed.filter(t => !['1', '2', '3', '4', '5'].includes(String(t.id)));
            if (filtered.length !== parsed.length) {
                saveTasks(filtered);
            }
            return filtered;
        }
        return [];
    } catch (e) {
        console.error('Error reading cached tasks:', e);
        return [];
    }
}

/**
 * Persist array of tasks to local cache
 * @param {Array} tasks
 */
function saveTasks(tasks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
        console.error('Error saving to local cache:', e);
    }
}

/**
 * Fetch fresh tasks from Django PostgreSQL Database API
 * @returns {Promise<Array>}
 */
async function fetchTasksFromAPI() {
    if (typeof apiRequest !== 'function') {
        console.warn('[ETMS] fetchTasksFromAPI: apiRequest not available');
        return getTasks();
    }

    try {
        const response = await apiRequest('/tasks/');
        console.log('[ETMS] fetchTasksFromAPI response:', response.status, response.ok);

        if (response.ok && response.data) {
            // Django success_response wraps paginated data:
            // { success: true, data: { count: N, results: [...] } }
            // OR un-paginated: { success: true, data: [...] }
            const payload = response.data.data;
            let rawList = [];

            if (Array.isArray(payload)) {
                rawList = payload;
            } else if (payload && Array.isArray(payload.results)) {
                rawList = payload.results;
            } else if (Array.isArray(response.data)) {
                rawList = response.data;
            }

            console.log('[ETMS] fetchTasksFromAPI raw count:', rawList.length);
            const normalizedList = rawList.map(normalizeTask).filter(Boolean);
            saveTasks(normalizedList);
            return normalizedList;
        } else {
            console.warn('[ETMS] fetchTasksFromAPI non-ok response:', response.status, response.data);
        }
    } catch (err) {
        console.warn('[ETMS] fetchTasksFromAPI error, using cache:', err);
    }

    return getTasks();
}

/**
 * Add a new task directly into PostgreSQL Database
 * @param {Object} taskData - { title, description, priority, category, dueDate, status }
 * @returns {Promise<Object>} Newly created task
 */
async function addTask(taskData) {
    const payload = {
        title: taskData.title,
        description: taskData.description || '',
        priority: (taskData.priority || 'medium').toUpperCase(),
        category: (taskData.category || 'development').toLowerCase(),
        status: (taskData.status || 'pending').toUpperCase().replace('-', '_'),
        deadline: taskData.dueDate || null
    };

    // assigned_to: Employee primary key (integer) — send only if provided
    if (taskData.assignedTo) {
        payload.assigned_to = parseInt(taskData.assignedTo, 10);
    }

    console.log('[ETMS] addTask payload:', payload);

    if (typeof apiRequest === 'function') {
        const response = await apiRequest('/tasks/', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        console.log('[ETMS] addTask response:', response.status, response.ok, response.data);

        if (response.ok) {
            // success_response wraps task in { success: true, data: {...task} }
            const apiTask = response.data?.data || response.data;
            if (!apiTask || !apiTask.id) {
                throw new Error('Task saved but response was unexpected. Please refresh the page.');
            }
            const newTask = normalizeTask(apiTask);
            console.log('[ETMS] addTask normalized:', newTask);
            const tasks = getTasks();
            tasks.unshift(newTask);
            saveTasks(tasks);
            return newTask;
        } else {
            const errors = response.data?.errors || response.data?.message || 'Failed to save task to database';
            console.error('[ETMS] addTask error:', response.data);
            throw new Error(typeof errors === 'object' ? JSON.stringify(errors) : errors);
        }
    }

    // Fallback if offline / no apiRequest
    console.warn('[ETMS] addTask: apiRequest not available, saving locally only');
    const tasks = getTasks();
    const newTask = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...taskData
    };
    tasks.unshift(newTask);
    saveTasks(tasks);
    return newTask;
}

/**
 * Update an existing task by ID in PostgreSQL Database
 * @param {string|number} id
 * @param {Object} updatedFields
 * @returns {Promise<Object|null>}
 */
async function updateTask(id, updatedFields) {
    const payload = {};
    if (updatedFields.title !== undefined) payload.title = updatedFields.title;
    if (updatedFields.description !== undefined) payload.description = updatedFields.description;
    if (updatedFields.priority !== undefined) payload.priority = updatedFields.priority.toUpperCase();
    if (updatedFields.category !== undefined) payload.category = updatedFields.category.toLowerCase();
    if (updatedFields.dueDate  !== undefined) payload.deadline = updatedFields.dueDate || null;
    if (updatedFields.status   !== undefined) payload.status   = updatedFields.status.toUpperCase().replace('-', '_');
    if (updatedFields.assignedTo !== undefined) {
        payload.assigned_to = updatedFields.assignedTo ? parseInt(updatedFields.assignedTo, 10) : null;
    }

    if (typeof apiRequest === 'function') {
        const response = await apiRequest(`/tasks/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });

        if (response.ok && response.data) {
            const updated = normalizeTask(response.data.data || response.data);
            const tasks = getTasks();
            const index = tasks.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                tasks[index] = updated;
                saveTasks(tasks);
            }
            return updated;
        } else {
            const errors = response.data?.errors || response.data?.message || 'Failed to update task in database';
            throw new Error(typeof errors === 'object' ? JSON.stringify(errors) : errors);
        }
    }

    const tasks = getTasks();
    const index = tasks.findIndex(t => String(t.id) === String(id));
    if (index !== -1) {
        tasks[index] = { ...tasks[index], ...updatedFields };
        saveTasks(tasks);
        return tasks[index];
    }
    return null;
}

/**
 * Accept task (moves from PENDING to IN_PROGRESS)
 * @param {string|number} id
 * @returns {Promise<Object>}
 */
async function acceptTask(id) {
    if (typeof apiRequest === 'function') {
        const response = await apiRequest(`/tasks/${id}/accept/`, {
            method: 'POST'
        });
        if (response.ok && response.data) {
            const updated = normalizeTask(response.data.data || response.data);
            const tasks = getTasks();
            const index = tasks.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                tasks[index] = updated;
                saveTasks(tasks);
            }
            return updated;
        } else {
            const msg = response.data?.message || response.data?.detail || 'Failed to accept task';
            throw new Error(msg);
        }
    }
    return updateTask(id, { status: 'in-progress' });
}

/**
 * Reject task (moves from PENDING to REJECTED)
 * @param {string|number} id
 * @param {string} reason
 * @returns {Promise<Object>}
 */
async function rejectTask(id, reason = '') {
    if (typeof apiRequest === 'function') {
        const response = await apiRequest(`/tasks/${id}/reject/`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || '' })
        });
        if (response.ok && response.data) {
            const updated = normalizeTask(response.data.data || response.data);
            const tasks = getTasks();
            const index = tasks.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                tasks[index] = updated;
                saveTasks(tasks);
            }
            return updated;
        } else {
            const msg = response.data?.message || response.data?.detail || 'Failed to reject task';
            throw new Error(msg);
        }
    }
    return updateTask(id, { status: 'rejected' });
}

/**
 * Complete task (moves status to COMPLETED)
 * @param {string|number} id
 * @returns {Promise<Object>}
 */
async function completeTask(id) {
    if (typeof apiRequest === 'function') {
        const response = await apiRequest(`/tasks/${id}/complete/`, {
            method: 'POST'
        });
        if (response.ok && response.data) {
            const updated = normalizeTask(response.data.data || response.data);
            const tasks = getTasks();
            const index = tasks.findIndex(t => String(t.id) === String(id));
            if (index !== -1) {
                tasks[index] = updated;
                saveTasks(tasks);
            }
            return updated;
        } else {
            const msg = response.data?.message || response.data?.detail || 'Failed to complete task';
            throw new Error(msg);
        }
    }
    return updateTask(id, { status: 'completed' });
}

/**
 * Delete a task by ID from PostgreSQL Database
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
async function deleteTask(id) {
    if (typeof apiRequest === 'function') {
        const response = await apiRequest(`/tasks/${id}/`, {
            method: 'DELETE'
        });

        if (!response.ok && response.status !== 204) {
            const errors = response.data?.errors || response.data?.message || 'Failed to delete task from database';
            throw new Error(typeof errors === 'object' ? JSON.stringify(errors) : errors);
        }
    }

    const tasks = getTasks();
    const filtered = tasks.filter(t => String(t.id) !== String(id));
    saveTasks(filtered);
    return true;
}

/**
 * Retrieve a single task by ID
 * @param {string|number} id
 * @returns {Object|null}
 */
function getTaskById(id) {
    const tasks = getTasks();
    return tasks.find(t => String(t.id) === String(id)) || null;
}
