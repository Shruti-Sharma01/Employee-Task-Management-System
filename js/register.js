document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 1. Element Selectors
    // ----------------------------------------------------
    const form = document.getElementById('registerForm');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const departmentSelect = document.getElementById('department');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const agreeTermsCheckbox = document.getElementById('agreeTerms');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Strength Meter & Rule Elements
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    const usernameHint = document.getElementById('usernameHint');
    const matchHint = document.getElementById('matchHint');
    const ruleLength = document.getElementById('rule-length');
    const ruleUppercase = document.getElementById('rule-uppercase');
    const ruleNumber = document.getElementById('rule-number');
    const ruleSpecial = document.getElementById('rule-special');

    // Error message spans
    const errors = {
        fullName: document.getElementById('fullNameError'),
        email: document.getElementById('emailError'),
        username: document.getElementById('usernameError'),
        department: document.getElementById('departmentError'),
        password: document.getElementById('passwordError'),
        confirmPassword: document.getElementById('confirmPasswordError'),
        terms: document.getElementById('termsError')
    };

    // ----------------------------------------------------
    // 2. Show / Hide Password Toggles
    // ----------------------------------------------------
    document.querySelectorAll('.toggle-password').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;

            const isHidden = targetInput.type === 'password';
            targetInput.type = isHidden ? 'text' : 'password';
            btn.textContent = isHidden ? 'Hide' : 'Show';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });

    // ----------------------------------------------------
    // 3. Error Helpers
    // ----------------------------------------------------
    const showError = (inputEl, errorEl, message) => {
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        if (inputEl) inputEl.classList.add('input-error');
    };

    const clearError = (inputEl, errorEl) => {
        if (!errorEl) return;
        errorEl.textContent = '';
        errorEl.style.display = 'none';
        if (inputEl) inputEl.classList.remove('input-error');
    };

    // ----------------------------------------------------
    // 4. Password Strength & Rules Checklist Function
    // ----------------------------------------------------
    const updatePasswordStrengthAndRules = () => {
        if (!passwordInput) return;
        const val = passwordInput.value;

        // Individual criteria checks
        const hasLength = val.length >= 8;
        const hasUppercase = /[A-Z]/.test(val);
        const hasNumber = /[0-9]/.test(val);
        const hasSpecial = /[^A-Za-z0-9]/.test(val);

        // Update live checklist items (✓ or ✕)
        if (ruleLength) ruleLength.classList.toggle('valid', hasLength);
        if (ruleUppercase) ruleUppercase.classList.toggle('valid', hasUppercase);
        if (ruleNumber) ruleNumber.classList.toggle('valid', hasNumber);
        if (ruleSpecial) ruleSpecial.classList.toggle('valid', hasSpecial);

        // Count how many criteria are met (0 to 4)
        const score = [hasLength, hasUppercase, hasNumber, hasSpecial].filter(Boolean).length;

        // When password box is empty
        if (!val) {
            if (strengthBar) {
                strengthBar.style.width = '0%';
                strengthBar.style.backgroundColor = 'transparent';
            }
            if (strengthText) {
                strengthText.textContent = 'Password strength';
                strengthText.style.color = '#6b7280';
                strengthText.style.fontWeight = 'normal';
            }
            return;
        }

        // Tier 1: WEAK (Under 6 chars or only 1 criteria met)
        if (val.length < 6 || score <= 1) {
            if (strengthBar) {
                strengthBar.style.width = '33%';
                strengthBar.style.backgroundColor = '#ef4444'; // Red
            }
            if (strengthText) {
                strengthText.textContent = 'Strength: Weak';
                strengthText.style.color = '#ef4444';
                strengthText.style.fontWeight = '600';
            }
        }
        // Tier 2: INTERMEDIATE (2 or 3 criteria met)
        else if (score === 2 || score === 3) {
            if (strengthBar) {
                strengthBar.style.width = '66%';
                strengthBar.style.backgroundColor = '#f59e0b'; // Amber / Orange
            }
            if (strengthText) {
                strengthText.textContent = 'Strength: Intermediate';
                strengthText.style.color = '#d97706';
                strengthText.style.fontWeight = '600';
            }
        }
        // Tier 3: STRONG (All 4 criteria met & length >= 8)
        else if (score === 4 && hasLength) {
            if (strengthBar) {
                strengthBar.style.width = '100%';
                strengthBar.style.backgroundColor = '#10b981'; // Green
            }
            if (strengthText) {
                strengthText.textContent = 'Strength: Strong ✓';
                strengthText.style.color = '#10b981';
                strengthText.style.fontWeight = '600';
            }
        }
    };

    // ----------------------------------------------------
    // 5. Field Validators
    // ----------------------------------------------------
    const validateFullName = () => {
        const val = fullNameInput.value.trim();
        if (!val) {
            showError(fullNameInput, errors.fullName, 'Full name is required.');
            return false;
        }
        if (val.length < 2) {
            showError(fullNameInput, errors.fullName, 'Name must be at least 2 characters.');
            return false;
        }
        clearError(fullNameInput, errors.fullName);
        return true;
    };

    const validateEmail = () => {
        const val = emailInput.value.trim();
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val) {
            showError(emailInput, errors.email, 'Work email is required.');
            return false;
        }
        if (!pattern.test(val)) {
            showError(emailInput, errors.email, 'Please enter a valid work email.');
            return false;
        }
        clearError(emailInput, errors.email);
        return true;
    };

    const validateUsername = () => {
        const val = usernameInput.value.trim();
        const pattern = /^[a-zA-Z0-9_]{3,20}$/;
        const isValid = pattern.test(val);

        if (usernameHint) {
            usernameHint.classList.toggle('valid', isValid);
        }

        if (!val) {
            showError(usernameInput, errors.username, 'Username is required.');
            return false;
        }
        if (!isValid) {
            showError(usernameInput, errors.username, '3–20 characters (letters, numbers, underscores).');
            return false;
        }
        clearError(usernameInput, errors.username);
        return true;
    };

    const validateDepartment = () => {
        if (!departmentSelect.value) {
            showError(departmentSelect, errors.department, 'Please select your department.');
            return false;
        }
        clearError(departmentSelect, errors.department);
        return true;
    };

    const validatePassword = () => {
        const val = passwordInput.value;
        const hasLength = val.length >= 8;
        const hasUppercase = /[A-Z]/.test(val);
        const hasNumber = /[0-9]/.test(val);
        const hasSpecial = /[^A-Za-z0-9]/.test(val);

        if (!val) {
            showError(passwordInput, errors.password, 'Password is required.');
            return false;
        }
        if (!hasLength || !hasUppercase || !hasNumber || !hasSpecial) {
            showError(passwordInput, errors.password, 'Please satisfy all password rules above.');
            return false;
        }
        clearError(passwordInput, errors.password);
        return true;
    };

    const validateConfirmPassword = () => {
        const pass = passwordInput.value;
        const confirmPass = confirmPasswordInput.value;
        const isMatch = pass.length > 0 && pass === confirmPass;

        if (matchHint) {
            matchHint.classList.toggle('valid', isMatch);
            matchHint.textContent = isMatch ? '✓ Passwords match' : 'Must match password';
        }

        if (!confirmPass) {
            showError(confirmPasswordInput, errors.confirmPassword, 'Please confirm your password.');
            return false;
        }
        if (pass !== confirmPass) {
            showError(confirmPasswordInput, errors.confirmPassword, 'Passwords do not match.');
            return false;
        }
        clearError(confirmPasswordInput, errors.confirmPassword);
        return true;
    };

    const validateTerms = () => {
        if (!agreeTermsCheckbox.checked) {
            showError(null, errors.terms, 'You must agree to the workspace terms.');
            return false;
        }
        clearError(null, errors.terms);
        return true;
    };

    // ----------------------------------------------------
    // 6. Real-Time Keystroke Listeners
    // ----------------------------------------------------
    fullNameInput.addEventListener('input', () => clearError(fullNameInput, errors.fullName));
    emailInput.addEventListener('input', () => clearError(emailInput, errors.email));
    usernameInput.addEventListener('input', validateUsername);
    departmentSelect.addEventListener('change', () => clearError(departmentSelect, errors.department));

    // Listen to password keystrokes to trigger the strength meter & rules
    passwordInput.addEventListener('input', () => {
        updatePasswordStrengthAndRules();
        clearError(passwordInput, errors.password);
        if (confirmPasswordInput.value) {
            validateConfirmPassword();
        }
    });

    confirmPasswordInput.addEventListener('input', () => {
        validateConfirmPassword();
    });

    agreeTermsCheckbox.addEventListener('change', () => clearError(null, errors.terms));

    // ----------------------------------------------------
    // 7. Form Submission (Saves to mock localStorage database)
    // ----------------------------------------------------
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const isNameValid = validateFullName();
        const isEmailValid = validateEmail();
        const isUserValid = validateUsername();
        const isDeptValid = validateDepartment();
        const isPassValid = validatePassword();
        const isConfirmValid = validateConfirmPassword();
        const isTermsValid = validateTerms();

        if (!isNameValid || !isEmailValid || !isUserValid || 
            !isDeptValid || !isPassValid || !isConfirmValid || !isTermsValid) {
            return;
        }

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const fullName = fullNameInput.value.trim();
        const department = departmentSelect.value;
        const roleSelect = document.getElementById('roleSelect');
        const selectedRole = roleSelect ? roleSelect.value : 'EMPLOYEE';

        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account in Database...';

        try {
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0] || username;
            const lastName = nameParts.slice(1).join(' ') || '';

            const payload = {
                username: username,
                email: email,
                first_name: firstName,
                last_name: lastName,
                department: department,
                password: password,
                confirm_password: confirmPasswordInput.value,
                role: selectedRole
            };

            const response = await apiRequest('/auth/register/', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (response.ok && response.data?.success) {
                // Pre-populate username on login page
                localStorage.setItem('etm_remembered_username', username);
                alert('Account successfully created and saved to Database! You can now log in.');
                window.location.href = 'login.html';
            } else {
                let errorMsg = response.data?.message || 'Registration failed.';
                if (response.data?.errors) {
                    const errorObj = response.data.errors;
                    const errorMessages = Object.entries(errorObj).map(([field, err]) => {
                        const msg = Array.isArray(err) ? err.join(' ') : String(err);
                        return `${field}: ${msg}`;
                    });
                    if (errorMessages.length > 0) {
                        errorMsg = errorMessages.join('\n');
                    }
                }
                showError(confirmPasswordInput, errors.confirmPassword, errorMsg);
            }
        } catch (error) {
            showError(confirmPasswordInput, errors.confirmPassword, error.message || 'Something went wrong.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
});