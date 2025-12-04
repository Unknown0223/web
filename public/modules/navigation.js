// Navigation Module
// Sahifalar orasida navigatsiya va permissions

import { state } from './state.js';
import { DOM } from './dom.js';
import { hasPermission, hidePageLoader } from './utils.js';
import { setupKpiPage } from './kpi.js';
import { setupPivot } from './pivot.js';
import { fetchAndRenderAuditLogs, renderAuditLogTable, renderAuditLogPagination } from './audit.js';
import { fetchAndRenderMySessions } from './security.js';

export function applyPermissions() {
    const userPermissions = state.currentUser.permissions || [];
    
    document.querySelectorAll('[data-permission]').forEach(el => {
        const requiredPermissions = el.dataset.permission.split(',').map(p => p.trim());
        const hasRequiredPermission = requiredPermissions.some(p => userPermissions.includes(p));
        if (!hasRequiredPermission) {
            el.style.display = 'none';
        }
    });
    
    // Xavfsizlik sahifasi har doim ko'rinadi
    const securityLink = document.querySelector('.nav-link[data-page="security"]');
    if (securityLink) {
        securityLink.style.display = 'flex';
    }
}

export async function navigateTo(pageId, hideLoaderAfter = false) {
    if (!pageId) pageId = 'dashboard';
    
    const targetPage = document.getElementById(pageId);
    const targetLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
    
    if (targetPage && targetLink && (targetLink.style.display !== 'none')) {
        // Avval hamma sahifalarni yashiramiz (ko'rinmaslik uchun)
        DOM.pages.forEach(p => p.classList.remove('active'));
        
        // Keyin kerakli sahifani ko'rsatamiz
        targetPage.classList.add('active');
        
        // Linkni active qilamiz
        document.querySelectorAll('.nav-link.active').forEach(l => l.classList.remove('active'));
        targetLink.classList.add('active');
        
        window.location.hash = pageId;

        // Sahifa-specific logikalar
        if (pageId === 'audit-log' && hasPermission(state.currentUser, 'audit:view')) {
            if (state.auditLog.initialLoad) {
                renderAuditLogTable();
                renderAuditLogPagination();
            }
        }
        
        if (pageId === 'pivot-reports' && !state.pivotGrid) {
            setupPivot();
        }
        
        if (pageId === 'comparison' && hasPermission(state.currentUser, 'comparison:view')) {
            try {
                const { setupComparison } = await import('./comparison.js');
                setupComparison();
            } catch (error) {
                console.error('Comparison modulini yuklashda xatolik:', error);
            }
        }
        
        if (pageId === 'security') {
            fetchAndRenderMySessions();
        }
        
        if (pageId === 'employee-statistics' && hasPermission(state.currentUser, 'dashboard:view')) {
            // Elementlarni ko'rsatish
            const statsGrid = document.getElementById('kpi-stats-grid');
            const topCard = document.getElementById('top-performers-card');
            const detailsView = document.getElementById('employee-details-view');
            
            if (statsGrid) statsGrid.style.display = 'grid';
            if (topCard && state.kpi.data.length >= 3) topCard.style.display = 'block';
            if (detailsView) detailsView.style.display = 'none';
            
            // Agar ma'lumotlar yo'q bo'lsa, yuklash
            if (!state.kpi.data || state.kpi.data.length === 0) {
                setupKpiPage();
            }
        }
        
        // Agar loader yashirilishi kerak bo'lsa
        if (hideLoaderAfter) {
            // Sahifa to'liq render bo'lguncha biroz kutish
            requestAnimationFrame(() => {
                setTimeout(() => {
                    hidePageLoader();
                }, 200);
            });
        }
    }
}

export function handleNavigation(e) {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    e.preventDefault();
    navigateTo(link.dataset.page);
}
