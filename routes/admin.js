const express = require('express');
const path = require('path');
const { db } = require('../db.js');
const { isAuthenticated, hasPermission } = require('../middleware/auth.js');

const router = express.Router();

// Bu butun router uchun middleware vazifasini o'taydi.
// Faqat 'roles:manage' huquqi borlar bu endpointlarga kira oladi.
router.use(isAuthenticated, hasPermission('roles:manage'));

// GET /api/admin/backup-db - Ma'lumotlar bazasini yuklab olish
router.get('/backup-db', (req, res) => {
    try {
        const dbPath = path.join(__dirname, '..', 'database.db');
        const fileName = `database_backup_${new Date().toISOString().split('T')[0]}.db`;

        res.download(dbPath, fileName, (err) => {
            if (err) {
                console.error("Baza nusxasini yuklashda xatolik:", err);
                if (!res.headersSent) {
                    res.status(500).json({ message: "Ma'lumotlar bazasi faylini o'qib bo'lmadi." });
                }
            }
        });

    } catch (error) {
        console.error("Baza nusxasini yuklashda kutilmagan xatolik:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: "Serverda ichki xatolik." });
        }
    }
});

// POST /api/admin/clear-sessions - Barcha sessiyalarni tozalash
router.post('/clear-sessions', async (req, res) => {
    try {
        const currentSessionId = req.sessionID;

        // O'zining (joriy adminning) sessiyasidan tashqari barcha sessiyalarni o'chiramiz.
        const changes = await db('sessions').whereNot('sid', currentSessionId).del();

        res.json({ message: `${changes} ta foydalanuvchi sessiyasi muvaffaqiyatli tugatildi.` });
    } catch (error) {
        console.error("Sessiyalarni tozalashda xatolik:", error);
        res.status(500).json({ message: "Sessiyalarni tozalashda server xatoligi." });
    }
});

