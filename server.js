const sql = require('mssql');
const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());

// 1. Configuración de archivos estáticos
// Esto permite que el navegador encuentre el CSS y el JS dentro de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

const config = {
    user: 'Fredy123_SQLLogin_1',
    password: '5j8k6lvrkl',
    server: 'NatilleraDB.mssql.somee.com', 
    database: 'NatilleraDB',
    options: {
        encrypt: true, 
        trustServerCertificate: true 
    }
};

// --- RUTA PRINCIPAL: Login ---
app.get('/', (req, res) => {
    const loginPath = path.join(__dirname, 'public', 'login.html');
    console.log("Serviendo login desde:", loginPath);
    res.sendFile(loginPath);
});

// --- RUTA PARA CARGAR DATOS (Sincronización multidispositivo) ---
app.get('/api/cargar-rifas', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        const configRes = await pool.request().query("SELECT * FROM Rifas_Config WHERE Id = 1");
        const detallesRes = await pool.request().query("SELECT * FROM Rifas_Detalle");

        if (configRes.recordset.length === 0) {
            return res.json({ info: {}, tablas: [] });
        }

        const info = configRes.recordset[0];
        const tablasMap = {};

        detallesRes.recordset.forEach(row => {
            if (!tablasMap[row.TablaId]) {
                tablasMap[row.TablaId] = { 
                    id: row.TablaId, 
                    titulo: row.TituloTabla, 
                    participantes: {} 
                };
            }
            tablasMap[row.TablaId].participantes[row.Numero] = {
                nombre: row.NombreParticipante,
                pago: row.EstadoPago
            };
        });

        res.json({
            info: {
                nombre: info.NombreRifa,
                premio: info.Premio,
                valor: info.ValorPuesto,
                fecha: info.FechaSorteo ? info.FechaSorteo.toISOString().split('T')[0] : ''
            },
            tablas: Object.values(tablasMap)
        });
    } catch (err) {
        console.error("Error en BD (Cargar):", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- RUTA PARA GUARDAR DATOS ---
app.post('/api/guardar-rifa', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        const { info, tablas } = req.body;

        // Guardar Info General
        await pool.request()
            .input('nr', sql.VarChar, info.nombre)
            .input('pr', sql.VarChar, info.premio)
            .input('vp', sql.Decimal(18, 2), info.valor)
            .input('fs', sql.Date, info.fecha)
            .query(`IF EXISTS (SELECT 1 FROM Rifas_Config WHERE Id = 1)
                    UPDATE Rifas_Config SET NombreRifa=@nr, Premio=@pr, ValorPuesto=@vp, FechaSorteo=@fs WHERE Id = 1
                    ELSE
                    INSERT INTO Rifas_Config (NombreRifa, Premio, ValorPuesto, FechaSorteo) VALUES (@nr, @pr, @vp, @fs)`);

        // Guardar cada puesto
        for (const tabla of tablas) {
            for (const [numero, data] of Object.entries(tabla.participantes)) {
                if (data.nombre && (data.nombre.trim() !== '' || data.pago)) {
                    await pool.request()
                        .input('tid', sql.BigInt, tabla.id)
                        .input('num', sql.Char(2), numero)
                        .input('nom', sql.VarChar, data.nombre)
                        .input('pago', sql.Bit, data.pago)
                        .input('tit', sql.VarChar, tabla.titulo)
                        .query(`MERGE INTO Rifas_Detalle AS target
                                USING (SELECT @tid as tid, @num as num) AS source
                                ON (target.TablaId = source.tid AND target.Numero = source.num)
                                WHEN MATCHED THEN 
                                    UPDATE SET NombreParticipante = @nom, EstadoPago = @pago, TituloTabla = @tit
                                WHEN NOT MATCHED THEN
                                    INSERT (TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla)
                                    VALUES (@tid, @num, @nom, @pago, @tit);`);
                }
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Error en BD (Guardar):", err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));

// --- RUTA DE AUTENTICACIÓN (Corregida para coincidir con auth.js) ---
app.post('/login', (req, res) => {
    // Cambiamos a 'user' y 'pass' para que coincida con lo que envía el fetch
    const { user, pass } = req.body;

    if (user === 'admin' && pass === '12345') {
        // Importante: Asegúrate de que el archivo sea index.html o dashboard.html según tu proyecto
        res.json({ success: true, redirect: '/dashboard.html' }); 
    } else {
        res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }
});