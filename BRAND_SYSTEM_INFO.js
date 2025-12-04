// ========================================
// BREND TIZIMI - JARAYON TAVSIFI
// ========================================

/*
BRENDLARNI YARATISH VA BOSHQARISH:
------------------------------------
1. Admin panelga kirish: http://localhost:3000/admin
2. "Brendlar boshqaruvi" bo'limiga o'tish
3. "Brend qo'shish" tugmasini bosish
4. Brend nomini va rangini tanlash
5. Saqlash

HISOBOT KIRITISH JARAYONI:
---------------------------
1. Asosiy sahifaga kirish: http://localhost:3000
2. "Yangi Hisobot" tugmasini bosish
3. Brendni tanlash (yuqorida, o'ng tomonda - "Brendni tanlang" select)
4. Sanani tanlash (markazda)
5. Filialni tanlash (brendning ostida)
6. Jadvalga ma'lumotlarni kiritish (har bir brend va to'lov turi uchun)
7. "TASDIQLASH VA SAQLASH" tugmasini bosish

HISOBOTLARNI KO'RISH:
---------------------
1. Saqlangan hisobotlar chap tomonda ro'yxatda ko'rinadi
2. Har bir hisobotda:
   - ID raqami
   - Sana
   - Filial nomi
   - Tahrirlangan yoki yo'qligini ko'rsatuvchi belgi
   
3. Hisobotga bosganda:
   - Barcha ma'lumotlar yuklanadi
   - Brendning rangi jadvalda ko'rinadi
   - Kiritilgan summalar to'ldiriladi

PIVOT JADVAL (INTERAKTIV HISOBOTLAR):
--------------------------------------
1. Admin panelga kirish: http://localhost:3000/admin
2. "Интерактивные отчеты" (Pivot) bo'limiga o'tish
3. Sana oralig'ini tanlash
4. "Обновить данные" (Yangilash) tugmasini bosish
5. Pivot jadvalda:
   - Brendlar ko'rinadi (Бренд ustuni)
   - To'lov turlari (Naqd/Terminal)
   - Summalar
   - Filiallar
   - Xodimlar (hodimlar)

TELEGRAM BILDIRISHNOMALAR:
---------------------------
Yangi hisobot yaratilganda yoki tahrirlanmganda:
- Brend nomi ko'rsatiladi (🏢 Brend: Lalaku)
- Filial nomi
- Sana
- Kim yaratdi/tahrirladi
- Qanday o'zgarishlar bo'ldi

MA'LUMOTLAR BAZASIDA:
---------------------
1. brands jadvali: brendlar ro'yxati (id, name, color)
2. reports jadvali: har bir hisobotda brand_id saqlanadi
3. report_history jadvali: tahrirlar tarixida old_brand_id saqlanadi

ASOSIY XUSUSIYATLAR:
--------------------
✅ Brend tanlanishi majburiy emas (null bo'lishi mumkin)
✅ Bir brendga bir nechta hisobot yaratish mumkin
✅ Hisobotni tahrirlashda brend o'zgartirilishi mumkin
✅ Pivot jadvalda brendlar bo'yicha guruhlash va tahlil qilish
✅ Brendning o'ziga xos rangi jadvalda ko'rinadi
✅ Telegram'da brend ma'lumotlari bilan bildirishnomalar

*/

// ========================================
// KODNING SODDA TUSHUNCHASI
// ========================================

/*
FRONTEND (public/script.js):
----------------------------
1. populateBrands() - brendlar ro'yxatini yuklaydi va select'ga to'ldiradi
2. handleConfirm() - hisobotni saqlashda brand_id ni yuboradi
3. loadReport() - hisobotni yuklashda brand_id ni o'rnatadi
4. buildTable() - jadval yaratishda brendlarni ko'rsatadi (ranglar bilan)

BACKEND (routes/reports.js):
----------------------------
1. POST /api/reports - yangi hisobot yaratadi, brand_id ni saqlaydi
2. PUT /api/reports/:id - hisobotni yangilaydi, old_brand_id ni history'ga saqlaydi
3. GET /api/reports - hisobotlarni brendlar bilan birga qaytaradi (LEFT JOIN)

PIVOT (routes/pivot.js):
------------------------
1. GET /api/pivot/data - brendlar bo'yicha ma'lumotlarni brandMap orqali qayta ishlaydi
2. Ma'lumotlarni WebDataRocks formatiga o'zgartiradi
3. Brend nomlari "Бренд" ustunida ko'rsatiladi

TELEGRAM (utils/bot.js):
------------------------
1. sendToTelegram() - brend ma'lumotini formatlab yuboradi
2. Yangi hisobot: brand_name ko'rsatiladi
3. Tahrirlangan hisobot: eski va yangi brend farqi ko'rsatiladi

*/

module.exports = {
    info: "Bu fayl brend tizimining qisqacha ta'rifi. O'chirib tashlanishi mumkin."
};
