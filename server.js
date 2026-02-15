const sql = require('mssql');
const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());

// 1. Servir archivos estáticos: Priorizamos la carpeta 'public'
// Si tus archivos (index.html, rifas.js, css) están dentro de /public, esto los servirá.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '.')));

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

// --- RUTA PRINCIPAL: Forzar el inicio en login.html ---
app.get('/', (req, res) => {
    // Definimos la ruta correctamente para evitar el error de "loginPath is not defined"
    const loginPath = path.join(__dirname, 'public', 'login.html');
    
    console.log("Intentando cargar login desde:", loginPath);
    
    res.sendFile(loginPath, (err) => {
        if (err) {
            console.error("Error al cargar login.html:", err.message);
            res.status(404).send("No se encontró el archivo login.html en la carpeta public.");
        }
    });
});

// --- RUTA PARA CARGAR TODO ---
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
        console.error("Error en cargar-rifas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- RUTA PARA GUARDAR TODO ---
app.post('/api/guardar-rifa', async (req, res) => {
    try {
        let pool = await sql.connect(config);
        const { info, tablas } = req.body;

        await pool.request()
            .input('nr', sql.VarChar, info.nombre)
            .input('pr', sql.VarChar, info.premio)
            .input('vp', sql.Decimal(18, 2), info.valor)
            .input('fs', sql.Date, info.fecha)
            .query(`IF EXISTS (SELECT 1 FROM Rifas_Config WHERE Id = 1)
                    UPDATE Rifas_Config SET NombreRifa=@nr, Premio=@pr, ValorPuesto=@vp, FechaSorteo=@fs WHERE Id = 1
                    ELSE
                    INSERT INTO Rifas_Config (NombreRifa, Premio, ValorPuesto, FechaSorteo) VALUES (@nr, @pr, @vp, @fs)`);

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
        console.error("Error en guardar-rifa:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Render usa el puerto que ellos asignan, por eso process.env.PORT es vital
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));