// routes/roles.js (TO'LIQ FAYL)

const express = require('express');
const { db } = require('../db.js');
const { isAuthenticated, hasPermission } = require('../middleware/auth.js');
const { refreshSessionsByRole } = require('../utils/sessionManager.js'); // YORDAMCHINI IMPORT QILAMIZ

const router = express.Router();

// Barcha rollar va ularning huquqlarini olish
router.get('/', isAuthenticated, hasPermission('roles:manage'), async (req, res) => {
    try {
        const [roles, permissions, rolePermissions] = await Promise.all([
            db('roles').select('role_name').orderBy('role_name'),
            db('permissions').select('*').orderBy('category', 'permission_key'),
            db('role_permissions').select('*')
        ]);

        const permissionsByCategory = permissions.reduce((acc, p) => {
            if (!acc[p.category]) {
                acc[p.category] = [];
            }
            acc[p.category].push({ key: p.permission_key, description: p.description });
            return acc;
        }, {});

        const result = roles.map(role => {
            const assignedPermissions = rolePermissions
                .filter(rp => rp.role_name === role.role_name)
                .map(rp => rp.permission_key);
            return {
                role_name: role.role_name,
                permissions: assignedPermissions
            };
        });

        res.json({ roles: result, all_permissions: permissionsByCategory });

    } catch (error) {
        console.error("/api/roles GET xatoligi:", error);
        res.status(500).json({ message: "Rollar va huquqlarni yuklashda xatolik." });
    }
});

// Rolning huquqlarini yangilash
router.put('/:role_name', isAuthenticated, hasPermission('roles:manage'), async (req, res) => {
    const { role_name } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
        return res.status(400).json({ message: "Huquqlar massiv formatida yuborilishi kerak." });
    }
    
    if (role_name === 'admin') {
        return res.status(403).json({ message: "Admin rolini huquqlarini o'zgartirish mumkin emas." });
    }

    try {
        await db.transaction(async trx => {
            await trx('role_permissions').where({ role_name: role_name }).del();

            if (permissions.length > 0) {
                const permissionsToInsert = permissions.map(permKey => ({
                    role_name: role_name,
                    permission_key: permKey
                }));
                await trx('role_permissions').insert(permissionsToInsert);
            }
        });

        // === MUHIM O'ZGARISH ===
        // Rol huquqlari o'zgargani uchun shu roldagi barcha foydalanuvchilarning sessiyalarini yangilaymiz
        await refreshSessionsByRole(role_name);
        // =======================

        res.json({ message: `"${role_name}" roli uchun huquqlar muvaffaqiyatli yangilandi.` });

    } catch (error) {
        console.error(`/api/roles/${role_name} PUT xatoligi:`, error);
        res.status(500).json({ message: "Rol huquqlarini yangilashda xatolik." });
    }
});

// Get all available permissions
router.get('/permissions', isAuthenticated, hasPermission('roles:manage'), async (req, res) => {
    try {
        const permissions = await db('permissions')
            .select('*')
            .orderBy('category', 'permission_key');
        res.json(permissions);
    } catch (error) {
        console.error('Get permissions error:', error);
        res.status(500).json({ message: 'Huquqlarni yuklashda xatolik' });
    }
});

// Get permissions overview with roles that have each permission
router.get('/permissions/overview', isAuthenticated, hasPermission('roles:manage'), async (req, res) => {
    try {
        const permissions = await db('permissions')
            .select('*')
            .orderBy('category', 'permission_key');
        
        res.json(permissions);
    } catch (error) {
        console.error('Get permissions overview error:', error);
        res.status(500).json({ message: 'Huquqlar ko\'rinishini yuklashda xatolik' });
    }
});

// Create new role
router.post('/', isAuthenticated, hasPermission('roles:manage'), async (req, res) => {
    const { role_name } = req.body;
    
    if (!role_name || !/^[a-z_]+$/.test(role_name)) {
        return res.status(400).json({ message: 'Noto\'g\'ri rol nomi formati' });
    }
    
    try {
        // Check if role already exists
        const existing = await db('roles').where('role_name', role_name).first();
        if (existing) {
            return res.status(400).json({ message: 'Bu rol allaqachon mavjud' });
        }
        
        // Create new role
        await db('roles').insert({ role_name });
        
        // Log to audit
        const adminId = req.session.user.id;
        const username = req.session.user?.username || 'admin';
        await db('audit_logs').insert({
            user_id: adminId,
            action: 'create_role',
            target_type: 'role',
            target_id: role_name,
            details: JSON.stringify({ role_name }),
            ip_address: req.session.ip_address,
            user_agent: req.session.user_agent
        });
        
        res.json({ message: 'Yangi rol muvaffaqiyatli yaratildi', role_name });
    } catch (error) {
        console.error('Create role error:', error);
        res.status(500).json({ message: 'Rol yaratishda xatolik' });
    }
});

module.exports = router;
