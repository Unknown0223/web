// Users Module (MODERNIZED)
// Foydalanuvchilarni boshqarish (CRUD, sessions, credentials, telegram)

import { state } from './state.js';
import { DOM } from './dom.js';
import { safeFetch, fetchUsers, fetchPendingUsers } from './api.js';
import { showToast, parseUserAgent, showConfirmDialog } from './utils.js';

// Selected users for bulk actions
let selectedUsers = new Set();

// Current filters
let currentFilters = {
    search: '',
    role: '',
    accountStatus: '',  // active, pending, inactive
    onlineStatus: ''     // online, offline
};

// Brendlarni yuklash va render qilish
async function loadBrandsForUser(userId = null) {
    try {
        // Barcha brendlarni olish
        const res = await safeFetch('/api/brands');
        if (!res.ok) throw new Error('Brendlarni yuklashda xatolik');
        const allBrands = await res.json();
        
        // Agar userId berilgan bo'lsa, foydalanuvchining brendlarini olish
        let userBrands = [];
        if (userId) {
            const userBrandsRes = await safeFetch(`/api/brands/user/${userId}`);
            if (userBrandsRes.ok) {
                const data = await userBrandsRes.json();
                userBrands = data.brands || [];
            }
        }
        
        // Brendlar ro'yxatini render qilish - user-brands-list yoki approval-brands-list
        const container = document.getElementById('user-brands-list') || document.getElementById('approval-brands-list');
        if (!container) return;
        
        if (allBrands.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center;">Avval brendlar yarating</p>';
            return;
        }
        
        const allChecked = allBrands.every(brand => userBrands.some(ub => ub.id === brand.id));
        
        let html = `
            <label class="checkbox-item" style="
                display: flex;
                align-items: center;
                padding: 10px;
                border-radius: 6px;
                cursor: pointer;
                background: rgba(79, 172, 254, 0.1);
                border: 1px solid rgba(79, 172, 254, 0.3);
                margin-bottom: 10px;
                font-weight: 600;
            ">
                <input type="checkbox" class="select-all-brands-checkbox" ${allChecked ? 'checked' : ''} 
                    style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
                <span style="font-size: 14px; color: #4facfe;">✓ Barchasi</span>
            </label>
            <div style="border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;"></div>
        `;
        
        html += allBrands.map(brand => {
            const isChecked = userBrands.some(ub => ub.id === brand.id);
            const brandEmoji = brand.emoji || '🏢';
            const brandColor = brand.color || '#4facfe';
            
            return `
                <label class="checkbox-item brand-checkbox-label" style="
                    display: flex;
                    align-items: center;
                    padding: 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background 0.2s;
                ">
                    <input type="checkbox" name="user-brand" value="${brand.id}" ${isChecked ? 'checked' : ''} 
                        class="brand-checkbox" style="margin-right: 10px; width: 16px; height: 16px; cursor: pointer;">
                    <span style="font-size: 20px; margin-right: 8px;">${brandEmoji}</span>
                    <span style="font-size: 14px; color: ${brandColor};">${brand.name}</span>
                </label>
            `;
        }).join('');
        
        container.innerHTML = html;
        
        // Barchasi checkbox event listener
        const selectAllCheckbox = container.querySelector('.select-all-brands-checkbox');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = container.querySelectorAll('.brand-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                });
            });
        }
        
        // Individual checkbox event listener
        const brandCheckboxes = container.querySelectorAll('.brand-checkbox');
        brandCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(brandCheckboxes).every(checkbox => checkbox.checked);
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = allChecked;
                }
            });
        });
        
        // Hover effects
        container.querySelectorAll('.brand-checkbox-label').forEach(label => {
            label.addEventListener('mouseenter', () => {
                label.style.background = 'rgba(255,255,255,0.05)';
            });
            label.addEventListener('mouseleave', () => {
                label.style.background = 'transparent';
            });
        });
    } catch (error) {
        // console.error('Brendlarni yuklash xatosi:', error);
        showToast('Brendlarni yuklashda xatolik', 'error');
    }
}

// Modern render function with filters
export function renderModernUsers() {
    if (!state.users || !DOM.userListContainer) return;

    // Apply filters
    let filteredUsers = state.users.filter(user => {
        // Super admin'ni faqat super admin o'zi ko'rsin
        if (user.role === 'super_admin' && state.currentUser?.role !== 'super_admin') {
            return false;
        }
        
        // Role filter
        if (currentFilters.role && user.role !== currentFilters.role) return false;

        // Account Status filter
        if (currentFilters.accountStatus) {
            if (currentFilters.accountStatus === 'active' && user.status !== 'active') return false;
            if (currentFilters.accountStatus === 'pending' && !user.status.startsWith('pending')) return false;
            if (currentFilters.accountStatus === 'inactive' && user.status !== 'blocked' && user.status !== 'archived') return false;
        }

        // Online Status filter
        if (currentFilters.onlineStatus) {
            if (currentFilters.onlineStatus === 'online' && !user.is_online) return false;
            if (currentFilters.onlineStatus === 'offline' && user.is_online) return false;
        }

        return true;
    });

    // Update statistics
    updateUsersStatistics();

    // Render
    if (filteredUsers.length === 0) {
        DOM.userListContainer.innerHTML = '<div class="empty-state"><i data-feather="users"></i><p>Foydalanuvchilar topilmadi</p></div>';
        feather.replace();
        return;
    }

    DOM.userListContainer.innerHTML = filteredUsers.map(user => renderModernUserCard(user)).join('');
    feather.replace();
}

