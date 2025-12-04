// Comparison Module
// Operatorlar kiritgan qiymatlarni umumiy qiymatlar bilan solishtirish

import { state } from './state.js';
import { DOM } from './dom.js';
import { safeFetch } from './api.js';
import { showToast, hasPermission } from './utils.js';

let comparisonDatePicker = null;

// flatpickr global o'zgaruvchi sifatida mavjud (CDN orqali yuklangan)

/**
 * Comparison bo'limini sozlash
 */
export function setupComparison() {
    if (!hasPermission(state.currentUser, 'comparison:view')) {
        return;
    }

    // Sana tanlash
    const dateFilter = document.getElementById('comparison-date-filter');
    if (dateFilter && typeof window.flatpickr !== 'undefined') {
        comparisonDatePicker = window.flatpickr(dateFilter, {
            mode: "range",
            dateFormat: "Y-m-d",
            locale: 'ru',
            defaultDate: [
                new Date(new Date().setDate(new Date().getDate() - 29)),
                new Date()
            ]
        });
    }

    // Brendlar ro'yxatini yuklash
    loadBrands();

    // Event listener'lar
    const loadBtn = document.getElementById('comparison-load-btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', loadComparisonData);
    }

    const exportBtn = document.getElementById('comparison-export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportComparisonData);
    }

    const notifyBtn = document.getElementById('comparison-notify-btn');
    if (notifyBtn) {
        notifyBtn.addEventListener('click', sendNotifications);
    }
}

/**
 * Brendlar ro'yxatini yuklash
 */
async function loadBrands() {
    try {
        const res = await safeFetch('/api/brands');
        if (!res || !res.ok) return;

        const brands = await res.json();
        const select = document.getElementById('comparison-brand-select');
        if (!select) return;

        // Mavjud option'larni saqlash (birinchi "Barcha brendlar")
        const firstOption = select.querySelector('option');
        select.innerHTML = '';
        if (firstOption) {
            select.appendChild(firstOption);
        }

        brands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Brendlarni yuklashda xatolik:', error);
    }
}

/**
 * Solishtirish ma'lumotlarini yuklash
 */
async function loadComparisonData() {
    const dateFilter = document.getElementById('comparison-date-filter');
    const brandSelect = document.getElementById('comparison-brand-select');
    const tableBody = document.getElementById('comparison-table-body');
    const summaryContainer = document.getElementById('comparison-summary');
    const loadBtn = document.getElementById('comparison-load-btn');

    if (!dateFilter || !tableBody) return;

    const selectedDates = comparisonDatePicker?.selectedDates || [];
    if (selectedDates.length < 2) {
        showToast('Iltimos, sana oralig\'ini tanlang', true);
        return;
    }

    const formatDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startDate = formatDate(selectedDates[0]);
    const endDate = formatDate(selectedDates[1]);
    const brandId = brandSelect?.value || '';

    try {
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.innerHTML = '<i data-feather="loader"></i> <span>Yuklanmoqda...</span>';
        }

        const params = new URLSearchParams({ startDate, endDate });
        if (brandId) params.append('brandId', brandId);

        const res = await safeFetch(`/api/comparison/data?${params.toString()}`);
        if (!res || !res.ok) {
            throw new Error('Ma\'lumotlarni yuklashda xatolik');
        }

        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Ma\'lumotlar topilmadi');
        }

        // Summary ko'rsatish
        renderSummary(data.summary);

        // Jadval ko'rsatish
        renderTable(data.data);

    } catch (error) {
        console.error('Solishtirish ma\'lumotlarini yuklashda xatolik:', error);
        showToast(error.message || 'Xatolik yuz berdi', true);
    } finally {
        if (loadBtn) {
            loadBtn.disabled = false;
            loadBtn.innerHTML = '<i data-feather="search"></i> <span>Qidirish</span>';
        }
    }
}

/**
 * Summary kartalarini ko'rsatish
 */
function renderSummary(summary) {
    const container = document.getElementById('comparison-summary');
    if (!container || !summary) return;

    container.innerHTML = `
        <div class="card" style="padding: 15px; background: linear-gradient(135deg, rgba(0, 123, 255, 0.1), rgba(138, 43, 226, 0.05));">
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;">Jami Brendlar</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${summary.total_brands || 0}</div>
        </div>
        <div class="card" style="padding: 15px; background: linear-gradient(135deg, rgba(40, 167, 69, 0.1), rgba(25, 135, 84, 0.05));">
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;">Umumiy Summa</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${(summary.total_sum || 0).toLocaleString('ru-RU')}</div>
        </div>
        <div class="card" style="padding: 15px; background: linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.05));">
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 5px;">Jami Hisobotlar</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${summary.total_reports || 0}</div>
        </div>
    `;
}

