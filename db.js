const sql = require('mssql');
require('dotenv').config();

const config = {
    // Usamos las variables de entorno de Render
    user: process.env.DB_USER, 
    password: process.env.DB_PASS, // Ojo: en tu .env pusiste DB_PASS, asegúrate que coincida
    server: process.env.DB_SERVER, 
    database: process.env.DB_NAME,
    // El puerto 1433 es el estándar, mssql lo usa por defecto si no se pone
    options: {
        trustServerCertificate: true, 
        encrypt: true // CAMBIO VITAL: Somee y la mayoría de nubes exigen conexión cifrada
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