// Render single modern user card
function renderModernUserCard(user) {
    const isOnline = user.is_online;
    const statusIndicator = isOnline ? 'online' : 'offline';
    
    // Get initials
    const initials = (user.fullname || user.username || 'U')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    // Status badge
    const userStatus = user.status === 'blocked' || user.status === 'archived' ? 'inactive' : 
                      user.status.startsWith('pending') ? 'pending' : 'active';

    return `
        <div class="user-card" data-user-id="${user.id}">
            <div class="user-card-header">
                <input type="checkbox" class="user-card-checkbox" 
                       data-user-id="${user.id}"
                       onchange="window.toggleUserSelection(${user.id}, this)">
                
                <div class="user-card-avatar">
                    ${initials}
                    <div class="user-card-status-indicator ${statusIndicator}"></div>
                </div>

                <div class="user-card-info">
                    <div class="user-card-name">
                        ${user.fullname || user.username}
                    </div>
                    <div class="user-card-username">@${user.username}</div>
                    <div class="user-card-badges">
                        <span class="user-badge user-badge-${user.role}">
                            <i data-feather="${user.role === 'admin' ? 'shield' : 'user'}"></i>
                            ${user.role}
                        </span>
                        <span class="user-badge user-badge-${userStatus}">
                            <i data-feather="${userStatus === 'active' ? 'check-circle' : userStatus === 'pending' ? 'clock' : 'x-circle'}"></i>
                            ${userStatus === 'active' ? 'Aktiv' : userStatus === 'pending' ? 'Kutmoqda' : 'Noaktiv'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="user-card-details">
                ${user.email ? `
                <div class="user-card-detail-item">
                    <i data-feather="mail"></i>
                    <span>${user.email}</span>
                </div>
                ` : ''}
                ${user.phone ? `
                <div class="user-card-detail-item">
                    <i data-feather="phone"></i>
                    <span>${user.phone}</span>
                </div>
                ` : ''}
                <div class="user-card-detail-item">
                    <i data-feather="calendar"></i>
                    <span>Ro'yxatdan o'tgan: ${new Date(user.created_at).toLocaleDateString('uz-UZ')}</span>
                </div>
                <div class="user-card-detail-item">
                    <i data-feather="activity"></i>
                    <span>Sessiyalar: <strong>${user.active_sessions_count || 0}</strong></span>
                </div>
                ${user.telegram_username ? `
                <div class="user-card-detail-item">
                    <i data-feather="send"></i>
                    <span>Telegram: <strong>@${user.telegram_username}</strong></span>
                </div>
                ` : ''}
            </div>

            <div class="user-card-actions">
                <button class="user-card-action-btn edit-user-btn" data-id="${user.id}" title="Tahrirlash" data-permission="users:edit">
                    <i data-feather="edit-2"></i>
                    Tahrirlash
                </button>
                <button class="user-card-action-btn manage-sessions-btn" data-id="${user.id}" data-username="${user.username}" title="Sessiyalar" data-permission="users:manage_sessions">
                    <i data-feather="monitor"></i>
                    Sessiyalar
                </button>
                ${state.currentUser.id !== user.id ? `
                <button class="user-card-action-btn danger ${user.status === 'active' ? 'deactivate-user-btn' : 'activate-user-btn'}" 
                        data-id="${user.id}" 
                        title="${user.status === 'active' ? 'Bloklash' : 'Aktivlashtirish'}" 
                        data-permission="users:change_status">
                    <i data-feather="${user.status === 'active' ? 'eye-off' : 'eye'}"></i>
                    ${user.status === 'active' ? 'Bloklash' : 'Aktivlashtirish'}
                </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Update statistics cards
function updateUsersStatistics() {
    if (!state.users) return;

    const totalUsers = state.users.length;
    const activeUsers = state.users.filter(u => u.status === 'active').length;
    const pendingUsers = state.users.filter(u => u.status.startsWith('pending')).length;
    const inactiveUsers = state.users.filter(u => u.status === 'blocked' || u.status === 'archived').length;

    const activePercent = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    const inactivePercent = totalUsers > 0 ? Math.round((inactiveUsers / totalUsers) * 100) : 0;

    // Update DOM
    document.getElementById('total-users-count').textContent = totalUsers;
    document.getElementById('active-users-count').textContent = activeUsers;
    document.getElementById('pending-users-count').textContent = pendingUsers;
    document.getElementById('inactive-users-count').textContent = inactiveUsers;
    
    document.getElementById('active-users-percent').textContent = `${activePercent}%`;
    document.getElementById('inactive-users-percent').textContent = `${inactivePercent}%`;

    // Update role counts
    const roleCounts = {};
    state.users.forEach(user => {
        const role = user.role || 'user';
        roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    // Update role count badges
    const roleCountAll = document.getElementById('role-count-all');
    if (roleCountAll) roleCountAll.textContent = totalUsers;

    Object.keys(roleCounts).forEach(role => {
        const countEl = document.getElementById(`role-count-${role}`);
        if (countEl) countEl.textContent = roleCounts[role];
    });

    // Update account status count badges
    const accountStatusCountAll = document.getElementById('account-status-count-all');
    if (accountStatusCountAll) accountStatusCountAll.textContent = totalUsers;
    
    const accountStatusCountActive = document.getElementById('account-status-count-active');
    if (accountStatusCountActive) accountStatusCountActive.textContent = activeUsers;
    
    const accountStatusCountPending = document.getElementById('account-status-count-pending');
    if (accountStatusCountPending) accountStatusCountPending.textContent = pendingUsers;
    
    const accountStatusCountInactive = document.getElementById('account-status-count-inactive');
    if (accountStatusCountInactive) accountStatusCountInactive.textContent = inactiveUsers;

    // Update online status count badges
    const onlineUsers = state.users.filter(u => u.is_online).length;
    const offlineUsers = totalUsers - onlineUsers;
    
    const onlineStatusCountAll = document.getElementById('online-status-count-all');
    if (onlineStatusCountAll) onlineStatusCountAll.textContent = totalUsers;
    
    const onlineStatusCountOnline = document.getElementById('online-status-count-online');
    if (onlineStatusCountOnline) onlineStatusCountOnline.textContent = onlineUsers;
    
    const onlineStatusCountOffline = document.getElementById('online-status-count-offline');
    if (onlineStatusCountOffline) onlineStatusCountOffline.textContent = offlineUsers;
}

// OLD FUNCTION (kept for compatibility)
export function renderUsersByStatus(status) {
    // Use new modern render with status filter
    currentFilters.status = status === 'active' ? 'active' : 
                            status === 'pending' ? 'pending' : 
                            status === 'inactive' ? 'inactive' : '';
    renderModernUsers();
}



export function renderPendingUsers() {
    // Check if modern requests section exists
    const modernContainer = document.getElementById('pending-users-list');
    if (modernContainer && modernContainer.classList.contains('requests-grid')) {
        // Use modern rendering
        renderModernRequests();
        return;
    }
    
    // Legacy rendering (old style)
    if (!DOM.pendingUsersList || !state.pendingUsers) return;

    if (DOM.requestsCountBadge) {
        const count = state.pendingUsers.length;
        DOM.requestsCountBadge.textContent = count;
        DOM.requestsCountBadge.classList.toggle('hidden', count === 0);
    }

    if (state.pendingUsers.length === 0) {
        DOM.pendingUsersList.innerHTML = '<div class="empty-state">Tasdiqlanishini kutayotgan so\'rovlar yo\'q.</div>';
        return;
    }

    DOM.pendingUsersList.innerHTML = state.pendingUsers.map(user => {
        const isInProcess = user.status === 'status_in_process';
        const statusText = user.status === 'pending_telegram_subscription'
            ? '<span style="color: var(--yellow-color);">Botga obuna bo\'lishini kutmoqda</span>'
            : isInProcess
                ? '<span style="color: var(--orange-color);">Bot orqali tasdiqlanmoqda...</span>'
                : '<span style="color: var(--cyan-color);">Admin tasdig\'ini kutmoqda</span>';

        return `
        <div class="user-item">
            <div class="user-avatar"><i data-feather="user-plus"></i></div>
            <div class="user-details">
                <div class="username">${user.fullname || 'Nomsiz'} (@${user.username})</div>
                <div class="user-meta">
                    <span>${statusText}</span> |
                    <span>Sana: ${new Date(user.created_at).toLocaleDateString('uz-UZ')}</span>
                </div>
            </div>
            <div class="item-actions">
                ${!isInProcess ? `
                    <button class="btn btn-success btn-sm approve-user-btn" data-id="${user.id}" data-username="${user.username}" title="Tasdiqlash"><i data-feather="check"></i> Tasdiqlash</button>
                    <button class="btn btn-danger btn-sm reject-user-btn" data-id="${user.id}" title="Rad etish"><i data-feather="x"></i> Rad etish</button>
                ` : ''}
            </div>
        </div>
    `;
    }).join('');
    feather.replace();
}

export function toggleLocationVisibilityForUserForm() {
    const role = DOM.userRoleSelect?.value;
    const locationsDisplay = (role === 'operator' || role === 'manager') ? 'block' : 'none';
    const brandsDisplay = (role === 'manager') ? 'block' : 'none';
    if (DOM.userLocationsGroup) DOM.userLocationsGroup.style.display = locationsDisplay;
    const brandsGroup = document.getElementById('user-brands-group');
    if (brandsGroup) brandsGroup.style.display = brandsDisplay;
    if (brandsDisplay === 'block') {
        loadBrandsForUser();
    }
}

export async function toggleLocationVisibilityForApprovalForm() {
    const role = DOM.approvalRoleSelect?.value;
    
    // Rol talablarini state'dan olish
    const roleData = state.roles.find(r => r.role_name === role);
    const requiresLocations = roleData ? (roleData.requires_locations || false) : false;
    const requiresBrands = roleData ? (roleData.requires_brands || false) : false;
    
    const locationsDisplay = requiresLocations ? 'block' : 'none';
    const brandsDisplay = requiresBrands ? 'block' : 'none';
    
    if (DOM.approvalLocationsGroup) DOM.approvalLocationsGroup.style.display = locationsDisplay;
    const approvalBrandsGroup = document.getElementById('approval-brands-group');
    if (approvalBrandsGroup) approvalBrandsGroup.style.display = brandsDisplay;
    
    // Filiallar kerak bo'lsa, filiallarni yuklash
    if (locationsDisplay === 'block') {
        await loadLocationsForApproval();
    }
    
    // Brendlar kerak bo'lsa, brendlarni yuklash
    if (brandsDisplay === 'block') {
        await loadBrandsForApproval();
    }
}

async function loadLocationsForApproval() {
    try {
        const settingsRes = await safeFetch('/api/settings');
        if (!settingsRes.ok) throw new Error('Sozlamalarni yuklashda xatolik');
        const settings = await settingsRes.json();
        const locations = settings.app_settings?.locations || [];
        
        if (DOM.approvalLocationsCheckboxList) {
            DOM.approvalLocationsCheckboxList.innerHTML = locations.map(loc => `
                <label class="checkbox-item">
                    <input type="checkbox" value="${loc}" name="approval-location">
                    <span>${loc}</span>
                </label>
            `).join('');
        }
    } catch (error) {
        console.error('Filiallarni yuklashda xatolik:', error);
    }
}

async function loadBrandsForApproval() {
    try {
        const res = await safeFetch('/api/brands');
        if (!res.ok) throw new Error('Brendlarni yuklashda xatolik');
        const allBrands = await res.json();
        
        const approvalBrandsList = document.getElementById('approval-brands-list');
        if (approvalBrandsList) {
            approvalBrandsList.innerHTML = allBrands.map(brand => `
                <label class="checkbox-item" style="display: block; margin-bottom: 8px;">
                    <input type="checkbox" value="${brand.id}" name="approval-brand">
                    <span>${brand.emoji || '🏷️'} ${brand.name}</span>
                </label>
            `).join('');
        }
    } catch (error) {
        console.error('Brendlarni yuklashda xatolik:', error);
    }
}

export function openUserModalForAdd() {
    DOM.userForm?.reset();
    if (DOM.editUserIdInput) DOM.editUserIdInput.value = '';
    if (DOM.userModalTitle) DOM.userModalTitle.textContent = 'Yangi Foydalanuvchi Qo\'shish';
    if (DOM.passwordGroup) DOM.passwordGroup.style.display = 'block';
    if (DOM.passwordInput) DOM.passwordInput.required = true;
    if (DOM.userRoleSelect) {
        DOM.userRoleSelect.innerHTML = state.roles
            .filter(r => r.role_name !== 'admin' && r.role_name !== 'super_admin') // Admin va super admin yaratish mumkin emas
            .map(r => 
                `<option value="${r.role_name}">${r.role_name}</option>`
            ).join('');
    }
    toggleLocationVisibilityForUserForm();
    DOM.userFormModal?.classList.remove('hidden');
}

export async function openUserModalForEdit(userId) {
    const user = state.users.find(u => u.id == userId);
    if (!user || !DOM.userForm) return;
    
    DOM.userForm.reset();
    DOM.editUserIdInput.value = user.id;
    DOM.userModalTitle.textContent = `"${user.username}"ni Tahrirlash`;
    DOM.usernameInput.value = user.username;
    DOM.fullnameInput.value = user.fullname || '';
    DOM.passwordGroup.style.display = 'none';
    DOM.passwordInput.required = false;
    DOM.userRoleSelect.innerHTML = state.roles
        .filter(r => r.role_name !== 'admin' && r.role_name !== 'super_admin') // Admin va super admin yaratish mumkin emas
        .map(r => 
            `<option value="${r.role_name}" ${user.role === r.role_name ? 'selected' : ''}>${r.role_name}</option>`
        ).join('');
    DOM.deviceLimitInput.value = user.device_limit;
    
    document.querySelectorAll('#locations-checkbox-list input').forEach(cb => {
        cb.checked = user.locations.includes(cb.value);
    });
    
    toggleLocationVisibilityForUserForm();
    
    // Agar menejer bo'lsa, brendlarni yuklash
    if (user.role === 'manager') {
        await loadBrandsForUser(userId);
    }
    
    DOM.userFormModal.classList.remove('hidden');
}

export async function handleUserFormSubmit(e) {
    e.preventDefault();
    const userId = DOM.editUserIdInput.value;
    const isEditing = !!userId;
    
    const data = {
        username: DOM.usernameInput.value.trim(),
        fullname: DOM.fullnameInput.value.trim(),
        role: DOM.userRoleSelect.value,
        device_limit: parseInt(DOM.deviceLimitInput.value) || 1,
        locations: Array.from(document.querySelectorAll('#locations-checkbox-list input:checked'))
            .map(cb => cb.value)
    };
    
    if (!isEditing && DOM.passwordInput.value) {
        data.password = DOM.passwordInput.value;
    }
    
    // Manager uchun brendlarni saqlash
    if (data.role === 'manager') {
        data.brands = Array.from(document.querySelectorAll('#user-brands-list input:checked'))
            .map(cb => parseInt(cb.value));
    }
    
    const url = isEditing ? `/api/users/${userId}` : '/api/users';
    const method = isEditing ? 'PUT' : 'POST';
    
    try {
        const res = await safeFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        showToast(result.message);
        
        // Super admin yaratilganda avtomatik login qilish
        if (result.autoLogin && result.loginData) {
            // Login qilish
            const loginRes = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: result.loginData.username,
                    password: result.loginData.password
                })
            });
            
            if (loginRes.ok) {
                const loginResult = await loginRes.json();
                showToast("Super admin tizimga muvaffaqiyatli kirildi.", false);
                setTimeout(() => {
                    window.location.href = result.redirectUrl || '/admin';
                }, 1000);
                return;
            }
        }
        
        const usersRes = await fetchUsers();
        if (usersRes) {
            state.users = usersRes;
            const activeTab = DOM.userTabs.querySelector('.active').dataset.status;
            renderUsersByStatus(activeTab);
        }
        
        DOM.userFormModal.classList.add('hidden');
    } catch (error) {
        showToast(error.message, true);
    }
}

