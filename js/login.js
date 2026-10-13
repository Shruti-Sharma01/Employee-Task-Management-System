document.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect straight to dashboard
    const existingToken = localStorage.getItem('etm_access_token');
    const existingUser = localStorage.getItem('etm_current_user');
    if (existingToken && existingUser) {
        window.location.replace('dashboard.html');
        return;
    }

    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const usernameError = document.getElementById('usernameError');
    const passwordError = document.getElementById('passwordError');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    // 1. Pre-fill username if remembered
    const savedUsername = localStorage.getItem('etm_remembered_username');
    if (savedUsername && usernameInput && rememberMeCheckbox) {
        usernameInput.value = savedUsername;
        rememberMeCheckbox.checked = true;
        if (passwordInput) passwordInput.focus();
    }

    // 2. Show / Hide password toggle
    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPasswordHidden = passwordInput.getAttribute('type') === 'password';
            if (isPasswordHidden) {
                passwordInput.setAttribute('type', 'text');
                togglePasswordBtn.textContent = 'Hide';
                togglePasswordBtn.setAttribute('aria-label', 'Hide password');
            } else {
                passwordInput.setAttribute('type', 'password');
                togglePasswordBtn.textContent = 'Show';
                togglePasswordBtn.setAttribute('aria-label', 'Show password');
            }
        });
    }

    // 3. Error helpers
    const showError = (inputEl, errorEl, message) => {
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }
        if (inputEl) inputEl.classList.add('input-error');
    };

    const clearError = (inputEl, errorEl) => {
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
        if (inputEl) inputEl.classList.remove('input-error');
    };

    const validateUsername = () => {
        const value = usernameInput.value.trim();
        if (!value) {
            showError(usernameInput, usernameError, 'Username is required.');
            return false;
        }
        clearError(usernameInput, usernameError);
        return true;
    };

    const validatePassword = () => {
        const value = passwordInput.value;
        if (!value) {
            showError(passwordInput, passwordError, 'Password is required.');
            return false;
        }
        clearError(passwordInput, passwordError);
        return true;
    };

    usernameInput.addEventListener('input', () => clearError(usernameInput, usernameError));
    passwordInput.addEventListener('input', () => clearError(passwordInput, passwordError));

    // 4. Submit Verification
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const isUserValid = validateUsername();
        const isPassValid = validatePassword();

        if (!isUserValid || !isPassValid) return;

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

        if (rememberMe) {
            localStorage.setItem('etm_remembered_username', username);
        } else {
            localStorage.removeItem('etm_remembered_username');
        }

        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in to Database...';

        try {
            const response = await apiRequest('/auth/login/', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            if (response.ok && response.data?.success) {
                const authData = response.data.data;
                localStorage.setItem('etm_access_token', authData.access);
                localStorage.setItem('etm_refresh_token', authData.refresh);

                const user = authData.user || {};
                const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;

                const sessionUser = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    fullName: fullName,
                    role: user.role || 'Employee',
                    department: user.department || 'Operations',
                    avatar: 'images/profile.png'
                };

                localStorage.setItem('etm_current_user', JSON.stringify(sessionUser));
                window.location.replace('dashboard.html');
            } else {
                const errorMsg = response.data?.message || 'Invalid username or password.';
                showError(passwordInput, passwordError, errorMsg);
            }

        } catch (error) {
            showError(passwordInput, passwordError, error.message || 'An error occurred while connecting to the database server.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
});