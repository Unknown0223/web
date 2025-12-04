// Eski hisobotga brand_id qo'shish
const { db } = require('./db.js');

async function fixBrand() {
    try {
        console.log('🔧 Hisobot #1 ni yangilanmoqda...');
        
        const result = await db('reports')
            .where({ id: 1 })
            .update({ brand_id: 1 });
        
        console.log('✅ Yangilandi:', result, 'ta hisobot');
        
        // Tekshirish
        const report = await db('reports')
            .leftJoin('brands', 'reports.brand_id', 'brands.id')
            .where('reports.id', 1)
            .select('reports.id', 'reports.brand_id', 'brands.name as brand_name')
            .first();
        
        console.log('📊 Yangilangan hisobot:', report);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Xatolik:', error);
        process.exit(1);
    }
}

fixBrand();
