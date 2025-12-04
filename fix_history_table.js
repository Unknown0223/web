// report_history jadvalini tuzatish
const { db } = require('./db.js');

async function fixHistoryTable() {
    try {
        console.log('🔧 report_history jadvalini tekshirish...');
        
        // Jadval ma'lumotlarini ko'rish
        const tableInfo = await db.raw("PRAGMA table_info(report_history)");
        console.log('📊 Hozirgi ustunlar:', tableInfo.map(c => c.name));
        
        const hasOldBrandId = tableInfo.some(c => c.name === 'old_brand_id');
        const hasOldLocation = tableInfo.some(c => c.name === 'old_location');
        
        console.log('✓ old_brand_id:', hasOldBrandId);
        console.log('✓ old_location:', hasOldLocation);
        
        if (!hasOldBrandId) {
            console.log('➕ old_brand_id ustunini qo\'shish...');
            await db.schema.table('report_history', table => {
                table.integer('old_brand_id').nullable();
            });
            console.log('✅ old_brand_id qo\'shildi');
        }
        
        if (!hasOldLocation) {
            console.log('➕ old_location ustunini qo\'shish...');
            await db.schema.table('report_history', table => {
                table.string('old_location', 255).nullable();
            });
            console.log('✅ old_location qo\'shildi');
        }
        
        console.log('✅ Jadval tuzatildi!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Xatolik:', error);
        process.exit(1);
    }
}

fixHistoryTable();
