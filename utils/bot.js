const TelegramBot = require('node-telegram-bot-api');
const { db } = require('../db.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { URL } = require('url');
const path = require('path');
const { format } = require('date-fns');

let bot;
let botIsInitialized = false;

const userStates = {}; // Adminning holatini saqlash uchun
const NODE_SERVER_URL = process.env.APP_BASE_URL || "http://127.0.0.1:3000/";

// --- Yordamchi funksiyalar ---

function escapeHtml(text  ) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function safeSendMessage(chatId, text, options = {}) {
    console.log(`🔐 [TELEGRAM] safeSendMessage chaqirildi. Chat ID: ${chatId}, Bot initialized: ${botIsInitialized}, Bot exists: ${!!bot}`);
    
    if (!bot || !botIsInitialized) {
        console.warn(`❌ [TELEGRAM] Bot ishga tushirilmagan, xabar yuborib bo'lmaydi. Bot: ${!!bot}, Initialized: ${botIsInitialized}`);
        return null;
    }
    
    try {
        console.log(`📨 [TELEGRAM] Telegram API'ga xabar yuborilmoqda... Chat ID: ${chatId}`);
        const result = await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
        console.log(`✅ [TELEGRAM] Telegram API javob berdi. Message ID: ${result?.message_id}`);
        return result;
    } catch (error) {
        const body = error.response?.body;
        console.error(`❌ [TELEGRAM] Telegram API xatolik:`, {
            error_code: body?.error_code,
            description: body?.description,
            message: error.message,
            chatId: chatId
        });
        
        if (body?.error_code === 403) {
            console.warn(`⚠️ [TELEGRAM] Xabar yuborish imkonsiz (chat_id: ${chatId}). Bot foydalanuvchi tomonidan bloklangan.`);
            await db('users').where({ telegram_chat_id: chatId }).update({ telegram_chat_id: null, telegram_username: null });
            console.log(`🗑️ [TELEGRAM] Foydalanuvchi (chat_id: ${chatId}) bloklagani uchun bazadan tozalandi.`);
        } else if (body?.error_code === 400) {
            console.error(`❌ [TELEGRAM] Bad Request (400). Chat ID: ${chatId}, Description: ${body?.description}`);
            if (body?.description?.includes("chat not found")) {
                console.error(`❌ [TELEGRAM] Guruh topilmadi! Group ID noto'g'ri yoki bot guruhda yo'q.`);
            } else if (body?.description?.includes("not enough rights")) {
                console.error(`❌ [TELEGRAM] Bot guruhda xabar yuborish huquqiga ega emas!`);
            }
        } else {
            console.error(`❌ [TELEGRAM] Telegramga xabar yuborishda xatolik (chat_id: ${chatId}): ${body?.description || error.message}`);
            if (String(body?.description).includes("can't parse entities")) {
                try {
                    console.log(`🔄 [TELEGRAM] HTML xatoligi tufayli oddiy matn rejimida qayta yuborilmoqda...`);
                    const plainText = text.replace(/<[^>]*>/g, '');
                    const fallbackResult = await bot.sendMessage(chatId, plainText, { ...options, parse_mode: undefined });
                    console.log(`✅ [TELEGRAM] Oddiy matn rejimida yuborildi. Message ID: ${fallbackResult?.message_id}`);
                    return fallbackResult;
                } catch (fallbackError) {
                    console.error(`❌ [TELEGRAM] Oddiy matn rejimida ham yuborib bo'lmadi:`, fallbackError.response?.body || fallbackError.message);
                }
            }
        }
        return null;
    }
}

// --- Asosiy mantiq funksiyalari ---

// ===================================================================
// === HISOBOTNI FORMATLASH FUNKSIYASI (YANGILANGAN VERSIYA) ===
// ===================================================================
async function formatAndSendReport(payload) {
    // `old_report_date` va `old_location` payload'dan olinmoqda
    const { type, report_id, location, date, author, data, old_data, settings, group_id, old_report_date, old_location, brand_name, old_brand_name, currency } = payload;
    
    console.log(`📋 [TELEGRAM] formatAndSendReport boshlandi. Type: ${type}, Report ID: ${report_id}, Group ID: ${group_id}`);
    
    // Valyuta formatlash uchun
    const { formatCurrency, BASE_CURRENCY } = require('./exchangeRates.js');
    const reportCurrency = currency || BASE_CURRENCY;
    // Konvertatsiya qilmaslik kerak - qiymatlar allaqachon tanlangan valyutada saqlangan
    
    let messageText = '';
    const reportRowsOrder = settings.rows || [];
    
    // Brendlarni database'dan olish
    let brandsMap = {}; // { brand_id: brand_name }
    try {
        const brands = await db('brands').select('id', 'name');
        brands.forEach(b => {
            brandsMap[b.id] = b.name;
        });
    } catch (error) {
        console.error('Brendlarni olishda xatolik:', error);
    }

    if (type === 'new') {
        const formattedDate = format(new Date(date), 'dd.MM.yyyy');
        
        messageText += `<b>${escapeHtml(location.toUpperCase())} filiali</b>\n`;
        if (brand_name) {
            messageText += `🏢 Brend: <b>${escapeHtml(brand_name)}</b>\n`;
        }
        messageText += `${formattedDate} uchun yangi hisobot\n`;
        messageText += `Hisobot #${String(report_id).padStart(4, '0')}\n\n`;
        messageText += `👤 Kiritdi: <b>${escapeHtml(author)}</b>\n\n`;

        let grandTotal = 0;
        
        // YANGI: Brendlar bo'yicha ma'lumotlarni ajratish
        const brandTotals = {}; // { brandId: { brandTotal, columns: { colName: value } } }
        
        // Ma'lumotlarni brendlar bo'yicha guruhlash
        for (const key in data) {
            const value = data[key] || 0;
            const parts = key.split('_');
            if (parts.length >= 2) {
                const brandId = parts[0];
                const colName = parts.slice(1).join('_');
                
                if (!brandTotals[brandId]) {
                    brandTotals[brandId] = { brandTotal: 0, columns: {} };
                }
                
                brandTotals[brandId].columns[colName] = value;
                brandTotals[brandId].brandTotal += value;
                grandTotal += value;
            }
        }
        
        // Brendlar bo'yicha ko'rsatish (faqat umumiy summa, ustunlarsiz)
        messageText += `<b>Yangilangan summalar:</b>\n\n`;
        
        const sortedBrandIds = Object.keys(brandTotals).sort((a, b) => a - b);
        
        for (const brandId of sortedBrandIds) {
            const { brandTotal } = brandTotals[brandId];
            
            if (brandTotal > 0) {
                const brandName = brandsMap[brandId] || `Brend #${brandId}`;
                
                // Qiymat allaqachon tanlangan valyutada saqlangan, konvertatsiya qilmaslik kerak
                // Faqat formatlash kerak
                messageText += `${escapeHtml(brandName)}: <code>${formatCurrency(brandTotal, reportCurrency)}</code>\n`;
            }
        }
        
        messageText += `\n`;

        // Jami summa - qiymat allaqachon tanlangan valyutada, konvertatsiya qilmaslik kerak
        messageText += `💰 <b>JAMI:</b> <code>${formatCurrency(grandTotal, reportCurrency)}</code>`;

    } else if (type === 'edit') {
        messageText += `✍️ <b>Hisobot Tahrirlandi #${String(report_id).padStart(4, '0')}</b>\n`;
        messageText += `👤 O'zgartirdi: <b>${escapeHtml(author)}</b>\n\n`;
        
        const changes = [];

        // === O'ZGARTIRISH: Filial o'zgarishini tekshirish ===
        if (old_location && location !== old_location) {
            changes.push(`Filial: <s>${escapeHtml(old_location)}</s> → <b>${escapeHtml(location)}</b>`);
        }

        // === O'ZGARTIRISH: Sana o'zgarishini tekshirish ===
        if (old_report_date && date !== old_report_date) {
            const formattedOldDate = format(new Date(old_report_date), 'dd.MM.yyyy');
            const formattedNewDate = format(new Date(date), 'dd.MM.yyyy');
            changes.push(`Sana: <s>${formattedOldDate}</s> → <b>${formattedNewDate}</b>`);
        }

        // === Brend o'zgarishini tekshirish ===
        if (old_brand_name !== brand_name) {
            const oldBrand = old_brand_name || 'Ko\'rsatilmagan';
            const newBrand = brand_name || 'Ko\'rsatilmagan';
            changes.push(`Brend: <s>${escapeHtml(oldBrand)}</s> → <b>${escapeHtml(newBrand)}</b>`);
        } else if (brand_name) {
            messageText += `🏢 Brend: <b>${escapeHtml(brand_name)}</b>\n`;
        }

        if (changes.length > 0) {
            messageText += `<b>O'zgargan ma'lumotlar:</b>\n${changes.join('\n')}\n\n`;
        }
        
        messageText += `<b>Yangilangan summalar:</b>\n\n`;

        let newGrandTotal = 0;
        let oldGrandTotal = 0;
        
        // Brendlar bo'yicha ma'lumotlarni ajratish
        const brandChanges = {}; // { brandId: { newTotal, oldTotal, columns: {...} } }
        
        // Yangi va eski ma'lumotlarni brendlar bo'yicha guruhlash
        const allKeys = new Set([...Object.keys(data), ...Object.keys(old_data)]);
        
        for (const key of allKeys) {
            const newValue = data[key] || 0;
            const oldValue = old_data[key] || 0;
            const parts = key.split('_');
            
            if (parts.length >= 2) {
                const brandId = parts[0];
                const colName = parts.slice(1).join('_');
                
                if (!brandChanges[brandId]) {
                    brandChanges[brandId] = { newTotal: 0, oldTotal: 0, columns: {} };
                }
                
                brandChanges[brandId].columns[colName] = { newValue, oldValue };
                brandChanges[brandId].newTotal += newValue;
                brandChanges[brandId].oldTotal += oldValue;
                
                newGrandTotal += newValue;
                oldGrandTotal += oldValue;
            }
        }
        
        // Brendlar bo'yicha o'zgarishlarni ko'rsatish (faqat umumiy summa)
        const sortedBrandIds = Object.keys(brandChanges).sort((a, b) => a - b);
        
        for (const brandId of sortedBrandIds) {
            const { newTotal, oldTotal } = brandChanges[brandId];
            
            if (newTotal > 0 || oldTotal > 0) {
                const brandName = brandsMap[brandId] || `Brend #${brandId}`;
                
                if (newTotal !== oldTotal) {
                    const sign = newTotal > oldTotal ? '➕' : '➖';
                    // Qiymatlar allaqachon tanlangan valyutada, konvertatsiya qilmaslik kerak
                    messageText += `${escapeHtml(brandName)}: <s>${formatCurrency(oldTotal, reportCurrency)}</s> → <code>${formatCurrency(newTotal, reportCurrency)}</code> ${sign}\n`;
                } else {
                    // Qiymat allaqachon tanlangan valyutada, konvertatsiya qilmaslik kerak
                    messageText += `${escapeHtml(brandName)}: <code>${formatCurrency(newTotal, reportCurrency)}</code>\n`;
                }
            }
        }
        
        messageText += `\n`;
        
        // Jami summalar - qiymatlar allaqachon tanlangan valyutada, konvertatsiya qilmaslik kerak
        const difference = newGrandTotal - oldGrandTotal;
        let diffText = '';
        if (difference > 0) {
            diffText = `<b>▲ ${formatCurrency(difference, reportCurrency)}</b>`;
        } else if (difference < 0) {
            diffText = `<b>▼ ${formatCurrency(Math.abs(difference), reportCurrency)}</b>`;
        }

        messageText += `\n💰 <b>JAMI:</b> <code>${formatCurrency(newGrandTotal, reportCurrency)}</code>  ${diffText}`;
    }

    if (messageText) {
        console.log(`💬 [TELEGRAM] Xabar tayyor. Uzunligi: ${messageText.length} belgi`);
        console.log(`📤 [TELEGRAM] safeSendMessage chaqirilmoqda. Group ID: ${group_id}`);
        const result = await safeSendMessage(group_id, messageText);
        if (result) {
            console.log(`✅ [TELEGRAM] Xabar muvaffaqiyatli yuborildi. Message ID: ${result.message_id}`);
        } else {
            console.error(`❌ [TELEGRAM] Xabar yuborilmadi. Result: null`);
        }
    } else {
        console.warn(`⚠️ [TELEGRAM] Xabar matni bo'sh. Xabar yuborilmadi.`);
    }
}


async function handleSecurityRequest(payload) {
    const { type, chat_id, admin_chat_id, user_id, username, fullname, token, password, secret_word } = payload;
    let text, keyboard;

    function escapeMarkdownV2(text) {
        if (!text) return "";
        return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
    }

    async function sendMarkdownV2Message(chatId, text, options = {}) {
        console.log(`📨 [TELEGRAM] sendMarkdownV2Message chaqirildi. Chat ID: ${chatId}, Bot initialized: ${botIsInitialized}, Bot exists: ${!!bot}`);
        
        if (!bot || !botIsInitialized) {
            console.warn(`❌ [TELEGRAM] Bot ishga tushirilmagan, MarkdownV2 xabar yuborib bo'lmaydi. Bot: ${!!bot}, Initialized: ${botIsInitialized}`);
            return null;
        }
        
        try {
            console.log(`📤 [TELEGRAM] MarkdownV2 xabar yuborilmoqda... Chat ID: ${chatId}, Text length: ${text?.length || 0}`);
            const result = await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2', ...options });
            console.log(`✅ [TELEGRAM] MarkdownV2 xabar muvaffaqiyatli yuborildi. Chat ID: ${chatId}, Message ID: ${result?.message_id}`);
            return result;
        } catch (error) {
            const body = error.response?.body;
            console.error(`❌ [TELEGRAM] MarkdownV2 xabar yuborishda xatolik (chat_id: ${chatId}):`, {
                error_code: body?.error_code,
                description: body?.description,
                message: error.message,
                chatId: chatId
            });
            
            if (body?.error_code === 403) {
                console.warn(`⚠️ [TELEGRAM] MarkdownV2 xabar yuborish imkonsiz (chat_id: ${chatId}). Bot foydalanuvchi tomonidan bloklangan.`);
            } else if (body?.error_code === 400) {
                console.error(`❌ [TELEGRAM] MarkdownV2 Bad Request (400). Chat ID: ${chatId}, Description: ${body?.description}`);
                if (body?.description?.includes("chat not found")) {
                    console.error(`❌ [TELEGRAM] MarkdownV2: Chat topilmadi! Chat ID noto'g'ri yoki bot chat'da yo'q.`);
                }
            }
            
            return null;
        }
    }

    switch (type) {
        case 'secret_word_request':
            userStates[chat_id] = { state: 'awaiting_secret_word', user_id, attempts_left: 2 };
            text = `Salom, *${escapeMarkdownV2(username)}*\\! \n\n${escapeMarkdownV2("Tizimga yangi qurilmadan kirishga urinish aniqlandi. Xavfsizlikni tasdiqlash uchun, iltimos, ")}*${escapeMarkdownV2("maxfiy so'zingizni")}*${escapeMarkdownV2(" shu botga yozib yuboring.")}`;
            await sendMarkdownV2Message(chat_id, text);
            break;

        case 'magic_link_request':
            console.log(`🔗 [TELEGRAM] Magic link so'rovi. Chat ID: ${chat_id}, User ID: ${user_id}`);
            const magicLink = new URL(path.join('api/verify-session/', token), NODE_SERVER_URL).href;
            text = `Salom, *${escapeMarkdownV2(username)}*\\! \n\n${escapeMarkdownV2("Yangi qurilmadan kirishni tasdiqlash uchun quyidagi tugmani bosing. Bu havola 5 daqiqa amal qiladi.")}`;
            keyboard = { inline_keyboard: [[{ text: "✅ Yangi Qurilmada Kirish", url: magicLink }]] };
            const magicLinkResult = await sendMarkdownV2Message(chat_id, text, { reply_markup: keyboard });
            if (magicLinkResult) {
                console.log(`✅ [TELEGRAM] Magic link yuborildi. Chat ID: ${chat_id}, Message ID: ${magicLinkResult.message_id}`);
            } else {
                console.error(`❌ [TELEGRAM] Magic link yuborilmadi. Chat ID: ${chat_id}`);
            }
            break;

        case 'security_alert':
            console.log(`⚠️ [TELEGRAM] Security alert. Admin Chat ID: ${admin_chat_id}, User ID: ${user_id}`);
            text = `⚠️ *${escapeMarkdownV2("Xavfsizlik Ogohlantirishi!")}* \n\n*${escapeMarkdownV2("Foydalanuvchi:")}* ${escapeMarkdownV2(username)} \\(ID: ${user_id}\\)\n*${escapeMarkdownV2("Holat:")}* ${escapeMarkdownV2("Akkauntga kirish uchun maxfiy so'z 2 marta xato kiritildi. Jarayon bloklandi.")}\n\n${escapeMarkdownV2("Nima qilamiz?")}`;
            keyboard = { inline_keyboard: [[{ text: "✅ Yana Urinish Berish", callback_data: `retry_${user_id}` }, { text: "❌ Jarayonni Bloklash", callback_data: `block_${user_id}` }]] };
            const securityAlertResult = await sendMarkdownV2Message(admin_chat_id, text, { reply_markup: keyboard });
            if (securityAlertResult) {
                console.log(`✅ [TELEGRAM] Security alert yuborildi. Admin Chat ID: ${admin_chat_id}, Message ID: ${securityAlertResult.message_id}`);
            } else {
                console.error(`❌ [TELEGRAM] Security alert yuborilmadi. Admin Chat ID: ${admin_chat_id}`);
            }
            break;

        case 'account_lock_alert':
            console.log(`🔒 [TELEGRAM] Account lock alert. Admin Chat ID: ${admin_chat_id}, User ID: ${user_id}`);
            text = `⚠️ *${escapeMarkdownV2("Xavfsizlik Ogohlantirishi!")}* \n\n*${escapeMarkdownV2("Foydalanuvchi:")}* ${escapeMarkdownV2(username)} \\(ID: ${user_id}\\)\n*${escapeMarkdownV2("Holat:")}* ${escapeMarkdownV2("Parol kiritish limitidan oshib ketgani uchun akkaunt bloklandi.")}\n\n${escapeMarkdownV2("Foydalanuvchiga qayta kirishga ruxsat berilsinmi?")}`;
            keyboard = { inline_keyboard: [[{ text: "✅ Ruxsat Berish", callback_data: `unblock_${user_id}` }, { text: "❌ Rad Etish", callback_data: `keep_blocked_${user_id}` }]] };
            const accountLockResult = await sendMarkdownV2Message(admin_chat_id, text, { reply_markup: keyboard });
            if (accountLockResult) {
                console.log(`✅ [TELEGRAM] Account lock alert yuborildi. Admin Chat ID: ${admin_chat_id}, Message ID: ${accountLockResult.message_id}`);
            } else {
                console.error(`❌ [TELEGRAM] Account lock alert yuborilmadi. Admin Chat ID: ${admin_chat_id}`);
            }
            break;
            
        case 'new_user_request':
            console.log(`🔔 [TELEGRAM] Yangi foydalanuvchi so'rovi (bot sozlanmagan). User ID: ${user_id}, Admin Chat ID: ${admin_chat_id}`);
            text = `🔔 *${escapeMarkdownV2("Yangi Foydalanuvchi So'rovi (Bot sozlanmagan)!")}* \n\n${escapeMarkdownV2("Tizimda yangi foydalanuvchi ro'yxatdan o'tdi, lekin bot sozlanmaganligi sababli obuna bo'la olmadi. Iltimos, admin panel orqali so'rovni tasdiqlang yoki rad eting.")} \n\n👤 *${escapeMarkdownV2("To'liq ism:")}* ${escapeMarkdownV2(fullname)}\n🔑 *${escapeMarkdownV2("Login:")}* \`${escapeMarkdownV2(username)}\``;
            const newUserRequestResult = await sendMarkdownV2Message(admin_chat_id, text);
            if (newUserRequestResult) {
                console.log(`✅ [TELEGRAM] Yangi foydalanuvchi so'rovi admin'ga yuborildi. User ID: ${user_id}, Message ID: ${newUserRequestResult.message_id}`);
            } else {
                console.error(`❌ [TELEGRAM] Yangi foydalanuvchi so'rovi yuborilmadi. User ID: ${user_id}, Admin Chat ID: ${admin_chat_id}`);
            }
            break;

        case 'new_user_approval':
            console.log(`🔔 [TELEGRAM] Yangi foydalanuvchi tasdiqlash so'rovi. User ID: ${user_id}, Admin Chat ID: ${admin_chat_id}`);
            text = `🔔 *${escapeMarkdownV2("Yangi Foydalanuvchi So'rovi!")}* \n\n${escapeMarkdownV2("Foydalanuvchi botga obuna bo'ldi va tasdiqlashingizni kutmoqda.")} \n\n👤 *${escapeMarkdownV2("To'liq ism:")}* ${escapeMarkdownV2(fullname)}\n🔑 *${escapeMarkdownV2("Login:")}* \`${escapeMarkdownV2(username)}\`\n\n${escapeMarkdownV2("Iltimos, so'rovni tasdiqlang yoki rad eting.")}`;
            keyboard = {
                inline_keyboard: [
                    [{ text: "✅ Tasdiqlash", callback_data: `approve_${user_id}` }, { text: "❌ Rad Etish", callback_data: `reject_${user_id}` }]
                ]
            };
            const newUserApprovalResult = await sendMarkdownV2Message(admin_chat_id, text, { reply_markup: keyboard });
            if (newUserApprovalResult) {
                console.log(`✅ [TELEGRAM] Tasdiqlash so'rovi admin'ga yuborildi. User ID: ${user_id}, Message ID: ${newUserApprovalResult.message_id}`);
            } else {
                console.error(`❌ [TELEGRAM] Tasdiqlash so'rovi yuborilmadi. User ID: ${user_id}, Admin Chat ID: ${admin_chat_id}`);
            }
            break;

        case 'user_approved_credentials':
            console.log(`🎉 [TELEGRAM] Foydalanuvchi tasdiqlandi va kirish ma'lumotlari yuborilmoqda. User ID: ${user_id}, Chat ID: ${chat_id}`);
            text = `🎉 *${escapeMarkdownV2("Tabriklaymiz, " + fullname)}*\\! \n\n${escapeMarkdownV2("Sizning hisobot tizimidagi akkauntingiz tasdiqlandi.")} \n\n${escapeMarkdownV2("Quyidagi ma'lumotlar orqali tizimga kirishingiz mumkin. Ushbu xabar tizimga birinchi marta kirganingizdan so'ng ")}*${escapeMarkdownV2("avtomatik o'chib ketadi")}*${escapeMarkdownV2(".")} \n\n${escapeMarkdownV2("—".repeat(25))}\n\n*${escapeMarkdownV2("Login:")}* \`${escapeMarkdownV2(username)}\`\n*${escapeMarkdownV2("Parol:")}* \`${escapeMarkdownV2(password)}\`\n*${escapeMarkdownV2("Maxfiy so'z:")}* \`${escapeMarkdownV2(secret_word)}\`\n\n${escapeMarkdownV2("—".repeat(25))}\n\n⚠️ *${escapeMarkdownV2("Diqqat!")}* ${escapeMarkdownV2("Bu ma'lumotlarni hech kimga bermang.")}`;
            const sentMessage = await sendMarkdownV2Message(chat_id, text, {
                disable_web_page_preview: true,
                protect_content: true
            });
            if (sentMessage) {
                await db('users').where({ id: user_id }).update({ creds_message_id: sentMessage.message_id });
                console.log(`✅ [TELEGRAM] Kirish ma'lumotlari yuborildi. User ID: ${user_id}, Message ID: ${sentMessage.message_id}`);
            } else {
                console.error(`❌ [TELEGRAM] Kirish ma'lumotlarini yuborib bo'lmadi. User ID: ${user_id}, Chat ID: ${chat_id}`);
            }
            break;
        
        case 'delete_credentials':
            const user = await db('users').where({ id: user_id }).select('creds_message_id').first();
            if (user && user.creds_message_id) {
                try {
                    await bot.deleteMessage(chat_id, user.creds_message_id);
                    await db('users').where({ id: user_id }).update({ creds_message_id: null });
                } catch (error) {
                    console.warn(`Eski kirish ma'lumotlari xabarini o'chirib bo'lmadi (chat_id: ${chat_id}, msg_id: ${user.creds_message_id}). Sabab: ${error.message}`);
                }
            }
            break;
    }
}


async function sendToTelegram(payload) {
    try {
        const { type } = payload;
        console.log(`📤 [TELEGRAM] sendToTelegram chaqirildi. Type: ${type}, Payload:`, JSON.stringify(payload, null, 2));

        if (type === 'new' || type === 'edit') {
            const groupIdSetting = await db('settings').where({ key: 'telegram_group_id' }).first();
            let groupId = groupIdSetting ? groupIdSetting.value : null;

            console.log(`🔍 [TELEGRAM] Group ID sozlamasi:`, groupIdSetting);
            console.log(`🔍 [TELEGRAM] Olingan Group ID: ${groupId} (type: ${typeof groupId})`);

            if (!groupId) {
                console.error("❌ [TELEGRAM] Telegram guruh ID si topilmadi. Hisobot yuborilmadi.");
                return;
            }
            
            // Group ID ni number'ga o'tkazish (agar string bo'lsa)
            if (typeof groupId === 'string') {
                const parsedId = parseInt(groupId, 10);
                if (!isNaN(parsedId)) {
                    groupId = parsedId;
                    console.log(`🔄 [TELEGRAM] Group ID string'dan number'ga o'tkazildi: ${groupId}`);
                } else {
                    console.error(`❌ [TELEGRAM] Group ID noto'g'ri format: "${groupId}". Number bo'lishi kerak.`);
                    return;
                }
            }
            
            console.log(`📝 [TELEGRAM] formatAndSendReport chaqirilmoqda. Group ID: ${groupId} (type: ${typeof groupId})`);
            await formatAndSendReport({ ...payload, group_id: groupId });
            console.log(`✅ [TELEGRAM] formatAndSendReport yakunlandi.`);

        } else if ([
            'secret_word_request', 
            'magic_link_request', 
            'security_alert', 
            'account_lock_alert', 
            'new_user_request',
            'new_user_approval',
            'user_approved_credentials',
            'delete_credentials'
        ].includes(type)) {
            
            if (['new_user_request', 'new_user_approval', 'account_lock_alert', 'security_alert'].includes(type)) {
                const adminChatIdSetting = await db('settings').where({ key: 'telegram_admin_chat_id' }).first();
                const adminChatId = adminChatIdSetting ? adminChatIdSetting.value : null;
                
                console.log(`👤 [TELEGRAM] Admin chat ID tekshiruvi. Type: ${type}, Admin Chat ID: ${adminChatId}`);
                
                if (!adminChatId) {
                    console.error(`❌ [TELEGRAM] Admin chat ID topilmadi. Type: ${type}, Xabarni yuborib bo'lmaydi.`);
                    if (type !== 'new_user_approval' && type !== 'new_user_request') {
                        return;
                    }
                }
                payload.admin_chat_id = adminChatId;
            }
            
            console.log(`🔄 [TELEGRAM] handleSecurityRequest chaqirilmoqda. Type: ${type}`);
            await handleSecurityRequest(payload);
            console.log(`✅ [TELEGRAM] handleSecurityRequest yakunlandi. Type: ${type}`);
        }

    } catch (error) {
        console.error(`❌ [TELEGRAM] Telegramga yuborish funksiyasida kutilmagan xatolik:`, error.message);
        console.error(`❌ [TELEGRAM] Stack trace:`, error.stack);
    }
}

async function handleReRegistration(chatId, newUser) {
    const existingUser = await db('users')
        .where({ telegram_chat_id: chatId })
        .whereNot({ id: newUser.id })
        .first();

    if (existingUser && existingUser.status === 'archived') {
        const adminSetting = await db('settings').where({ key: 'telegram_admin_chat_id' }).first();
        const adminChatId = adminSetting ? adminSetting.value : null;
        if (adminChatId) {
            const text = `⚠️ <b>Qayta Registratsiya Aniqlanmadi!</b> \n\nFoydalanuvchi <b>${escapeHtml(newUser.fullname)}</b> (@${escapeHtml(newUser.username)}) yangi akkaunt bilan ro'yxatdan o'tmoqda, lekin uning Telegram akkaunti avval <b>${escapeHtml(existingUser.username)}</b> logini bilan ro'yxatdan o'tgan va arxivlangan. \n\nQaysi birini tanlaysiz?`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: "♻️ Eskisini Tiklash", callback_data: `restore_${existingUser.id}_${newUser.id}` },
                        { text: "🆕 Yangi Yaratish", callback_data: `force_new_${existingUser.id}_${newUser.id}` }
                    ]
                ]
            };
            await safeSendMessage(adminChatId, text, { reply_markup: keyboard });
            return true;
        }
    }
    return false;
}