// GET /api/admin/export-full-db - To'liq ma'lumotlar bazasini JSON formatda export qilish
router.get('/export-full-db', async (req, res) => {
    try {
        console.log('📥 To\'liq database export boshlandi...');
        
        // Barcha jadvallardan ma'lumot olish (to'liq ro'yxat)
        const tables = {
            // Asosiy jadvallar
            users: await db('users').select('*'),
            roles: await db('roles').select('*'),
            permissions: await db('permissions').select('*').catch(() => []),
            role_permissions: await db('role_permissions').select('*'),
            user_permissions: await db('user_permissions').select('*').catch(() => []),
            
            // Foydalanuvchi bog'lanishlar
            user_locations: await db('user_locations').select('*'),
            user_brands: await db('user_brands').select('*').catch(() => []),
            
            // Hisobotlar
            reports: await db('reports').select('*'),
            report_history: await db('report_history').select('*').catch(() => []),
            
            // Sozlamalar
            settings: await db('settings').select('*'),
            
            // Brendlar
            brands: await db('brands').select('*'),
            brand_locations: await db('brand_locations').select('*').catch(() => []),
            
            // Ro'yxatdan o'tish
            pending_registrations: await db('pending_registrations').select('*'),
            
            // Audit va xavfsizlik
            audit_logs: await db('audit_logs').select('*'),
            password_change_requests: await db('password_change_requests').select('*').catch(() => []),
            
            // Pivot va shablonlar
            pivot_templates: await db('pivot_templates').select('*'),
            
            // Magic links
            magic_links: await db('magic_links').select('*').catch(() => []),
            
            // Valyuta kurslari
            exchange_rates: await db('exchange_rates').select('*').catch(() => []),
            
            // Solishtirish
            comparisons: await db('comparisons').select('*').catch(() => []),
            
            // Bildirishnomalar
            notifications: await db('notifications').select('*').catch(() => []),
            
            // Filiallar va mahsulotlar
            branches: await db('branches').select('*').catch(() => []),
            products: await db('products').select('*').catch(() => []),
            stocks: await db('stocks').select('*').catch(() => []),
            sales: await db('sales').select('*').catch(() => []),
            
            // Ostatki tahlil
            ostatki_analysis: await db('ostatki_analysis').select('*').catch(() => []),
            ostatki_imports: await db('ostatki_imports').select('*').catch(() => []),
            
            // Bloklangan filiallar
            blocked_filials: await db('blocked_filials').select('*').catch(() => []),
            
            // Import loglari
            imports_log: await db('imports_log').select('*').catch(() => [])
        };
        
        // Counts hisoblash
        const counts = {};
        Object.keys(tables).forEach(tableName => {
            counts[tableName] = Array.isArray(tables[tableName]) ? tables[tableName].length : 0;
        });
        
        // JSON obyekt yaratish
        const fullExport = {
            export_info: {
                version: '2.0',
                exported_at: new Date().toISOString(),
                exported_by: req.user?.username || 'admin',
                description: 'To\'liq ma\'lumotlar bazasi eksporti - barcha jadvallar',
                total_tables: Object.keys(tables).length,
                total_records: Object.values(counts).reduce((sum, count) => sum + count, 0)
            },
            data: tables,
            counts: counts
        };
        
        console.log(`✅ Export tayyor: ${Object.keys(tables).length} jadval, ${fullExport.export_info.total_records} yozuv`);
        console.log(`📊 Jadval statistikasi:`, counts);
        
        // JSON fayl sifatida yuborish
        const fileName = `full_database_export_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.json(fullExport);
        
    } catch (error) {
        console.error('❌ To\'liq export xatolik:', error);
        res.status(500).json({ message: 'Export qilishda xatolik: ' + error.message });
    }
});

// POST /api/admin/import-full-db - To'liq ma'lumotlar bazasini JSON dan import qilish
router.post('/import-full-db', async (req, res) => {
    try {
        console.log('📤 To\'liq database import boshlandi...');
        
        const importData = req.body;
        
        // Validatsiya
        if (!importData || !importData.data) {
            return res.status(400).json({ message: 'Noto\'g\'ri import fayl formati' });
        }
        
        const { data } = importData;
        
        // Joriy user ID ni olish (agar mavjud bo'lsa)
        const currentUserId = req.user?.id;
        
        // Transaction ichida import qilish (xatolik bo'lsa rollback)
        const importCounts = {};
        
        await db.transaction(async (trx) => {
            // 1. Barcha jadvallarni tozalash (sessiyalardan tashqari)
            console.log('🗑️ Eski ma\'lumotlarni tozalash...');
            
            // Bog'liq jadvallarni avval tozalash (foreign key cheklovlari tufayli)
            const tablesToClear = [
                'user_permissions', 'user_brands', 'user_locations',
                'role_permissions', 'report_history', 'brand_locations',
                'audit_logs', 'reports', 'pending_registrations',
                'password_change_requests', 'pivot_templates', 'magic_links',
                'comparisons', 'notifications', 'stocks', 'sales',
                'ostatki_analysis', 'ostatki_imports', 'blocked_filials',
                'imports_log', 'exchange_rates'
            ];
            
            for (const table of tablesToClear) {
                try {
                    await trx(table).del();
                    console.log(`  ✓ ${table} tozalandi`);
                } catch (err) {
                    // Jadval mavjud bo'lmasa, o'tkazib yuborish
                    console.log(`  ⚠ ${table} jadvali topilmadi yoki xatolik: ${err.message}`);
                }
            }
            
            // Brands
            try {
                await trx('brands').del();
            } catch (err) {
                console.log(`  ⚠ brands jadvali xatolik: ${err.message}`);
            }
            
            // Users (joriy adminni saqlab qolish)
            if (currentUserId) {
                await trx('users').whereNot('id', currentUserId).del();
            } else {
                await trx('users').del();
            }
            
            // Settings
            try {
                await trx('settings').del();
            } catch (err) {
                console.log(`  ⚠ settings jadvali xatolik: ${err.message}`);
            }
            
            // Products va Branches (agar mavjud bo'lsa)
            try {
                await trx('products').del();
                await trx('branches').del();
            } catch (err) {
                console.log(`  ⚠ products/branches jadvallari xatolik: ${err.message}`);
            }
            
            // Roles ni to'liq o'chirmaymiz, faqat yangilaymiz
            
            // 2. Ma'lumotlarni import qilish
            console.log('📥 Yangi ma\'lumotlarni yuklash...');
            
            // Helper funksiya - jadvalni import qilish
            const importTable = async (tableName, tableData, options = {}) => {
                if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
                    importCounts[tableName] = 0;
                    return;
                }
                
                try {
                    if (options.upsert) {
                        // Update yoki insert (roles uchun)
                        for (const record of tableData) {
                            const existing = await trx(tableName).where(options.upsert.where, record[options.upsert.key]).first();
                            if (existing) {
                                await trx(tableName).where(options.upsert.where, record[options.upsert.key]).update(record);
                            } else {
                                await trx(tableName).insert(record);
                            }
                        }
                    } else if (options.filter) {
                        // Filter qo'llash (users uchun)
                        const filtered = options.filter(tableData);
                        if (filtered.length > 0) {
                            await trx(tableName).insert(filtered);
                        }
                        importCounts[tableName] = filtered.length;
                    } else {
                        // Oddiy insert
                        await trx(tableName).insert(tableData);
                        importCounts[tableName] = tableData.length;
                    }
                    console.log(`  ✓ ${tableName}: ${importCounts[tableName]} yozuv`);
                } catch (err) {
                    console.error(`  ❌ ${tableName} import xatolik:`, err.message);
                    importCounts[tableName] = 0;
                }
            };
            
            // Asosiy jadvallar
            await importTable('users', data.users, {
                filter: (users) => currentUserId ? users.filter(u => u.id !== currentUserId) : users
            });
            
            await importTable('roles', data.roles, {
                upsert: { where: 'role_name', key: 'role_name' }
            });
            
            await importTable('permissions', data.permissions);
            await importTable('role_permissions', data.role_permissions);
            await importTable('user_permissions', data.user_permissions);
            
            // Foydalanuvchi bog'lanishlar
            await importTable('user_locations', data.user_locations);
            await importTable('user_brands', data.user_brands);
            
            // Hisobotlar
            await importTable('reports', data.reports);
            await importTable('report_history', data.report_history);
            
            // Sozlamalar
            await importTable('settings', data.settings);
            
            // Brendlar
            await importTable('brands', data.brands);
            await importTable('brand_locations', data.brand_locations);
            
            // Ro'yxatdan o'tish
            await importTable('pending_registrations', data.pending_registrations);
            
            // Audit va xavfsizlik
            await importTable('audit_logs', data.audit_logs);
            await importTable('password_change_requests', data.password_change_requests);
            
            // Pivot va shablonlar
            await importTable('pivot_templates', data.pivot_templates);
            
            // Magic links
            await importTable('magic_links', data.magic_links);
            
            // Valyuta kurslari
            await importTable('exchange_rates', data.exchange_rates);
            
            // Solishtirish
            await importTable('comparisons', data.comparisons);
            
            // Bildirishnomalar
            await importTable('notifications', data.notifications);
            
            // Filiallar va mahsulotlar
            await importTable('branches', data.branches);
            await importTable('products', data.products);
            await importTable('stocks', data.stocks);
            await importTable('sales', data.sales);
            
            // Ostatki tahlil
            await importTable('ostatki_analysis', data.ostatki_analysis);
            await importTable('ostatki_imports', data.ostatki_imports);
            
            // Bloklangan filiallar
            await importTable('blocked_filials', data.blocked_filials);
            
            // Import loglari
            await importTable('imports_log', data.imports_log);
            
            console.log('✅ Import muvaffaqiyatli yakunlandi!');
        });
        
        // Import yakunlandi
        const totalImported = Object.values(importCounts).reduce((sum, count) => sum + count, 0);
        
        res.json({ 
            message: 'Ma\'lumotlar bazasi muvaffaqiyatli import qilindi!',
            counts: importCounts,
            total_imported: totalImported,
            tables_imported: Object.keys(importCounts).filter(key => importCounts[key] > 0).length
        });
        
    } catch (error) {
        console.error('❌ Import xatolik:', error);
        res.status(500).json({ message: 'Import qilishda xatolik: ' + error.message });
    }
});

module.exports = router;
