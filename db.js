const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Agro1234*',
    server: '127.0.0.1', 
    port: 1433,
    database: process.env.DB_DATABASE || 'NatilleraDB',
    options: {
        // QUITAMOS instanceName PARA QUE NO BUSQUE PUERTOS DINÁMICOS
        trustServerCertificate: true, 
        encrypt: false 
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ ¡CONEXIÓN REAL ESTABLECIDA CON SQL SERVER!');
        return pool;
    })
    .catch(err => {
        console.error('❌ ERROR CRÍTICO DE CONEXIÓN:', err.message);
    });

module.exports = { sql, poolPromise };