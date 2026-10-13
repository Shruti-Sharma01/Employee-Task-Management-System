/**
 * js/api.js
 * Central API Client for Employee Task Management System (ETMS)
 * Directly connects frontend to Django REST Framework backend and PostgreSQL database.
 */

const API_BASE_URL = (window.location.port === '8000') 
    ? '/api' 
    : 'http://127.0.0.1:8000/api';

/**
 * Universal API Request with automatic token attachment & refresh handling
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem('etm_access_token');

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    try {
        response = await fetch(url, { ...options, headers });
    } catch (networkError) {
        console.error('API Network Error:', networkError);
        throw new Error('Could not connect to database backend. Please ensure the Django server is running on http://127.0.0.1:8000');
    }

    // Attempt token refresh on 401
    if (response.status === 401 && !options._retry && localStorage.getItem('etm_refresh_token')) {
        options._retry = true;
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            headers['Authorization'] = `Bearer ${localStorage.getItem('etm_access_token')}`;
            const retryRes = await fetch(url, { ...options, headers });
            let retryData = null;
            try { retryData = await retryRes.json(); } catch (_) {}
            return { ok: retryRes.ok, status: retryRes.status, data: retryData };
        } else {
            localStorage.removeItem('etm_access_token');
            localStorage.removeItem('etm_refresh_token');
            const path = window.location.pathname.toLowerCase();
            if (path.includes('tasks.html') || path.includes('dashboard.html') || path.includes('profile.html')) {
                window.location.href = 'login.html';
            }
        }
    }

    let data = null;
    try {
        data = await response.json();
    } catch (_) {}

    return {
        ok: response.ok,
        status: response.status,
        data: data
    };
}

async function refreshAccessToken() {
    const refresh = localStorage.getItem('etm_refresh_token');
    if (!refresh) return false;
    try {
        const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh })
        });
        if (res.ok) {
            const result = await res.json();
            const newAccess = result.data?.access || result.access;
            if (newAccess) {
                localStorage.setItem('etm_access_token', newAccess);
                return true;
            }
        }
    } catch (e) {
        console.warn('Failed to refresh token', e);
    }
    return false;
}

function checkAuth() {
    const token = localStorage.getItem('etm_access_token');
    const user = localStorage.getItem('etm_current_user');
    if (!token || !user) {
        document.documentElement.style.display = 'none';
        window.location.replace('login.html');
        return false;
    }
    return true;
}

function apiLogout() {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.innerHTML = '';
    window.location.replace('login.html');
}
