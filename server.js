const express = require('express');
const path = require('path');
const { sql, poolPromise } = require('./db');

const app = express();

// --- 1. CONFIGURACIONES BÁSICAS ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Desactivar caché para evitar datos viejos en el navegador
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// --- 2. RUTAS DE NAVEGACIÓN Y LOGIN ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const USUARIO_MASTER = "admin";
    const CLAVE_MASTER = "natillera2026"; 

    if (user === USUARIO_MASTER && pass === CLAVE_MASTER) {
        res.json({ success: true, redirect: '/dashboard' });
    } else {
        res.status(401).json({ success: false, message: "Datos incorrectos" });
    }
});

// --- 3. RUTAS DE RIFAS ---

app.get('/api/cargar-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const configRes = await pool.request().query("SELECT * FROM Rifas_Config WHERE Id = 1");
        const detallesRes = await pool.request().query("SELECT * FROM Rifas_Detalle");

        if (configRes.recordset.length === 0) return res.json({ info: {}, tablas: [] });

        const info = configRes.recordset[0];
        const tablasMap = {};

        detallesRes.recordset.forEach(row => {
            if (!tablasMap[row.TablaId]) {
                tablasMap[row.TablaId] = { id: row.TablaId, titulo: row.TituloTabla, participantes: {} };
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
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/guardar-rifa', async (req, res) => {
    try {
        const pool = await poolPromise;
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
                                WHEN MATCHED THEN UPDATE SET NombreParticipante = @nom, EstadoPago = @pago, TituloTabla = @tit
                                WHEN NOT MATCHED THEN INSERT (TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla)
                                VALUES (@tid, @num, @nom, @pago, @tit);`);
                }
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. RUTAS DE SOCIOS Y MIEMBROS ---

app.get('/listar-miembros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT p.ID_Persona as id, p.Nombre as nombre, p.Documento as cedula, 
            CASE WHEN p.EsSocio = 1 THEN 'SOCIO' ELSE 'EXTERNO' END as tipo,
            ISNULL((SELECT SUM(SaldoActual) FROM Prestamos WHERE ID_Persona = p.ID_Persona), 0) as deudaTotal
            FROM Personas p ORDER BY p.ID_Persona DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

app.post('/guardar-miembro', async (req, res) => {
    try {
        const { nombre, cedula, esSocio } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('n', sql.VarChar, nombre).input('d', sql.VarChar, cedula).input('s', sql.Bit, esSocio)
            .query("INSERT INTO Personas (Nombre, Documento, EsSocio) VALUES (@n, @d, @s)");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/editar-socio/:id', async (req, res) => {
    try {
        const { nombre, cedula } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, req.params.id).input('n', sql.VarChar, nombre).input('d', sql.VarChar, cedula)
            .query("UPDATE Personas SET Nombre = @n, Documento = @d WHERE ID_Persona = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/eliminar-socio', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, req.body.id)
            .query("DELETE FROM Personas WHERE ID_Persona = @id");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "No se puede eliminar: tiene historial activo." });
    }
});

// --- 5. RUTAS DE PRÉSTAMOS Y AHORROS ---

app.post('/registrar-prestamo', async (req, res) => {
    try {
        const { idPersona, monto, tasaInteres, cuotas } = req.body;
        const pool = await poolPromise;
        const capital = parseFloat(monto);
        const tasa = parseFloat(tasaInteres || 5);
        const n = parseInt(cuotas || 1);
        const intTotal = capital * (tasa / 100) * n;

        await pool.request()
            .input('id', sql.Int, idPersona).input('m', sql.Decimal(18,2), capital)
            .input('t', sql.Decimal(5,2), tasa).input('i', sql.Decimal(18,2), intTotal)
            .input('s', sql.Decimal(18,2), capital + intTotal).input('c', sql.Int, n)
            .query(`INSERT INTO Prestamos (ID_Persona, MontoPrestado, TasaInteres, MontoInteres, MontoPagado, SaldoActual, Estado, Fecha, Cuotas, InteresesPagados) 
                    VALUES (@id, @m, @t, @i, 0, @s, 'Activo', GETDATE(), @c, 0)`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/procesar-movimiento', async (req, res) => {
    try {
        const { idPersona, monto, tipoMovimiento, idPrestamo } = req.body;
        const pool = await poolPromise;
        const m = parseFloat(monto);

        if (tipoMovimiento === 'deuda') {
            const pRes = await pool.request().input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, MontoPagado FROM Prestamos WHERE ID_Prestamo = @idP");
            const p = pRes.recordset[0];
            const faltante = p.MontoPrestado - p.MontoPagado;
            let ganancia = m > faltante ? m - faltante : 0;
            if (faltante <= 0) ganancia = m;

            await pool.request()
                .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18,2), m).input('g', sql.Decimal(18,2), ganancia)
                .query(`UPDATE Prestamos SET MontoPagado += @m, InteresesPagados += @g, 
                        SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END,
                        Estado = CASE WHEN (SaldoActual - @m) <= 0 THEN 'Pagado' ELSE 'Activo' END WHERE ID_Prestamo = @idP`);
            
            await pool.request().input('idPers', sql.Int, idPersona).input('idPre', sql.Int, idPrestamo).input('m', sql.Decimal(18,2), m)
                .query("INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento) VALUES (@idPers, @idPre, @m, GETDATE(), 'Abono Deuda')");
        } else {
            await pool.request().input('id', sql.Int, idPersona).input('m', sql.Decimal(18,2), m)
                .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha) VALUES (@id, @m, GETDATE())");
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- 6. REPORTES Y ESTADOS ---

app.get('/reporte-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
            ((SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) - (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo')) as TotalAhorrado,
            (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,
            (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas`);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ TotalAhorrado: 0 }); }
});

