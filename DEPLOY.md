# Deploy Qo'llanmasi

## PM2 bilan Deploy

### 1. Dependencies o'rnatish
```bash
npm install
```

### 2. Environment Variables
`.env` faylini yarating va quyidagilarni qo'shing:
```env
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://your-domain.com
SESSION_SECRET=your-very-strong-secret-key-here
```

### 3. Database Migrations
```bash
npm run migrate:latest
```

### 4. PM2 bilan ishga tushirish

#### Birinchi marta ishga tushirish:
```bash
npm run pm2:start
```

#### PM2 ni system startup ga qo'shish (server qayta ishga tushganda avtomatik ishga tushishi uchun):
```bash
npm run pm2:startup
npm run pm2:save
```

### 5. PM2 Buyruqlari

- **Ishga tushirish**: `npm run pm2:start`
- **To'xtatish**: `npm run pm2:stop`
- **Qayta ishga tushirish**: `npm run pm2:restart`
- **Reload (zero-downtime)**: `npm run pm2:reload`
- **Holatni ko'rish**: `npm run pm2:status`
- **Loglarni ko'rish**: `npm run pm2:logs`
- **Monitoring**: `npm run pm2:monit`
- **O'chirish**: `npm run pm2:delete`

### 6. Loglar

Loglar `logs/` papkasida saqlanadi:
- `pm2-error.log` - Xatoliklar
- `pm2-out.log` - Standart chiqish
- `pm2-combined.log` - Barcha loglar

### 7. Telegram Bot Sozlash

1. Admin panelga kiring
2. Sozlamalar → Telegram bo'limiga o'ting
3. Bot tokenini kiriting
4. Bot username ni kiriting
5. Admin chat ID ni kiriting (ixtiyoriy)

**Muhim**: `.env` faylida `APP_BASE_URL` o'rnatilgan bo'lishi kerak (HTTPS bilan boshlanishi kerak).

### 8. Performance Monitoring

PM2 monitoring:
```bash
npm run pm2:monit
```

Bu sizga quyidagilarni ko'rsatadi:
- CPU foydalanishi
- Memory foydalanishi
- Restartlar soni
- Uptime

### 9. Zero-Downtime Deployment

Kod yangilanganda:
```bash
git pull
npm install
npm run migrate:latest
npm run pm2:reload
```

`reload` buyrug'i zero-downtime bilan qayta ishga tushiradi (yangi instance yaratadi, eski instance yopiladi).

### 10. Troubleshooting

#### Server ishlamayapti:
```bash
npm run pm2:logs
```

#### Memory muammosi:
`ecosystem.config.js` da `max_memory_restart` ni o'zgartiring.

#### WebSocket muammosi:
`ecosystem.config.js` da `instances: 1` va `exec_mode: 'fork'` bo'lishi kerak.

#### Database connection timeout:
`knexfile.js` da pool sozlamalarini tekshiring.

### 11. Production Checklist

- [ ] `.env` fayli to'g'ri sozlangan
- [ ] `APP_BASE_URL` HTTPS bilan boshlanadi
- [ ] Database migrations bajarilgan
- [ ] PM2 ishga tushirilgan
- [ ] PM2 startup ga qo'shilgan
- [ ] Telegram bot tokeni kiriting
- [ ] Loglar to'g'ri ishlayapti
- [ ] WebSocket ishlayapti
- [ ] Graceful shutdown ishlayapti

### 12. Security

- `.env` faylini git ga commit qilmang
- `SESSION_SECRET` kuchli bo'lishi kerak
- HTTPS ishlatilishi kerak
- Firewall sozlamalari to'g'ri bo'lishi kerak

