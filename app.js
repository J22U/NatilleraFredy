const express = require('express');
const path = require('path');
const { sql, poolPromise } = require('./db');

const app = express();

// 1. Configuraciones básicas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// 2. Servir archivos estáticos (CSS, JS, Imágenes)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// 3. RUTA DE LOGIN (POST)
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    const USUARIO_MASTER = "admin";
    const CLAVE_MASTER = "natillera2026"; 

    if (user === USUARIO_MASTER && pass === CLAVE_MASTER) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Datos incorrectos" });
    }
});

// 4. RUTAS DE NAVEGACIÓN
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// REPORTE GENERAL
app.get('/reporte-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) - 
                (SELECT ISNULL(SUM(MontoPrestado - (MontoPagado - InteresesPagados)), 0) FROM Prestamos WHERE Estado = 'Activo') as TotalAhorrado,
                (SELECT ISNULL(SUM(MontoPrestado - (MontoPagado - InteresesPagados)), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,
                (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error en reporte:", err);
        res.status(500).json({ TotalAhorrado: 0, CapitalPrestado: 0, GananciasBrutas: 0 });
    }
});

// LISTAR MIEMBROS
app.get('/listar-miembros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                p.ID_Persona as id, 
                p.Nombre as nombre, 
                p.Documento as cedula, 
                CASE WHEN p.EsSocio = 1 THEN 'SOCIO' ELSE 'EXTERNO' END as tipo,
                ISNULL((SELECT SUM(SaldoActual) FROM Prestamos WHERE ID_Persona = p.ID_Persona), 0) as deudaTotal
            FROM Personas p
            ORDER BY p.ID_Persona DESC
        `);
        res.json(result.recordset);
    } catch (err) { 
        console.error(err);
        res.status(500).json([]); 
    }
});

// REGISTRAR PRÉSTAMO
app.post('/registrar-prestamo', async (req, res) => {
    try {
        const { idPersona, monto, tasaInteres, cuotas } = req.body;
        const pool = await poolPromise;
        const capital = parseFloat(monto);
        const tasaNumerica = parseFloat(tasaInteres || 5);
        const nCuotas = parseInt(cuotas || 1);
        const interesTotal = capital * (tasaNumerica / 100) * nCuotas;
        const totalConInteres = capital + interesTotal;

        await pool.request()
            .input('id', sql.Int, idPersona)
            .input('m', sql.Decimal(18,2), capital)
            .input('t', sql.Decimal(5,2), tasaNumerica)
            .input('i', sql.Decimal(18,2), interesTotal)
            .input('s', sql.Decimal(18,2), totalConInteres)
            .input('c', sql.Int, nCuotas)
            .query(`
                INSERT INTO Prestamos 
                (ID_Persona, MontoPrestado, TasaInteres, MontoInteres, MontoPagado, SaldoActual, Estado, Fecha, Cuotas, InteresesPagados) 
                VALUES (@id, @m, @t, @i, 0, @s, 'Activo', GETDATE(), @c, 0)
            `);
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// PROCESAR MOVIMIENTOS (AHORROS Y PAGOS)
app.post('/procesar-movimiento', async (req, res) => {
    try {
        const { idPersona, monto, tipoMovimiento, idPrestamo } = req.body;
        const pool = await poolPromise;
        const m = parseFloat(monto);

        if (tipoMovimiento === 'deuda') {
            const prestamoReq = await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, MontoPagado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            const p = prestamoReq.recordset[0];
            const capitalOriginal = parseFloat(p.MontoPrestado);
            const pagadoAntes = parseFloat(p.MontoPagado || 0);
            const faltanteCapital = capitalOriginal - pagadoAntes;
            let paraInteres = 0;

            if (faltanteCapital <= 0) {
                paraInteres = m;
            } else if (m > faltanteCapital) {
                paraInteres = m - faltanteCapital;
            }

            await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .input('m', sql.Decimal(18,2), m)
                .input('ganancia', sql.Decimal(18,2), paraInteres)
                .query(`
                    UPDATE Prestamos 
                    SET MontoPagado = ISNULL(MontoPagado, 0) + @m,
                        InteresesPagados = ISNULL(InteresesPagados, 0) + @ganancia,
                        SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END,
                        Estado = CASE WHEN (SaldoActual - @m) <= 0 THEN 'Pagado' ELSE 'Activo' END
                    WHERE ID_Prestamo = @idP
                `);

            await pool.request()
                .input('idPers', sql.Int, idPersona)
                .input('idPre', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18,2), m)
                .query(`
                    INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento) 
                    VALUES (@idPers, @idPre, @monto, GETDATE(), 'Abono Deuda')
                `);
            
        } else if (tipoMovimiento === 'ahorro') {
            await pool.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18,2), m)
                .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha) VALUES (@id, @m, GETDATE())");
            
            await pool.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18,2), m)
                .query("INSERT INTO HistorialPagos (ID_Persona, Monto, Fecha, TipoMovimiento) VALUES (@id, @m, GETDATE(), 'Ahorro')");
        }

        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// HISTORIALES PARA EL RESUMEN
app.get('/historial-ahorros/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.id)
            .query("SELECT ID_Ahorro, Monto, FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada, ISNULL(MesesCorrespondientes, 'Abono General') as Detalle FROM Ahorros WHERE ID_Persona = @id ORDER BY Fecha DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

app.get('/detalle-prestamo/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT ID_Prestamo, MontoPrestado, TasaInteres, MontoInteres, SaldoActual, Estado, Cuotas, FORMAT(Fecha, 'dd/MM/yyyy') as FechaPrestamo
                FROM Prestamos WHERE ID_Persona = @id ORDER BY Fecha DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error al traer detalles:", err);
        res.status(500).json([]);
    }
});

app.get('/estado-cuenta/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.id)
            .query(`SELECT (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros WHERE ID_Persona = @id) as totalAhorrado, ISNULL((SELECT SUM(SaldoActual) FROM Prestamos WHERE ID_Persona = @id AND Estado = 'Activo'), 0) as deudaTotal`);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ totalAhorrado: 0, deudaTotal: 0 }); }
});

// GUARDAR NUEVO MIEMBRO
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

// HISTORIAL DE ABONOS A DEUDA
app.get('/historial-abonos-deuda/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT h.ID_Pago, h.ID_Prestamo, h.Monto as Monto_Abonado, FORMAT(h.Fecha, 'dd/MM/yyyy') as FechaFormateada, ISNULL(h.Detalle, 'Abono a deuda') as Detalle, (p.MontoPrestado + p.MontoInteres) as PrestamoRef
                FROM HistorialPagos h JOIN Prestamos p ON h.ID_Prestamo = p.ID_Prestamo
                WHERE h.ID_Persona = @id AND h.TipoMovimiento = 'Abono Deuda'
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

// PRÉSTAMOS ACTIVOS
app.get('/prestamos-activos/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.idPersona)
            .query(`SELECT ID_Prestamo, SaldoActual as saldoAMostrar, SaldoActual, MontoPrestado FROM Prestamos WHERE ID_Persona = @id AND Estado = 'Activo'`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

// RETIRAR AHORRO
app.post('/api/retirar-ahorro', async (req, res) => {
    const { id, tipo, monto } = req.body;
    try {
        const pool = await poolPromise;
        const resultSaldo = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ISNULL(SUM(Monto), 0) as SaldoTotal FROM Ahorros WHERE ID_Persona = @id');
        
        const saldoActual = resultSaldo.recordset[0].SaldoTotal;
        let montoARetirar = (tipo === 'total') ? saldoActual : parseFloat(monto);

        if (montoARetirar > saldoActual) {
            return res.status(400).json({ success: false, message: `Saldo insuficiente. Máximo disponible: $${saldoActual.toLocaleString()}` });
        }

        if (montoARetirar <= 0) {
            return res.status(400).json({ success: false, message: "El monto debe ser mayor a 0." });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('monto', sql.Decimal(18, 2), montoARetirar * -1)
            .input('fecha', sql.DateTime, new Date())
            .query(`INSERT INTO Ahorros (ID_Persona, Monto, Fecha) VALUES (@id, @monto, @fecha)`);

        res.json({ success: true, message: 'Retiro procesado con éxito' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Error en el servidor' });
    }
});

// EDITAR SOCIO
app.post('/editar-socio/:id', async (req, res) => {
    try {
        const { nombre, cedula } = req.body;
        const { id } = req.params;
        const pool = await poolPromise;

        await pool.request()
            .input('id', sql.Int, id)
            .input('n', sql.VarChar, nombre)
            .input('d', sql.VarChar, cedula)
            .query(`UPDATE Personas SET Nombre = @n, Documento = @d WHERE ID_Persona = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error("Error al editar:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ELIMINAR SOCIO
app.post('/eliminar-socio', async (req, res) => {
    try {
        const { id } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, id)
            .query("DELETE FROM Personas WHERE ID_Persona = @id");
        res.json({ success: true });
    } catch (err) {
        console.error("Error al eliminar:", err.message);
        let mensaje = "No se puede eliminar: el socio tiene historial de préstamos o ahorros.";
        if (!err.message.includes("REFERENCE constraint")) {
            mensaje = "Error interno al eliminar el socio.";
        }
        res.status(500).json({ success: false, message: mensaje });
    }
});

app.get('/obtener-totales', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + (SELECT ISNULL(SUM(MontoPagado), 0) FROM Prestamos) as CapitalTotal, (SELECT ISNULL(SUM(MontoInteres), 0) FROM Prestamos) as Ganancias
        `);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).send(err.message); }
});

app.post('/procesar-cruce', async (req, res) => {
    try {
        const { idPersona, idPrestamo, monto } = req.body;
        const pool = await poolPromise;
        const m = parseFloat(monto);
        
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const pRes = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, MontoPagado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            const p = pRes.recordset[0];
            const capOriginal = parseFloat(p.MontoPrestado);
            const pagadoAntes = parseFloat(p.MontoPagado || 0);
            const faltanteCap = capOriginal - pagadoAntes;
            let paraInteres = 0;

            if (faltanteCap <= 0) {
                paraInteres = m;
            } else if (m > faltanteCap) {
                paraInteres = m - faltanteCap;
            }

            await transaction.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18,2), -m)
                .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha) VALUES (@id, @m, GETDATE())");

            await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .input('m', sql.Decimal(18,2), m)
                .input('gan', sql.Decimal(18,2), paraInteres)
                .query(`
                    UPDATE Prestamos 
                    SET MontoPagado = ISNULL(MontoPagado, 0) + @m,
                        InteresesPagados = ISNULL(InteresesPagados, 0) + @gan,
                        SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END,
                        Estado = CASE WHEN (SaldoActual - @m) <= 0 THEN 'Pagado' ELSE 'Activo' END
                    WHERE ID_Prestamo = @idP
                `);

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- RUTAS PARA EDITAR MOVIMIENTOS ---

// 1. Editar Ahorro
app.put('/api/editar-ahorro', async (req, res) => {
    try {
        const { idAhorro, monto, fecha, MesesCorrespondientes } = req.body;
        
        if (!idAhorro || !monto) {
            return res.status(400).json({ success: false, error: "Faltan datos requeridos" });
        }

        const pool = await poolPromise;
        
        await pool.request()
            .input('id', sql.Int, idAhorro)
            .input('monto', sql.Decimal(18, 2), monto)
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('meses', sql.VarChar(sql.MAX), MesesCorrespondientes || 'Abono General')
            .query(`
                UPDATE Ahorros 
                SET Monto = @monto, Fecha = @fecha, FechaAporte = @fecha, MesesCorrespondientes = @meses
                WHERE ID_Ahorro = @id
            `);

        res.json({ success: true, message: "Ahorro actualizado correctamente" });
    } catch (err) {
        console.error("Error al editar ahorro:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Editar Pago de Deuda
app.put('/api/editar-pago-deuda', async (req, res) => {
    try {
        const { idPago, monto, fecha, detalle, idPrestamo, montoAnterior } = req.body;
        
        if (!idPago || !monto || !idPrestamo) {
            return res.status(400).json({ success: false, error: "Faltan datos requeridos" });
        }

        const pool = await poolPromise;
        const montoNuevo = parseFloat(monto);
        const montoAnt = montoAnterior ? parseFloat(montoAnterior) : 0;
        const diferencia = montoNuevo - montoAnt;

        await pool.request()
            .input('id', sql.Int, idPago)
            .input('monto', sql.Decimal(18, 2), montoNuevo)
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('detalle', sql.VarChar, detalle || 'Abono a deuda')
            .query(`
                UPDATE HistorialPagos SET Monto = @monto, Fecha = @fecha, Detalle = @detalle
                WHERE ID_Pago = @id
            `);

        const esCapital = String(detalle || '').toLowerCase().includes('capital');
        
        if (diferencia !== 0) {
            if (esCapital) {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo)
                    .input('dif', sql.Decimal(18, 2), diferencia)
                    .query(`
                        UPDATE Prestamos 
                        SET MontoPagado = ISNULL(MontoPagado, 0) + @dif,
                            SaldoActual = CASE WHEN (SaldoActual - @dif) < 0 THEN 0 ELSE SaldoActual - @dif END,
                            Estado = CASE WHEN (SaldoActual - @dif) <= 0 THEN 'Pagado' ELSE 'Activo' END
                        WHERE ID_Prestamo = @idP
                    `);
            } else {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo)
                    .input('dif', sql.Decimal(18, 2), diferencia)
                    .query(`UPDATE Prestamos SET InteresesPagados = ISNULL(InteresesPagados, 0) + @dif WHERE ID_Prestamo = @idP`);
            }
        }

        res.json({ success: true, message: "Pago actualizado correctamente" });
    } catch (err) {
        console.error("Error al editar pago:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR CORRIENDO EN PUERTO ${PORT}`);
});
