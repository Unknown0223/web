// Модуль интерактивных отчетов (Pivot)
// Управление сводными таблицами и шаблонами

import { state, setPivotDatePicker, pivotDatePickerFP } from './state.js';
import { DOM } from './dom.js';
import { safeFetch } from './api.js';
import { showToast, debounce, hasPermission, showConfirmDialog } from './utils.js';

/**
 * Показать индикатор загрузки над pivot таблицей
 */
function showPivotLoader() {
    const container = document.getElementById('pivot-container');
    if (container && !container.querySelector('.pivot-loader')) {
        const loader = document.createElement('div');
        loader.className = 'pivot-loader';
        loader.innerHTML = '<div class="spinner"></div><p>Загрузка данных...</p>';
        loader.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:999;';
        container.style.position = 'relative';
        container.style.opacity = '0.5';
        container.appendChild(loader);
    }
}

/**
 * Скрыть индикатор загрузки
 */
function hidePivotLoader() {
    const container = document.getElementById('pivot-container');
    if (container) {
        const loader = container.querySelector('.pivot-loader');
        if (loader) loader.remove();
        container.style.opacity = '1';
    }
}

/**
 * Настроить кастомизацию панели инструментов pivot таблицы
 * @param {Object} toolbar - объект панели инструментов WebDataRocks
 */
function customizePivotToolbar(toolbar) {
    let tabs = toolbar.getTabs();
    
    // Убираем кнопку "Connect" (подключение к источникам данных)
    tabs = tabs.filter(tab => tab.id !== 'wdr-tab-connect');
    
    // Настраиваем кнопку "Save" - открывать модальное окно для сохранения шаблона
    tabs = tabs.map(tab => {
        if (tab.id === 'wdr-tab-save') {
            tab.handler = () => {
                // Открываем модальное окно для сохранения шаблона
                if (DOM.saveTemplateModal) {
                    DOM.saveTemplateModal.classList.remove('hidden');
                    DOM.templateNameInput.focus();
                }
            };
            tab.title = 'Сохранить шаблон';
        }
        
        // Настраиваем кнопку "Open" - показать список сохранённых шаблонов
        if (tab.id === 'wdr-tab-open') {
            tab.handler = () => {
                // Открываем модальное окно со списком шаблонов
                if (DOM.loadTemplateModal) {
                    DOM.loadTemplateModal.classList.remove('hidden');
                    renderTemplatesList();
                }
            };
            tab.title = 'Загрузить шаблон';
            // Dropdown menyusini butunlay olib tashlaymiz
            tab.menu = [];
            delete tab.menu;
        }
        
        return tab;
    });

    // Создаём две отдельные кнопки для сворачивания и разворачивания
    // Показываем только одну в зависимости от состояния через CSS
    
    const expandAllTab = {
        id: 'custom-expand-all',
        title: 'Развернуть все данные',
        icon: `<svg width="20" height="20" viewBox="0 0 20 20">
                <path d="M13 3 L17 3 L17 7 M3 13 L3 17 L7 17" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M17 3 L11 9 M3 17 L9 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
               </svg>`,
        handler: () => {
            if (state.pivotGrid && typeof state.pivotGrid.expandAllData === 'function') {
                state.pivotGrid.expandAllData();
                
                setTimeout(() => {
                    const expandBtn = document.querySelector('[id="custom-expand-all"]');
                    const collapseBtn = document.querySelector('[id="custom-collapse-all"]');
                    
                    if (expandBtn && collapseBtn) {
                        expandBtn.style.setProperty('display', 'none', 'important');
                        collapseBtn.style.setProperty('display', 'inline-block', 'important');
                    }
                }, 50);
            }
        }
    };
    
    const collapseAllTab = {
        id: 'custom-collapse-all',
        title: 'Свернуть все данные',
        icon: `<svg width="20" height="20" viewBox="0 0 20 20">
                <path d="M9 5 L9 9 L5 9 M11 15 L11 11 L15 11" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 9 L3 3 M11 11 L17 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
               </svg>`,
        handler: () => {
            if (state.pivotGrid && typeof state.pivotGrid.collapseAllData === 'function') {
                state.pivotGrid.collapseAllData();
                
                setTimeout(() => {
                    const expandBtn = document.querySelector('[id="custom-expand-all"]');
                    const collapseBtn = document.querySelector('[id="custom-collapse-all"]');
                    
                    if (expandBtn && collapseBtn) {
                        collapseBtn.style.setProperty('display', 'none', 'important');
                        expandBtn.style.setProperty('display', 'inline-block', 'important');
                    }
                }, 50);
            }
        }
    };

    // Обе кнопки добавляем, но используем абсолютное позиционирование для наложения
    tabs.unshift(collapseAllTab);
    tabs.unshift(expandAllTab);
    
    // Начальное состояние: данные свёрнуты, показываем кнопку "Развернуть"
    setTimeout(() => {
        const expandBtn = document.querySelector('[id="custom-expand-all"]');
        const collapseBtn = document.querySelector('[id="custom-collapse-all"]');
        
        if (expandBtn && collapseBtn) {
            collapseBtn.style.cssText = 'display: none !important;';
            expandBtn.style.cssText = 'display: inline-block !important;';
        }
    }, 200);
    
    toolbar.getTabs = () => tabs;
}

