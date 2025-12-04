# Railway.com ga Deploy Qilish Qo'llanmasi

## 1. Railway.com'da Loyiha Yaratish

1. [Railway.com](https://railway.com) ga kirib, yangi loyiha yarating
2. "New Project" > "Deploy from GitHub repo" ni tanlang
3. GitHub repository'ni ulang

## 2. Environment Variables Sozlash

Railway.com dashboard'da **Variables** bo'limiga o'ting va quyidagi o'zgaruvchilarni qo'shing:

### Majburiy o'zgaruvchilar:

```
NODE_ENV=production
SESSION_SECRET=your-very-strong-secret-key-here-change-this
```

### Ixtiyoriy (avtomatik sozlanadi):

```
APP_BASE_URL
```
**Eslatma:** `RAILWAY_PUBLIC_DOMAIN` o'rnatilganda, `APP_BASE_URL` avtomatik sozlanadi. Agar qo'lda sozlamoqchi bo'lsangiz, to'liq URL ni kiriting: `https://your-app-name.railway.app`

### Telegram Bot (Admin panel orqali ham sozlash mumkin):

```
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_GROUP_ID=your-group-id-here
TELEGRAM_ADMIN_CHAT_ID=your-admin-chat-id-here
```

## 3. Public Domain Sozlash

1. Railway.com dashboard'da loyihangizni oching
2. **Settings** > **Networking** bo'limiga o'ting
3. **Generate Domain** tugmasini bosing
4. Domain yaratilgandan keyin, `RAILWAY_PUBLIC_DOMAIN` avtomatik sozlanadi

## 4. Deploy

Railway.com avtomatik ravishda:
- `package.json` dan dependencies ni o'rnatadi
- `Procfile` yoki `railway.json` dan start command ni ishlatadi
- Server ni ishga tushiradi

## 5. Telegram Bot Webhook

Server ishga tushgandan keyin:
1. Admin panelga kirib, **Sozlamalar** > **Telegram Bot** bo'limiga o'ting
2. Bot token ni kiriting va saqlang
3. Webhook avtomatik o'rnatiladi

Yoki environment variable'da `TELEGRAM_BOT_TOKEN` ni sozlasangiz, server start qilganda avtomatik webhook o'rnatiladi.

## 6. Tekshirish

1. Railway.com dashboard'da **Deployments** bo'limiga o'ting
2. Log'larni tekshiring - quyidagi xabarlarni ko'rishingiz kerak:
   - `✅ Server 3000 portida ishga tushdi`
   - `🌐 APP_BASE_URL: https://your-app.railway.app`
   - `✅ Webhook muvaffaqiyatli ... manziliga o'rnatildi`

## 7. Muammolarni Hal Qilish

### Webhook ishlamayapti:
- `APP_BASE_URL` to'g'ri sozlanganligini tekshiring
- Railway.com'da public domain yaratilganligini tekshiring
- Log'larda xatoliklar bor-yo'qligini tekshiring

### Bot javob bermayapti:
- Bot token to'g'ri ekanligini tekshiring
- Webhook to'g'ri o'rnatilganligini tekshiring
- Telegram bot API'ga ulanishni tekshiring

### Session ishlamayapti:
- `SESSION_SECRET` sozlanganligini tekshiring
- Cookie'lar HTTPS orqali ishlayotganligini tekshiring

## 8. Database

SQLite database fayli Railway.com'da saqlanadi. Agar ma'lumotlarni saqlab qolishni xohlasangiz, Railway.com'ning persistent storage xizmatidan foydalaning.

## 9. Qo'shimcha Sozlamalar

- **Port:** Railway.com avtomatik `PORT` environment variable'ni beradi
- **HTTPS:** Railway.com avtomatik HTTPS sertifikatini beradi
- **WebSocket:** WebSocket ham ishlaydi, faqat `wss://` protokoli ishlatiladi