// --- RUTAS PARA EL RESUMEN DEL SOCIO ---

// 1. Obtener totales (Ahorro total y Deuda actual)
app.get('/estado-cuenta/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT 
                    (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros WHERE ID_Persona = @id) as totalAhorrado,
                    ISNULL((SELECT SUM(SaldoActual) FROM Prestamos WHERE ID_Persona = @id AND Estado = 'Activo'), 0) as deudaTotal`);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ totalAhorrado: 0, deudaTotal: 0 });
    }
});

// 2. Historial de Ahorros
app.get('/historial-ahorros/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT Monto, FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada FROM Ahorros WHERE ID_Persona = @id ORDER BY Fecha DESC");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

// 3. Historial de Abonos a Deuda
app.get('/historial-abonos-deuda/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT h.Monto as Monto_Abonado, FORMAT(h.Fecha, 'dd/MM/yyyy') as FechaFormateada
                FROM HistorialPagos h
                WHERE h.ID_Persona = @id AND h.TipoMovimiento = 'Abono Deuda'
                ORDER BY h.Fecha DESC`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Agrega esta ruta para los detalles de préstamos (el error 404 de tu imagen)
app.get('/detalle-prestamo/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Prestamo, 
                    MontoPrestado, 
                    TasaInteres,      -- El porcentaje (ej: 5%)
                    MontoInteres,     -- El valor en dinero del interés
                    SaldoActual, 
                    Estado, 
                    FORMAT(Fecha, 'dd/MM/yyyy') as FechaPrestamo 
                FROM Prestamos 
                WHERE ID_Persona = @id 
                ORDER BY Fecha DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en detalle-prestamo:", err);
        res.status(500).json([]);
    }
});

// --- OBTENER PRÉSTAMOS ACTIVOS DE UN SOCIO PARA EL SELECTOR ---
app.get('/api/prestamos-activos/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.idPersona)
            .query(`
                SELECT ID_Prestamo, 
                       SaldoActual, 
                       MontoPrestado,
                       FORMAT(Fecha, 'dd/MM/yyyy') as Fecha
                FROM Prestamos 
                WHERE ID_Persona = @id AND Estado = 'Activo'
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR UNIFICADO CORRIENDO EN PUERTO ${PORT}`);
});