/**
 * Jadvalni ko'rsatish
 */
function renderTable(data) {
    const tableBody = document.getElementById('comparison-table-body');
    if (!tableBody) return;

    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    Ma'lumotlar topilmadi
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    for (const brand of data) {
        if (brand.operators.length === 0) {
            html += `
                <tr>
                    <td><strong>${brand.brand_name}</strong></td>
                    <td>${brand.total_sum.toLocaleString('ru-RU')}</td>
                    <td colspan="5" style="text-align: center; color: var(--text-secondary);">Operatorlar yo'q</td>
                </tr>
            `;
        } else {
            brand.operators.forEach((operator, index) => {
                const percentage = parseFloat(operator.percentage);
                const percentageClass = percentage < 10 || percentage > 90 ? 'text-danger' : '';
                
                html += `
                    <tr>
                        ${index === 0 ? `<td rowspan="${brand.operators.length}"><strong>${brand.brand_name}</strong></td>` : ''}
                        ${index === 0 ? `<td rowspan="${brand.operators.length}">${brand.total_sum.toLocaleString('ru-RU')}</td>` : ''}
                        <td>${operator.operator_name}</td>
                        <td>${operator.total.toLocaleString('ru-RU')}</td>
                        <td class="${percentageClass}">${operator.percentage}%</td>
                        <td>${operator.reports_count}</td>
                        <td>${operator.locations.join(', ')}</td>
                    </tr>
                `;
            });
        }
    }

    tableBody.innerHTML = html;
}

/**
 * Excel export
 */
async function exportComparisonData() {
    const dateFilter = document.getElementById('comparison-date-filter');
    const brandSelect = document.getElementById('comparison-brand-select');

    if (!dateFilter) return;

    const selectedDates = comparisonDatePicker?.selectedDates || [];
    if (selectedDates.length < 2) {
        showToast('Iltimos, sana oralig\'ini tanlang', true);
        return;
    }

    const formatDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startDate = formatDate(selectedDates[0]);
    const endDate = formatDate(selectedDates[1]);
    const brandId = brandSelect?.value || '';

    try {
        const params = new URLSearchParams({ startDate, endDate });
        if (brandId) params.append('brandId', brandId);

        window.location.href = `/api/comparison/export?${params.toString()}`;
        showToast('Excel fayl yuklanmoqda...', false);
    } catch (error) {
        console.error('Export xatolik:', error);
        showToast('Export qilishda xatolik', true);
    }
}

/**
 * Bildirishnoma yuborish
 */
async function sendNotifications() {
    const dateFilter = document.getElementById('comparison-date-filter');
    const brandSelect = document.getElementById('comparison-brand-select');
    const notifyBtn = document.getElementById('comparison-notify-btn');

    if (!dateFilter) return;

    const selectedDates = comparisonDatePicker?.selectedDates || [];
    if (selectedDates.length < 2) {
        showToast('Iltimos, sana oralig\'ini tanlang', true);
        return;
    }

    const formatDate = (date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const startDate = formatDate(selectedDates[0]);
    const endDate = formatDate(selectedDates[1]);
    const brandId = brandSelect?.value || '';

    // Threshold so'raladi
    const threshold = prompt('Farq foizini kiriting (default: 10%):', '10');
    if (!threshold) return;

    try {
        if (notifyBtn) {
            notifyBtn.disabled = true;
            notifyBtn.innerHTML = '<i data-feather="loader"></i> <span>Yuborilmoqda...</span>';
        }

        const res = await safeFetch('/api/comparison/notify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                startDate,
                endDate,
                brandId: brandId || null,
                threshold: parseFloat(threshold) || 10
            })
        });

        if (!res || !res.ok) {
            throw new Error('Bildirishnoma yuborishda xatolik');
        }

        const data = await res.json();
        if (data.success) {
            showToast(`✅ ${data.notifications_sent} ta bildirishnoma yuborildi. ${data.notifications_failed > 0 ? `(${data.notifications_failed} ta xatolik)` : ''}`, false);
        } else {
            throw new Error(data.error || 'Xatolik yuz berdi');
        }

    } catch (error) {
        console.error('Bildirishnoma yuborishda xatolik:', error);
        showToast(error.message || 'Xatolik yuz berdi', true);
    } finally {
        if (notifyBtn) {
            notifyBtn.disabled = false;
            notifyBtn.innerHTML = '<i data-feather="send"></i> <span>Bildirishnoma Yuborish</span>';
        }
    }
}