export async function handleUserActions(e) {
    const button = e.target.closest('button');
    if (!button) return;
    
    const userId = button.dataset.id;
    
    if (button.classList.contains('edit-user-btn')) {
        openUserModalForEdit(userId);
    } else if (button.classList.contains('deactivate-user-btn') || button.classList.contains('activate-user-btn')) {
        const status = button.classList.contains('activate-user-btn') ? 'active' : 'blocked';
        const confirmed = await showConfirmDialog({
            title: status === 'active' ? '✅ Faollashtirish' : '🚫 Bloklash',
            message: `Rostdan ham bu foydalanuvchini ${status === 'active' ? 'aktivlashtirmoqchimisiz' : 'bloklamoqchimisiz'}?`,
            confirmText: status === 'active' ? 'Faollashtirish' : 'Bloklash',
            cancelText: 'Bekor qilish',
            type: status === 'active' ? 'success' : 'danger',
            icon: status === 'active' ? 'user-check' : 'user-x'
        });
        
        if (confirmed) {
            try {
                const res = await safeFetch(`/api/users/${userId}/status`, { 
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                if (!res || !res.ok) throw new Error((await res.json()).message);
                
                const result = await res.json();
                showToast(result.message);
                
                const usersRes = await fetchUsers();
                if (usersRes) {
                    state.users = usersRes;
                    const activeTab = DOM.userTabs.querySelector('.active').dataset.status;
                    renderUsersByStatus(activeTab);
                }
            } catch (error) { 
                showToast(error.message, true); 
            }
        }
    } else if (button.classList.contains('manage-sessions-btn')) {
        const username = button.dataset.username;
        await openSessionsModal(userId, username);
    } else if (button.classList.contains('change-password-btn')) {
        openCredentialsModal(userId, 'password');
    } else if (button.classList.contains('set-secret-word-btn')) {
        openCredentialsModal(userId, 'secret-word');
    } else if (button.classList.contains('connect-telegram-btn')) {
        openTelegramConnectModal(userId);
    }
}

async function openSessionsModal(userId, username) {
    DOM.sessionsModalTitle.textContent = `"${username}"ning Aktiv Sessiyalari`;
    DOM.sessionsListContainer.innerHTML = '<div class="skeleton-item"></div>';
    DOM.sessionsModal.classList.remove('hidden');
    
    try {
        const res = await safeFetch(`/api/users/${userId}/sessions`);
        if (!res || !res.ok) throw new Error('Sessiyalarni yuklab bo\'lmadi');
        const sessions = await res.json();
        
        DOM.sessionsListContainer.innerHTML = sessions.length > 0 ? sessions.map(s => `
            <div class="session-item ${s.is_current ? 'current' : ''}">
                <div class="session-details">
                    <div><strong>IP Manzil:</strong> ${s.ip_address || 'Noma\'lum'}</div>
                    <div><strong>Qurilma:</strong> ${s.user_agent || 'Noma\'lum'}</div>
                    <div><strong>Oxirgi faollik:</strong> ${new Date(s.last_activity).toLocaleString()}</div>
                </div>
                ${!s.is_current 
                    ? `<button class="btn btn-danger btn-sm terminate-session-btn" data-sid="${s.sid}">Tugatish</button>` 
                    : '<span class="badge" style="background-color: var(--green-color);">Joriy</span>'}
            </div>
        `).join('') : '<div class="empty-state">Aktiv sessiyalar topilmadi.</div>';
    } catch (error) {
        DOM.sessionsListContainer.innerHTML = `<div class="empty-state error">${error.message}</div>`;
    }
}

function openCredentialsModal(userId, type) {
    DOM.credentialsForm.reset();
    DOM.credentialsUserIdInput.value = userId;
    DOM.credentialsForm.dataset.type = type;
    
    if (type === 'password') {
        DOM.credentialsModalTitle.textContent = "Parolni O'zgartirish";
        DOM.credentialsInputLabel.textContent = "Yangi Parol";
        DOM.credentialsInput.type = 'password';
        DOM.credentialsInput.minLength = 8;
    } else {
        DOM.credentialsModalTitle.textContent = "Maxfiy So'zni O'rnatish";
        DOM.credentialsInputLabel.textContent = "Yangi Maxfiy So'z";
        DOM.credentialsInput.type = 'text';
        DOM.credentialsInput.minLength = 6;
    }
    
    DOM.credentialsModal.classList.remove('hidden');
}

export async function handleCredentialsFormSubmit(e) {
    e.preventDefault();
    const userId = DOM.credentialsUserIdInput.value;
    const type = DOM.credentialsForm.dataset.type;
    const value = DOM.credentialsInput.value;
    const url = `/api/users/${userId}/${type}`;
    const body = type === 'password' ? { newPassword: value } : { secretWord: value };
    
    try {
        const res = await safeFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        showToast(result.message);
        DOM.credentialsModal.classList.add('hidden');
    } catch (error) {
        showToast(error.message, true);
    }
}

function openTelegramConnectModal(userId) {
    const randomToken = Math.random().toString(36).substring(2, 10);
    const connectCode = `connect_${userId}_${randomToken}`;
    const botUsername = state.settings.telegram_bot_username;
    
    if (!botUsername) {
        return showToast("Iltimos, avval Sozlamalar bo'limida Bot Username'ni kiriting!", true);
    }
    
    const connectLink = `https://t.me/${botUsername}?start=${connectCode}`;
    DOM.telegramConnectLinkInput.value = connectLink;
    DOM.telegramConnectModal.classList.remove('hidden');
}

export function copyTelegramLink() {
    DOM.telegramConnectLinkInput.select();
    document.execCommand('copy');
    showToast("Havola nusxalandi!");
}

// Pending users uchun funksiyalar
export function openApprovalModal(userId, username) {
    DOM.approvalForm.reset();
    DOM.approvalUserIdInput.value = userId;
    DOM.approvalUsernameSpan.textContent = username;
    // Super admin'dan tashqari barcha rollarni ko'rsatish
    DOM.approvalRoleSelect.innerHTML = state.roles
        .filter(r => r.role_name !== 'super_admin') // Super admin yaratish mumkin emas
        .map(r => {
            // Rol nomlarini o'zbek tiliga tarjima qilish
            const roleNames = {
                'admin': 'Admin',
                'manager': 'Menejer',
                'operator': 'Operator'
            };
            const displayName = roleNames[r.role_name] || r.role_name.charAt(0).toUpperCase() + r.role_name.slice(1);
            return `<option value="${r.role_name}">${displayName}</option>`;
        }).join('');
    toggleLocationVisibilityForApprovalForm();
    // Rol tanlanganda filiallar va brendlar maydonlarini ko'rsatish
    toggleLocationVisibilityForApprovalForm();
    
    DOM.approvalModal.classList.remove('hidden');
}

export async function submitUserApproval(e) {
    e.preventDefault();
    const userId = DOM.approvalUserIdInput.value;
    const role = DOM.approvalRoleSelect.value;
    
    // Rol talablarini state'dan olish
    const roleData = state.roles.find(r => r.role_name === role);
    const requiresLocations = roleData ? (roleData.requires_locations || false) : false;
    const requiresBrands = roleData ? (roleData.requires_brands || false) : false;
    
    const data = {
        role: role,
        locations: [],
        brands: []
    };
    
    // Filiallar kerak bo'lsa, tanlangan filiallarni qo'shish
    if (requiresLocations) {
        data.locations = Array.from(document.querySelectorAll('#approval-locations-checkbox-list input:checked'))
            .map(cb => cb.value);
    }
    
    // Brendlar kerak bo'lsa, tanlangan brendlarni qo'shish
    if (requiresBrands) {
        data.brands = Array.from(document.querySelectorAll('#approval-brands-list input:checked'))
            .map(cb => parseInt(cb.value));
    }

    try {
        const res = await safeFetch(`/api/users/${userId}/approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        showToast(result.message);
        
        const [pendingRes, usersRes] = await Promise.all([
            fetchPendingUsers(),
            fetchUsers()
        ]);

        if (pendingRes) {
            state.pendingUsers = pendingRes;
            renderPendingUsers();
        }
        if (usersRes) {
            state.users = usersRes;
            const activeTab = DOM.userTabs.querySelector('.active')?.dataset.status;
            if (activeTab) renderUsersByStatus(activeTab);
        }
        
        DOM.approvalModal.classList.add('hidden');
    } catch (error) {
        showToast(error.message, true);
    }
}

export async function handleUserRejection(userId) {
    try {
        const res = await safeFetch(`/api/users/${userId}/reject`, { method: 'PUT' });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        showToast(result.message);
        
        state.pendingUsers = state.pendingUsers.filter(u => u.id != userId);
        renderPendingUsers();
    } catch (error) {
        showToast(error.message, true);
    }
}

export async function handlePendingUserActions(e) {
    const button = e.target.closest('button');
    if (!button) return;
    
    const userId = button.dataset.id;
    
    if (button.classList.contains('approve-user-btn')) {
        const username = button.dataset.username;
        openApprovalModal(userId, username);
    } else if (button.classList.contains('reject-user-btn')) {
        const confirmed = await showConfirmDialog({
            title: '❌ So\'rovni rad etish',
            message: "Rostdan ham bu foydalanuvchining so'rovini rad etmoqchimisiz?",
            confirmText: 'Rad etish',
            cancelText: 'Bekor qilish',
            type: 'danger',
            icon: 'user-x'
        });
        
        if (confirmed) {
            handleUserRejection(userId);
        }
    }
}

export async function handleSessionTermination(e) {
    const button = e.target.closest('.terminate-session-btn');
    if (!button) return;
    
    const sid = button.dataset.sid;
    const confirmed = await showConfirmDialog({
        title: '🔒 Sessiyani tugatish',
        message: 'Rostdan ham bu sessiyani tugatmoqchimisiz?',
        confirmText: 'Tugatish',
        cancelText: 'Bekor qilish',
        type: 'warning',
        icon: 'log-out'
    });
    
    if (confirmed) {
        try {
            const res = await safeFetch(`/api/sessions/${sid}`, { method: 'DELETE' });
            if (!res || !res.ok) throw new Error((await res.json()).message);
            
            const result = await res.json();
            showToast(result.message);
            
            if (DOM.securityPage.classList.contains('active')) {
                const { fetchAndRenderMySessions } = await import('./security.js');
                fetchAndRenderMySessions();
            } else if (!DOM.sessionsModal.classList.contains('hidden')) {
                button.closest('.session-item').remove();
            }
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

/* ===================================================== */
/* === 👥 YANGI ADMIN FUNKSIYALARI === */
/* ===================================================== */

/**
 * Avatar yaratish (ismdan birinchi harf)
 */
export function createAvatar(fullName) {
    if (!fullName) return '';
    
    const initials = fullName
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    
    // Rang generatsiya (ismga qarab)
    const colors = [
        '#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8',
        '#6f42c1', '#fd7e14', '#e83e8c', '#20c997', '#6610f2'
    ];
    
    const charCode = fullName.charCodeAt(0) + fullName.charCodeAt(fullName.length - 1);
    const colorIndex = charCode % colors.length;
    const backgroundColor = colors[colorIndex];
    
    return `<div class="user-avatar" style="background: ${backgroundColor}">${initials}</div>`;
}

/**
 * Status badge yaratish
 */
export function createStatusBadge(status) {
    const statusMap = {
        'active': { class: 'active', text: 'Faol', icon: '🟢' },
        'pending': { class: 'pending', text: 'Kutilmoqda', icon: '🟡' },
        'inactive': { class: 'inactive', text: 'Nofaol', icon: '🔴' }
    };
    
    const statusInfo = statusMap[status] || statusMap['inactive'];
    
    return `
        <span class="status-badge ${statusInfo.class}">
            <span class="status-dot"></span>
            ${statusInfo.text}
        </span>
    `;
}

/**
 * Quick actions tugmalari
 */
export function createQuickActions(userId) {
    return `
        <div class="quick-actions">
            <button class="action-btn view" onclick="window.viewUserQuick(${userId})" title="Ko'rish">
                <i data-feather="eye"></i>
            </button>
            <button class="action-btn edit" onclick="window.editUserQuick(${userId})" title="Tahrirlash">
                <i data-feather="edit-2"></i>
            </button>
            <button class="action-btn delete" onclick="window.deleteUserQuick(${userId})" title="O'chirish">
                <i data-feather="trash-2"></i>
            </button>
        </div>
    `;
}

/**
 * Telegram status badge
 */
export function createTelegramStatus(telegramId, telegramUsername) {
    const isConnected = telegramId && telegramUsername;
    
    if (isConnected) {
        return `
            <span class="telegram-status connected" title="Telegram ulangan">
                <i data-feather="check-circle" style="width: 12px; height: 12px;"></i>
                @${telegramUsername}
            </span>
        `;
    } else {
        return `
            <span class="telegram-status disconnected" title="Telegram ulanmagan">
                <i data-feather="x-circle" style="width: 12px; height: 12px;"></i>
                Ulanmagan
            </span>
        `;
    }
}

/**
 * Bulk selection barini ko'rsatish
 */
export function toggleUserSelection(userId, checkbox) {
    if (checkbox.checked) {
        selectedUsers.add(userId);
    } else {
        selectedUsers.delete(userId);
    }
    
    updateBulkActionsBar();
}

// Global funktsiya qilish
window.toggleUserSelection = toggleUserSelection;

/**
 * Foydalanuvchi tezkor ko'rish
 */
window.viewUserQuick = async function(userId) {
    const user = state.users.find(u => u.id === userId);
    if (!user) return;
    
    // Modal yaratish
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="user-quick-view">
            <div class="user-quick-view-header">
                ${createAvatar(user.full_name)}
                <div class="user-quick-view-info">
                    <h3>${user.full_name}</h3>
                    ${createStatusBadge(user.status)}
                    ${createTelegramStatus(user.telegram_id, user.telegram_username)}
                </div>
            </div>
            <div class="user-quick-view-body">
                <div class="user-quick-view-stat">
                    <span class="label">👤 Foydalanuvchi nomi:</span>
                    <span class="value">${user.username}</span>
                </div>
                <div class="user-quick-view-stat">
                    <span class="label">🎭 Rol:</span>
                    <span class="value">${user.role_name || 'Yo\'q'}</span>
                </div>
                <div class="user-quick-view-stat">
                    <span class="label">📍 Joylashuv:</span>
                    <span class="value">${user.location_name || 'Yo\'q'}</span>
                </div>
                <div class="user-quick-view-stat">
                    <span class="label">📅 Ro'yxatdan o'tgan:</span>
                    <span class="value">${new Date(user.created_at).toLocaleDateString('uz-UZ')}</span>
                </div>
                <div class="user-quick-view-stat">
                    <span class="label">⏰ Oxirgi faollik:</span>
                    <span class="value">${user.last_active ? new Date(user.last_active).toLocaleString('uz-UZ') : 'Hech qachon'}</span>
                </div>
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                    Yopish
                </button>
                <button class="btn btn-primary" onclick="window.editUserQuick(${userId}); this.closest('.modal-overlay').remove();">
                    Tahrirlash
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    feather.replace();
    
    // Click tashqarida yopish
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

/**
 * Global functions for bulk operations
 */
window.clearSelection = function() {
    selectedUsers.clear();
    document.querySelectorAll('.bulk-select-checkbox').forEach(cb => cb.checked = false);
    updateBulkActionsBar();
}

window.bulkChangeStatus = async function() {
    if (selectedUsers.size === 0) return;
    
    const newStatus = prompt('Yangi holat (active/inactive):');
    if (!newStatus || !['active', 'inactive'].includes(newStatus)) return;
    
    try {
        for (const userId of selectedUsers) {
            await safeFetch(`/api/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
        }
        
        showToast(`✅ ${selectedUsers.size} ta foydalanuvchi holati o'zgartirildi`);
        window.clearSelection();
        await fetchUsers();
        renderUsersByStatus();
    } catch (error) {
        showToast(`❌ Xatolik: ${error.message}`, true);
    }
}

window.bulkAssignRole = async function() {
    if (selectedUsers.size === 0) return;
    
    const roleId = prompt('Rol ID raqamini kiriting:');
    if (!roleId) return;
    
    try {
        for (const userId of selectedUsers) {
            await safeFetch(`/api/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_id: parseInt(roleId) })
            });
        }
        
        showToast(`✅ ${selectedUsers.size} ta foydalanuvchiga rol berildi`);
        window.clearSelection();
        await fetchUsers();
        renderUsersByStatus();
    } catch (error) {
        showToast(`❌ Xatolik: ${error.message}`, true);
    }
}

window.bulkDeleteUsers = async function() {
    if (selectedUsers.size === 0) return;
    
    const confirmed = await showConfirmDialog({
        title: '🗑️ Ko\'plab foydalanuvchilarni o\'chirish',
        message: `${selectedUsers.size} ta foydalanuvchini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi!`,
        confirmText: `${selectedUsers.size} ta o'chirish`,
        cancelText: 'Bekor qilish',
        type: 'danger',
        icon: 'trash-2'
    });
    
    if (!confirmed) return;
    
    try {
        for (const userId of selectedUsers) {
            await safeFetch(`/api/users/${userId}`, { method: 'DELETE' });
        }
        
        showToast(`✅ ${selectedUsers.size} ta foydalanuvchi o'chirildi`);
        window.clearSelection();
        await fetchUsers();
        renderUsersByStatus();
    } catch (error) {
        showToast(`❌ Xatolik: ${error.message}`, true);
    }
}

window.editUserQuick = function(userId) {
    // Mavjud edit funksiyasini chaqirish
    const user = state.users.find(u => u.id === userId);
    if (user) {
        // User form modalni ochish va ma'lumotlarni to'ldirish
        const editBtn = document.querySelector(`button[onclick*="handleUserActions"][onclick*="'edit'"][onclick*="${userId}"]`);
        if (editBtn) editBtn.click();
    }
}

window.deleteUserQuick = async function(userId) {
    const confirmed = await showConfirmDialog({
        title: '🗑️ Foydalanuvchini o\'chirish',
        message: 'Foydalanuvchini o\'chirmoqchimisiz? Bu amalni qaytarib bo\'lmaydi!',
        confirmText: 'O\'chirish',
        cancelText: 'Bekor qilish',
        type: 'danger',
        icon: 'trash-2'
    });
    
    if (!confirmed) return;
    
    try {
        const res = await safeFetch(`/api/users/${userId}`, { method: 'DELETE' });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        showToast('✅ Foydalanuvchi o\'chirildi');
        await fetchUsers();
        renderUsersByStatus();
    } catch (error) {
        showToast(`❌ ${error.message}`, true);
    }
}

// ===== MODERN USERS MODULE - EVENT LISTENERS =====

// Initialize modern users page
export function initModernUsersPage() {
    // console.log('🔄 Initializing Modern Users Page...');
    
    // Setup filters
    setupUsersFilters();
    
    // Load users
    fetchUsers().then(() => {
        renderModernUsers();
    });
    
    // Setup refresh button
    const refreshBtn = document.getElementById('refresh-users-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.innerHTML = '<i data-feather="refresh-cw" class="spin"></i><span>Yangilanmoqda...</span>';
            await fetchUsers();
            renderModernUsers();
            refreshBtn.innerHTML = '<i data-feather="refresh-cw"></i><span>Yangilash</span>';
            feather.replace();
            showToast('✅ Ma\'lumotlar yangilandi');
        });
    }
}

// Load role filter badges dynamically
function loadRoleFilterBadges() {
    const roleBadgesContainer = document.getElementById('users-role-badges');
    if (!roleBadgesContainer || !state.roles) return;

    // Count users by role
    const roleCounts = {};
    let totalUsers = 0;
    
    if (state.users) {
        totalUsers = state.users.length;
        state.users.forEach(user => {
            const role = user.role || 'user';
            roleCounts[role] = (roleCounts[role] || 0) + 1;
        });
    }

    // Get ONLY existing roles (with count > 0)
    const existingRoles = Object.keys(roleCounts).filter(role => roleCounts[role] > 0);

    // Role icons and colors
    const roleConfig = {
        'admin': { icon: 'shield', color: 'danger', label: 'Admin' },
        'manager': { icon: 'briefcase', color: 'warning', label: 'Manager' },
        'operator': { icon: 'user-check', color: 'info', label: 'Operator' },
        'user': { icon: 'user', color: 'success', label: 'User' },
        'viewer': { icon: 'eye', color: 'info', label: 'Viewer' }
    };

    // Build badges HTML - start with "Barchasi"
    let badgesHTML = `
        <button class="filter-badge filter-badge-primary active" data-role="">
            <i data-feather="users"></i>
            <span>Barchasi <span class="badge-count" id="role-count-all">${totalUsers}</span></span>
        </button>
    `;

    // Add only existing roles
    existingRoles.forEach(role => {
        const config = roleConfig[role] || { icon: 'user', color: 'info', label: role.charAt(0).toUpperCase() + role.slice(1) };
        const count = roleCounts[role];
        
        badgesHTML += `
            <button class="filter-badge filter-badge-${config.color}" data-role="${role}">
                <i data-feather="${config.icon}"></i>
                <span>${config.label} <span class="badge-count" id="role-count-${role}">${count}</span></span>
            </button>
        `;
    });

    roleBadgesContainer.innerHTML = badgesHTML;
    feather.replace();

    // Setup click handlers
    const roleBadges = roleBadgesContainer.querySelectorAll('.filter-badge');
    roleBadges.forEach(badge => {
        badge.addEventListener('click', () => {
            // Remove active from all
            roleBadges.forEach(b => b.classList.remove('active'));
            
            // Add active to clicked
            badge.classList.add('active');
            
            // Update filter
            currentFilters.role = badge.dataset.role || '';
            
            // Re-render
            renderModernUsers();
        });
    });
}

// Setup all filters
function setupUsersFilters() {
    // Load and setup role filter badges dynamically
    loadRoleFilterBadges();
    
    // Account Status filter badges
    const accountStatusBadges = document.querySelectorAll('#users-account-status-badges .filter-badge');
    accountStatusBadges.forEach(badge => {
        badge.addEventListener('click', () => {
            accountStatusBadges.forEach(b => b.classList.remove('active'));
            badge.classList.add('active');
            currentFilters.accountStatus = badge.dataset.accountStatus || '';
            renderModernUsers();
        });
    });

    // Online Status filter badges
    const onlineStatusBadges = document.querySelectorAll('#users-online-status-badges .filter-badge');
    onlineStatusBadges.forEach(badge => {
        badge.addEventListener('click', () => {
            onlineStatusBadges.forEach(b => b.classList.remove('active'));
            badge.classList.add('active');
            currentFilters.onlineStatus = badge.dataset.onlineStatus || '';
            renderModernUsers();
        });
    });
    
    // Bulk actions
    setupBulkActions();
}

// Setup bulk actions
function setupBulkActions() {
    const bulkActivateBtn = document.getElementById('bulk-activate-btn');
    const bulkDeactivateBtn = document.getElementById('bulk-deactivate-btn');
    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    
    if (bulkActivateBtn) {
        bulkActivateBtn.addEventListener('click', () => bulkAction('activate'));
    }
    
    if (bulkDeactivateBtn) {
        bulkDeactivateBtn.addEventListener('click', () => bulkAction('deactivate'));
    }
    
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', () => bulkAction('delete'));
    }
}