const initializeBot = async (botToken, options = { polling: true }) => {
    if (!botToken) {
        console.warn("Bot tokeni berilmadi. Bot ishga tushirilmadi.");
        return;
    }

    if (bot && botIsInitialized) {
        console.log("Bot qayta ishga tushirilmoqda...");
        if (bot.isPolling()) {
            await bot.stopPolling();
        }
    }

    bot = new TelegramBot(botToken, options);
    botIsInitialized = true;

    if (options.polling) {
        console.log("✅ Telegram bot (polling rejimi) muvaffaqiyatli ishga tushdi.");
    } else {
        console.log("✅ Telegram bot (webhook rejimi) uchun tayyor.");
        console.log("📝 [BOT] Event handler'lar o'rnatilmoqda...");
        console.log(`📝 [BOT] Bot instance mavjud: ${!!bot}, Bot token: ${botToken?.substring(0, 10)}...`);
    }

    bot.on('polling_error', (error) => {
        console.error('Polling xatoligi:', error.code, '-', error.message);
        if (error.response && error.response.statusCode === 401) {
            console.error("Noto'g'ri bot tokeni. Bot to'xtatildi.");
            bot.stopPolling();
            botIsInitialized = false;
        }
    });

    bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const code = match[1];
        
        console.log(`🤖 [BOT] /start komandasi qabul qilindi. Chat ID: ${chatId}, Code: ${code || 'yo\'q'}`);
        console.log(`🤖 [BOT] /start handler ishga tushdi. Message:`, JSON.stringify(msg, null, 2));

        if (code && code.startsWith('subscribe_')) {
            const newUserId = code.split('_')[1];
            console.log(`🔗 [BOT] Subscribe so'rovi. User ID: ${newUserId}, Chat ID: ${chatId}`);
            
            try {
                const existingUserWithTg = await db('users').where({ telegram_chat_id: chatId }).first();

                if (existingUserWithTg) {
                    if (String(existingUserWithTg.id) !== String(newUserId)) {
                        if (existingUserWithTg.status === 'active') {
                            await safeSendMessage(chatId, `❌ <b>Xatolik:</b> Sizning Telegram profilingiz allaqachon tizimdagi boshqa <b>aktiv akkauntga</b> bog'langan. Yangi akkaunt ochish uchun boshqa Telegram profildan foydalaning.`);
                            return;
                        }
                        if (existingUserWithTg.status === 'blocked') {
                            await safeSendMessage(chatId, `❌ <b>Xatolik:</b> Sizning Telegram profilingiz tizimda <b>bloklangan</b> akkauntga bog'langan. Iltimos, administratorga murojaat qiling.`);
                            return;
                        }
                        
                        console.log(`Eski, keraksiz foydalanuvchi yozuvi (ID: ${existingUserWithTg.id}) tozalanmoqda...`);
                        await db('users').where({ id: existingUserWithTg.id }).del();
                    }
                }

                const user = await db('users').where({ id: newUserId }).first();
                if (!user) {
                    await safeSendMessage(chatId, `❌ Noma'lum yoki eskirgan so'rov. Iltimos, ro'yxatdan o'tishni qaytadan boshlang.`);
                    return;
                }

                if (user.status !== 'pending_telegram_subscription') {
                    await safeSendMessage(chatId, `✅ Siz allaqachon obuna bo'lgansiz yoki so'rovingiz ko'rib chiqilmoqda.`);
                    return;
                }

                await db('users').where({ id: newUserId }).update({
                    telegram_chat_id: chatId,
                    telegram_username: msg.from.username,
                    status: 'pending_approval'
                });

                console.log(`✅ [BOT] Foydalanuvchi botga ulandi. User ID: ${newUserId}, Status: pending_approval`);
                await safeSendMessage(chatId, `✅ Rahmat! Siz botga muvaffaqiyatli obuna bo'ldingiz. \n\nSo'rovingiz ko'rib chiqish uchun adminga yuborildi. Tasdiqlanishini kuting.`);

                await sendToTelegram({
                    type: 'new_user_approval',
                    user_id: user.id,
                    username: user.username,
                    fullname: user.fullname
                });

            } catch (error) {
                console.error("Yangi foydalanuvchi obunasida xatolik:", error);
                await safeSendMessage(chatId, "Tizimda vaqtinchalik xatolik. Iltimos, keyinroq qayta urinib ko'ring.");
            }

        } else if (code && code.startsWith('connect_')) {
            try {
                const response = await fetch(new URL('api/telegram/register-chat', NODE_SERVER_URL).href, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, username: msg.from.username, code: code })
                });
                const result = await response.json();
                const message = result.status === 'success' ? `✅ Siz hisobot tizimiga muvaffaqiyatli ulandingiz!` : `❌ Xatolik: ${result.message}`;
                await safeSendMessage(chatId, message);
            } catch (error) {
                console.error("Node.js serveriga ulanishda xatolik:", error);
                await safeSendMessage(chatId, "Tizimda vaqtinchalik xatolik. Iltimos, keyinroq urinib ko'ring.");
            }
        } else {
            // Agar hech qanday kod bo'lmasa, oddiy /start komandasi
            // Super admin yoki admin bo'lsa, chat ID'ni avtomatik saqlash
            const user = await db('users').where({ telegram_chat_id: chatId }).first();
            if (user && (user.role === 'super_admin' || user.role === 'admin')) {
                // Admin chat ID'ni tekshirish va saqlash
                const adminChatIdSetting = await db('settings').where({ key: 'telegram_admin_chat_id' }).first();
                if (!adminChatIdSetting || !adminChatIdSetting.value) {
                    await db('settings')
                        .insert({ key: 'telegram_admin_chat_id', value: String(chatId) })
                        .onConflict('key')
                        .merge();
                    console.log(`✅ [BOT] Admin chat ID avtomatik saqlandi. Chat ID: ${chatId}, User: ${user.username}`);
                    await safeSendMessage(chatId, `✅ <b>Salom, ${escapeHtml(user.fullname || user.username)}!</b>\n\nSizning Chat ID'ingiz avtomatik saqlandi. Endi sizga yangi foydalanuvchi so'rovlari yuboriladi.`);
                } else {
                    await safeSendMessage(chatId, `Salom! Bu hisobot tizimining rasmiy boti.`);
                }
            } else {
                await safeSendMessage(chatId, `Salom! Bu hisobot tizimining rasmiy boti.`);
            }
        }
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        
        console.log(`💬 [BOT] Xabar qabul qilindi. Chat ID: ${chatId}, Text: ${text?.substring(0, 50) || 'yo\'q'}`);
        console.log(`💬 [BOT] message event handler ishga tushdi. Message:`, JSON.stringify(msg, null, 2));

        // Admin chat ID'ni avtomatik saqlash (super admin yoki admin uchun)
        try {
            const user = await db('users').where({ telegram_chat_id: chatId }).first();
            if (user && (user.role === 'super_admin' || user.role === 'admin')) {
                const adminChatIdSetting = await db('settings').where({ key: 'telegram_admin_chat_id' }).first();
                if (!adminChatIdSetting || !adminChatIdSetting.value) {
                    await db('settings')
                        .insert({ key: 'telegram_admin_chat_id', value: String(chatId) })
                        .onConflict('key')
                        .merge();
                    console.log(`✅ [BOT] Admin chat ID avtomatik saqlandi. Chat ID: ${chatId}, User: ${user.username}`);
                }
            }
        } catch (error) {
            console.error(`❌ [BOT] Admin chat ID saqlashda xatolik:`, error);
        }

        if (!text || text.startsWith('/')) return;

        const state = userStates[chatId];
        if (state && state.state === 'awaiting_secret_word') {
            const { user_id } = state;
            console.log(`🔐 [BOT] Secret word kutilmoqda. User ID: ${user_id}, Chat ID: ${chatId}`);
            try {
                const response = await fetch(new URL('api/telegram/verify-secret-word', NODE_SERVER_URL).href, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id, secret_word: text })
                });
                const result = await response.json();

                if (result.status === 'success') {
                    console.log(`✅ [BOT] Secret word to'g'ri. Magic link yuborilmoqda. User ID: ${user_id}`);
                    const magicLink = new URL(path.join('api/verify-session/', result.magic_token), NODE_SERVER_URL).href;
                    const messageText = `Salom, <b>${escapeHtml(msg.from.username)}</b>! \n\nYangi qurilmadan kirishni tasdiqlash uchun quyidagi tugmani bosing. Bu havola 5 daqiqa amal qiladi.`;
                    const keyboard = { inline_keyboard: [[{ text: "✅ Yangi Qurilmada Kirish", url: magicLink }]] };
                    await safeSendMessage(chatId, messageText, { reply_markup: keyboard });
                    delete userStates[chatId];
                    console.log(`✅ [BOT] Magic link yuborildi. User ID: ${user_id}`);
                } else if (result.status === 'locked') {
                    console.log(`🔒 [BOT] Secret word urinishlari bloklandi. User ID: ${user_id}`);
                    await safeSendMessage(chatId, "Xavfsizlik qoidasi buzildi. Kirishga urinish bloklandi. Administrator bilan bog'laning.");
                    delete userStates[chatId];
                } else {
                    state.attempts_left--;
                    console.log(`⚠️ [BOT] Secret word noto'g'ri. Qolgan urinishlar: ${state.attempts_left}, User ID: ${user_id}`);
                    if (state.attempts_left > 0) {
                        await safeSendMessage(chatId, `Maxfiy so'z noto'g'ri. Qayta urinib ko'ring. (Qolgan urinishlar: ${state.attempts_left})`);
                    } else {
                        console.log(`🔒 [BOT] Secret word urinishlari tugadi. Admin'ga xabar yuborilmoqda. User ID: ${user_id}`);
                        await safeSendMessage(chatId, "Urinishlar soni tugadi. Jarayon bloklandi.");
                        fetch(new URL('api/telegram/notify-admin-lock', NODE_SERVER_URL).href, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id })
                        });
                        delete userStates[chatId];
                    }
                }
            } catch (error) {
                console.error("Node.js serveriga maxfiy so'zni tekshirish uchun ulanishda xatolik:", error);
                await safeSendMessage(chatId, "Tizimda vaqtinchalik xatolik.");
            }
        }
    });

    bot.on('callback_query', async (query) => {
        console.log(`🔄 [BOT] callback_query event handler ishga tushdi. Query:`, JSON.stringify(query, null, 2));
        const adminChatId = query.message.chat.id;
        const { data, message } = query;
        
        console.log(`🔘 [BOT] Callback query qabul qilindi. Chat ID: ${adminChatId}, Data: ${data}`);
        
        const originalText = message.text;
        
        const adminState = userStates[adminChatId];

        if (adminState) {
            const { state, userId } = adminState;
            if (state === 'awaiting_role') {
                const role = data;
                userStates[adminChatId].role = role;
                userStates[adminChatId].state = 'awaiting_locations';
                userStates[adminChatId].locations = [];

                const settings = await db('settings').where({ key: 'app_settings' }).first();
                const allLocations = settings ? JSON.parse(settings.value).locations : [];
                
                if (allLocations.length === 0) {
                    const { userId, role } = userStates[adminChatId];
                    delete userStates[adminChatId];

                    try {
                        const response = await fetch(new URL('api/telegram/finalize-approval', NODE_SERVER_URL).href, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: userId, role, locations: [] })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.message);

                        await bot.editMessageText(originalText + `\n\n✅ <b>Foydalanuvchi tasdiqlandi (filialsiz) va unga kirish ma'lumotlari yuborildi.</b>`, {
                            chat_id: adminChatId,
                            message_id: message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: {}
                        });
                    } catch (error) {
                        await db('users').where({ id: userId }).update({ status: 'pending_approval' });
                        await bot.editMessageText(originalText + `\n\n⚠️ <b>Xatolik:</b> ${escapeHtml(error.message)}`, {
                            chat_id: adminChatId,
                            message_id: message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: {}
                        });
                    }
                    await bot.answerCallbackQuery(query.id);
                    return;
                }

                const locationButtons = allLocations.map(loc => ([{ text: escapeHtml(loc), callback_data: `loc_${loc}` }]));
                const keyboard = {
                    inline_keyboard: [
                        ...locationButtons,
                        [{ text: "✅ Yakunlash", callback_data: 'finish_locations' }]
                    ]
                };
                const newText = originalText + `\n\n<b>Rol tanlandi:</b> <code>${role}</code>\nEndi filial(lar)ni tanlang:`;
                await bot.editMessageText(newText, {
                    chat_id: adminChatId,
                    message_id: message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
                await bot.answerCallbackQuery(query.id);
                return;
            }
            if (state === 'awaiting_locations') {
                if (data === 'finish_locations') {
                    const { userId, role, locations } = userStates[adminChatId];
                    delete userStates[adminChatId];

                    try {
                        const response = await fetch(new URL('api/telegram/finalize-approval', NODE_SERVER_URL).href, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: userId, role, locations })
                        });
                        const result = await response.json();
                        if (!response.ok) throw new Error(result.message);

                        await bot.editMessageText(originalText + `\n\n✅ <b>Foydalanuvchi tasdiqlandi va unga kirish ma'lumotlari yuborildi.</b>`, {
                            chat_id: adminChatId,
                            message_id: message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: {}
                        });
                    } catch (error) {
                        await db('users').where({ id: userId }).update({ status: 'pending_approval' });
                        await bot.editMessageText(originalText + `\n\n⚠️ <b>Xatolik:</b> ${escapeHtml(error.message)}`, {
                            chat_id: adminChatId,
                            message_id: message.message_id,
                            parse_mode: 'HTML',
                            reply_markup: {}
                        });
                    }
                    await bot.answerCallbackQuery(query.id);
                    return;
                }
                
                const parts = data.split('_');
                if (parts[0] === 'loc') {
                    const location = parts.slice(1).join('_');
                    const selectedLocations = userStates[adminChatId].locations;
                    const index = selectedLocations.indexOf(location);
                    if (index > -1) {
                        selectedLocations.splice(index, 1);
                    } else {
                        selectedLocations.push(location);
                    }

                    const settings = await db('settings').where({ key: 'app_settings' }).first();
                    const allLocations = settings ? JSON.parse(settings.value).locations : [];
                    const locationButtons = allLocations.map(loc => ([{ text: `${selectedLocations.includes(loc) ? '✔️ ' : ''}${escapeHtml(loc)}`, callback_data: `loc_${loc}` }]));
                    const keyboard = {
                        inline_keyboard: [
                            ...locationButtons,
                            [{ text: "✅ Yakunlash", callback_data: 'finish_locations' }]
                        ]
                    };
                    await bot.editMessageReplyMarkup(keyboard, {
                        chat_id: adminChatId,
                        message_id: message.message_id
                    });
                    await bot.answerCallbackQuery(query.id);
                    return;
                }
            }
        }

        const parts = data.split('_');
        const action = parts[0];
        const userId = parseInt(parts[1], 10);

        if (action === 'approve') {
            console.log(`✅ [BOT] Foydalanuvchi tasdiqlash so'rovi. User ID: ${userId}`);
            try {
                const updated = await db('users')
                    .where({ id: userId, status: 'pending_approval' })
                    .update({ status: 'status_in_process' });
                
                console.log(`🔄 [BOT] Foydalanuvchi statusi yangilandi. User ID: ${userId}, Updated: ${updated}`);

                                if (updated === 0) {
                    await bot.editMessageText(originalText + `\n\n⚠️ <b>Xatolik:</b> Bu so'rov allaqachon ko'rib chiqilgan yoki bekor qilingan.`, {
                        chat_id: adminChatId,
                        message_id: message.message_id,
                        parse_mode: 'HTML',
                        reply_markup: {}
                    });
                    await bot.answerCallbackQuery(query.id);
                    return;
                }

                userStates[adminChatId] = { state: 'awaiting_role', userId: userId };
                const keyboard = {
                    inline_keyboard: [
                        [{ text: "Operator", callback_data: 'operator' }, { text: "Menejer", callback_data: 'manager' }]
                    ]
                };
                await bot.editMessageText(originalText + "\n\nFoydalanuvchi uchun rol tanlang:", {
                    chat_id: adminChatId,
                    message_id: message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });

            } catch (dbError) {
                console.error("Statusni yangilashda DB xatoligi:", dbError);
                await bot.answerCallbackQuery(query.id, { text: "Ma'lumotlar bazasida xatolik!", show_alert: true });
            }

        } else if (action === 'reject') {
            console.log(`❌ [BOT] Foydalanuvchi so'rovi rad etildi. User ID: ${userId}`);
            await db('users').where({ id: userId }).update({ status: 'archived' });
            await bot.editMessageText(originalText + `\n\n❌ <b>So'rov rad etildi va foydalanuvchi arxivlandi.</b>`, {
                chat_id: adminChatId,
                message_id: message.message_id,
                parse_mode: 'HTML',
                reply_markup: {}
            });
            console.log(`✅ [BOT] Foydalanuvchi arxivlandi. User ID: ${userId}`);
        } else if (action === 'restore') {
            const newUserId = parseInt(parts[2], 10);
            await db('users').where({ id: userId }).update({ status: 'active' });
            await db('users').where({ id: newUserId }).del();
            await bot.editMessageText(originalText + `\n\n✅ <b>Eski akkaunt qayta tiklandi. Yangi so'rov o'chirildi.</b>`, {
                chat_id: adminChatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: {}
            });
        } else if (action === 'force_new') {
            const newUserId = parseInt(parts[2], 10);
            await db('users').where({ id: userId }).update({ telegram_chat_id: null }); // Eskisidan telegramni uzish
            await db('users').where({ id: newUserId }).update({ status: 'pending_approval' });
            const newUser = await db('users').where({ id: newUserId }).first();
            await sendToTelegram({ type: 'new_user_approval', user_id: newUser.id, username: newUser.username, fullname: newUser.fullname });
            await bot.editMessageText(originalText + `\n\n✅ <b>Yangi akkaunt uchun tasdiqlash so'rovi qayta yuborildi. Eskisidan Telegram ID uzildi.</b>`, {
                chat_id: adminChatId, message_id: message.message_id, parse_mode: 'HTML', reply_markup: {}
            });
        } else {
            // Boshqa callback'lar (retry, block, unblock...)
            let endpoint = '';
            switch (action) {
                case 'retry': endpoint = 'api/telegram/reset-attempts'; break;
                case 'block': endpoint = 'api/telegram/confirm-lock'; break;
                case 'unblock': endpoint = 'api/telegram/unblock-user'; break;
                case 'keep_blocked': endpoint = 'api/telegram/keep-blocked'; break;
                default: await bot.answerCallbackQuery(query.id); return;
            }

            try {
                const response = await fetch(new URL(endpoint, NODE_SERVER_URL).href, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId })
                });
                const result = await response.json();
                
                let newText;

                if (result.status === 'success') {
                    const successMessages = {
                        retry: `\n\n✅ <b>Foydalanuvchiga qayta urinish huquqi berildi. Unga yangi so'rov yuborildi.</b>`,
                        block: `\n\n❌ <b>Jarayon bloklangani tasdiqlandi.</b>`,
                        unblock: `\n\n✅ <b>Ruxsat berildi. Foydalanuvchi endi tizimga kira oladi.</b>`,
                        keep_blocked: `\n\n❌ <b>Rad etildi. Foydalanuvchi bloklangan holatda qoldirildi.</b>`
                    };
                    newText = originalText + (successMessages[action] || "");
                } else {
                    newText = originalText + `\n\n⚠️ <b>Xatolik:</b> ${escapeHtml(result.message || 'Noma\'lum xato')}`;
                }
                
                await bot.editMessageText(newText, {
                    chat_id: message.chat.id,
                    message_id: message.message_id,
                    parse_mode: 'HTML',
                    reply_markup: {}
                });
            } catch (error) {
                console.error(`Node.js serveriga (${endpoint}) so'rov yuborishda xatolik:`, error);
                await bot.answerCallbackQuery(query.id, { text: "Server bilan bog'lanishda xatolik!", show_alert: true });
            }
        }
        await bot.answerCallbackQuery(query.id);
    });

    bot.on('my_chat_member', async (msg) => {
        const chatId = msg.chat.id;
        const newStatus = msg.new_chat_member.status;

        if (newStatus === 'left' || newStatus === 'kicked') {
            const user = await db('users').where({ telegram_chat_id: chatId }).first();
            if (user) {
                await db('users').where({ id: user.id }).update({
                    telegram_chat_id: null,
                    telegram_username: null
                });

                const adminSetting = await db('settings').where({ key: 'telegram_admin_chat_id' }).first();
                const adminChatId = adminSetting ? adminSetting.value : null;
                if (adminChatId) {
                    const text = `⚠️ <b>Obuna Bekor Qilindi!</b> \n\nFoydalanuvchi <b>${escapeHtml(user.fullname || user.username)}</b> botga obunani bekor qildi. \n\nUning tizimga kirish imkoniyatlari cheklanishi mumkin.`;
                    await safeSendMessage(adminChatId, text);
                }
                console.log(`Foydalanuvchi ${user.username} (ID: ${user.id}) botdan chiqib ketdi.`);
            }
        } else if (newStatus === 'member') {
            const user = await db('users').where({ telegram_chat_id: chatId }).first();
            if (user) {
                console.log(`Foydalanuvchi ${user.username} (ID: ${user.id}) botga qayta qo'shildi.`);
            }
        }
    });
    
    // Event handler'lar o'rnatilganligini tasdiqlash
    console.log(`✅ [BOT] Barcha event handler'lar o'rnatildi. Bot ready: ${!!bot}, Initialized: ${botIsInitialized}`);
    console.log(`✅ [BOT] Event handler'lar ro'yxati:`);
    console.log(`   - onText(/\\/start/)`);
    console.log(`   - on('message')`);
    console.log(`   - on('callback_query')`);
    console.log(`   - on('my_chat_member')`);
    console.log(`   - on('polling_error')`);
};

const getBot = () => {
    return bot;
};

module.exports = {
    initializeBot,
    getBot,
    sendToTelegram
};

