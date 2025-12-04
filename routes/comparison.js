const express = require('express');
const ExcelJS = require('exceljs');
const { db } = require('../db.js');
const { isAuthenticated, hasPermission } = require('../middleware/auth.js');
const { sendToTelegram } = require('../utils/bot.js');

const router = express.Router();

/**
 * GET /api/comparison/data
 * Operatorlar kiritgan qiymatlarni umumiy qiymatlar bilan solishtirish
 * Har bir brend bo'yicha umumiy summalarni qaytaradi
 */
router.get('/data', isAuthenticated, hasPermission('comparison:view'), async (req, res) => {
    try {
        const { startDate, endDate, brandId } = req.query;
        
        // Sana oralig'ini aniqlash
        const query = db('reports as r')
            .leftJoin('brands as b', 'r.brand_id', 'b.id')
            .leftJoin('users as u', 'r.created_by', 'u.id')
            .select(
                'r.id',
                'r.report_date',
                'r.location',
                'r.data',
                'r.currency',
                'b.id as brand_id',
                'b.name as brand_name',
                'u.id as user_id',
                'u.username',
                'u.role'
            );
        
        if (startDate) query.where('r.report_date', '>=', startDate);
        if (endDate) query.where('r.report_date', '<=', endDate);
        if (brandId) query.where('r.brand_id', brandId);
        
        const reports = await query.orderBy('r.report_date', 'desc');
        
        // Har bir brend bo'yicha umumiy summalarni hisoblash
        const brandTotals = {};
        const operatorReports = {};
        
        for (const report of reports) {
            try {
                const reportData = JSON.parse(report.data || '{}');
                const brandId = report.brand_id;
                const brandName = report.brand_name || `Brend #${brandId}`;
                
                if (!brandTotals[brandId]) {
                    brandTotals[brandId] = {
                        brand_id: brandId,
                        brand_name: brandName,
                        total_sum: 0,
                        operator_totals: {},
                        operator_reports: []
                    };
                }
                
                // Barcha qiymatlarni yig'ish
                let reportTotal = 0;
                for (const key in reportData) {
                    const value = parseFloat(reportData[key]) || 0;
                    reportTotal += value;
                }
                
                brandTotals[brandId].total_sum += reportTotal;
                
                // Operator bo'yicha guruhlash
                const operatorId = report.user_id;
                const operatorName = report.username || 'Noma\'lum';
                
                if (!brandTotals[brandId].operator_totals[operatorId]) {
                    brandTotals[brandId].operator_totals[operatorId] = {
                        operator_id: operatorId,
                        operator_name: operatorName,
                        total: 0,
                        reports_count: 0,
                        locations: new Set()
                    };
                }
                
                brandTotals[brandId].operator_totals[operatorId].total += reportTotal;
                brandTotals[brandId].operator_totals[operatorId].reports_count += 1;
                brandTotals[brandId].operator_totals[operatorId].locations.add(report.location);
                
                // Operator hisobotlarini saqlash
                brandTotals[brandId].operator_reports.push({
                    report_id: report.id,
                    report_date: report.report_date,
                    location: report.location,
                    operator_name: operatorName,
                    operator_id: operatorId,
                    total: reportTotal,
                    currency: report.currency || 'UZS'
                });
            } catch (error) {
                console.error(`Report #${report.id} ni parse qilishda xatolik:`, error);
            }
        }
        
        // Formatlash
        const result = Object.values(brandTotals).map(brand => ({
            brand_id: brand.brand_id,
            brand_name: brand.brand_name,
            total_sum: brand.total_sum,
            operators: Object.values(brand.operator_totals).map(op => ({
                operator_id: op.operator_id,
                operator_name: op.operator_name,
                total: op.total,
                reports_count: op.reports_count,
                locations: Array.from(op.locations),
                percentage: brand.total_sum > 0 ? ((op.total / brand.total_sum) * 100).toFixed(2) : '0.00'
            })),
            reports_count: brand.operator_reports.length
        }));
        
        res.json({
            success: true,
            data: result,
            summary: {
                total_brands: result.length,
                total_sum: result.reduce((sum, b) => sum + b.total_sum, 0),
                total_reports: result.reduce((sum, b) => sum + b.reports_count, 0)
            }
        });
    } catch (error) {
        console.error('Solishtirish ma\'lumotlarini olishda xatolik:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * GET /api/comparison/export
 * Solishtirish natijalarini Excel faylga eksport qilish
 */
router.get('/export', isAuthenticated, hasPermission('comparison:export'), async (req, res) => {
    try {
        const { startDate, endDate, brandId } = req.query;
        
        // Ma'lumotlarni to'g'ridan-to'g'ri olish (fetch o'rniga)
        const query = db('reports as r')
            .leftJoin('brands as b', 'r.brand_id', 'b.id')
            .leftJoin('users as u', 'r.created_by', 'u.id')
            .select(
                'r.id',
                'r.report_date',
                'r.location',
                'r.data',
                'r.currency',
                'b.id as brand_id',
                'b.name as brand_name',
                'u.id as user_id',
                'u.username',
                'u.role'
            );
        
        if (startDate) query.where('r.report_date', '>=', startDate);
        if (endDate) query.where('r.report_date', '<=', endDate);
        if (brandId) query.where('r.brand_id', brandId);
        
        const reports = await query.orderBy('r.report_date', 'desc');
        
        // Har bir brend bo'yicha umumiy summalarni hisoblash
        const brandTotals = {};
        
        for (const report of reports) {
            try {
                const reportData = JSON.parse(report.data || '{}');
                const brandId = report.brand_id;
                const brandName = report.brand_name || `Brend #${brandId}`;
                
                if (!brandTotals[brandId]) {
                    brandTotals[brandId] = {
                        brand_id: brandId,
                        brand_name: brandName,
                        total_sum: 0,
                        operator_totals: {}
                    };
                }
                
                let reportTotal = 0;
                for (const key in reportData) {
                    const value = parseFloat(reportData[key]) || 0;
                    reportTotal += value;
                }
                
                brandTotals[brandId].total_sum += reportTotal;
                
                const operatorId = report.user_id;
                const operatorName = report.username || 'Noma\'lum';
                
                if (!brandTotals[brandId].operator_totals[operatorId]) {
                    brandTotals[brandId].operator_totals[operatorId] = {
                        operator_id: operatorId,
                        operator_name: operatorName,
                        total: 0,
                        reports_count: 0,
                        locations: new Set()
                    };
                }
                
                brandTotals[brandId].operator_totals[operatorId].total += reportTotal;
                brandTotals[brandId].operator_totals[operatorId].reports_count += 1;
                brandTotals[brandId].operator_totals[operatorId].locations.add(report.location);
            } catch (error) {
                console.error(`Report #${report.id} ni parse qilishda xatolik:`, error);
            }
        }
        
        const data = {
            success: true,
            data: Object.values(brandTotals).map(brand => ({
                brand_id: brand.brand_id,
                brand_name: brand.brand_name,
                total_sum: brand.total_sum,
                operators: Object.values(brand.operator_totals).map(op => ({
                    operator_id: op.operator_id,
                    operator_name: op.operator_name,
                    total: op.total,
                    reports_count: op.reports_count,
                    locations: Array.from(op.locations),
                    percentage: brand.total_sum > 0 ? ((op.total / brand.total_sum) * 100).toFixed(2) : '0.00'
                }))
            }))
        };
        
        if (!data.success) {
            return res.status(500).json({ success: false, error: 'Ma\'lumotlarni olishda xatolik' });
        }
        
        // Excel workbook yaratish
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Solishtirish Natijalari');
        
        // Sarlavhalar
        worksheet.columns = [
            { header: 'Brend', key: 'brand_name', width: 30 },
            { header: 'Umumiy Summa', key: 'total_sum', width: 20 },
            { header: 'Operator', key: 'operator_name', width: 20 },
            { header: 'Operator Summasi', key: 'operator_total', width: 20 },
            { header: 'Foiz', key: 'percentage', width: 15 },
            { header: 'Hisobotlar Soni', key: 'reports_count', width: 15 },
            { header: 'Filiallar', key: 'locations', width: 30 }
        ];
        
        // Ma'lumotlarni qo'shish
        for (const brand of data.data) {
            if (brand.operators.length === 0) {
                worksheet.addRow({
                    brand_name: brand.brand_name,
                    total_sum: brand.total_sum,
                    operator_name: '-',
                    operator_total: '-',
                    percentage: '-',
                    reports_count: brand.reports_count,
                    locations: '-'
                });
            } else {
                for (const operator of brand.operators) {
                    worksheet.addRow({
                        brand_name: brand.brand_name,
                        total_sum: brand.total_sum,
                        operator_name: operator.operator_name,
                        operator_total: operator.total,
                        percentage: `${operator.percentage}%`,
                        reports_count: operator.reports_count,
                        locations: operator.locations.join(', ')
                    });
                }
            }
        }
        
        // Stil qo'shish
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };
        
        // Response
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="solishtirish_${new Date().toISOString().split('T')[0]}.xlsx"`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel export xatolik:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/comparison/notify
 * Farqlar haqida operatorlarga bildirishnoma yuborish
 */
router.post('/notify', isAuthenticated, hasPermission('comparison:notify'), async (req, res) => {
    try {
        const { startDate, endDate, brandId, threshold } = req.body;
        
        // Ma'lumotlarni to'g'ridan-to'g'ri olish
        const query = db('reports as r')
            .leftJoin('brands as b', 'r.brand_id', 'b.id')
            .leftJoin('users as u', 'r.created_by', 'u.id')
            .select(
                'r.id',
                'r.report_date',
                'r.location',
                'r.data',
                'r.currency',
                'b.id as brand_id',
                'b.name as brand_name',
                'u.id as user_id',
                'u.username',
                'u.role'
            );
        
        if (startDate) query.where('r.report_date', '>=', startDate);
        if (endDate) query.where('r.report_date', '<=', endDate);
        if (brandId) query.where('r.brand_id', brandId);
        
        const reports = await query.orderBy('r.report_date', 'desc');
        
        const brandTotals = {};
        
        for (const report of reports) {
            try {
                const reportData = JSON.parse(report.data || '{}');
                const brandId = report.brand_id;
                const brandName = report.brand_name || `Brend #${brandId}`;
                
                if (!brandTotals[brandId]) {
                    brandTotals[brandId] = {
                        brand_id: brandId,
                        brand_name: brandName,
                        total_sum: 0,
                        operator_totals: {}
                    };
                }
                
                let reportTotal = 0;
                for (const key in reportData) {
                    const value = parseFloat(reportData[key]) || 0;
                    reportTotal += value;
                }
                
                brandTotals[brandId].total_sum += reportTotal;
                
                const operatorId = report.user_id;
                const operatorName = report.username || 'Noma\'lum';
                
                if (!brandTotals[brandId].operator_totals[operatorId]) {
                    brandTotals[brandId].operator_totals[operatorId] = {
                        operator_id: operatorId,
                        operator_name: operatorName,
                        total: 0,
                        reports_count: 0,
                        locations: new Set()
                    };
                }
                
                brandTotals[brandId].operator_totals[operatorId].total += reportTotal;
                brandTotals[brandId].operator_totals[operatorId].reports_count += 1;
                brandTotals[brandId].operator_totals[operatorId].locations.add(report.location);
            } catch (error) {
                console.error(`Report #${report.id} ni parse qilishda xatolik:`, error);
            }
        }
        
        const data = {
            success: true,
            data: Object.values(brandTotals).map(brand => ({
                brand_id: brand.brand_id,
                brand_name: brand.brand_name,
                total_sum: brand.total_sum,
                operators: Object.values(brand.operator_totals).map(op => ({
                    operator_id: op.operator_id,
                    operator_name: op.operator_name,
                    total: op.total,
                    reports_count: op.reports_count,
                    locations: Array.from(op.locations),
                    percentage: brand.total_sum > 0 ? ((op.total / brand.total_sum) * 100).toFixed(2) : '0.00'
                }))
            }))
        };
        
        if (!data.success) {
            return res.status(500).json({ success: false, error: 'Ma\'lumotlarni olishda xatolik' });
        }
        
        const thresholdPercent = parseFloat(threshold) || 10; // Default 10%
        const notifications = [];
        
        // Har bir brend va operator uchun tekshirish
        for (const brand of data.data) {
            for (const operator of brand.operators) {
                const percentage = parseFloat(operator.percentage);
                
                // Agar operator summasi umumiy summadan farq qilsa
                if (percentage < thresholdPercent || percentage > (100 - thresholdPercent)) {
                    // Operator ma'lumotlarini olish
                    const operatorUser = await db('users')
                        .where({ id: operator.operator_id })
                        .first();
                    
                    if (operatorUser && operatorUser.telegram_chat_id) {
                        const message = `⚠️ *Farq Aniqlandi*\n\n` +
                            `📊 *Brend:* ${brand.brand_name}\n` +
                            `👤 *Operator:* ${operator.operator_name}\n` +
                            `💰 *Umumiy Summa:* ${brand.total_sum.toLocaleString('ru-RU')}\n` +
                            `💵 *Sizning Summangiz:* ${operator.total.toLocaleString('ru-RU')}\n` +
                            `📈 *Foiz:* ${operator.percentage}%\n` +
                            `📝 *Hisobotlar Soni:* ${operator.reports_count}\n` +
                            `🏢 *Filiallar:* ${operator.locations.join(', ')}\n\n` +
                            `Iltimos, kiritilgan ma'lumotlarni tekshiring.`;
                        
                        try {
                            await sendToTelegram(operatorUser.telegram_chat_id, message);
                            notifications.push({
                                operator_id: operator.operator_id,
                                operator_name: operator.operator_name,
                                brand_name: brand.brand_name,
                                status: 'sent'
                            });
                        } catch (error) {
                            console.error(`Telegram xabar yuborishda xatolik (${operator.operator_name}):`, error);
                            notifications.push({
                                operator_id: operator.operator_id,
                                operator_name: operator.operator_name,
                                brand_name: brand.brand_name,
                                status: 'failed',
                                error: error.message
                            });
                        }
                    }
                }
            }
        }
        
        res.json({
            success: true,
            notifications_sent: notifications.filter(n => n.status === 'sent').length,
            notifications_failed: notifications.filter(n => n.status === 'failed').length,
            notifications: notifications
        });
    } catch (error) {
        console.error('Bildirishnoma yuborishda xatolik:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;

