const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER || process.env.DB_USERNAME,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || process.env.DB_HOST,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    options: {
        trustServerCertificate: true,
        encrypt: true
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ ¡CONEXIÓN REAL ESTABLECIDA CON SOMEE SQL SERVER!');
        return pool;
    })
    .catch(err => {
        console.error('❌ ERROR CRÍTICO DE CONEXIÓN:', err.message);
    });

module.exports = { sql, poolPromise };