// Bulk action handler
async function bulkAction(action) {
    if (selectedUsers.size === 0) {
        showToast('❌ Foydalanuvchi tanlanmagan', 'error');
        return;
    }
    
    const actionText = action === 'activate' ? 'faollashtirish' : 
                      action === 'deactivate' ? 'deaktiv qilish' : 
                      'o\'chirish';
    
    const confirmed = await showConfirmDialog({
        title: `${selectedUsers.size} ta foydalanuvchini ${actionText}`,
        message: `Tanlangan foydalanuvchilarni ${actionText}ni tasdiqlaysizmi?`,
        confirmText: 'Tasdiqlash',
        cancelText: 'Bekor qilish',
        type: action === 'delete' ? 'danger' : 'warning'
    });
    
    if (!confirmed) return;
    
    try {
        const userIds = Array.from(selectedUsers);
        
        for (const userId of userIds) {
            if (action === 'activate') {
                await safeFetch(`/api/users/${userId}/activate`, { method: 'POST' });
            } else if (action === 'deactivate') {
                await safeFetch(`/api/users/${userId}/deactivate`, { method: 'POST' });
            } else if (action === 'delete') {
                await safeFetch(`/api/users/${userId}`, { method: 'DELETE' });
            }
        }
        
        showToast(`✅ ${selectedUsers.size} ta foydalanuvchi ${actionText}ildi`);
        
        // Clear selection
        selectedUsers.clear();
        updateBulkActionsBar();
        
        // Reload
        await fetchUsers();
        renderModernUsers();
        
    } catch (error) {
        showToast(`❌ Xatolik: ${error.message}`, 'error');
    }
}

