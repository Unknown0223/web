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
        
        // Barcha jadvallardan ma'lumot olish
        const users = await db('users').select('*');
        const reports = await db('reports').select('*');
        const audit_logs = await db('audit_logs').select('*');
        const roles = await db('roles').select('*');
        const role_permissions = await db('role_permissions').select('*');
        const settings = await db('settings').select('*');
        const brands = await db('brands').select('*');
        const pending_registrations = await db('pending_registrations').select('*');
        
        // JSON obyekt yaratish
        const fullExport = {
            export_info: {
                version: '1.0',
                exported_at: new Date().toISOString(),
                exported_by: req.user?.username || 'admin',
                description: 'To\'liq ma\'lumotlar bazasi eksporti'
            },
            data: {
                users,
                reports,
                audit_logs,
                roles,
                role_permissions,
                settings,
                brands,
                pending_registrations
            },
            counts: {
                users: users.length,
                reports: reports.length,
                audit_logs: audit_logs.length,
                roles: roles.length,
                role_permissions: role_permissions.length,
                settings: settings.length,
                brands: brands.length,
                pending_registrations: pending_registrations.length
            }
        };
        
        console.log(`✅ Export tayyor: ${JSON.stringify(fullExport.counts)}`);
        
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
        await db.transaction(async (trx) => {
            // 1. Barcha jadvallarni tozalash (sessiyalardan tashqari)
            console.log('🗑️ Eski ma\'lumotlarni tozalash...');
            await trx('role_permissions').del();
            await trx('audit_logs').del();
            await trx('reports').del();
            await trx('pending_registrations').del();
            await trx('brands').del();
            
            // Agar joriy user bor bo'lsa, uni saqlab qolish
            if (currentUserId) {
                await trx('users').whereNot('id', currentUserId).del();
            } else {
                await trx('users').del(); // Barchani o'chirish
            }
            
            await trx('settings').del();
            // Roles ni to'liq o'chirmaymiz, faqat yangilaymiz
            
            // 2. Ma'lumotlarni import qilish
            console.log('📥 Yangi ma\'lumotlarni yuklash...');
            
            // Users (joriy adminni saqlab qolish)
            if (data.users && data.users.length > 0) {
                let usersToImport;
                if (currentUserId) {
                    usersToImport = data.users.filter(u => u.id !== currentUserId);
                } else {
                    usersToImport = data.users;
                }
                
                if (usersToImport.length > 0) {
                    await trx('users').insert(usersToImport);
                }
            }
            
            // Reports
            if (data.reports && data.reports.length > 0) {
                await trx('reports').insert(data.reports);
            }
            
            // Audit logs
            if (data.audit_logs && data.audit_logs.length > 0) {
                await trx('audit_logs').insert(data.audit_logs);
            }
            
            // Roles (mavjud bo'lsa update, yo'q bo'lsa insert)
            if (data.roles && data.roles.length > 0) {
                for (const role of data.roles) {
                    const existing = await trx('roles').where('role_name', role.role_name).first();
                    if (existing) {
                        await trx('roles').where('role_name', role.role_name).update(role);
                    } else {
                        await trx('roles').insert(role);
                    }
                }
            }
            
            // Role permissions
            if (data.role_permissions && data.role_permissions.length > 0) {
                await trx('role_permissions').insert(data.role_permissions);
            }
            
            // Settings
            if (data.settings && data.settings.length > 0) {
                await trx('settings').insert(data.settings);
            }
            
            // Brands
            if (data.brands && data.brands.length > 0) {
                await trx('brands').insert(data.brands);
            }
            
            // Pending registrations
            if (data.pending_registrations && data.pending_registrations.length > 0) {
                await trx('pending_registrations').insert(data.pending_registrations);
            }
            
            console.log('✅ Import muvaffaqiyatli yakunlandi!');
        });
        
        // Import yakunlandi
        const counts = {
            users: data.users?.length || 0,
            reports: data.reports?.length || 0,
            audit_logs: data.audit_logs?.length || 0,
            roles: data.roles?.length || 0,
            settings: data.settings?.length || 0,
            brands: data.brands?.length || 0
        };
        
        res.json({ 
            message: 'Ma\'lumotlar bazasi muvaffaqiyatli import qilindi!',
            counts
        });
        
    } catch (error) {
        console.error('❌ Import xatolik:', error);
        res.status(500).json({ message: 'Import qilishda xatolik: ' + error.message });
    }
});

module.exports = router;
