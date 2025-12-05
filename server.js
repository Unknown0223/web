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
    // Railway uchun - bir nechta variantni tekshirish
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        process.env.APP_BASE_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
        console.log(`✅ Railway domain aniqlandi (RAILWAY_PUBLIC_DOMAIN): ${process.env.APP_BASE_URL}`);
    }
    // Railway'da boshqa variant
    else if (process.env.RAILWAY_STATIC_URL) {
        process.env.APP_BASE_URL = process.env.RAILWAY_STATIC_URL;
        console.log(`✅ Railway domain aniqlandi (RAILWAY_STATIC_URL): ${process.env.APP_BASE_URL}`);
    }
    // Railway'da PORT va PUBLIC_DOMAIN kombinatsiyasi
    else if (process.env.RAILWAY_ENVIRONMENT) {
        // Railway'da ishlayotgan bo'lsa, lekin domain o'rnatilmagan
        console.warn(`⚠️  Railway'da ishlayapsiz, lekin RAILWAY_PUBLIC_DOMAIN o'rnatilmagan.`);
        console.warn(`⚠️  Railway dashboard'da "Generate Domain" tugmasini bosing yoki environment variable qo'shing.`);
        process.env.APP_BASE_URL = `http://localhost:${PORT}`;
        console.log(`⚠️  APP_BASE_URL localhost ishlatilmoqda: ${process.env.APP_BASE_URL}`);
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

// Yordamchi funksiyalar va DB ni import qilish (webhook uchun kerak)
const { db, initializeDB } = require('./db.js');
const { isAuthenticated, hasPermission } = require('./middleware/auth.js');
const { initializeBot, getBot } = require('./utils/bot.js');
const axios = require('axios');

// --- WEBHOOK UCHUN ENDPOINT (MIDDLEWARE'DAN OLDIN) ---
app.post('/telegram-webhook/:token', async (req, res) => {
    try {
        const secretToken = req.params.token;
        console.log(`📥 [WEBHOOK] So'rov qabul qilindi. Method: ${req.method}, Path: ${req.path}`);
        console.log(`📥 [WEBHOOK] Token (birinchi 10 belgi): ${secretToken?.substring(0, 10)}...`);
        console.log(`📥 [WEBHOOK] Request body mavjud: ${!!req.body}, Body keys: ${req.body ? Object.keys(req.body).join(', ') : 'yo\'q'}`);
        console.log(`📥 [WEBHOOK] Headers:`, {
            'content-type': req.headers['content-type'],
            'user-agent': req.headers['user-agent'],
            'x-forwarded-for': req.headers['x-forwarded-for']
        });
        
        const bot = getBot();

        // Bot token'ni bazadan tekshirish
        const tokenSetting = await db('settings').where({ key: 'telegram_bot_token' }).first();
        const botToken = tokenSetting ? tokenSetting.value : null;

        console.log(`🔍 [WEBHOOK] Tekshiruv:`);
        console.log(`   - Bot mavjud: ${!!bot}`);
        console.log(`   - Bot initialized: ${bot ? 'ha' : 'yo\'q'}`);
        console.log(`   - Token bazada mavjud: ${!!botToken}`);
        console.log(`   - Token mos keladi: ${botToken === secretToken}`);

        if (!bot || !botToken) {
            console.error(`❌ [WEBHOOK] Bot yoki token mavjud emas!`);
            console.error(`   - Bot: ${!!bot}`);
            console.error(`   - Token: ${!!botToken}`);
            return res.status(503).json({ error: 'Bot ishga tushirilmagan' });
        }

        if (secretToken !== botToken) {
            console.warn(`⚠️ [WEBHOOK] Token mos kelmaydi!`);
            console.warn(`   - Bazadagi token (birinchi 10 belgi): ${botToken?.substring(0, 10)}...`);
            console.warn(`   - URL'dagi token (birinchi 10 belgi): ${secretToken?.substring(0, 10)}...`);
            return res.status(403).json({ error: 'Token mos kelmaydi' });
        }

        // Debug: webhook so'rovi kelganini log qilish
        if (req.body && req.body.message) {
            const msg = req.body.message;
            console.log(`📨 [WEBHOOK] Xabar qabul qilindi:`);
            console.log(`   - Chat ID: ${msg.chat?.id}`);
            console.log(`   - User ID: ${msg.from?.id}`);
            console.log(`   - Username: ${msg.from?.username || 'yo\'q'}`);
            console.log(`   - Text: ${msg.text?.substring(0, 50) || 'yo\'q'}...`);
        } else if (req.body && req.body.callback_query) {
            const cb = req.body.callback_query;
            console.log(`📨 [WEBHOOK] Callback query qabul qilindi:`);
            console.log(`   - Chat ID: ${cb.message?.chat?.id}`);
            console.log(`   - User ID: ${cb.from?.id}`);
            console.log(`   - Data: ${cb.data}`);
        } else if (req.body) {
            console.log(`📨 [WEBHOOK] Boshqa turdagi update: ${Object.keys(req.body).join(', ')}`);
        } else {
            console.warn(`⚠️ [WEBHOOK] Request body bo'sh!`);
        }
        
        console.log(`🔄 [WEBHOOK] bot.processUpdate() chaqirilmoqda...`);
        bot.processUpdate(req.body);
        console.log(`✅ [WEBHOOK] bot.processUpdate() yakunlandi.`);
        
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('❌ [WEBHOOK] Endpoint xatoligi:', error.message);
        console.error('❌ [WEBHOOK] Error stack:', error.stack);
        console.error('❌ [WEBHOOK] Request body:', JSON.stringify(req.body, null, 2));
        
        // Xatolik bo'lsa ham 200 qaytaramiz, chunki Telegram qayta yuboradi
        res.status(200).json({ ok: false, error: error.message });
    }
});

// Static files va session middleware (webhook'dan keyin)
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
                const appBaseUrl = process.env.APP_BASE_URL;
                
                console.log(`🔍 [BOT] Environment tekshiruvi:`);
                console.log(`   - APP_BASE_URL: ${appBaseUrl || 'yo\'q'}`);
                console.log(`   - RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'yo\'q'}`);
                console.log(`   - RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'yo\'q'}`);
                console.log(`   - NODE_ENV: ${process.env.NODE_ENV || 'yo\'q'}`);
                
                if (appBaseUrl && appBaseUrl.startsWith('https://')) {
                    // Webhook avtomatik o'rnatish
                    const webhookUrl = `${appBaseUrl}/telegram-webhook/${botToken}`;
                    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
                    
                    console.log(`🔗 [BOT] Webhook o'rnatilmoqda...`);
                    console.log(`   - Webhook URL: ${webhookUrl}`);
                    console.log(`   - Telegram API: ${telegramApiUrl.substring(0, 40)}...`);
                    
                    try {
                        // Avval eski webhookni o'chirish (agar mavjud bo'lsa)
                        try {
                            const deleteResponse = await axios.post(`${telegramApiUrl}`, { url: '' });
                            if (deleteResponse.data.ok) {
                                console.log(`🗑️  [BOT] Eski webhook o'chirildi`);
                            }
                        } catch (deleteError) {
                            // Xatolik bo'lsa ham davom etamiz
                            console.log(`ℹ️  [BOT] Eski webhook o'chirishda xatolik (e'tiborsiz): ${deleteError.message}`);
                        }
                        
                        // Yangi webhookni o'rnatish
                        const response = await axios.post(telegramApiUrl, { 
                            url: webhookUrl,
                            allowed_updates: ['message', 'callback_query', 'my_chat_member']
                        });
                        
                        if (response.data.ok) {
                            console.log(`✅ [BOT] Webhook muvaffaqiyatli o'rnatildi!`);
                            console.log(`   - Webhook URL: ${webhookUrl}`);
                            console.log(`   - Telegram javob: ${JSON.stringify(response.data.result)}`);
                            
                            // Webhook rejimida botni ishga tushirish
                            await initializeBot(botToken, { polling: false });
                            console.log("✅ [BOT] Telegram bot webhook rejimida ishga tushirildi");
                            
                            // Webhook holatini tekshirish
                            try {
                                const getWebhookResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
                                if (getWebhookResponse.data.ok) {
                                    const webhookInfo = getWebhookResponse.data.result;
                                    console.log(`📊 [BOT] Webhook ma'lumotlari:`);
                                    console.log(`   - URL: ${webhookInfo.url || 'yo\'q'}`);
                                    console.log(`   - Pending updates: ${webhookInfo.pending_update_count || 0}`);
                                    if (webhookInfo.last_error_date) {
                                        console.warn(`   ⚠️  Oxirgi xatolik: ${webhookInfo.last_error_message} (${new Date(webhookInfo.last_error_date * 1000).toISOString()})`);
                                    }
                                }
                            } catch (checkError) {
                                console.warn(`⚠️  [BOT] Webhook holatini tekshirib bo'lmadi: ${checkError.message}`);
                            }
                        } else {
                            console.error(`❌ [BOT] Telegram webhookni o'rnatishda xatolik:`, response.data.description);
                            console.error(`   - Response: ${JSON.stringify(response.data)}`);
                            
                            // Fallback: polling rejimi (faqat development uchun)
                            if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
                                console.log("⚠️  [BOT] Development rejimida polling rejimida ishga tushirilmoqda...");
                                await initializeBot(botToken, { polling: true });
                            } else {
                                console.error("❌ [BOT] Production'da webhook o'rnatilmadi va polling rejimi ishlatilmaydi!");
                                console.error("❌ [BOT] Iltimos, Railway dashboard'da RAILWAY_PUBLIC_DOMAIN yoki APP_BASE_URL ni tekshiring.");
                            }
                        }
                    } catch (error) {
                        console.error(`❌ [BOT] Telegram API'ga ulanishda xatolik:`, error.message);
                        if (error.response) {
                            console.error(`   - Status: ${error.response.status}`);
                            console.error(`   - Data: ${JSON.stringify(error.response.data)}`);
                        }
                        if (error.request) {
                            console.error(`   - Request: ${JSON.stringify(error.request)}`);
                        }
                        
                        // Fallback: polling rejimi (faqat development uchun)
                        if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
                            console.log("⚠️  [BOT] Development rejimida polling rejimida ishga tushirilmoqda...");
                            await initializeBot(botToken, { polling: true });
                        } else {
                            console.error("❌ [BOT] Production'da webhook o'rnatilmadi va polling rejimi ishlatilmaydi!");
                            console.error("❌ [BOT] Iltimos, Railway dashboard'da RAILWAY_PUBLIC_DOMAIN yoki APP_BASE_URL ni tekshiring.");
                        }
                    }
                } else {
                    // Lokal yoki webhook sozlanmagan - polling rejimi (faqat development uchun)
                    if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
                        console.log("✅ [BOT] Telegram bot polling rejimida ishga tushirildi (APP_BASE_URL o'rnatilmagan yoki HTTPS emas)");
                        await initializeBot(botToken, { polling: true });
                    } else {
                        console.error("❌ [BOT] Production'da APP_BASE_URL o'rnatilmagan yoki HTTPS emas!");
                        console.error("❌ [BOT] Railway dashboard'da quyidagilarni tekshiring:");
                        console.error("   1. RAILWAY_PUBLIC_DOMAIN environment variable o'rnatilganmi?");
                        console.error("   2. APP_BASE_URL to'g'ri sozlanganmi?");
                        console.error("   3. Domain HTTPS bilan boshlanadimi?");
                    }
                }
            } else {
                console.warn("⚠️  [BOT] Ma'lumotlar bazasida bot tokeni topilmadi. Bot ishga tushirilmadi.");
                console.warn("⚠️  [BOT] Iltimos, admin panel orqali tokenni kiriting.");
            }
        });
    } catch (err) {
        console.error("❌ Serverni ishga tushirishda DB yoki Bot bilan bog'liq xatolik:", err);
        process.exit(1);
    }
})();