// Update bulk actions bar visibility
function updateBulkActionsBar() {
    const bulkContainer = document.getElementById('bulk-actions-container');
    const selectedCountEl = document.getElementById('selected-count');
    
    if (bulkContainer && selectedCountEl) {
        bulkContainer.style.display = selectedUsers.size > 0 ? 'flex' : 'none';
        selectedCountEl.textContent = selectedUsers.size;
    }
    
    // Update checkboxes state
    document.querySelectorAll('.user-card-checkbox').forEach(checkbox => {
        const userId = parseInt(checkbox.dataset.userId);
        checkbox.checked = selectedUsers.has(userId);
    });
}

// ============================================
// REQUESTS SECTION - MODERN DESIGN
// ============================================

// Helper function to update element text
function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}

// Helper function to get initials from name
function getInitials(name) {
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + (words[1] ? words[1][0] : words[0][1])).toUpperCase();
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// State for requests section
let selectedRequests = new Set();
let currentRequestsFilter = {
    status: '',
    sort: 'newest'
};

// Render modern requests cards
function renderModernRequests() {
    const container = document.getElementById('pending-users-list');
    if (!container) return;

    // console.log('🔍 state.pendingUsers:', state.pendingUsers);
    // console.log('🔍 state.users (pending only):', state.users ? state.users.filter(u => u.status === 'pending') : 'state.users is null');

    // Get pending users (requests) - use state.pendingUsers if available, otherwise filter state.users
    let requests = [];
    
    if (state.pendingUsers && state.pendingUsers.length > 0) {
        // Use dedicated pending users array
        requests = [...state.pendingUsers];
    } else if (state.users && state.users.length > 0) {
        // Fallback: filter from all users
        requests = state.users.filter(u => u.status === 'pending');
    }

    // Apply status filter
    if (currentRequestsFilter.status) {
        if (currentRequestsFilter.status === 'pending_telegram_subscription') {
            // Telegram kutmoqda - null, undefined yoki pending_subscription
            requests = requests.filter(r => !r.telegram_connection_status || r.telegram_connection_status === 'pending_subscription' || r.telegram_connection_status === 'not_connected');
        } else if (currentRequestsFilter.status === 'pending_admin_approval') {
            // Admin tasdiq - telegram ulanish tugallangan, lekin admin tasdiqlashi kerak
            requests = requests.filter(r => r.telegram_connection_status === 'subscribed' || r.telegram_connection_status === 'connected' || r.telegram_connection_status === 'pending_admin_approval');
        } else if (currentRequestsFilter.status === 'status_in_process') {
            // Jarayonda
            requests = requests.filter(r => r.telegram_connection_status === 'in_process');
        }
    }

    // Apply sorting
    if (currentRequestsFilter.sort === 'newest') {
        requests.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (currentRequestsFilter.sort === 'oldest') {
        requests.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } else if (currentRequestsFilter.sort === 'name') {
        requests.sort((a, b) => (a.full_name || a.username || '').localeCompare(b.full_name || b.username || ''));
    }

    // Empty state
    if (requests.length === 0) {
        container.innerHTML = `
            <div class="requests-empty-state">
                <i data-feather="inbox"></i>
                <h3>So'rovlar yo'q</h3>
                <p>Hozircha tasdiqlash uchun kutayotgan so'rovlar mavjud emas</p>
            </div>
        `;
        feather.replace();
        return;
    }

    // Render cards
    container.innerHTML = requests.map(request => {
        const initials = getInitials(request.full_name || request.username);
        const statusBadge = getRequestStatusBadge(request);
        const createdDate = request.created_at ? formatRelativeTime(request.created_at) : 'Noma\'lum';
        
        return `
            <div class="request-card" data-request-id="${request.id}">
                <div class="request-card-header">
                    <div class="request-card-checkbox">
                        <input type="checkbox" 
                               class="request-checkbox" 
                               data-request-id="${request.id}"
                               ${selectedRequests.has(request.id) ? 'checked' : ''}>
                    </div>
                    <div class="request-avatar">${initials}</div>
                    <div class="request-card-info">
                        <h3 class="request-card-name">${escapeHtml(request.full_name || request.username || 'Noma\'lum')}</h3>
                        <p class="request-card-username">@${escapeHtml(request.username || 'noname')}</p>
                    </div>
                    ${statusBadge}
                </div>
                
                <div class="request-card-details">
                    ${request.phone ? `
                        <div class="request-detail-item">
                            <i data-feather="phone"></i>
                            <span>${escapeHtml(request.phone)}</span>
                        </div>
                    ` : ''}
                    ${request.telegram_id ? `
                        <div class="request-detail-item">
                            <i data-feather="send"></i>
                            <span>Telegram ID: <strong>${request.telegram_id}</strong></span>
                        </div>
                    ` : ''}
                    ${request.registration_code ? `
                        <div class="request-detail-item">
                            <i data-feather="key"></i>
                            <span>Kod: <strong>${request.registration_code}</strong></span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="request-timeline">
                    <i data-feather="clock"></i>
                    <span class="request-timeline-text">
                        So'rov yuborilgan: <span class="request-timeline-date">${createdDate}</span>
                    </span>
                </div>
                
                <div class="request-card-actions">
                    <button class="btn btn-success" onclick="window.approveRequest(${request.id})">
                        <i data-feather="check"></i>
                        <span>Tasdiqlash</span>
                    </button>
                    <button class="btn btn-danger" onclick="window.rejectRequest(${request.id})">
                        <i data-feather="x"></i>
                        <span>Rad etish</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    feather.replace();
    setupRequestCheckboxes();
}

// Get request status badge HTML
function getRequestStatusBadge(request) {
    // console.log('📋 Request badge for:', request.username, 'telegram_connection_status:', request.telegram_connection_status);
    
    // If telegram_id exists but telegram_connection_status is null/undefined, user needs admin approval
    if (request.telegram_id && (!request.telegram_connection_status || request.telegram_connection_status === 'pending_admin_approval')) {
        return `
            <div class="request-status-badge status-admin">
                <i data-feather="user-check"></i>
                <span>Admin</span>
            </div>
        `;
    }
    
    if (!request.telegram_connection_status || request.telegram_connection_status === 'pending_subscription' || request.telegram_connection_status === 'not_connected') {
        return `
            <div class="request-status-badge status-telegram">
                <i data-feather="send"></i>
                <span>Telegram</span>
            </div>
        `;
    } else if (request.telegram_connection_status === 'subscribed' || request.telegram_connection_status === 'connected') {
        return `
            <div class="request-status-badge status-admin">
                <i data-feather="user-check"></i>
                <span>Admin</span>
            </div>
        `;
    } else if (request.telegram_connection_status === 'in_process') {
        return `
            <div class="request-status-badge status-process">
                <i data-feather="loader"></i>
                <span>Jarayonda</span>
            </div>
        `;
    }
    return '';
}

// Update requests statistics
function updateRequestsStatistics() {
    // Use state.pendingUsers if available, otherwise filter state.users
    let pendingUsers = [];
    if (state.pendingUsers && state.pendingUsers.length > 0) {
        pendingUsers = state.pendingUsers;
    } else if (state.users && state.users.length > 0) {
        pendingUsers = state.users.filter(u => u.status === 'pending');
    }
    
    // Count by status
    // Telegram kutmoqda - null, undefined yoki pending_subscription
    const telegramPending = pendingUsers.filter(u => !u.telegram_connection_status || u.telegram_connection_status === 'pending_subscription' || u.telegram_connection_status === 'not_connected').length;
    
    // Admin tasdiq - telegram_id bor lekin connection_status null yoki pending_admin_approval
    const adminPending = pendingUsers.filter(u => 
        (u.telegram_id && (!u.telegram_connection_status || u.telegram_connection_status === 'pending_admin_approval')) ||
        u.telegram_connection_status === 'subscribed' || 
        u.telegram_connection_status === 'connected'
    ).length;
    
    const inProcess = pendingUsers.filter(u => u.telegram_connection_status === 'in_process').length;
    
    // Count today's requests
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRequests = pendingUsers.filter(u => {
        const created = new Date(u.created_at);
        return created >= today;
    }).length;
    
    // Mock data for approved/rejected (real data would come from history)
    const approvedToday = 0; // TODO: Get from history table
    const rejectedToday = 0; // TODO: Get from history table
    const totalToday = todayRequests + approvedToday + rejectedToday;
    const approvalRate = totalToday > 0 ? Math.round((approvedToday / totalToday) * 100) : 0;
    const rejectionRate = totalToday > 0 ? Math.round((rejectedToday / totalToday) * 100) : 0;
    
    // Update DOM
    updateElement('pending-requests-count', pendingUsers.length);
    updateElement('today-requests-count', todayRequests);
    updateElement('approved-today-count', approvedToday);
    updateElement('rejected-today-count', rejectedToday);
    updateElement('approval-rate', `${approvalRate}%`);
    updateElement('rejection-rate', `${rejectionRate}%`);
    
    // Update filter badges
    updateElement('request-status-count-all', pendingUsers.length);
    updateElement('request-status-count-telegram', telegramPending);
    updateElement('request-status-count-admin', adminPending);
    updateElement('request-status-count-process', inProcess);
    
    // Update pending text
    const pendingText = pendingUsers.length === 0 ? 'Hammasi tasdiqlangan' : 
                       pendingUsers.length === 1 ? '1 ta so\'rov' : 
                       `${pendingUsers.length} ta so'rov`;
    updateElement('pending-requests-text', pendingText);
    
    // Show/hide bulk approve button
    const bulkApproveBtn = document.getElementById('bulk-approve-all-btn');
    if (bulkApproveBtn) {
        bulkApproveBtn.style.display = pendingUsers.length > 0 ? 'flex' : 'none';
    }
}

// Setup request checkboxes
function setupRequestCheckboxes() {
    document.querySelectorAll('.request-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const requestId = parseInt(e.target.dataset.requestId);
            if (e.target.checked) {
                selectedRequests.add(requestId);
            } else {
                selectedRequests.delete(requestId);
            }
            updateRequestsBulkActions();
        });
    });
}