/**
 * Инициализация модуля Pivot
 * Создает экземпляр WebDataRocks с русской локализацией
 */
export function setupPivot() {
    // Проверка прав доступа
    if (!hasPermission(state.currentUser, 'reports:view_all') || !DOM.pivotContainer) {
        return;
    }
    
    // Faqat admin uchun public shablon yaratish imkonini ko'rsatamiz
    if (state.currentUser && state.currentUser.role === 'admin' && DOM.publicTemplateOption) {
        DOM.publicTemplateOption.style.display = 'block';
    }
    
    // Shablonlar ro'yxatini yuklash
    renderTemplatesAsTags();

    // Настройка выбора диапазона дат с помощью flatpickr
    const fpInstance = flatpickr(DOM.pivotDateFilter, {
        mode: "range",
        dateFormat: "Y-m-d",
        locale: 'ru',
        defaultDate: [ 
            new Date(new Date().setDate(new Date().getDate() - 29)), 
            new Date() 
        ],
        onChange: debounce(async (selectedDates) => {
            console.log('📅 [PIVOT] Sana tanlandi:', selectedDates);
            
            const selectedCurrency = DOM.pivotCurrencySelect?.value || 'UZS';
            
            if (selectedDates.length === 1) {
                // Bitta sana tanlansa, boshlanish va tugash sanasi bir xil
                const singleDate = flatpickr.formatDate(selectedDates[0], 'Y-m-d');
                console.log('📅 [PIVOT] Bitta sana:', singleDate);
                updatePivotData(singleDate, singleDate, selectedCurrency);
                await loadExchangeRates(singleDate, singleDate);
            } else if (selectedDates.length === 2) {
                // Ikkita sana tanlansa, oraliq
                const startDate = flatpickr.formatDate(selectedDates[0], 'Y-m-d');
                const endDate = flatpickr.formatDate(selectedDates[1], 'Y-m-d');
                console.log('📅 [PIVOT] Sana oralig\'i:', startDate, '-', endDate);
                updatePivotData(startDate, endDate, selectedCurrency);
                await loadExchangeRates(startDate, endDate);
            }
        }, 500)
    });
    
    setPivotDatePicker(fpInstance);

    // Инициализация WebDataRocks с русской локализацией
    state.pivotGrid = new WebDataRocks({
        container: "#pivot-container",
        toolbar: true,
        beforetoolbarcreated: customizePivotToolbar,
        report: {
            dataSource: { 
                data: [] 
            },
            options: { 
                grid: { 
                    title: "Сводная таблица отчетов", 
                    showHeaders: true, 
                    showTotals: "on", 
                    showGrandTotals: "on",
                    type: "compact"
                },
                configuratorActive: false,
                datePattern: "dd.MM.yyyy"
            },
            formats: [{
                name: "currency", 
                thousandsSeparator: " ", 
                decimalPlaces: 0, 
                currencySymbol: " сум", 
                currencySymbolAlign: "right",
                nullValue: "0"
            }]
        },
        reportcomplete: function() {
            hidePivotLoader();
        }
    });
    
    // Rus tilini o'rnatish
    if (state.pivotGrid && typeof state.pivotGrid.setLocalization === 'function') {
        state.pivotGrid.setLocalization('/webdatarocks.ru.json');
    }

    // Valyuta tanlash selector'iga event listener qo'shish
    if (DOM.pivotCurrencySelect) {
        DOM.pivotCurrencySelect.addEventListener('change', () => {
            if (pivotDatePickerFP && pivotDatePickerFP.selectedDates.length >= 1) {
                const selectedCurrency = DOM.pivotCurrencySelect.value || 'UZS';
                if (pivotDatePickerFP.selectedDates.length === 1) {
                    const singleDate = flatpickr.formatDate(pivotDatePickerFP.selectedDates[0], 'Y-m-d');
                    updatePivotData(singleDate, singleDate, selectedCurrency);
                } else if (pivotDatePickerFP.selectedDates.length === 2) {
                    const startDate = flatpickr.formatDate(pivotDatePickerFP.selectedDates[0], 'Y-m-d');
                    const endDate = flatpickr.formatDate(pivotDatePickerFP.selectedDates[1], 'Y-m-d');
                    updatePivotData(startDate, endDate, selectedCurrency);
                }
            }
        });
    }
    
    // Загрузка данных при инициализации (если даты уже выбраны)
    if (pivotDatePickerFP && pivotDatePickerFP.selectedDates.length === 2) {
        const startDate = flatpickr.formatDate(pivotDatePickerFP.selectedDates[0], 'Y-m-d');
        const endDate = flatpickr.formatDate(pivotDatePickerFP.selectedDates[1], 'Y-m-d');
        const selectedCurrency = DOM.pivotCurrencySelect?.value || 'UZS';
        updatePivotData(startDate, endDate, selectedCurrency);
        // Kurslarni yuklash
        loadExchangeRates(startDate, endDate);
    }
    
    // Kurslarni yangilash tugmasi
    const refreshRatesBtn = document.getElementById('refresh-rates-btn');
    if (refreshRatesBtn) {
        refreshRatesBtn.addEventListener('click', async () => {
            if (pivotDatePickerFP && pivotDatePickerFP.selectedDates.length >= 1) {
                const startDate = pivotDatePickerFP.selectedDates.length === 1 
                    ? flatpickr.formatDate(pivotDatePickerFP.selectedDates[0], 'Y-m-d')
                    : flatpickr.formatDate(pivotDatePickerFP.selectedDates[0], 'Y-m-d');
                const endDate = pivotDatePickerFP.selectedDates.length === 2
                    ? flatpickr.formatDate(pivotDatePickerFP.selectedDates[1], 'Y-m-d')
                    : startDate;
                await loadExchangeRates(startDate, endDate, true);
            }
        });
    }
}

