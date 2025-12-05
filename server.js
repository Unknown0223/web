require('dotenv').config(); // .env faylini o'qish uchun eng yuqorida chaqiriladi
const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
const PORT = process.env.PORT || 3000;

// Railway.com va boshqa reverse proxy'lar uchun trust proxy sozlash
// Bu X-Forwarded-* header'larni to'g'ri ishlatish uchun kerak
app.set('trust proxy', 1);

// Railway yoki boshqa platformalar uchun APP_BASE_URL ni avtomatik aniqlash
if (!process.env.APP_BASE_URL) {
    // Railway uchun
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        process.env.APP_BASE_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
        console.log(`✅ Railway domain aniqlandi: ${process.env.APP_BASE_URL}`);
    }
    // Render.com uchun
    else if (process.env.RENDER_EXTERNAL_URL) {
        process.env.APP_BASE_URL = process.env.RENDER_EXTERNAL_URL;
        console.log(`✅ Render domain aniqlandi: ${process.env.APP_BASE_URL}`);
    }
    // Heroku uchun
    else if (process.env.HEROKU_APP_NAME) {
        process.env.APP_BASE_URL = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
        console.log(`✅ Heroku domain aniqlandi: ${process.env.APP_BASE_URL}`);
    }
    // Boshqa holatda localhost (development)
    else {
        process.env.APP_BASE_URL = `http://localhost:${PORT}`;
        console.log(`⚠️  APP_BASE_URL o'rnatilmagan, localhost ishlatilmoqda: ${process.env.APP_BASE_URL}`);
    }
}

// Middlewares - Avatar uchun katta hajmli JSON qabul qilish (10MB gacha)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Sessiyani sozlash
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

// Production yoki development rejimini aniqlash
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';
// Railway.com yoki boshqa cloud platformalar uchun HTTPS tekshiruvi
const isSecure = isProduction || 
                 process.env.RAILWAY_PUBLIC_DOMAIN || 
                 process.env.APP_BASE_URL?.startsWith('https://') ||
                 process.env.HTTPS === 'true';

app.use(session({
    store: new SQLiteStore({ db: 'database.db', dir: './' }),
    secret: process.env.SESSION_SECRET || 'a-very-strong-and-long-secret-key-for-session',
    resave: false,
    saveUninitialized: false,
    name: 'sessionId', // Default 'connect.sid' o'rniga
    cookie: { 
        secure: isSecure, // Production'da HTTPS uchun true
        maxAge: 1000 * 60 * 60 * 24, // 1 kun
        sameSite: isSecure ? 'none' : 'lax', // HTTPS uchun cross-site cookie
        httpOnly: true, // XSS hujumlaridan himoya qilish
        // Domain ni o'rnatmaymiz - bu cookie'ni barcha subdomain'larda ishlashiga imkon beradi
    },
    proxy: true, // Railway.com kabi reverse proxy orqali ishlaganda
    rolling: true // Har bir request'da cookie'ni yangilash
}));

// Yordamchi funksiyalar va DB ni import qilish
const { db, initializeDB } = require('./db.js');
const { isAuthenticated, hasPermission } = require('./middleware/auth.js');
const { initializeBot, getBot } = require('./utils/bot.js');
const axios = require('axios');

// --- WEBHOOK UCHUN ENDPOINT ---
app.post('/telegram-webhook/:token', async (req, res) => {
    try {
        const bot = getBot();
        const secretToken = req.params.token;

        // Bot token'ni bazadan tekshirish
        const tokenSetting = await db('settings').where({ key: 'telegram_bot_token' }).first();
        const botToken = tokenSetting ? tokenSetting.value : null;

        if (bot && botToken && secretToken === botToken) {
            bot.processUpdate(req.body);
            res.sendStatus(200);
        } else {
            console.warn(`⚠️ Webhook so'rovi rad etildi. Bot: ${!!bot}, Token match: ${botToken === secretToken}`);
            res.sendStatus(403);
        }
    } catch (error) {
        console.error('Webhook endpoint xatoligi:', error);
        res.sendStatus(500);
    }
});

// Markaziy routerni ulash
app.use('/api', require('./routes'));

// Health check endpoint (Railway va boshqa platformalar uchun)
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- Sahifalarni ko'rsatish (HTML Routing) ---
app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.get('/register.html', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'register.html'));
    }
});