// Update requests bulk actions visibility
function updateRequestsBulkActions() {
    const bulkContainer = document.getElementById('requests-bulk-actions');
    const selectedCountEl = document.getElementById('requests-selected-count');
    
    if (bulkContainer && selectedCountEl) {
        bulkContainer.style.display = selectedRequests.size > 0 ? 'flex' : 'none';
        selectedCountEl.textContent = selectedRequests.size;
    }
    
    // Update checkboxes state
    document.querySelectorAll('.request-checkbox').forEach(checkbox => {
        const requestId = parseInt(checkbox.dataset.requestId);
        checkbox.checked = selectedRequests.has(requestId);
    });
}

// Setup requests filters
function setupRequestsFilters() {
    // Status filter badges
    document.querySelectorAll('#requests-status-badges .filter-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            const status = e.currentTarget.dataset.requestStatus;
            
            // Update active state
            document.querySelectorAll('#requests-status-badges .filter-badge').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Update filter and render
            currentRequestsFilter.status = status;
            renderModernRequests();
        });
    });
    
    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sort = e.currentTarget.dataset.sort;
            
            // Update active state
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            // Update filter and render
            currentRequestsFilter.sort = sort;
            renderModernRequests();
        });
    });
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-requests-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i data-feather="loader"></i><span>Yuklanmoqda...</span>';
            feather.replace();
            
            await fetchUsers();
            renderModernRequests();
            updateRequestsStatistics();
            
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i data-feather="refresh-cw"></i><span>Yangilash</span>';
            feather.replace();
            showToast('So\'rovlar yangilandi', 'success');
        });
    }
    
    // Bulk approve all button
    const bulkApproveAllBtn = document.getElementById('bulk-approve-all-btn');
    if (bulkApproveAllBtn) {
        bulkApproveAllBtn.addEventListener('click', async () => {
            const pendingUsers = state.users.filter(u => u.status === 'pending');
            if (pendingUsers.length === 0) return;
            
            const confirmed = await showConfirmDialog({
                title: 'Barchani tasdiqlash',
                message: `Barcha ${pendingUsers.length} ta so'rovni tasdiqlashni xohlaysizmi?`,
                confirmText: 'Ha, tasdiqlash',
                cancelText: 'Bekor qilish',
                type: 'warning',
                icon: 'check-circle'
            });
            if (!confirmed) return;
            
            try {
                for (const user of pendingUsers) {
                    await api.post('/api/admin/users/approve', { userId: user.id });
                }
                
                showToast('Barcha so\'rovlar tasdiqlandi', 'success');
                await fetchUsers();
                renderModernRequests();
                updateRequestsStatistics();
            } catch (error) {
                showToast(`Xatolik: ${error.message}`, 'error');
            }
        });
    }
    
    // Bulk actions for selected requests
    const bulkApproveBtn = document.getElementById('requests-bulk-approve-btn');
    if (bulkApproveBtn) {
        bulkApproveBtn.addEventListener('click', async () => {
            if (selectedRequests.size === 0) return;
            
            const confirmed = await showConfirmDialog({
                title: 'Tanlanganlarni tasdiqlash',
                message: `Tanlangan ${selectedRequests.size} ta so'rovni tasdiqlashni xohlaysizmi?`,
                confirmText: 'Ha, tasdiqlash',
                cancelText: 'Bekor qilish',
                type: 'warning',
                icon: 'check-circle'
            });
            if (!confirmed) return;
            
            try {
                for (const userId of selectedRequests) {
                    await api.post('/api/admin/users/approve', { userId });
                }
                
                showToast('Tanlangan so\'rovlar tasdiqlandi', 'success');
                selectedRequests.clear();
                await fetchUsers();
                renderModernRequests();
                updateRequestsStatistics();
                updateRequestsBulkActions();
            } catch (error) {
                showToast(`Xatolik: ${error.message}`, 'error');
            }
        });
    }
    
    const bulkRejectBtn = document.getElementById('requests-bulk-reject-btn');
    if (bulkRejectBtn) {
        bulkRejectBtn.addEventListener('click', async () => {
            if (selectedRequests.size === 0) return;
            
            const confirmed = await showConfirmDialog({
                title: 'Tanlanganlarni rad etish',
                message: `Tanlangan ${selectedRequests.size} ta so'rovni rad etishni xohlaysizmi?`,
                confirmText: 'Ha, rad etish',
                cancelText: 'Bekor qilish',
                type: 'danger',
                icon: 'x-circle'
            });
            if (!confirmed) return;
            
            try {
                for (const userId of selectedRequests) {
                    await api.post('/api/admin/users/reject', { userId });
                }
                
                showToast('Tanlangan so\'rovlar rad etildi', 'success');
                selectedRequests.clear();
                await fetchUsers();
                renderModernRequests();
                updateRequestsStatistics();
                updateRequestsBulkActions();
            } catch (error) {
                showToast(`Xatolik: ${error.message}`, 'error');
            }
        });
    }
}

