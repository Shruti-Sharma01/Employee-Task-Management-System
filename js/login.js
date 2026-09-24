document.addEventListener('DOMContentLoaded', () => {
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

        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
            await new Promise((resolve) => setTimeout(resolve, 600));

            // Default users with complete profile data
            const defaultUsers = [
                {
                    username: 'admin',
                    password: 'admin123',
                    fullName: 'System Administrator',
                    email: 'admin@company.com',
                    department: 'Operations & IT',
                    role: 'Administrator',
                    avatar: 'images/profile.png'
                },
                {
                    username: 'employee',
                    password: 'password123',
                    fullName: 'Alex Morgan',
                    email: 'alex.morgan@company.com',
                    department: 'Product Engineering',
                    role: 'Software Engineer',
                    avatar: 'images/profile.png'
                }
            ];

            const registeredUsers = JSON.parse(localStorage.getItem('etm_users') || '[]');
            const allUsers = [...defaultUsers, ...registeredUsers];

            const foundUser = allUsers.find(u => 
                (u.username && u.username.toLowerCase() === username.toLowerCase()) || 
                (u.email && u.email.toLowerCase() === username.toLowerCase())
            );

            if (!foundUser) {
                showError(usernameInput, usernameError, 'Account not found.');
                return;
            }

            if (foundUser.password !== password) {
                showError(passwordInput, passwordError, 'Incorrect password. Please try again.');
                return;
            }

            // Ensure profile fields exist even for custom registered users
            const sessionUser = {
                username: foundUser.username,
                fullName: foundUser.fullName || foundUser.name || foundUser.username,
                email: foundUser.email || `${foundUser.username}@company.com`,
                department: foundUser.department || 'General',
                role: foundUser.role || 'Employee',
                avatar: foundUser.avatar || 'images/profile.png'
            };

            // SAVE SESSION: Read by profile.js and dashboard.js
            localStorage.setItem('etm_current_user', JSON.stringify(sessionUser));

            window.location.href = 'dashboard.html';

        } catch (error) {
            showError(passwordInput, passwordError, 'An error occurred while logging in.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    });
});