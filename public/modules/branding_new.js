// 🎨 ZAMONAVIY BRENDING MODULE
// Tizimning to'liq dizaynini boshqarish

import { state } from './state.js';
import { DOM } from './dom.js';
import { safeFetch } from './api.js';
import { showToast } from './utils.js';

// Hozirgi brending sozlamalari
let currentBranding = {
    logo: {
        text: 'MANUS',
        color: '#4CAF50',
        size: 32,
        animation: 'anim-glow-pulse',
        border: 'border-none'
    },
    colors: {
        primary: '#007bff',
        success: '#28a745',
        danger: '#dc3545',
        warning: '#ffc107'
    }
};

/**
 * Brending bo'limini sozlash
 */
export function setupBrandingControls() {
    // Hozirgi sozlamalarni yuklash
    if (state.settings.branding_settings) {
        currentBranding = { ...currentBranding, ...state.settings.branding_settings };
    }
    
    // Tab navigationni sozlash
    setupBrandingTabs();
    
    // Har bir bo'lim uchun event listenerlar
    setupLogoTab();
    
    // Dastlabki sozlamalarni UI ga qo'llash
    applyBrandingToUI(currentBranding);
}

/**
 * Tab navigation
 */
function setupBrandingTabs() {
    const tabs = document.querySelectorAll('.branding-tab');
    const contents = document.querySelectorAll('.branding-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            contents.forEach(c => c.classList.remove('active'));
            document.querySelector(`[data-content="${targetTab}"]`)?.classList.add('active');
            
            if (typeof feather !== 'undefined') feather.replace();
        });
    });
}

/**
 * LOGO TAB
 */
