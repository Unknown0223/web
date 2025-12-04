# Deploy Qilish Ko'rsatmasi

Bu loyiha Railway, Render, Heroku va boshqa cloud platformalarda deploy qilish uchun tayyorlangan.

## Talablar

- Node.js 18+ 
- SQLite (avtomatik yaratiladi)
- Telegram Bot Token (bot ishlashi uchun)

## Environment Variables (Muhit O'zgaruvchilari)

Loyiha quyidagi environment variablelarni qo'llab-quvvatlaydi:

### Majburiy (Required)

- `PORT` - Server porti (default: 3000)
- `SESSION_SECRET` - Session secret key (xavfsizlik uchun)

### Ixtiyoriy (Optional)

- `APP_BASE_URL` - Application base URL
  - **Railway**: Avtomatik `RAILWAY_PUBLIC_DOMAIN` dan olinadi
  - **Render**: Avtomatik `RENDER_EXTERNAL_URL` dan olinadi  
  - **Heroku**: Avtomatik `HEROKU_APP_NAME` dan olinadi
  - **Lokal test**: `https://your-ngrok-id.ngrok.io` ko'rinishida qo'ying

## Railway'da Deploy Qilish

1. **Railway'ga kirish va loyihani yaratish:**
   - [Railway.app](https://railway.app) ga kirib, yangi loyiha yarating
   - GitHub repository'ni ulang

2. **Environment Variables o'rnatish:**
   - Railway dashboard'da "Variables" bo'limiga kiring
   - Quyidagi variablelarni qo'shing:
     ```
     SESSION_SECRET=your-very-strong-secret-key-here
     ```
   - `APP_BASE_URL` Railway tomonidan avtomatik o'rnatiladi (`RAILWAY_PUBLIC_DOMAIN`)

3. **Deploy:**
   - Railway avtomatik deploy qiladi
   - Public domain Railway tomonidan beriladi

4. **Telegram Bot Webhook:**
   - Server ishga tushgandan so'ng, admin panelga kiring
   - Settings > Telegram bo'limiga o'ting
   - Bot tokenini kiriting
   - Webhook avtomatik o'rnatiladi (APP_BASE_URL ishlatiladi)

## Render'da Deploy Qilish

1. **Render'ga kirish:**
   - [Render.com](https://render.com) ga kirib, yangi Web Service yarating
   - GitHub repository'ni ulang

2. **Environment Variables:**
   ```
   SESSION_SECRET=your-very-strong-secret-key-here
   ```
   - `APP_BASE_URL` Render tomonidan avtomatik o'rnatiladi (`RENDER_EXTERNAL_URL`)

3. **Build va Start Command:**
   - Build Command: `npm install`
   - Start Command: `node server.js`

## Heroku'da Deploy Qilish

1. **Heroku CLI orqali:**
   ```bash
   heroku create your-app-name
   heroku config:set SESSION_SECRET=your-very-strong-secret-key-here
   git push heroku main
   ```

2. **Heroku Dashboard orqali:**
   - Settings > Config Vars bo'limiga kiring
   - `SESSION_SECRET` qo'shing

## Lokal Test (ngrok bilan)

1. **ngrok o'rnatish:**
   ```bash
   npm install -g ngrok
   ```

2. **ngrok ishga tushirish:**
   ```bash
   ngrok http 3000
   ```

3. **.env fayl yaratish:**
   ```env
   PORT=3000
   SESSION_SECRET=your-secret-key
   APP_BASE_URL=https://your-ngrok-id.ngrok.io
   ```

4. **Server ishga tushirish:**
   ```bash
   npm start
   ```

## Telegram Bot Sozlash

1. **Bot Token olish:**
   - [@BotFather](https://t.me/botfather) ga yozing
   - `/newbot` buyrug'ini bering
   - Bot nomi va username tanlang
   - Olingan tokenni saqlang

2. **Webhook o'rnatish:**
   - Admin panelga kiring
   - Settings > Telegram bo'limiga o'ting
   - Bot tokenini kiriting va saqlang
   - Webhook avtomatik o'rnatiladi

3. **Webhook tekshirish:**
   - Server loglarida quyidagi xabarni ko'rasiz:
     ```
     ✅ Webhook muvaffaqiyatli https://your-domain.com/telegram-webhook/TOKEN manziliga o'rnatildi.
     ```

## Muhim Eslatmalar

1. **HTTPS talab qilinadi:**
   - Telegram webhooklari faqat HTTPS manzillarni qabul qiladi
   - Production'da `APP_BASE_URL` `https://` bilan boshlanishi kerak

2. **Bot ishlamay qolsa:**
   - `APP_BASE_URL` to'g'ri o'rnatilganligini tekshiring
   - Server loglarini ko'rib chiqing
   - Admin panel orqali bot tokenini qayta saqlang (webhook qayta o'rnatiladi)

3. **Database:**
   - SQLite fayli avtomatik yaratiladi
   - Migrations avtomatik ishga tushadi
   - Database faylini backup qiling

4. **Session Security:**
   - Production'da `SESSION_SECRET` ni kuchli va random qiling
   - Hech qachon GitHub'ga commit qilmang

## Troubleshooting

### Bot ishlamayapti

1. `APP_BASE_URL` to'g'ri o'rnatilganligini tekshiring
2. Server loglarida webhook xabarlarini ko'ring
3. Telegram Bot API'dan webhook holatini tekshiring:
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
   ```

### Webhook o'rnatilmadi

1. `APP_BASE_URL` mavjudligini tekshiring
2. URL `https://` bilan boshlanishini tekshiring
3. Server ishga tushganligini tekshiring
4. Bot token to'g'riligini tekshiring

### Database xatoliklari

1. Database fayli yaratilganligini tekshiring
2. Migrations ishlaganligini tekshiring
3. File permissions'ni tekshiring

## Qo'shimcha Ma'lumot

- Bot webhook endpoint: `/telegram-webhook/:token`
- Webhook avtomatik server ishga tushganda o'rnatiladi
- Bot token o'zgarganda webhook qayta o'rnatiladi

