// knexfile.js

const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.resolve(__dirname, 'database.db')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    // Connection pool sozlamalari - timeout muammosini hal qilish uchun
    pool: {
      min: 2,
      max: 20, // SQLite uchun kattaroq pool (default 10)
      acquireTimeoutMillis: 60000, // 60 soniya (default 30000)
      idleTimeoutMillis: 30000, // 30 soniya
      reapIntervalMillis: 1000, // 1 soniyada bir marta tekshirish
      createTimeoutMillis: 60000,
      destroyTimeoutMillis: 5000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false // Xatolikni tushirib yubormaslik
    },
    // SQLite uchun qo'shimcha sozlamalar
    acquireConnectionTimeout: 60000 // 60 soniya
  },
  production: {
    client: 'sqlite3',
    connection: {
      filename: path.resolve(__dirname, 'database.db')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    // Connection pool sozlamalari - timeout muammosini hal qilish uchun
    pool: {
      min: 2,
      max: 20, // SQLite uchun kattaroq pool (default 10)
      acquireTimeoutMillis: 60000, // 60 soniya (default 30000)
      idleTimeoutMillis: 30000, // 30 soniya
      reapIntervalMillis: 1000, // 1 soniyada bir marta tekshirish
      createTimeoutMillis: 60000,
      destroyTimeoutMillis: 5000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false // Xatolikni tushirib yubormaslik
    },
    // SQLite uchun qo'shimcha sozlamalar
    acquireConnectionTimeout: 60000 // 60 soniya
  }
};
