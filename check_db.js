// Ma'lumotlar bazasini tekshirish
const { db } = require('./db.js');

async function checkDatabase() {
    try {
        console.log('🔍 Ma\'lumotlar bazasini tekshirish...\n');
        
        // report_history jadval strukturasi
        const historyInfo = await db.raw("PRAGMA table_info(report_history)");
        console.log('📋 report_history ustunlari:');
        historyInfo.forEach(col => {
            console.log(`  - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : 'NULL'}`);
        });
        
        console.log('\n📊 report_history qatorlar soni:');
        const historyCount = await db('report_history').count('* as count').first();
        console.log(`  ${historyCount.count} ta yozuv`);
        
        // Bitta hisobot ma'lumotlarini ko'rish
        console.log('\n📄 Hisobot #1 ma\'lumotlari:');
        const report = await db('reports').where({ id: 1 }).first();
        console.log(report);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Xatolik:', error);
        process.exit(1);
    }
}

checkDatabase();