/**
 * Загрузить и обновить данные в pivot таблице
 * @param {string} startDate - начальная дата в формате YYYY-MM-DD
 * @param {string} endDate - конечная дата в формате YYYY-MM-DD
 * @param {string} currency - tanlangan valyuta (UZS, USD, EUR, RUB, KZT)
 */
async function updatePivotData(startDate, endDate, currency = 'UZS') {
    console.log('🔍 [PIVOT] updatePivotData chaqirildi:', { startDate, endDate });
    
    if (!state.pivotGrid) {
        console.error('❌ [PIVOT] state.pivotGrid mavjud emas!');
        return;
    }
    
    showPivotLoader();
    
    try {
        const params = new URLSearchParams({ startDate, endDate, currency });
        const url = `/api/pivot/data?${params.toString()}`;
        console.log('📡 [PIVOT] Ma\'lumot so\'ralmoqda:', url, 'Valyuta:', currency);
        
        const res = await safeFetch(url);
        
        // console.log('📥 [PIVOT] Response olindi:', res?.status, res?.ok);
        
        if (!res || !res.ok) {
            throw new Error('Не удалось загрузить данные для сводной таблицы');
        }
        
        const data = await res.json();
        
        console.log('✅ [PIVOT] Ma\'lumot parse qilindi:', {
            length: data.length,
            firstItem: data[0],
            keys: data[0] ? Object.keys(data[0]) : []
        });
        
        if (data.length === 0) {
            console.warn('⚠️ [PIVOT] Ma\'lumot topilmadi! Belgilangan sana uchun hisobotlar yo\'q.');
        }
        
        // Ma'lumotlarni qayta ishlash - Дата maydonidan kun raqamini ajratib olish
        const processedData = data.map(item => {
            // Дата: "2025-10-01" -> Kun: 1
            const dateStr = item["Дата"];
            let dayNumber = dateStr;
            
            if (dateStr && typeof dateStr === 'string') {
                const dateParts = dateStr.split('-');
                if (dateParts.length === 3) {
                    dayNumber = parseInt(dateParts[2], 10); // Kunni olish
                }
            }
            
            return {
                ...item,
                "День": dayNumber, // Yangi maydon - kun raqami
                "Дата полная": dateStr // To'liq sana
            };
        });
        
        console.log('🔄 [PIVOT] Ma\'lumotlar qayta ishlandi:', {
            length: processedData.length,
            firstProcessed: processedData[0]
        });
        
        // Valyuta belgisi va formatini aniqlash
        const currencySymbols = {
            'UZS': 'so\'m',
            'USD': '$',
            'EUR': '€',
            'RUB': '₽',
            'KZT': '₸'
        };
        const currencySymbol = currencySymbols[currency] || 'so\'m';
        const currencyFormat = currency === 'UZS' ? ' сум' : ` ${currencySymbol}`;
        
        // Report konfiguratsiyasi
        const pivotReport = {
            dataSource: { 
                data: processedData 
            },
            slice: {
                rows: [
                    { uniqueName: "Бренд" },
                    { uniqueName: "Филиал" }
                ],
                columns: [
                    { uniqueName: "День" },  // Kun raqami ustunlarda
                    { uniqueName: "Тип оплаты" }
                ],
                measures: [
                    { 
                        uniqueName: "Сумма",
                        aggregation: "sum",
                        format: "currency"
                    }
                ],
                reportFilters: [
                    { uniqueName: "Показатель" },
                    { uniqueName: "Сотрудник" },
                    { uniqueName: "Дата полная" }  // To'liq sana filter uchun
                ]
            },
            options: {
                grid: {
                    title: `Сводная таблица (${currency})`,
                    showHeaders: true,
                    showTotals: "on",
                    showGrandTotals: "on",
                    type: "compact"
                },
                configuratorActive: false,
                datePattern: "dd.MM.yyyy"
            },
            formats: [{
                name: "currency",
                thousandsSeparator: " ",
                decimalPlaces: 0,
                currencySymbol: currencyFormat,
                currencySymbolAlign: currency === 'UZS' ? "right" : "left",
                nullValue: "0"
            }]
        };
        
        // console.log('� [PIVOT] Report konfiguratsiyasi:', pivotReport);
        
        // Обновляем отчет полностью
        state.pivotGrid.setReport(pivotReport);
        
        // console.log('✅ [PIVOT] setReport yuborildi');
        
        // Сворачиваем все данные по умолчанию (пользователь сам развернёт нужное)
        setTimeout(() => {
            if (data.length > 0) {
                // console.log('🔒 [PIVOT] collapseAllData chaqirilmoqda...');
                state.pivotGrid.collapseAllData();
            }
            hidePivotLoader();
        }, 500);
        
    } catch (error) {
        // console.error('Ошибка загрузки данных pivot:', error);
        showToast(error.message, true);
        hidePivotLoader();
        
        // Устанавливаем пустой отчет при ошибке
        state.pivotGrid.setReport({ 
            dataSource: { data: [] }, 
            options: { 
                grid: { 
                    title: "Ошибка загрузки данных" 
                } 
            } 
        });
    }
}

