const express = require('express');
const { db } = require('../db.js');
const { isAuthenticated } = require('../middleware/auth.js');

const router = express.Router();

/**
 * GET /api/notifications
 * Foydalanuvchining bildirishnomalarini olish
 */
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { unread_only } = req.query;

        let query = db('notifications')
            .where('user_id', userId)
            .orderBy('created_at', 'desc')
            .limit(100);

        if (unread_only === 'true') {
            query = query.where('is_read', false);
        }

        const notifications = await query;

        // Unread count
        const unreadCount = await db('notifications')
            .where('user_id', userId)
            .where('is_read', false)
            .count('id as count')
            .first();

        res.json({
            success: true,
            notifications: notifications.map(n => ({
                ...n,
                details: n.details ? JSON.parse(n.details) : null
            })),
            unread_count: unreadCount ? parseInt(unreadCount.count) : 0
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/notifications/:id/read
 * Bildirishnomani o'qilgan deb belgilash
 */
router.put('/:id/read', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const notificationId = req.params.id;

        // Bildirishnoma foydalanuvchiga tegishli ekanligini tekshirish
        const notification = await db('notifications')
            .where('id', notificationId)
            .where('user_id', userId)
            .first();

        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Bildirishnoma topilmadi'
            });
        }

        // O'qilgan deb belgilash
        await db('notifications')
            .where('id', notificationId)
            .update({
                is_read: true,
                read_at: db.fn.now()
            });

        res.json({
            success: true,
            message: 'Bildirishnoma o\'qilgan deb belgilandi'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/notifications/read-all
 * Barcha bildirishnomalarni o'qilgan deb belgilash
 */
router.put('/read-all', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;

        await db('notifications')
            .where('user_id', userId)
            .where('is_read', false)
            .update({
                is_read: true,
                read_at: db.fn.now()
            });

        res.json({
            success: true,
            message: 'Barcha bildirishnomalar o\'qilgan deb belgilandi'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;