// Global functions for buttons (onclick handlers)
window.approveRequest = async function(userId) {
    try {
        await api.post('/api/admin/users/approve', { userId });
        showToast('Foydalanuvchi tasdiqlandi', 'success');
        await fetchUsers();
        renderModernRequests();
        updateRequestsStatistics();
    } catch (error) {
        showToast(`Xatolik: ${error.message}`, 'error');
    }
};

window.rejectRequest = async function(userId) {
    const confirmed = await showConfirmDialog({
        title: 'So\'rovni rad etish',
        message: 'Ushbu so\'rovni rad etishni xohlaysizmi?',
        confirmText: 'Ha, rad etish',
        cancelText: 'Bekor qilish',
        type: 'danger',
        icon: 'x-circle'
    });
    
    if (!confirmed) return;
    
    try {
        await api.post('/api/admin/users/reject', { userId });
        showToast('So\'rov rad etildi', 'success');
        await fetchUsers();
        renderModernRequests();
        updateRequestsStatistics();
    } catch (error) {
        showToast(`Xatolik: ${error.message}`, 'error');
    }
};

// viewRequestDetails function removed - modal deleted

// Format relative time
function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Hozirgina';
    if (diffMins < 60) return `${diffMins} daqiqa oldin`;
    if (diffHours < 24) return `${diffHours} soat oldin`;
    if (diffDays < 7) return `${diffDays} kun oldin`;
    
    return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Initialize requests section
export function initModernRequestsPage() {
    setupRequestsFilters();
    renderModernRequests();
    updateRequestsStatistics();
}