/**
 * Отобразить список сохраненных шаблонов в виде тегов
 */
export async function renderTemplatesAsTags() {
    if (!DOM.templatesTagList) {
        return;
    }
    
    try {
        const res = await safeFetch('/api/pivot/templates');
        
        if (!res || !res.ok) {
            throw new Error('Не удалось загрузить шаблоны');
        }
        
        state.pivotTemplates = await res.json();
        
        if (state.pivotTemplates.length === 0) {
            DOM.templatesTagList.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; color: var(--text-secondary);">
                    <i data-feather="bookmark" style="width: 48px; height: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                    <p style="margin: 0; font-size: 14px;">Сохранённых шаблонов пока нет</p>
                    <small style="margin-top: 5px; opacity: 0.7;">Создайте первый шаблон, настроив таблицу и нажав кнопку "Сохранить"</small>
                </div>
            `;
            if (typeof feather !== 'undefined') feather.replace();
            return;
        }
        
        // Генерируем HTML для каждого шаблона
        DOM.templatesTagList.innerHTML = state.pivotTemplates.map(template => {
            const canModify = state.currentUser.role === 'admin' || state.currentUser.id === template.created_by;
            const isPublic = template.is_public;
            const publicClass = isPublic ? 'template-tag-public' : '';
            const publicBadge = isPublic ? `<span class="public-badge" title="Публичный шаблон"><i class="fas fa-globe"></i></span>` : '';
            
            const actionsHtml = canModify ? `
                <div class="tag-actions">
                    <button class="btn-icon edit-template-btn" 
                            data-id="${template.id}" 
                            data-name="${template.name}" 
                            data-is-public="${isPublic}"
                            title="Изменить название шаблона">
                        <i data-feather="edit-2" style="width:16px; height:16px;"></i>
                    </button>
                    <button class="btn-icon delete-template-btn" 
                            data-id="${template.id}" 
                            title="Удалить шаблон">
                        <i data-feather="trash-2" style="width:16px; height:16px;"></i>
                    </button>
                </div>
            ` : '';
            
            return `
                <div class="template-tag ${publicClass}" data-id="${template.id}" title="Загрузить этот шаблон">
                    ${publicBadge}
                    <span class="tag-name">${template.name}</span>
                    ${actionsHtml}
                </div>`;
        }).join('');
        
        // Обновляем иконки Feather
        feather.replace();
        
    } catch (error) {
        // console.error('Ошибка загрузки шаблонов:', error);
        showToast(error.message, true);
    }
}

/**
 * Сохранить текущую конфигурацию pivot таблицы как шаблон
 */
export async function savePivotTemplate() {
    const name = DOM.templateNameInput.value.trim();
    
    if (!name) {
        showToast("Пожалуйста, введите название шаблона!", true);
        return;
    }
    
    if (!state.pivotGrid) {
        showToast("Сводная таблица не найдена!", true);
        return;
    }
    
    // Получаем текущий отчет (конфигурацию)
    const report = state.pivotGrid.getReport();
    
    // Admin uchun public flag
    const isPublic = DOM.templateIsPublicCheckbox && DOM.templateIsPublicCheckbox.checked;
    
    try {
        const res = await safeFetch('/api/pivot/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, report, isPublic })
        });
        
        if (!res || !res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || 'Ошибка сохранения шаблона');
        }
        
        showToast("Шаблон успешно сохранен!");
        DOM.saveTemplateModal.classList.add('hidden');
        DOM.templateNameInput.value = '';
        if (DOM.templateIsPublicCheckbox) {
            DOM.templateIsPublicCheckbox.checked = false;
        }
        
        // Обновляем список шаблонов
        renderTemplatesAsTags();
        
    } catch (error) {
        // console.error('Ошибка сохранения шаблона:', error);
        showToast(error.message, true);
    }
}

/**
 * Отрисовка списка шаблонов в модальном окне "Открыть"
 */
export async function renderTemplatesList() {
    if (!DOM.templatesListContainer) {
        return;
    }
    
    try {
        const res = await safeFetch('/api/pivot/templates');
        
        if (!res || !res.ok) {
            throw new Error('Не удалось загрузить шаблоны');
        }
        
        state.pivotTemplates = await res.json();
        
        if (state.pivotTemplates.length === 0) {
            DOM.templatesListContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 30px; text-align: center; color: var(--text-secondary);">
                    <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); display: flex; align-items: center; justify-content: center; margin-bottom: 20px; border: 2px solid rgba(102, 126, 234, 0.2);">
                        <i class="fas fa-bookmark" style="font-size: 36px; color: #667eea; opacity: 0.6;"></i>
                    </div>
                    <p style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">Сохранённых шаблонов пока нет</p>
                    <small style="margin-top: 10px; opacity: 0.7; font-size: 13px; line-height: 1.5;">Создайте первый шаблон, настроив таблицу<br>и нажав кнопку "Сохранить" в панели инструментов</small>
                </div>
            `;
            return;
        }
        
        // Генерируем HTML для каждого шаблона в виде списка
        DOM.templatesListContainer.innerHTML = state.pivotTemplates.map(template => {
            const canDelete = state.currentUser.role === 'admin' || state.currentUser.id === template.created_by;
            const isPublic = template.is_public;
            const publicClass = isPublic ? 'template-list-item-public' : '';
            const publicBadge = isPublic ? `<span class="public-badge-small" title="Публичный шаблон"><i class="fas fa-globe"></i> Публичный</span>` : '';
            
            const deleteButtonHtml = canDelete ? `
                <button class="btn-icon delete-template-modal-btn" 
                        data-id="${template.id}" 
                        title="Удалить шаблон">
                    <i class="fas fa-trash-alt"></i>
                </button>
            ` : '';
            
            return `
                <div class="template-list-item ${publicClass}" data-id="${template.id}">
                    <div class="template-info">
                        <i class="fas ${isPublic ? 'fa-globe' : 'fa-file-alt'}"></i>
                        <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                            <span class="template-list-name">${template.name}</span>
                            ${publicBadge}
                        </div>
                    </div>
                    ${deleteButtonHtml}
                </div>`;
        }).join('');
        
    } catch (error) {
        showToast(error.message, true);
    }
}

