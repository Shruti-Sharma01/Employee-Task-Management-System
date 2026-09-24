/**
 * js/storage.js
 * Handles LocalStorage data management for Employee Task Manager
 * Works across both dashboard.html and tasks.html
 */

const STORAGE_KEY = 'employee_tasks';

// Default initial tasks (fallback if offline and localStorage is empty)
const defaultTasks = [
    {
        id: '1',
        title: 'Build Authentication Flow',
        description: 'Implement JWT login and session handling for employee accounts.',
        priority: 'high',
        category: 'development',
        dueDate: '2026-09-12',
        status: 'in-progress',
        createdAt: new Date(Date.now() - 3600 * 1000 * 24 * 2).toISOString()
    },
    {
        id: '2',
        title: 'Review Pull Requests from Backend Team',
        description: 'Review API route changes, security checks, and database migrations.',
        priority: 'medium',
        category: 'testing',
        dueDate: '2026-09-15',
        status: 'pending',
        createdAt: new Date(Date.now() - 3600 * 1000 * 6).toISOString()
    },
    {
        id: '3',
        title: 'Design Dashboard Wireframes',
        description: 'Create high-fidelity Figma components for stats and task cards.',
        priority: 'low',
        category: 'design',
        dueDate: '2026-09-10',
        status: 'completed',
        createdAt: new Date(Date.now() - 3600 * 1000 * 30).toISOString()
    },
    {
        id: '4',
        title: 'Update Project Documentation',
        description: 'Document system setup and API specs in markdown README.',
        priority: 'medium',
        category: 'documentation',
        dueDate: '2026-09-18',
        status: 'pending',
        createdAt: new Date(Date.now() - 3600 * 1000 * 12).toISOString()
    },
    {
        id: '5',
        title: 'Fix Mobile Navigation Glitch',
        description: 'Sidebar drawer does not smoothly close on tap on mobile screens.',
        priority: 'high',
        category: 'development',
        dueDate: '2026-09-09',
        status: 'in-progress',
        createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString()
    }
];

/**
 * Retrieve cached tasks from localStorage
 * @returns {Array} Array of task objects
 */
function getTasks() {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) {
        saveTasks(defaultTasks);
        return defaultTasks;
    }
    try {
        return JSON.parse(rawData);
    } catch (e) {
        console.error('Error reading localStorage data:', e);
        return [];
    }
}

/**
 * Persist array of tasks to localStorage
 * @param {Array} tasks
 */
function saveTasks(tasks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
}

/**
 * Add a new task
 * @param {Object} taskData - { title, description, priority, category, dueDate, status }
 * @returns {Object} Newly created task
 */
function addTask(taskData) {
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
 * Update an existing task by ID
 * @param {string|number} id
 * @param {Object} updatedFields
 * @returns {Object|null} Updated task or null if not found
 */
function updateTask(id, updatedFields) {
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
 * Delete a task by ID
 * @param {string|number} id
 */
function deleteTask(id) {
    const tasks = getTasks();
    const filtered = tasks.filter(t => String(t.id) !== String(id));
    saveTasks(filtered);
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
