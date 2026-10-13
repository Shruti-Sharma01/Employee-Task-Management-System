/**
 * js/forgot-password.js
 * 3-Step OTP-based Password Reset Flow:
 *   Step 1 → Enter email   → POST /api/auth/password-reset/request/
 *   Step 2 → Enter OTP     → POST /api/auth/password-reset/verify/
 *   Step 3 → New password  → POST /api/auth/password-reset/confirm/
 */

document.addEventListener('DOMContentLoaded', () => {

    // ----------------------------------------------------------------
    // Elements
    // ----------------------------------------------------------------
    const requestForm      = document.getElementById('requestResetForm');
    const otpVerifyForm    = document.getElementById('otpVerifyForm');
    const newPasswordForm  = document.getElementById('newPasswordForm');
    const successState     = document.getElementById('successState');
    const footerNav        = document.getElementById('footerNav');

    const resetEmailInput  = document.getElementById('resetEmail');
    const emailError       = document.getElementById('emailError');
    const sendCodeBtn      = document.getElementById('sendCodeBtn');

    const otpSentEmail     = document.getElementById('otpSentEmail');
    const otpInput         = document.getElementById('otpInput');
    const otpError         = document.getElementById('otpError');
    const verifyOtpBtn     = document.getElementById('verifyOtpBtn');
    const resendOtpBtn     = document.getElementById('resendOtpBtn');
    const otpTimerCountdown= document.getElementById('otpTimerCountdown');

    const verifiedEmailText    = document.getElementById('verifiedEmailText');
    const newPasswordInput     = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    const newPasswordError     = document.getElementById('newPasswordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');
    const updatePasswordBtn    = document.getElementById('updatePasswordBtn');

    const strengthBar  = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');
    const pageTitle    = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');

    // State
    let currentEmail  = '';
    let resetToken    = '';
    let otpTimerInterval = null;
    let resendCooldownInterval = null;

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
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

    const setLoading = (btn, loading, originalText) => {
        btn.disabled = loading;
        btn.textContent = loading ? 'Please wait...' : originalText;
    };

    const showStep = (stepForm) => {
        [requestForm, otpVerifyForm, newPasswordForm, successState].forEach(f => {
            if (f) f.classList.add('hidden');
        });
        if (stepForm) stepForm.classList.remove('hidden');
    };

    // ----------------------------------------------------------------
    // OTP Countdown Timer (10 minutes)
    // ----------------------------------------------------------------
    const startOtpTimer = (durationSeconds = 600) => {
        clearInterval(otpTimerInterval);
        let remaining = durationSeconds;

        const updateDisplay = () => {
            const m = Math.floor(remaining / 60).toString().padStart(2, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            if (otpTimerCountdown) otpTimerCountdown.textContent = `${m}:${s}`;
        };

        updateDisplay();
        otpTimerInterval = setInterval(() => {
            remaining--;
            updateDisplay();
            if (remaining <= 0) {
                clearInterval(otpTimerInterval);
                if (otpTimerCountdown) otpTimerCountdown.textContent = '00:00';
                showError(otpInput, otpError, 'OTP has expired. Please click "Resend OTP".');
                if (verifyOtpBtn) verifyOtpBtn.disabled = true;
            }
        }, 1000);
    };

    // Resend cooldown (30 seconds)
    const startResendCooldown = (seconds = 30) => {
        clearInterval(resendCooldownInterval);
        if (!resendOtpBtn) return;
        resendOtpBtn.disabled = true;
        let remaining = seconds;
        resendOtpBtn.textContent = `Resend in ${remaining}s`;

        resendCooldownInterval = setInterval(() => {
            remaining--;
            resendOtpBtn.textContent = `Resend in ${remaining}s`;
            if (remaining <= 0) {
                clearInterval(resendCooldownInterval);
                resendOtpBtn.disabled = false;
                resendOtpBtn.textContent = 'Resend OTP';
            }
        }, 1000);
    };

    // ----------------------------------------------------------------
    // Show/Hide password toggle
    // ----------------------------------------------------------------
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

    // ----------------------------------------------------------------
    // Password Strength Meter
    // ----------------------------------------------------------------
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
        } else if (score <= 3) {
            strengthBar.style.width = '66%';
            strengthBar.style.backgroundColor = '#F59E0B';
            strengthText.textContent = 'Strength: Intermediate';
            strengthText.style.color = '#D97706';
        } else {
            strengthBar.style.width = '100%';
            strengthBar.style.backgroundColor = '#10B981';
            strengthText.textContent = 'Strength: Strong ✓';
            strengthText.style.color = '#10B981';
        }
    };

    if (newPasswordInput) newPasswordInput.addEventListener('input', updatePasswordStrength);

    // Clear errors on input
    if (resetEmailInput) resetEmailInput.addEventListener('input', () => clearError(resetEmailInput, emailError));
    if (otpInput) {
        otpInput.addEventListener('input', () => {
            // Only allow digits
            otpInput.value = otpInput.value.replace(/\D/g, '').slice(0, 6);
            clearError(otpInput, otpError);
        });
    }
    if (newPasswordInput) newPasswordInput.addEventListener('input', () => clearError(newPasswordInput, newPasswordError));
    if (confirmNewPasswordInput) confirmNewPasswordInput.addEventListener('input', () => clearError(confirmNewPasswordInput, confirmPasswordError));

    // ----------------------------------------------------------------
    // STEP 1: Send OTP to email
    // ----------------------------------------------------------------
    const sendOtp = async (email) => {
        const response = await apiRequest('/auth/password-reset/request/', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return response;
    };

    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = resetEmailInput.value.trim().toLowerCase();
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email) {
            showError(resetEmailInput, emailError, 'Email address is required.');
            return;
        }
        if (!pattern.test(email)) {
            showError(resetEmailInput, emailError, 'Please enter a valid email address.');
            return;
        }

        setLoading(sendCodeBtn, true, 'Send OTP');

        try {
            const response = await sendOtp(email);

            if (response.ok && response.data?.success) {
                currentEmail = email;

                // Move to OTP step
                showStep(otpVerifyForm);
                pageTitle.textContent = 'Enter OTP';
                pageSubtitle.textContent = 'Enter the 6-digit code sent to your email.';
                if (otpSentEmail) otpSentEmail.textContent = email;

                // Start countdown
                startOtpTimer(600);
                startResendCooldown(30);

                if (otpInput) {
                    otpInput.value = '';
                    otpInput.focus();
                }
                if (verifyOtpBtn) verifyOtpBtn.disabled = false;
            } else {
                const msg = response.data?.errors?.email?.[0]
                    || response.data?.message
                    || 'No account found with this email.';
                showError(resetEmailInput, emailError, msg);
            }
        } catch (err) {
            showError(resetEmailInput, emailError, 'Could not connect. Please ensure the server is running.');
        } finally {
            setLoading(sendCodeBtn, false, 'Send OTP');
        }
    });

    // ----------------------------------------------------------------
    // Resend OTP
    // ----------------------------------------------------------------
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', async () => {
            if (!currentEmail) return;

            setLoading(resendOtpBtn, true, 'Resend OTP');
            clearError(otpInput, otpError);

            try {
                const response = await sendOtp(currentEmail);
                if (response.ok && response.data?.success) {
                    otpInput.value = '';
                    startOtpTimer(600);
                    startResendCooldown(30);
                    if (verifyOtpBtn) verifyOtpBtn.disabled = false;
                    otpInput.focus();
                } else {
                    showError(otpInput, otpError, 'Could not resend OTP. Please try again.');
                }
            } catch (err) {
                showError(otpInput, otpError, 'Network error. Please try again.');
            } finally {
                setLoading(resendOtpBtn, false, 'Resend OTP');
            }
        });
    }

    // ----------------------------------------------------------------
    // STEP 2: Verify OTP
    // ----------------------------------------------------------------
    otpVerifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const otp = (otpInput.value || '').trim();

        if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
            showError(otpInput, otpError, 'Please enter the 6-digit OTP sent to your email.');
            return;
        }

        setLoading(verifyOtpBtn, true, 'Verify OTP');

        try {
            const response = await apiRequest('/auth/password-reset/verify/', {
                method: 'POST',
                body: JSON.stringify({ email: currentEmail, otp })
            });

            if (response.ok && response.data?.success) {
                resetToken = response.data.data?.reset_token || '';
                clearInterval(otpTimerInterval);

                // Move to new password step
                showStep(newPasswordForm);
                pageTitle.textContent = 'Create New Password';
                pageSubtitle.textContent = 'Choose a strong password for your account.';
                if (verifiedEmailText) verifiedEmailText.textContent = currentEmail;
                if (newPasswordInput) newPasswordInput.focus();
            } else {
                const msg = response.data?.errors?.otp?.[0]
                    || response.data?.errors?.email?.[0]
                    || response.data?.message
                    || 'Invalid OTP. Please try again.';
                showError(otpInput, otpError, msg);
            }
        } catch (err) {
            showError(otpInput, otpError, 'Network error. Please check the server and try again.');
        } finally {
            setLoading(verifyOtpBtn, false, 'Verify OTP');
        }
    });

    // ----------------------------------------------------------------
    // STEP 3: Set New Password
    // ----------------------------------------------------------------
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

        setLoading(updatePasswordBtn, true, 'Update Password');

        try {
            const response = await apiRequest('/auth/password-reset/confirm/', {
                method: 'POST',
                body: JSON.stringify({
                    email: currentEmail,
                    reset_token: resetToken,
                    new_password: newPass,
                    confirm_password: confirmPass
                })
            });

            if (response.ok && response.data?.success) {
                // Success!
                showStep(successState);
                pageTitle.classList.add('hidden');
                pageSubtitle.classList.add('hidden');
                footerNav.classList.add('hidden');
            } else {
                const errors = response.data?.errors || {};
                const msg = errors.new_password?.[0]
                    || errors.confirm_password?.[0]
                    || errors.reset_token?.[0]
                    || response.data?.message
                    || 'Failed to reset password. Please try again.';
                showError(newPasswordInput, newPasswordError, msg);
            }
        } catch (err) {
            showError(newPasswordInput, newPasswordError, 'Network error. Please check the server and try again.');
        } finally {
            setLoading(updatePasswordBtn, false, 'Update Password');
        }
    });

});