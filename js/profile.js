/**
 * js/profile.js - Fixed & Stabilized
 */

// Bulletproof SVG default avatar (guaranteed never to 404 or trigger error loops)
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23E2E8F0'/><circle cx='50' cy='38' r='20' fill='%2394A3B8'/><path d='M50 62c-20 0-36 12-36 28h72c0-16-16-28-36-28z' fill='%2394A3B8'/></svg>";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Safe Auth Check (creates default session if opened standalone to prevent redirect bouncing)
    const currentUser = getCurrentUser();

    initNavigation();
    initLogout();
    loadProfileData(currentUser);
    
    setupQuickClickAvatar();
    setupModalAvatar();
});

/**
 * Get current session user with safe fallback
 */
function getCurrentUser() {
    const session = localStorage.getItem('etm_current_user');
    if (!session) {
        const defaultUser = {
            username: 'employee',
            fullName: 'Alex Morgan',
            email: 'alex.morgan@company.com',
            department: 'Product Engineering',
            role: 'Software Engineer',
            avatar: DEFAULT_AVATAR
        };
        localStorage.setItem('etm_current_user', JSON.stringify(defaultUser));
        return defaultUser;
    }
    try {
        return JSON.parse(session);
    } catch (e) {
        return null;
    }
}

/**
 * Save updated user
 */
function saveCurrentUser(updatedUser) {
    localStorage.setItem('etm_current_user', JSON.stringify(updatedUser));

    const registeredUsers = JSON.parse(localStorage.getItem('etm_users') || '[]');
    const index = registeredUsers.findIndex(u => u.username === updatedUser.username);
    if (index !== -1) {
        registeredUsers[index] = { ...registeredUsers[index], ...updatedUser };
        localStorage.setItem('etm_users', JSON.stringify(registeredUsers));
    }
}

/**
 * Populate Profile Page UI (With Loop-Protected Image Loading)
 */
function loadProfileData(user) {
    const currentUser = user || getCurrentUser();
    if (!currentUser) return;

    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const deptEl = document.getElementById('profileDepartment');
    const roleEl = document.getElementById('profileRole');
    const picEl = document.getElementById('profilePicture');
    const completedCountEl = document.getElementById('profileCompletedCount');

    if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.username;
    if (emailEl) emailEl.textContent = currentUser.email || '—';
    if (deptEl) deptEl.textContent = currentUser.department || '—';
    if (roleEl) roleEl.textContent = currentUser.role || '—';

    // FIX: Set onerror to null first to completely prevent infinite repaint loops
    if (picEl) {
        picEl.onerror = function() {
            this.onerror = null; // Stops loop immediately
            this.src = DEFAULT_AVATAR;
        };
        picEl.src = currentUser.avatar || DEFAULT_AVATAR;
    }

    if (completedCountEl) {
        const tasks = typeof getTasks === 'function' ? getTasks() : [];
        const completedCount = tasks.filter(t => (t.status || '').toLowerCase().trim() === 'completed').length;
        completedCountEl.textContent = completedCount;
    }
}

/**
 * Compress and scale image to lightweight base64 JPEG
 */
function processImageFile(file, maxSize = 250) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            return reject(new Error('Please select an image file (JPG, PNG, WebP).'));
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => reject(new Error('Failed to load image.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Toast Notification for Quick Click confirmation
 */
function showToast(message) {
    let toast = document.getElementById('profileToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'profileToast';
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background-color: #1E2A44;
            color: #FFFFFF;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            font-size: 0.9rem;
            z-index: 1000;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, 2500);
}

/**
 * 1. Quick Click Directly on Profile Picture
 */
function setupQuickClickAvatar() {
    const picEl = document.getElementById('profilePicture');
    if (!picEl) return;

    picEl.style.cursor = 'pointer';
    picEl.title = 'Click to change profile picture';

    const quickInput = document.createElement('input');
    quickInput.type = 'file';
    quickInput.accept = 'image/*';
    quickInput.style.display = 'none';
    document.body.appendChild(quickInput);

    picEl.addEventListener('click', () => {
        quickInput.click();
    });

    quickInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
            const base64Data = await processImageFile(file);
            const user = getCurrentUser();
            user.avatar = base64Data;

            saveCurrentUser(user);
            loadProfileData(user);
            showToast('✓ Profile picture updated!');
        } catch (err) {
            alert(err.message);
        } finally {
            quickInput.value = '';
        }
    });
}