/**
 * Обработка действий с шаблонами в модальном окне (загрузка, удаление)
 * @param {Event} e - событие клика
 */
export async function handleTemplateModalActions(e) {
    const listItem = e.target.closest('.template-list-item');
    
    if (!listItem) {
        return;
    }
    
    const deleteButton = e.target.closest('.delete-template-modal-btn');
    const templateId = listItem.dataset.id;

    if (deleteButton) {
        // Предотвращаем загрузку шаблона при клике на кнопку удаления
        e.stopPropagation();
        
        const confirmed = await showConfirmDialog({
            title: 'Удаление шаблона',
            message: 'Вы действительно хотите удалить этот шаблон?',
            confirmText: 'Удалить',
            cancelText: 'Отмена',
            type: 'danger',
            icon: 'trash-2'
        });
        
        if (confirmed) {
            try {
                const res = await safeFetch(`/api/pivot/templates/${templateId}`, { 
                    method: 'DELETE' 
                });
                
                if (!res || !res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || 'Ошибка удаления шаблона');
                }
                
                showToast("Шаблон успешно удален.");
                
                // Обновляем оба списка
                renderTemplatesList();
                renderTemplatesAsTags();
                
            } catch (error) {
                showToast(error.message, true);
            }
        }
    } else {
        // Загрузка шаблона (клик по элементу списка)
        try {
            const res = await safeFetch(`/api/pivot/templates/${templateId}`);
            
            if (!res || !res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Ошибка загрузки шаблона');
            }
            
            const report = await res.json();
            state.pivotGrid.setReport(report);
            
            const templateName = listItem.querySelector('.template-list-name').textContent;
            showToast(`Шаблон "${templateName}" загружен.`);
            
            // Закрываем модальное окно
            DOM.loadTemplateModal.classList.add('hidden');
            
        } catch (error) {
            showToast(error.message, true);
        }
    }
}