// Admin paneliga kirish huquqini tekshirish
// Super admin yoki admin role'ga ega foydalanuvchilar yoki kerakli permissions'ga ega foydalanuvchilar kirishi mumkin
const canAccessAdminPanel = (req, res, next) => {
    // Agar session yoki user mavjud bo'lmasa, isAuthenticated middleware xatolik qaytaradi
    if (!req.session || !req.session.user) {
        return res.status(401).json({ message: "Avtorizatsiyadan o'tmagansiz." });
    }
    
    const userRole = req.session.user?.role;
    const userPermissions = req.session.user?.permissions || [];
    
    // Super admin yoki admin barcha cheklovlardan ozod
    if (userRole === 'super_admin' || userRole === 'admin') {
        return next();
    }
    
    // Boshqa foydalanuvchilar uchun kerakli permissions'ga ega bo'lishi kerak
    const requiredPermissions = ['dashboard:view', 'users:view', 'settings:view', 'roles:manage', 'audit:view'];
    const hasAnyRequiredPermission = requiredPermissions.some(p => userPermissions.includes(p));
    
    if (hasAnyRequiredPermission) {
        next();
    } else {
        res.status(403).json({ message: "Admin paneliga kirish uchun sizda yetarli huquq yo'q." });
    }
};

app.get('/admin', isAuthenticated, canAccessAdminPanel, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', isAuthenticated, (req, res) => {
    // Barcha foydalanuvchilar asosiy sahifani ko'radi
    // Admin huquqiga ega bo'lganlar uchun tepada "Boshqaruv Paneli" tugmasi ko'rinadi
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Boshqa barcha so'rovlar uchun
app.get('*', (req, res) => {
    if (req.session && req.session.user) {
        res.redirect('/');
    } else {
        res.redirect('/login');
    }
});

// WebSocket ulanishlarini boshqarish
wss.on('connection', (ws) => {
    console.log('✅ Yangi WebSocket ulanish o\'rnatildi');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('WebSocket xabar qabul qilindi:', data);
            
            // Xabarni barcha ulanishga yuborish (broadcast)
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch (error) {
            console.error('WebSocket xabarni qayta ishlashda xato:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket ulanish yopildi');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket xatosi:', error);
    });
    
    // Ping/Pong uchun
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

// Har 30 soniyada ping yuborish (ulanish holatini tekshirish)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

// Broadcast funksiyasi (boshqa routerlar uchun)
global.broadcastWebSocket = (type, payload) => {
    const message = JSON.stringify({ type, payload });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};

// Serverni ishga tushirish
(async () => {
    try {
        await initializeDB();
        
        const tokenSetting = await db('settings').where({ key: 'telegram_bot_token' }).first();
        const botToken = tokenSetting ? tokenSetting.value : null;

        // Serverni ishga tushirish
        server.listen(PORT, '0.0.0.0', async () => {
            console.log(`✅ Server ${PORT} portida ishga tushdi`);
            console.log(`🌐 APP_BASE_URL: ${process.env.APP_BASE_URL}`);
            console.log(`🔌 WebSocket server ws://localhost:${PORT}/ws da ishga tushdi`);

            // PM2 uchun ready signal
            if (process.send) {
                process.send('ready');
            }

            // Bot token mavjud bo'lsa, webhookni o'rnatish
            if (botToken) {
                // Deploy uchun webhook rejimida ishga tushirish
                // Railway uchun: RAILWAY_PUBLIC_DOMAIN yoki APP_BASE_URL
                const appBaseUrl = process.env.APP_BASE_URL || 
                                  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);
                if (appBaseUrl && appBaseUrl.startsWith('https://')) {
                    // Webhook avtomatik o'rnatish
                    const webhookUrl = `${appBaseUrl}/telegram-webhook/${botToken}`;
                    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
                    try {
                        const response = await axios.post(telegramApiUrl, { url: webhookUrl });
                        if (response.data.ok) {
                            console.log(`✅ Webhook muvaffaqiyatli ${webhookUrl} manziliga o'rnatildi.`);
                            await initializeBot(botToken, { polling: false });
                            console.log("✅ Telegram bot webhook rejimida ishga tushirildi");
                        } else {
                            console.error("❌ Telegram webhookni o'rnatishda xatolik:", response.data.description);
                            // Fallback: polling rejimi
                            await initializeBot(botToken, { polling: true });
                            console.log("⚠️ Webhook o'rnatilmadi, polling rejimida ishga tushirildi");
                        }
                    } catch (error) {
                        console.error("❌ Telegram API'ga ulanishda xatolik:", error.response ? error.response.data : error.message);
                        // Fallback: polling rejimi
                        await initializeBot(botToken, { polling: true });
                        console.log("⚠️ Webhook o'rnatilmadi, polling rejimida ishga tushirildi");
                    }
                } else {
                    // Lokal yoki webhook sozlanmagan - polling rejimi
                    await initializeBot(botToken, { polling: true });
                    console.log("✅ Telegram bot polling rejimida ishga tushirildi (APP_BASE_URL o'rnatilmagan)");
                }
            } else {
                console.warn("⚠️  Ma'lumotlar bazasida bot tokeni topilmadi. Bot ishga tushirilmadi. Iltimos, admin panel orqali tokenni kiriting.");
            }
        });
    } catch (err) {
        console.error("❌ Serverni ishga tushirishda DB yoki Bot bilan bog'liq xatolik:", err);
        process.exit(1);
    }
})();