/**
 * 2. Edit Profile Modal
 */
function setupModalAvatar() {
    const editBtn = document.getElementById('editProfileBtn');
    if (!editBtn) return;

    let modal = document.getElementById('editProfileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'editProfileModal';
        modal.style.display = 'none';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 460px; width: 92%;">
                <h3 style="margin-bottom: var(--space-md);">Edit Profile</h3>

                <form id="editProfileForm">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: var(--space-md); padding-bottom: var(--space-md); border-bottom: 1px solid var(--color-border);">
                        <img id="modalAvatarPreview" src="${DEFAULT_AVATAR}" 
                             style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border);" 
                             alt="Preview">
                        <div>
                            <label for="modalFileInput" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem; cursor: pointer; display: inline-block;">
                                Upload Photo
                            </label>
                            <input type="file" id="modalFileInput" accept="image/*" style="display: none;">

                            <button type="button" id="resetAvatarBtn" class="btn" style="padding: 6px 10px; font-size: 0.85rem; color: var(--color-danger); background: none; border: none; cursor: pointer;">
                                Reset Default
                            </button>
                            <div id="modalAvatarError" style="color: var(--color-danger); font-size: 0.75rem; margin-top: 4px;"></div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="editFullName">Full Name</label>
                        <input type="text" id="editFullName" required>
                    </div>

                    <div class="form-group">
                        <label for="editEmail">Email Address</label>
                        <input type="email" id="editEmail" required>
                    </div>

                    <div class="form-group">
                        <label for="editDepartment">Department</label>
                        <input type="text" id="editDepartment" required>
                    </div>

                    <div class="form-group">
                        <label for="editRole">Role</label>
                        <input type="text" id="editRole" required>
                    </div>

                    <div class="modal-actions" style="margin-top: var(--space-lg);">
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                        <button type="button" class="btn btn-secondary" id="cancelEditProfileBtn">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const form = document.getElementById('editProfileForm');
    const cancelBtn = document.getElementById('cancelEditProfileBtn');
    const modalFileInput = document.getElementById('modalFileInput');
    const modalAvatarPreview = document.getElementById('modalAvatarPreview');
    const resetAvatarBtn = document.getElementById('resetAvatarBtn');
    const modalAvatarError = document.getElementById('modalAvatarError');

    let tempAvatar = null;

    editBtn.addEventListener('click', () => {
        const user = getCurrentUser();
        if (!user) return;

        tempAvatar = user.avatar || DEFAULT_AVATAR;
        modalAvatarPreview.src = tempAvatar;
        modalAvatarError.textContent = '';

        document.getElementById('editFullName').value = user.fullName || '';
        document.getElementById('editEmail').value = user.email || '';
        document.getElementById('editDepartment').value = user.department || '';
        document.getElementById('editRole').value = user.role || '';

        modal.style.display = 'flex';
    });

    const closeModal = () => {
        modal.style.display = 'none';
        tempAvatar = null;
    };

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    modalFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        modalAvatarError.textContent = '';
        try {
            tempAvatar = await processImageFile(file);
            modalAvatarPreview.src = tempAvatar;
        } catch (err) {
            modalAvatarError.textContent = err.message;
        } finally {
            modalFileInput.value = '';
        }
    });

    resetAvatarBtn.addEventListener('click', () => {
        tempAvatar = DEFAULT_AVATAR;
        modalAvatarPreview.src = tempAvatar;
        modalAvatarError.textContent = '';
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const user = getCurrentUser();
        const updatedUser = {
            ...user,
            avatar: tempAvatar || user.avatar || DEFAULT_AVATAR,
            fullName: document.getElementById('editFullName').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            department: document.getElementById('editDepartment').value.trim(),
            role: document.getElementById('editRole').value.trim()
        };

        saveCurrentUser(updatedUser);
        loadProfileData(updatedUser);
        closeModal();
        showToast('✓ Profile saved successfully!');
    });
}

function initLogout() {
    const logoutLinks = document.querySelectorAll('a[href="login.html"]');
    logoutLinks.forEach(link => {
        link.addEventListener('click', () => {
            localStorage.removeItem('etm_current_user');
        });
    });
}

function initNavigation() {
    const navToggle = document.getElementById('navToggle');
    const sidebar = document.getElementById('sidebar');

    if (navToggle && sidebar) {
        navToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
}