/**
 * Обработка действий с шаблонами (загрузка, редактирование, удаление)
 * @param {Event} e - событие клика
 */
export async function handleTemplateActions(e) {
    const tag = e.target.closest('.template-tag');
    
    if (!tag) {
        return;
    }
    
    const button = e.target.closest('button');
    const templateId = tag.dataset.id;

    if (button) {
        // Предотвращаем загрузку шаблона при клике на кнопки действий
        e.stopPropagation();
        
        // Изменение названия шаблона
        if (button.classList.contains('edit-template-btn')) {
            const currentName = button.dataset.name;
            const newName = prompt("Введите новое название для шаблона:", currentName);
            
            if (newName && newName.trim() && newName.trim() !== currentName) {
                try {
                    const res = await safeFetch(`/api/pivot/templates/${templateId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName.trim() })
                    });
                    
                    if (!res || !res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.message || 'Ошибка обновления шаблона');
                    }
                    
                    showToast("Название шаблона успешно изменено.");
                    renderTemplatesAsTags();
                    
                } catch (error) {
                    // console.error('Ошибка редактирования шаблона:', error);
                    showToast(error.message, true);
                }
            }
        } 
        // Удаление шаблона
        else if (button.classList.contains('delete-template-btn')) {
            const confirmed = await showConfirmDialog({
                title: 'Удаление шаблона',
                message: 'Вы действительно хотите удалить этот шаблон?',
                confirmText: 'Удалить',
                cancelText: 'Отмена',
                type: 'danger',
                icon: 'trash-2'
            });
            
            if (confirmed) {
                try {
                    const res = await safeFetch(`/api/pivot/templates/${templateId}`, { 
                        method: 'DELETE' 
                    });
                    
                    if (!res || !res.ok) {
                        const errorData = await res.json();
                        throw new Error(errorData.message || 'Ошибка удаления шаблона');
                    }
                    
                    showToast("Шаблон успешно удален.");
                    renderTemplatesAsTags();
                    
                } catch (error) {
                    // console.error('Ошибка удаления шаблона:', error);
                    showToast(error.message, true);
                }
            }
        }
    } else {
        // Загрузка шаблона (клик по самому тегу)
        try {
            const res = await safeFetch(`/api/pivot/templates/${templateId}`);
            
            if (!res || !res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Ошибка загрузки шаблона');
            }
            
            const report = await res.json();
            state.pivotGrid.setReport(report);
            
            const templateName = tag.querySelector('.tag-name').textContent;
            showToast(`Шаблон "${templateName}" загружен.`);
            
            // Templates panel doimo ochiq turadi
            
        } catch (error) {
            // console.error('Ошибка загрузки шаблона:', error);
            showToast(error.message, true);
        }
    }
}

/**
 * Kurslarni yuklash va ko'rsatish
 * @param {string} startDate - boshlanish sanasi
 * @param {string} endDate - tugash sanasi
 * @param {boolean} forceRefresh - majburiy yangilash
 */
async function loadExchangeRates(startDate, endDate, forceRefresh = false) {
    const ratesContainer = document.getElementById('pivot-exchange-rates');
    const ratesList = document.getElementById('exchange-rates-list');
    const lastUpdated = document.getElementById('rates-last-updated');
    const refreshBtn = document.getElementById('refresh-rates-btn');
    
    if (!ratesContainer || !ratesList) return;
    
    try {
        // Loading holatini ko'rsatish
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner"></i>';
            refreshBtn.classList.add('refreshing');
        }
        
        // Status dot animatsiyasi
        const statusDot = document.querySelector('.status-dot');
        if (statusDot) {
            statusDot.style.animation = 'none';
            setTimeout(() => {
                statusDot.style.animation = 'blink 2s ease-in-out infinite';
            }, 10);
        }
        
        const params = new URLSearchParams({ startDate, endDate });
        if (forceRefresh) {
            params.append('refresh', 'true');
        }
        
        const res = await safeFetch(`/api/pivot/used-currencies?${params.toString()}`);
        
        if (!res || !res.ok) {
            throw new Error('Kurslarni olishda xatolik');
        }
        
        const data = await res.json();
        
        if (!data.currencies || data.currencies.length === 0) {
            ratesContainer.style.display = 'none';
            return;
        }
        
        // Kurslar ro'yxatini ko'rsatish
        ratesList.innerHTML = '';
        
        // Container'ga loading class qo'shish
        if (ratesContainer) {
            ratesContainer.classList.add('loading');
        }
        
        // Animatsiya delay uchun
        data.currencies.forEach((rate, index) => {
            setTimeout(() => {
                const rateCard = document.createElement('div');
                rateCard.className = 'exchange-rate-card';
                rateCard.setAttribute('data-currency', rate.currency);
                
                // Formatlash - raqamlarni chiroyli ko'rsatish
                const formattedRate = Math.round(rate.rate).toLocaleString('ru-RU');
                
                rateCard.innerHTML = `
                    <div class="rate-card-header">
                        <span class="rate-card-symbol">${rate.symbol}</span>
                        <span class="rate-card-currency">${rate.currency}</span>
                    </div>
                    <div class="rate-card-value">
                        <strong>1 ${rate.currency}</strong> = ${formattedRate} so'm
                    </div>
                `;
                
                // Click event - kursni tanlash va ripple effekti
                rateCard.addEventListener('click', (e) => {
                    // Ripple effekti
                    const ripple = document.createElement('span');
                    ripple.className = 'ripple';
                    const rect = rateCard.getBoundingClientRect();
                    const size = Math.max(rect.width, rect.height);
                    const x = e.clientX - rect.left - size / 2;
                    const y = e.clientY - rect.top - size / 2;
                    ripple.style.width = ripple.style.height = size + 'px';
                    ripple.style.left = x + 'px';
                    ripple.style.top = y + 'px';
                    rateCard.appendChild(ripple);
                    
                    setTimeout(() => {
                        ripple.remove();
                    }, 600);
                    
                    // Animatsiya effekti
                    rateCard.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        rateCard.style.transform = '';
                    }, 150);
                    
                    // Kursni clipboard'ga nusxalash
                    const textToCopy = `1 ${rate.currency} = ${formattedRate} so'm`;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(textToCopy).then(() => {
                            showToast(`✅ Kurs nusxalandi: ${textToCopy}`, false);
                        }).catch(() => {
                            // Clipboard xatolik bo'lsa, hech narsa qilmaymiz
                        });
                    }
                });
                
                // Hover effektlari CSS orqali boshqariladi
                ratesList.appendChild(rateCard);
                
                // Animatsiya
                rateCard.style.opacity = '0';
                rateCard.style.transform = 'translateY(20px)';
                setTimeout(() => {
                    rateCard.style.transition = 'all 0.4s ease-out';
                    rateCard.style.opacity = '1';
                    rateCard.style.transform = 'translateY(0)';
                }, 10);
            }, index * 100); // Har bir karta 100ms delay bilan
        });
        
        // Loading class'ni olib tashlash
        setTimeout(() => {
            if (ratesContainer) {
                ratesContainer.classList.remove('loading');
            }
        }, data.currencies.length * 100 + 200);
        
        // Yangilanish vaqtini ko'rsatish
        if (lastUpdated && data.lastUpdated) {
            const updateTime = new Date(data.lastUpdated);
            const now = new Date();
            const diffMinutes = Math.floor((now - updateTime) / 60000);
            const diffSeconds = Math.floor((now - updateTime) / 1000);
            
            let timeText = '';
            if (diffSeconds < 10) {
                timeText = 'Hozir yangilandi';
            } else if (diffSeconds < 60) {
                timeText = `${diffSeconds} soniya oldin`;
            } else if (diffMinutes < 60) {
                timeText = `${diffMinutes} daqiqa oldin`;
            } else {
                const hours = Math.floor(diffMinutes / 60);
                timeText = `${hours} soat oldin`;
            }
            
            lastUpdated.textContent = timeText;
            
            // Real-time yangilanish - har 30 soniyada yangilash
            if (window.ratesUpdateInterval) {
                clearInterval(window.ratesUpdateInterval);
            }
            
            window.ratesUpdateInterval = setInterval(() => {
                const newNow = new Date();
                const newDiffSeconds = Math.floor((newNow - updateTime) / 1000);
                const newDiffMinutes = Math.floor(newDiffSeconds / 60);
                
                if (newDiffSeconds < 10) {
                    lastUpdated.textContent = 'Hozir yangilandi';
                } else if (newDiffSeconds < 60) {
                    lastUpdated.textContent = `${newDiffSeconds} soniya oldin`;
                } else if (newDiffMinutes < 60) {
                    lastUpdated.textContent = `${newDiffMinutes} daqiqa oldin`;
                } else {
                    const hours = Math.floor(newDiffMinutes / 60);
                    lastUpdated.textContent = `${hours} soat oldin`;
                }
            }, 10000); // Har 10 soniyada yangilash
        }
        
        // Ko'rsatish
        ratesContainer.style.display = 'block';
        
    } catch (error) {
        console.error('Kurslarni yuklashda xatolik:', error);
        ratesContainer.style.display = 'none';
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            refreshBtn.classList.remove('refreshing');
        }
    }
}
