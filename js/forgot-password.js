document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. Elements
    // ----------------------------------------------------
    const requestForm = document.getElementById('requestResetForm');
    const newPasswordForm = document.getElementById('newPasswordForm');
    const successState = document.getElementById('successState');
    const footerNav = document.getElementById('footerNav');

    const resetEmailInput = document.getElementById('resetEmail');
    const emailError = document.getElementById('emailError');
    const sendCodeBtn = document.getElementById('sendCodeBtn');

    const verifiedEmailText = document.getElementById('verifiedEmailText');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    const newPasswordError = document.getElementById('newPasswordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');
    const updatePasswordBtn = document.getElementById('updatePasswordBtn');

    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');

    let verifiedUser = null; // Holds the user found in localStorage

    // ----------------------------------------------------
    // 2. Toggle Show/Hide Password
    // ----------------------------------------------------
    document.querySelectorAll('.toggle-password').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;

            const isHidden = targetInput.type === 'password';
            targetInput.type = isHidden ? 'text' : 'password';
            btn.textContent = isHidden ? 'Hide' : 'Show';
        });
    });

    // ----------------------------------------------------
    // 3. Error Helpers
    // ----------------------------------------------------
    const showError = (inputEl, errorEl, message) => {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        if (inputEl) inputEl.classList.add('input-error');
    };

    const clearError = (inputEl, errorEl) => {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
        if (inputEl) inputEl.classList.remove('input-error');
    };

    resetEmailInput.addEventListener('input', () => clearError(resetEmailInput, emailError));
    newPasswordInput.addEventListener('input', () => clearError(newPasswordInput, newPasswordError));
    confirmNewPasswordInput.addEventListener('input', () => clearError(confirmNewPasswordInput, confirmPasswordError));

    // ----------------------------------------------------
    // 4. Password Strength Meter for New Password
    // ----------------------------------------------------
    const updatePasswordStrength = () => {
        const val = newPasswordInput.value;
        const score = [
            val.length >= 8,
            /[A-Z]/.test(val),
            /[0-9]/.test(val),
            /[^A-Za-z0-9]/.test(val)
        ].filter(Boolean).length;

        if (!val) {
            strengthBar.style.width = '0%';
            strengthText.textContent = 'Password strength';
            strengthText.style.color = '#64748B';
            return;
        }

        if (val.length < 6 || score <= 1) {
            strengthBar.style.width = '33%';
            strengthBar.style.backgroundColor = '#EF4444';
            strengthText.textContent = 'Strength: Weak';
            strengthText.style.color = '#EF4444';
        } else if (score === 2 || score === 3) {
            strengthBar.style.width = '66%';
            strengthBar.style.backgroundColor = '#F59E0B';
            strengthText.textContent = 'Strength: Intermediate';
            strengthText.style.color = '#D97706';
        } else if (score === 4 && val.length >= 8) {
            strengthBar.style.width = '100%';
            strengthBar.style.backgroundColor = '#10B981';
            strengthText.textContent = 'Strength: Strong ✓';
            strengthText.style.color = '#10B981';
        }
    };

    newPasswordInput.addEventListener('input', updatePasswordStrength);

    // ----------------------------------------------------
    // 5. STEP 1: Verify Email against LocalStorage
    // ----------------------------------------------------
    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = resetEmailInput.value.trim().toLowerCase();
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email) {
            showError(resetEmailInput, emailError, 'Email address is required.');
            return;
        }
        if (!pattern.test(email)) {
            showError(resetEmailInput, emailError, 'Please enter a valid work email.');
            return;
        }

        sendCodeBtn.disabled = true;
        sendCodeBtn.textContent = 'Checking account...';

        try {
            await new Promise((res) => setTimeout(res, 800));

            // Load registered accounts
            const storedUsers = JSON.parse(localStorage.getItem('etm_users') || '[]');

            // Default built-in test accounts
            const defaultUsers = [
                { username: 'admin', email: 'admin@company.com', password: 'admin123' },
                { username: 'employee', email: 'employee@company.com', password: 'password123' }
            ];

            const allUsers = [...defaultUsers, ...storedUsers];

            // Match by email
            const found = allUsers.find(u => (u.email && u.email.toLowerCase() === email));

            if (!found) {
                showError(resetEmailInput, emailError, 'No account found matching this email address.');
                return;
            }

            // Successfully matched user!
            verifiedUser = found;

            // Transition to Step 2
            requestForm.classList.add('hidden');
            newPasswordForm.classList.remove('hidden');

            pageTitle.textContent = 'Create New Password';
            pageSubtitle.textContent = 'Choose a secure password for your account.';
            verifiedEmailText.textContent = verifiedUser.email;
            newPasswordInput.focus();

        } finally {
            sendCodeBtn.disabled = false;
            sendCodeBtn.textContent = 'Verify Email';
        }
    });

    // ----------------------------------------------------
    // 6. STEP 2: Save New Password into LocalStorage
    // ----------------------------------------------------
    newPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newPass = newPasswordInput.value;
        const confirmPass = confirmNewPasswordInput.value;

        if (!newPass) {
            showError(newPasswordInput, newPasswordError, 'New password is required.');
            return;
        }
        if (newPass.length < 8) {
            showError(newPasswordInput, newPasswordError, 'Password must be at least 8 characters.');
            return;
        }
        if (!confirmPass) {
            showError(confirmNewPasswordInput, confirmPasswordError, 'Please confirm your password.');
            return;
        }
        if (newPass !== confirmPass) {
            showError(confirmNewPasswordInput, confirmPasswordError, 'Passwords do not match.');
            return;
        }

        updatePasswordBtn.disabled = true;
        updatePasswordBtn.textContent = 'Updating...';

        try {
            await new Promise((res) => setTimeout(res, 900));

            // Update user in localStorage
            const storedUsers = JSON.parse(localStorage.getItem('etm_users') || '[]');
            const userIndex = storedUsers.findIndex(u => 
                (u.email && u.email.toLowerCase() === verifiedUser.email.toLowerCase()) || 
                u.username.toLowerCase() === verifiedUser.username.toLowerCase()
            );

            if (userIndex !== -1) {
                storedUsers[userIndex].password = newPass;
                localStorage.setItem('etm_users', JSON.stringify(storedUsers));
            } else {
                // If it was one of the default demo users, save it to etm_users so the new password works
                verifiedUser.password = newPass;
                storedUsers.push(verifiedUser);
                localStorage.setItem('etm_users', JSON.stringify(storedUsers));
            }

            // Set prefill for convenience on login page
            localStorage.setItem('etm_remembered_username', verifiedUser.username);

            // Show success screen
            newPasswordForm.classList.add('hidden');
            pageTitle.classList.add('hidden');
            pageSubtitle.classList.add('hidden');
            footerNav.classList.add('hidden');
            successState.classList.remove('hidden');

        } finally {
            updatePasswordBtn.disabled = false;
            updatePasswordBtn.textContent = 'Update Password';
        }
    });
});