function setupLogoTab() {
    // Logo matni
    const logoTextInput = document.getElementById('logo-text-input');
    if (logoTextInput) {
        logoTextInput.value = currentBranding.logo?.text || 'MANUS';
        logoTextInput.addEventListener('input', (e) => {
            currentBranding.logo.text = e.target.value;
            updateLogoPreview();
        });
    }
    
    // Logo rangi
    const logoColorPicker = document.getElementById('logo-color-picker');
    const logoColorHex = document.getElementById('logo-color-hex');
    if (logoColorPicker) {
        logoColorPicker.value = currentBranding.logo?.color || '#4CAF50';
        if (logoColorHex) logoColorHex.value = logoColorPicker.value;
        
        logoColorPicker.addEventListener('input', (e) => {
            currentBranding.logo.color = e.target.value;
            if (logoColorHex) logoColorHex.value = e.target.value;
            updateLogoPreview();
        });
    }
    
    // Logo ranglar palitra
    const colorPalette = document.getElementById('logo-color-palette');
    if (colorPalette) {
        const colors = ['#4CAF50', '#007bff', '#dc3545', '#ffc107', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c', '#17a2b8', '#ffffff'];
        
        colorPalette.innerHTML = colors.map(c =>
            `<div class="color-box ${c === currentBranding.logo?.color ? 'active' : ''}" style="background-color: ${c}" data-color="${c}"></div>`
        ).join('');
        
        colorPalette.addEventListener('click', (e) => {
            if (e.target.classList.contains('color-box')) {
                const color = e.target.dataset.color;
                currentBranding.logo.color = color;
                if (logoColorPicker) logoColorPicker.value = color;
                if (logoColorHex) logoColorHex.value = color;
                
                colorPalette.querySelectorAll('.color-box').forEach(box => {
                    box.classList.toggle('active', box.dataset.color === color);
                });
                
                updateLogoPreview();
            }
        });
    }
    
    // Logo o'lchami
    const logoSizeInput = document.getElementById('logo-size-input');
    const logoSizeValue = document.getElementById('logo-size-value');
    if (logoSizeInput) {
        logoSizeInput.value = currentBranding.logo?.size || 32;
        if (logoSizeValue) logoSizeValue.textContent = `${logoSizeInput.value}px`;
        
        logoSizeInput.addEventListener('input', (e) => {
            currentBranding.logo.size = parseInt(e.target.value);
            if (logoSizeValue) logoSizeValue.textContent = `${e.target.value}px`;
            updateLogoPreview();
        });
    }
    
    // Logo animatsiya
    const logoAnimationSelect = document.getElementById('logo-animation-select');
    if (logoAnimationSelect) {
        const animations = {
            'anim-none': 'Yo\'q',
            'anim-glow-pulse': 'Pulsatsiya',
            'anim-flicker': 'Miltillash',
            'anim-scanner': 'Skaner'
        };
        
        logoAnimationSelect.innerHTML = Object.entries(animations).map(([k, v]) =>
            `<option value="${k}" ${k === currentBranding.logo?.animation ? 'selected' : ''}>${v}</option>`
        ).join('');
        
        logoAnimationSelect.addEventListener('change', (e) => {
            currentBranding.logo.animation = e.target.value;
            updateLogoPreview();
        });
    }
    
    // Logo border effekt
    const logoBorderSelect = document.getElementById('logo-border-effect-select');
    if (logoBorderSelect) {
        const borders = {
            'border-none': 'Yo\'q',
            'border-glow': 'Yorqin Chegara',
            'border-dashed': 'Punktir Chegara',
            'border-line-grow': 'Chiziqli Animatsiya'
        };
        
        logoBorderSelect.innerHTML = Object.entries(borders).map(([k, v]) =>
            `<option value="${k}" ${k === currentBrending.logo?.border ? 'selected' : ''}>${v}</option>`
        ).join('');
        
        logoBorderSelect.addEventListener('change', (e) => {
            currentBranding.logo.border = e.target.value;
            updateLogoPreview();
        });
    }
    
    // Save tugmasi
    const saveBtn = document.getElementById('save-branding-settings-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveBrandingSettings);
    }
    
    updateLogoPreview();
}

/**
 * Logo preview ni yangilash
 */
function updateLogoPreview() {
    const logoPreview = document.getElementById('logo-preview');
    const logoPreviewContainer = document.getElementById('logo-preview-container');
    
    if (logoPreview) {
        logoPreview.textContent = currentBranding.logo.text;
        logoPreview.style.setProperty('--glow-color', currentBranding.logo.color);
        logoPreview.style.fontSize = `${currentBranding.logo.size}px`;
        
        logoPreview.className = 'brand-logo';
        if (currentBranding.logo.animation !== 'anim-none') {
            logoPreview.classList.add(currentBranding.logo.animation);
        }
    }
    
    if (logoPreviewContainer) {
        logoPreviewContainer.className = 'logo-border-effect';
        if (currentBranding.logo.border !== 'border-none') {
            logoPreviewContainer.classList.add(currentBranding.logo.border);
        }
        logoPreviewContainer.style.setProperty('--glow-color', currentBranding.logo.color);
    }
}

/**
 * Brendingni saqlash
 */
export async function saveBrandingSettings() {
    try {
        const res = await safeFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'branding_settings', value: currentBranding })
        });
        
        if (!res || !res.ok) {
            const error = await res.json();
            throw new Error(error.message || 'Xatolik yuz berdi');
        }
        
        showToast('✅ Brending sozlamalari saqlandi!');
        applyBranding(currentBranding);
    } catch (error) {
        showToast(`❌ ${error.message}`, true);
    }
}

/**
 * Brendingni butun tizimga qo'llash
 */
export function applyBranding(settings) {
    currentBranding = { ...currentBranding, ...settings };
    applyBrandingToUI(currentBranding);
}

/**
 * UI ga brendingni qo'llash
 */
function applyBrandingToUI(branding) {
    // Logo
    DOM.brandLogos?.forEach(logo => {
        logo.textContent = branding.logo?.text || 'MANUS';
        logo.className = 'brand-logo';
        if (branding.logo?.animation !== 'anim-none') {
            logo.classList.add(branding.logo.animation);
        }
        logo.style.setProperty('--glow-color', branding.logo?.color || '#4CAF50');
        logo.style.fontSize = `${branding.logo?.size || 32}px`;
    });
    
    DOM.logoBorderEffects?.forEach(container => {
        container.className = 'logo-border-effect';
        if (branding.logo?.border !== 'border-none') {
            container.classList.add(branding.logo.border);
        }
        container.style.setProperty('--glow-color', branding.logo?.color || '#4CAF50');
    });
}
