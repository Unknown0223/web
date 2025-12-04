// Roles Module
// Rollar va huquqlarni boshqarish

import { state } from './state.js';
import { DOM } from './dom.js';
import { safeFetch } from './api.js';
import { showToast, showConfirmDialog } from './utils.js';

const permissionExclusionGroups = {
    view: ['reports:view_all', 'reports:view_assigned', 'reports:view_own'],
    edit: ['reports:edit_all', 'reports:edit_assigned', 'reports:edit_own']
};

export function renderRoles() {
    if (!state.roles || !state.allPermissions) return;
    
    DOM.rolesList.innerHTML = state.roles.map(role => 
        `<li data-role="${role.role_name}">${role.role_name}</li>`
    ).join('');
    
    DOM.permissionsGrid.innerHTML = Object.entries(state.allPermissions).map(([category, perms]) => `
        <div class="permission-category">
            <h4 class="permission-category-title">${category}</h4>
            <div class="permission-list">
                ${perms.map(perm => `
                    <label class="permission-item">
                        <input type="checkbox" value="${perm.key}">
                        <span>${perm.description}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    DOM.permissionsGrid.addEventListener('change', handlePermissionChange);
    
    // Birinchi rolni default tanlash
    if (state.roles.length > 0) {
        // console.log('🔍 Roles module: Selecting first role...', state.roles[0]);
        const firstRole = state.roles[0];
        const firstRoleElement = DOM.rolesList.querySelector(`[data-role="${firstRole.role_name}"]`);
        // console.log('🔍 First role element found:', firstRoleElement);
        if (firstRoleElement) {
            // Click o'rniga to'g'ridan-to'g'ri handleRoleSelection ni chaqiramiz
            setTimeout(() => {
                // console.log('🔍 Simulating click on first role');
                handleRoleSelection({ target: firstRoleElement });
            }, 100);
        }
    }
}

export function handleRoleSelection(e) {
    // console.log('🎯 handleRoleSelection called', e);
    const li = e.target.closest('li');
    // console.log('🎯 Found li element:', li);
    if (!li) return;
    
    const roleName = li.dataset.role;
    // console.log('🎯 Selected role:', roleName);
    state.currentEditingRole = roleName;
    
    DOM.rolesList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
    li.classList.add('active');
    
    DOM.currentRoleTitle.textContent = `"${roleName}" roli uchun huquqlar`;
    DOM.saveRolePermissionsBtn.classList.remove('hidden');
    
    const roleData = state.roles.find(r => r.role_name === roleName);
    const rolePermissions = roleData ? roleData.permissions : [];
    // console.log('🎯 Role permissions:', rolePermissions);
    
    const checkboxes = DOM.permissionsGrid.querySelectorAll('input[type="checkbox"]');
    // console.log('🎯 Found checkboxes:', checkboxes.length);
    checkboxes.forEach(cb => {
        cb.checked = rolePermissions.includes(cb.value);
    });
    
    applyAllPermissionExclusions();
    
    if (roleName === 'admin') {
        DOM.permissionsPanel.classList.add('disabled');
    } else {
        DOM.permissionsPanel.classList.remove('disabled');
    }
    // console.log('🎯 Role selection completed');
}

export async function saveRolePermissions() {
    if (!state.currentEditingRole || state.currentEditingRole === 'admin') return;
    
    const checkedPermissions = Array.from(DOM.permissionsGrid.querySelectorAll('input:checked'))
        .map(cb => cb.value);
    
    try {
        const res = await safeFetch(`/api/roles/${state.currentEditingRole}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: checkedPermissions })
        });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        showToast(result.message);
        
        const roleIndex = state.roles.findIndex(r => r.role_name === state.currentEditingRole);
        if (roleIndex > -1) {
            state.roles[roleIndex].permissions = checkedPermissions;
        }
    } catch (error) {
        showToast(error.message, true);
    }
}

function handlePermissionChange(event) {
    const changedCheckbox = event.target;
    if (changedCheckbox.tagName !== 'INPUT' || changedCheckbox.type !== 'checkbox') return;
    
    const changedPermission = changedCheckbox.value;
    
    for (const groupName in permissionExclusionGroups) {
        const group = permissionExclusionGroups[groupName];
        if (group.includes(changedPermission)) {
            if (changedCheckbox.checked) {
                group.forEach(permKey => {
                    if (permKey !== changedPermission) {
                        const checkbox = DOM.permissionsGrid.querySelector(`input[value="${permKey}"]`);
                        if (checkbox) checkbox.checked = false;
                    }
                });
            }
            applyPermissionExclusionsForGroup(group);
            break;
        }
    }
}

function applyPermissionExclusionsForGroup(group) {
    let checkedPermission = null;
    
    for (const permKey of group) {
        const checkbox = DOM.permissionsGrid.querySelector(`input[value="${permKey}"]`);
        if (checkbox && checkbox.checked) {
            checkedPermission = permKey;
            break;
        }
    }
    
    group.forEach(permKey => {
        const checkbox = DOM.permissionsGrid.querySelector(`input[value="${permKey}"]`);
        if (checkbox) {
            const item = checkbox.closest('.permission-item');
            const shouldBeDisabled = checkedPermission && permKey !== checkedPermission;
            checkbox.disabled = shouldBeDisabled;
            if (item) item.classList.toggle('disabled', shouldBeDisabled);
        }
    });
}

function applyAllPermissionExclusions() {
    for (const groupName in permissionExclusionGroups) {
        applyPermissionExclusionsForGroup(permissionExclusionGroups[groupName]);
    }
}

export async function handleBackupDb() {
    const confirmed = await showConfirmDialog({
        title: '💾 Ma\'lumotlar bazasi nusxasi',
        message: "Rostdan ham ma'lumotlar bazasining to'liq nusxasini yuklab olmoqchimisiz?",
        confirmText: 'Yuklab olish',
        cancelText: 'Bekor qilish',
        type: 'info',
        icon: 'database'
    });
    
    if (!confirmed) return;
    
    try {
        const response = await safeFetch('/api/admin/backup-db');
        if (!response || !response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Baza nusxasini olib bo\'lmadi');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const disposition = response.headers.get('content-disposition');
        let fileName = `database_backup_${new Date().toISOString().split('T')[0]}.db`;
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                fileName = matches[1].replace(/['"]/g, '');
            }
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        showToast("Baza nusxasi muvaffaqiyatli yuklab olindi.");
    } catch (error) {
        showToast(error.message, true);
    }
}

export async function handleClearSessions() {
    const confirmed = await showConfirmDialog({
        title: '⚠️ DIQQAT! Barcha sessiyalarni tozalash',
        message: "Bu amal o'zingizdan tashqari barcha foydalanuvchilarni tizimdan chiqarib yuboradi. Davom etasizmi?",
        confirmText: 'Ha, tozalash',
        cancelText: 'Bekor qilish',
        type: 'danger',
        icon: 'alert-triangle'
    });
    
    if (!confirmed) return;
    
    try {
        const res = await safeFetch('/api/admin/clear-sessions', { method: 'POST' });
        if (!res || !res.ok) throw new Error((await res.json()).message);
        
        const result = await res.json();
        showToast(result.message);
    } catch (error) {
        showToast(error.message, true);
    }
}

/* ===================================================== */
/* === 💾 TO'LIQ DATABASE EXPORT/IMPORT === */
/* ===================================================== */

/**
 * To'liq ma'lumotlar bazasini export qilish
 */
export async function exportFullDatabase() {
    const confirmed = await showConfirmDialog({
        title: '📥 To\'liq Database Export',
        message: 'Barcha ma\'lumotlar (foydalanuvchilar, hisobotlar, tarix, sozlamalar) JSON faylda yuklab olinadi. Davom etasizmi?',
        confirmText: 'Ha, yuklab olish',
        cancelText: 'Bekor qilish',
        type: 'info',
        icon: 'download-cloud'
    });
    
    if (!confirmed) return;
    
    try {
        showProgress('📥 Export jarayoni boshlandi...', 10);
        showToast('📥 Ma\'lumotlar bazasi yuklab olinmoqda...');
        
        showProgress('🔍 Ma\'lumotlarni yig\'ish...', 40);
        
        const response = await safeFetch('/api/admin/export-full-db');
        if (!response || !response.ok) {
            throw new Error('Export qilishda xatolik');
        }
        
        showProgress('💾 Fayl tayyorlanmoqda...', 70);
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Fayl nomini response header dan olish
        let fileName = `full_database_export_${new Date().toISOString().split('T')[0]}.json`;
        const disposition = response.headers.get('content-disposition');
        if (disposition) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
            if (matches && matches[1]) {
                fileName = matches[1].replace(/['"]/g, '');
            }
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        showProgress('✅ Export muvaffaqiyatli!', 100);
        
        setTimeout(() => {
            hideProgress();
            showToast('✅ Ma\'lumotlar bazasi muvaffaqiyatli yuklab olindi!');
            document.getElementById('export-info').classList.remove('hidden');
        }, 500);
        
    } catch (error) {
        hideProgress();
        // console.error('Export xatolik:', error);
        showToast('❌ Export qilishda xatolik: ' + error.message, true);
    }
}

/**
 * To'liq ma'lumotlar bazasini import qilish
 */
export async function importFullDatabase(file) {
    if (!file) {
        showToast('❌ Fayl tanlanmagan!', true);
        return;
    }
    
    if (!file.name.endsWith('.json')) {
        showToast('❌ Faqat JSON fayllarni import qilish mumkin!', true);
        return;
    }
    
    const confirmed = await showConfirmDialog({
        title: '⚠️ DIQQAT! To\'liq Database Import',
        message: `
            <strong style="color: #e74c3c;">Bu amal hozirgi barcha ma'lumotlarni o'chiradi!</strong><br><br>
            Import qilinadigan fayl: <strong>${file.name}</strong><br>
            Hajmi: <strong>${(file.size / 1024).toFixed(2)} KB</strong><br><br>
            Barcha foydalanuvchilar, hisobotlar, sozlamalar almashtiriladi. Davom etasizmi?
        `,
        confirmText: 'Ha, import qilish',
        cancelText: 'Bekor qilish',
        type: 'danger',
        icon: 'alert-triangle'
    });
    
    if (!confirmed) return;
    
    try {
        showProgress('📤 Import jarayoni boshlandi...', 10);
        showToast('📤 Ma\'lumotlar bazasi import qilinmoqda...');
        
        // Faylni o'qish
        showProgress('📄 Fayl o\'qilmoqda...', 30);
        const fileText = await file.text();
        const importData = JSON.parse(fileText);
        
        // Validatsiya
        if (!importData.data) {
            throw new Error('Noto\'g\'ri fayl formati! "data" maydoni topilmadi.');
        }
        
        showProgress('🔄 Ma\'lumotlar bazasiga yuklash...', 50);
        
        // Backend ga yuborish
        const response = await safeFetch('/api/admin/import-full-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importData)
        });
        
        if (!response || !response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Import qilishda xatolik');
        }
        
        showProgress('✅ Import muvaffaqiyatli!', 100);
        
        const result = await response.json();
        
        setTimeout(() => {
            hideProgress();
            showToast('✅ Ma\'lumotlar bazasi muvaffaqiyatli import qilindi! Sahifa qayta yuklanadi...');
            
            // 2 soniyadan keyin sahifani yangilash
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        }, 500);
        
    } catch (error) {
        hideProgress();
        // console.error('Import xatolik:', error);
        showToast('❌ Import qilishda xatolik: ' + error.message, true);
    }
}

/**
 * Progress bar ko'rsatish
 */
function showProgress(text, percent) {
    const container = document.getElementById('db-operation-progress');
    const progressFill = container.querySelector('.progress-fill');
    const progressText = container.querySelector('.progress-text');
    const progressPercentage = container.querySelector('.progress-percentage');
    
    container.classList.remove('hidden');
    progressFill.style.width = `${percent}%`;
    progressText.textContent = text;
    
    if (progressPercentage) {
        progressPercentage.textContent = `${percent}%`;
    }
}

/**
 * Progress bar yashirish
 */
function hideProgress() {
    const container = document.getElementById('db-operation-progress');
    container.classList.add('hidden');
}

/**
 * Event listener'larni ulash
 */
export function initExportImport() {
    // Export tugmasi
    const exportBtn = document.getElementById('export-full-db-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportFullDatabase);
    }
    
    // Import tugmasi
    const importBtn = document.getElementById('import-full-db-btn');
    const fileInput = document.getElementById('import-file-input');
    const selectedFileInfo = document.getElementById('selected-file-info');
    
    if (importBtn && fileInput) {
        importBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Fayl nomini ko'rsatish
                if (selectedFileInfo) {
                    const fileName = selectedFileInfo.querySelector('.file-name');
                    if (fileName) {
                        fileName.textContent = file.name;
                    }
                    selectedFileInfo.classList.remove('hidden');
                }
                
                document.getElementById('import-info').classList.remove('hidden');
                importFullDatabase(file);
                // Input ni tozalash (qayta bir xil faylni tanlash mumkin bo'lishi uchun)
                fileInput.value = '';
                
                // 3 soniyadan keyin fayl nomini yashirish
                setTimeout(() => {
                    if (selectedFileInfo) {
                        selectedFileInfo.classList.add('hidden');
                    }
                }, 3000);
            }
        });
    }
}

// Add New Role Functionality
export function setupAddNewRole() {
    const addRoleBtn = document.getElementById('add-new-role-btn');
    if (addRoleBtn) {
        addRoleBtn.addEventListener('click', openAddRoleModal);
    }
}

function openAddRoleModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
                        </svg>
                        Yangi Rol Qo'shish
                    </h5>
                    <button type="button" class="btn-close" onclick="this.closest('.modal').remove()"></button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="new-role-name">Rol Nomi</label>
                        <input type="text" class="form-control" id="new-role-name" placeholder="masalan: viewer, editor">
                        <small class="form-text text-muted">Faqat lotin harflari va pastki chiziq (_) ishlatiladi</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').remove()">Bekor qilish</button>
                    <button type="button" class="btn btn-primary" id="create-role-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
                        </svg>
                        Yaratish
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    // Focus input
    setTimeout(() => {
        document.getElementById('new-role-name').focus();
    }, 100);
    
    // Create button handler
    document.getElementById('create-role-btn').addEventListener('click', createNewRole);
}

async function createNewRole() {
    const input = document.getElementById('new-role-name');
    const roleName = input.value.trim().toLowerCase();
    
    // Validation
    if (!roleName) {
        showToast('Rol nomini kiriting!', 'error');
        input.focus();
        return;
    }
    
    if (!/^[a-z_]+$/.test(roleName)) {
        showToast('Rol nomida faqat lotin harflari va pastki chiziq (_) bo\'lishi mumkin!', 'error');
        input.focus();
        return;
    }
    
    if (state.roles.some(r => r.role_name === roleName)) {
        showToast('Bu rol allaqachon mavjud!', 'error');
        input.focus();
        return;
    }
    
    const btn = document.getElementById('create-role-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Yaratilmoqda...';
    
    try {
        const response = await safeFetch('/api/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_name: roleName })
        });
        
        if (!response.ok) throw new Error('Failed to create role');
        
        showToast('Yangi rol muvaffaqiyatli yaratildi!', 'success');
        
        // Close modal
        document.querySelector('.modal').remove();
        
        // Reload roles
        const rolesData = await safeFetch('/api/roles');
        state.roles = rolesData.roles;
        state.allPermissions = rolesData.all_permissions;
        renderRoles();
        
    } catch (error) {
        // console.error('Create role error:', error);
        showToast('Rol yaratishda xatolik!', 'error');
        btn.disabled = false;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg> Yaratish';
    }
}
