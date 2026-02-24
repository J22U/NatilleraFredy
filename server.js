const express = require('express');
const fs = require('fs');
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

// Obtener los datos de las rifas (usando DatosJSON)
app.get('/api/cargar-rifas', async (req, res) => {
    try {
        const { fecha } = req.query;
        const pool = await poolPromise;
        
        let query;
        let request = pool.request();

        if (fecha) {
            // Buscar rifa por fecha específica
            query = "SELECT DatosJSON, FechaSorteo FROM ConfiguracionRifas WHERE FechaSorteo = @fechaBuscada";
            request.input('fechaBuscada', sql.Date, fecha); 
        } else {
            // Si no hay fecha, traer la rifa más reciente
            query = "SELECT TOP 1 DatosJSON, FechaSorteo FROM ConfiguracionRifas ORDER BY Id DESC";
        }

        const result = await request.query(query);

        // Si no hay datos, devolver estructura vacía
        if (result.recordset.length === 0 || !result.recordset[0].DatosJSON) {
            res.json({ 
                sinDatos: true, 
                mensaje: `No hay rifa guardada para ${fecha || 'ninguna fecha'}`,
                info: { nombre: '', premio: '', valor: '', fecha: fecha || '' }, 
                tabla1: { titulo: 'Tabla 1', participantes: {} }, 
                tabla2: { titulo: 'Tabla 2', participantes: {} }, 
                tabla3: { titulo: 'Tabla 3', participantes: {} }, 
                tabla4: { titulo: 'Tabla 4', participantes: {} }
            });
            return;
        }

        // Parsear los datos JSON
        const datos = JSON.parse(result.recordset[0].DatosJSON);
        
        console.log("🔍 DATOS CARGADOS DESDE LA BD:", datos);
        res.json(datos);

    } catch (err) {
        console.error("❌ Error al leer la base de datos:", err.message);
        res.status(500).json({ error: "Error al cargar datos: " + err.message });
    }
});

// Guardar rifa (usando DatosJSON)
app.post('/api/guardar-rifa', async (req, res) => {
    try {
        const pool = await poolPromise;
        const nuevosDatos = req.body;
        
        console.log('📥 Datos recibidos en /api/guardar-rifa:', JSON.stringify(nuevosDatos).substring(0, 500));
        
        // Sacamos la fecha del objeto info
        const fechaSorteo = nuevosDatos.info ? nuevosDatos.info.fecha : null;

        if (!fechaSorteo) {
            return res.status(400).json({ success: false, error: "La fecha es obligatoria para guardar." });
        }

        // Buscar si ya existe un registro para esa fecha
        const check = await pool.request()
            .input('fecha', sql.Date, fechaSorteo)
            .query("SELECT Id, DatosJSON FROM ConfiguracionRifas WHERE FechaSorteo = @fecha");

        if (check.recordset.length > 0) {
            // Actualizar registro existente
            await pool.request()
                .input('id', sql.Int, check.recordset[0].Id)
                .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(nuevosDatos))
                .query("UPDATE ConfiguracionRifas SET DatosJSON = @datos, UltimaActualizacion = GETDATE() WHERE Id = @id");
        } else {
            // Crear nuevo registro
            await pool.request()
                .input('fecha', sql.Date, fechaSorteo)
                .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(nuevosDatos))
                .query("INSERT INTO ConfiguracionRifas (FechaSorteo, DatosJSON, UltimaActualizacion) VALUES (@fecha, @datos, GETDATE())");
        }

        console.log('✅ Datos guardados correctamente en la BD');
        res.json({ success: true, message: "Guardado correctamente" });
        
    } catch (err) {
        console.error("❌ Error al guardar:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 4. RUTAS DE SOCIOS Y MIEMBROS ---

app.get('/api/socios-esfuerzo', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                P.ID_Persona as id, 
                P.Nombre as nombre,
                P.Documento as documento,
                P.EsSocio,
                CASE WHEN P.EsSocio = 1 THEN 'SOCIO' ELSE 'EXTERNO' END as tipo,
                -- Saldo Total Real
                ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) as totalAhorrado,
                
                -- LÓGICA DE PUNTOS POR DÍAS EXACTOS
                ISNULL((
                    SELECT SUM(CAST(Monto AS FLOAT) * (
                        DATEDIFF(DAY, 
                            CASE 
                                -- Ajuste de LIKE para ser más flexible con espacios o formatos
                                WHEN MesesCorrespondientes LIKE '%Diciembre%1%' THEN '2025-12-02'
                                WHEN MesesCorrespondientes LIKE '%Diciembre%2%' THEN '2025-12-17'
                                WHEN MesesCorrespondientes LIKE '%Enero%1%'     THEN '2026-01-02'
                                WHEN MesesCorrespondientes LIKE '%Enero%2%'     THEN '2026-01-17'
                                WHEN MesesCorrespondientes LIKE '%Febrero%1%'   THEN '2026-02-02'
                                WHEN MesesCorrespondientes LIKE '%Febrero%2%'   THEN '2026-02-17'
                                -- Prioridad absoluta a la fecha manual de aporte
                                ELSE ISNULL(FechaAporte, Fecha) 
                            END, 
                            GETDATE()) + 1
                    ))
                    FROM Ahorros 
                    WHERE ID_Persona = P.ID_Persona
                ), 0) as puntosEsfuerzo
            FROM Personas P
            WHERE P.Estado = 'Activo'
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en /api/socios-esfuerzo:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/guardar-miembro', async (req, res) => {
    try {
        const { nombre, cedula, esSocio } = req.body;
        
        if (!nombre || !cedula) {
            return res.status(400).json({ success: false, error: "Nombre y documento son requeridos" });
        }
        
        const pool = await poolPromise;
        
        // Verificar si el documento ya existe
        const checkDoc = await pool.request()
            .input('d', sql.VarChar, cedula)
            .query("SELECT ID_Persona FROM Personas WHERE Documento = @d");
        
        if (checkDoc.recordset.length > 0) {
            return res.status(400).json({ success: false, error: "Ya existe un miembro con este documento" });
        }
        
        await pool.request()
            .input('n', sql.VarChar, nombre).input('d', sql.VarChar, cedula).input('s', sql.Bit, esSocio)
            .query("INSERT INTO Personas (Nombre, Documento, EsSocio) VALUES (@n, @d, @s)");
        res.json({ success: true });
    } catch (err) { 
        console.error("Error en guardar-miembro:", err.message);
        res.status(500).json({ success: false, error: err.message }); 
    }
});

app.post('/editar-socio', async (req, res) => {
    try {
        const { id, nombre, cedula, esSocio } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, id)
            .input('nombre', sql.VarChar, nombre)
            .input('cedula', sql.VarChar, cedula)
            .input('esSocio', sql.Int, esSocio) // 1 o 0
            .query(`
                UPDATE Personas 
                SET Nombre = @nombre, Documento = @cedula, EsSocio = @esSocio 
                WHERE ID_Persona = @id
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

app.post('/registrar-prestamo-diario', async (req, res) => {
    try {
        const { idPersona, monto, tasaInteresMensual, fechaInicio } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), monto)
            .input('tasa', sql.Decimal(18, 2), tasaInteresMensual)
            .input('fechaInicio', sql.Date, fechaInicio)
            .query(`
                INSERT INTO Prestamos (
                    ID_Persona, 
                    MontoPrestado, 
                    TasaInteres,     
                    FechaInicio,     
                    MontoPagado, 
                    SaldoActual, 
                    Estado
                ) 
                VALUES (
                    @idPersona, 
                    @monto, 
                    @tasa, 
                    @fechaInicio,
                    0, 
                    @monto, 
                    'Activo'
                )
            `);

        res.json({ success: true });
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 5.5 RUTA DE RETIRO DE AHORROS ---
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
            return res.status(400).json({ 
                success: false, 
                message: `Saldo insuficiente. Máximo disponible: $${saldoActual.toLocaleString()}` 
            });
        }

        if (montoARetirar <= 0) {
            return res.status(400).json({ success: false, message: "El monto debe ser mayor a 0." });
        }

        await pool.request()
            .input('id', sql.Int, id)
            .input('monto', sql.Decimal(18, 2), montoARetirar * -1)
            .query(`
                INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) 
                VALUES (@id, @monto, GETDATE(), 'RETIRO DE AHORRO')
            `);

        res.json({ success: true, message: 'Retiro procesado con éxito' });

    } catch (err) {
        console.error("Error en retiro:", err);
        res.status(500).json({ success: false, message: 'Error interno en el servidor' });
    }
});

// --- 6. REPORTES Y ESTADOS ---

app.get('/reporte-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) as TotalAhorrado,
                (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,
                (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas,
                (
                    (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + 
                    (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) - 
                    (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo')
                ) as CajaDisponible
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ TotalAhorrado: 0, CapitalPrestado: 0, GananciasBrutas: 0, CajaDisponible: 0 });
    }
});

// --- RUTAS PARA EL RESUMEN DEL SOCIO ---

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

app.get('/historial-ahorros/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT 
                        ROW_NUMBER() OVER (ORDER BY Fecha DESC) as RowNum,
                        ID_Ahorro,
                        Monto, 
                        FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada, 
                        ISNULL(MesesCorrespondientes, 'Abono General') as Detalle 
                    FROM Ahorros 
                    WHERE ID_Persona = @id ORDER BY Fecha DESC`);
        res.json(result.recordset);
    } catch (err) { 
        console.error("Error en historial-ahorros:", err.message);
        res.status(500).json([]); 
    }
});

app.get('/historial-abonos-deuda/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Pago,
                    Monto as Monto_Abonado, 
                    FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada,
                    ID_Prestamo
                FROM HistorialPagos 
                WHERE ID_Persona = @id AND TipoMovimiento = 'Abono Deuda'
                ORDER BY Fecha DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.get('/detalle-prestamo/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Prestamo,
                    MontoPrestado,
                    MontoPagado,
                    ISNULL(InteresesPagados, 0) as InteresesPagados,
                    TasaInteres,         
                    FechaInicio,         
                    FechaInteres,
                    CASE 
                        WHEN FechaInteres IS NOT NULL THEN DATEDIFF(DAY, FechaInicio, FechaInteres)
                        WHEN DATEDIFF(DAY, FechaInicio, GETDATE()) < 0 THEN 0 
                        ELSE DATEDIFF(DAY, FechaInicio, GETDATE()) 
                    END as DiasTranscurridos,
                    (MontoPrestado * (TasaInteres / 100.0 / 30.0) * CASE 
                            WHEN FechaInteres IS NOT NULL THEN DATEDIFF(DAY, FechaInicio, FechaInteres)
                            WHEN DATEDIFF(DAY, FechaInicio, GETDATE()) < 0 THEN 0 
                            ELSE DATEDIFF(DAY, FechaInicio, GETDATE()) 
                        END) as InteresAcumulado
                FROM Prestamos 
                WHERE ID_Persona = @id
            `);

        const prestamosCalculados = result.recordset.map(p => {
            const capital = Number(p.MontoPrestado || 0);
            const interesTotal = Number(p.InteresAcumulado || 0);
            const pagadoCapital = Number(p.MontoPagado || 0);
            const pagadoInteres = Number(p.InteresesPagados || 0);
            
            const interesPendiente = interesTotal - pagadoInteres;
            const saldoActual = (capital - pagadoCapital) + interesPendiente;

            return {
                ID_Prestamo: p.ID_Prestamo,
                MontoPrestado: capital,
                MontoPagado: pagadoCapital,
                InteresesPagados: pagadoInteres,
                TasaInteres: p.TasaInteres,
                FechaInicio: p.FechaInicio,
                FechaInteres: p.FechaInteres,
                DiasTranscurridos: p.DiasTranscurridos || 0,
                InteresGenerado: interesPendiente > 0 ? interesPendiente : 0,
                saldoHoy: saldoActual > 0 ? saldoActual : 0,
                FechaInicioFormateada: p.FechaInicio ? new Date(p.FechaInicio).toLocaleDateString('es-CO') : 'S/F',
                FechaInteresFormateada: p.FechaInteres ? new Date(p.FechaInteres).toLocaleDateString('es-CO') : null
            };
        });

        res.json(prestamosCalculados);
    } catch (err) {
        console.error("Error detallado:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/cobro-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                p.ID_Persona,
                per.Nombre,
                SUM(p.SaldoActual) as TotalCapital,
                SUM(ROUND(
                    (p.MontoPrestado * (p.TasaInteres / 100.0 / 30.0) * CASE WHEN DATEDIFF(DAY, p.FechaInicio, GETDATE()) < 0 THEN 0 
                    ELSE DATEDIFF(DAY, p.FechaInicio, GETDATE()) END) 
                    - ISNULL(p.InteresesPagados, 0), 0
                )) as TotalInteres,
                SUM(p.SaldoActual + ROUND(
                    (p.MontoPrestado * (p.TasaInteres / 100.0 / 30.0) * CASE WHEN DATEDIFF(DAY, p.FechaInicio, GETDATE()) < 0 THEN 0 
                    ELSE DATEDIFF(DAY, p.FechaInicio, GETDATE()) END) 
                    - ISNULL(p.InteresesPagados, 0), 0
                )) as GranTotal
            FROM Prestamos p
            INNER JOIN Personas per ON p.ID_Persona = per.ID_Persona
            WHERE p.Estado = 'Activo'
            GROUP BY p.ID_Persona, per.Nombre
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/procesar-movimiento', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { idPersona, monto, tipoMovimiento, idPrestamo, destinoAbono, MesesCorrespondientes, fechaManual } = req.body;
        
        const m = parseFloat(monto);
        if (isNaN(m) || m <= 0) {
            return res.status(400).json({ success: false, error: "El monto debe ser un número válido." });
        }

        const mesesParaSQL = MesesCorrespondientes || "Abono General";
        const fAporte = fechaManual || new Date().toISOString().split('T')[0];

        if (tipoMovimiento === 'deuda') {
            const checkPrestamo = await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT 
                        SaldoActual, MontoPrestado, TasaInteres, FechaInicio, 
                        ISNULL(InteresesPagados, 0) as InteresesPagados,
                        (MontoPrestado * (TasaInteres / 100.0 / 30.0) * CASE WHEN DATEDIFF(DAY, FechaInicio, GETDATE()) < 0 THEN 0 
                         ELSE DATEDIFF(DAY, FechaInicio, GETDATE()) END) as InteresTotalGenerado
                    FROM Prestamos 
                    WHERE ID_Prestamo = @idP`);
            
            const p = checkPrestamo.recordset[0];
            if (!p) return res.status(404).json({ success: false, error: "Préstamo no encontrado." });

            const interesTotalGenerado = parseFloat(p.InteresTotalGenerado || 0);
            const interesesYaPagados = parseFloat(p.InteresesPagados || 0);
            const interesPendiente = interesTotalGenerado - interesesYaPagados;

            if (destinoAbono === 'interes') {
                if (interesPendiente <= 0.01) {
                    return res.status(400).json({ success: false, error: "No hay intereses pendientes." });
                }
                if (m > (interesPendiente + 0.1)) {
                    return res.status(400).json({ success: false, error: `Excede el interés ($${Math.round(interesPendiente).toLocaleString()}).` });
                }

                await pool.request()
                    .input('idP', sql.Int, idPrestamo)
                    .input('m', sql.Decimal(18, 2), m)
                    .query("UPDATE Prestamos SET InteresesPagados = ISNULL(InteresesPagados, 0) + @m WHERE ID_Prestamo = @idP");
            } 
            else if (destinoAbono === 'capital') {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo)
                    .input('m', sql.Decimal(18, 2), m)
                    .query(`
                        UPDATE Prestamos 
                        SET MontoPagado = ISNULL(MontoPagado, 0) + @m,
                            SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END,
                            Estado = CASE WHEN (SaldoActual - @m) <= 0 THEN 'Pagado' ELSE 'Activo' END 
                        WHERE ID_Prestamo = @idP
                    `);
            }
            
            await pool.request()
                .input('idPers', sql.Int, idPersona).input('idPre', sql.Int, idPrestamo)
                .input('m', sql.Decimal(18, 2), m).input('det', sql.VarChar, mesesParaSQL)
                .input('fAporte', sql.Date, fAporte)
                .query(`INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento, Detalle) 
                        VALUES (@idPers, @idPre, @m, @fAporte, 'Abono Deuda', @det)`);
        } 
        else if (tipoMovimiento === 'ahorro') {
            await pool.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18, 2), m)
                .input('txtMeses', sql.VarChar(sql.MAX), mesesParaSQL) 
                .input('fAporte', sql.Date, fAporte)
                .query(`INSERT INTO Ahorros (ID_Persona, Monto, Fecha, FechaAporte, MesesCorrespondientes) 
                        VALUES (@id, @m, @fAporte, @fAporte, @txtMeses)`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Error en procesar-movimiento:", err.message);
        res.status(500).json({ success: false, error: "Error de base de datos: " + err.message });
    }
});

app.get('/api/quincenas-pagas/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.idPersona)
            .query("SELECT MesesCorrespondientes FROM Ahorros WHERE ID_Persona = @id");

        let pagas = [];
        result.recordset.forEach(reg => {
            if (reg.MesesCorrespondientes) {
                const lista = reg.MesesCorrespondientes.split(',').map(s => s.trim());
                pagas = pagas.concat(lista);
            }
        });

        res.json(pagas);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/registrar-abono-dinamico', async (req, res) => {
    const { idPrestamo, idPersona, monto, tipo } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();
        const m = parseFloat(monto);

        await transaction.request()
            .input('idPrestamo', sql.Int, idPrestamo)
            .input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), m)
            .input('detalle', sql.VarChar, `Abono a ${tipo.toUpperCase()}`)
            .query(`INSERT INTO HistorialPagos (ID_Prestamo, ID_Persona, Monto, Fecha, Detalle, TipoMovimiento) 
                    VALUES (@idPrestamo, @idPersona, @monto, GETDATE(), @detalle, 'Abono Deuda')`);

        if (tipo === 'capital') {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18, 2), m)
                .query(`UPDATE Prestamos 
                        SET MontoPagado = MontoPagado + @monto,
                            SaldoActual = CASE WHEN (SaldoActual - @monto) < 0 THEN 0 ELSE SaldoActual - @monto END,
                            Estado = CASE WHEN (SaldoActual - @monto) <= 0 THEN 'Pagado' ELSE 'Activo' END 
                        WHERE ID_Prestamo = @idPrestamo`);
        } else {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18, 2), m)
                .query(`UPDATE Prestamos 
                        SET InteresesPagados = InteresesPagados + @monto
                        WHERE ID_Prestamo = @idPrestamo`);
        }

        await transaction.commit();
        res.json({ success: true });

    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("Error en abono dinámico:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/cambiar-estado-socio', async (req, res) => {
    try {
        const { id, nuevoEstado } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, id)
            .input('estado', sql.VarChar, nuevoEstado)
            .query("UPDATE Personas SET Estado = @estado WHERE ID_Persona = @id");
        
        res.json({ success: true });
    } catch (err) {
        console.error("Error al cambiar estado:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/listar-inactivos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query("SELECT ID_Persona as id, Nombre as nombre FROM Personas WHERE Estado = 'Inactivo'");
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ganancias-disponibles', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT ISNULL(SUM(InteresesPagados), 0) as saldo 
            FROM Prestamos
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/caja-disponible', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT (
                ISNULL((SELECT SUM(Monto) FROM Ahorros), 0) + 
                ISNULL((SELECT SUM(Monto), 0) FROM HistorialGanancias)
            ) - (
                ISNULL((SELECT SUM(MontoPrestado - MontoPagado) FROM Prestamos WHERE Estado = 'Activo'), 0)
            ) as total
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ total: 0 });
    }
});

app.get('/api/total-ahorros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT ISNULL(SUM(Monto), 0) as total FROM Ahorros");
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ total: 0 });
    }
});

app.get('/api/total-prestamos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT ISNULL(SUM(MontoPrestado - MontoPagado), 0) as total 
            FROM Prestamos 
            WHERE Estado = 'Activo'
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ total: 0 });
    }
});

app.get('/api/ganancias-rifas-acumuladas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query("SELECT TOP 1 DatosJSON FROM ConfiguracionRifas WHERE FechaSorteo = '2099-12-31'");
        
        if (result.recordset.length > 0 && result.recordset[0].DatosJSON) {
            const datos = JSON.parse(result.recordset[0].DatosJSON);
            res.json({ gananciaTotal: datos.gananciaAcumulada || 0 });
        } else {
            res.json({ gananciaTotal: 0 });
        }
    } catch (err) {
        console.error("Error en ganancias-rifas-acumuladas:", err.message);
        res.status(500).json({ error: err.message, gananciaTotal: 0 });
    }
});

app.post('/api/ganancias-rifas-acumuladas', async (req, res) => {
    try {
        const { gananciaAcumulada } = req.body;
        const pool = await poolPromise;
        
        const check = await pool.request()
            .query("SELECT Id FROM ConfiguracionRifas WHERE FechaSorteo = '2099-12-31'");
        
        if (check.recordset.length > 0) {
            await pool.request()
                .input('ganancia', sql.NVarChar, JSON.stringify({ gananciaAcumulada }))
                .query("UPDATE ConfiguracionRifas SET DatosJSON = @ganancia, UltimaActualizacion = GETDATE() WHERE FechaSorteo = '2099-12-31'");
        } else {
            await pool.request()
                .input('ganancia', sql.NVarChar, JSON.stringify({ gananciaAcumulada }))
                .query("INSERT INTO ConfiguracionRifas (FechaSorteo, DatosJSON, UltimaActualizacion) VALUES ('2099-12-31', @ganancia, GETDATE())");
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error("Error al guardar ganancias acumuladas:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/estadisticas-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT DatosJSON FROM ConfiguracionRifas WHERE Id = 1");
        
        if (result.recordset.length > 0 && result.recordset[0].DatosJSON) {
            const datos = JSON.parse(result.recordset[0].DatosJSON);
            let totalPorRecoger = 0;
            let totalRecogido = 0;

            datos.tablas.forEach(tabla => {
                tabla.numeros.forEach(n => {
                    const valorNum = parseFloat(datos.info.valor) || 0;
                    totalPorRecoger += valorNum;
                    if (n.pagado) {
                        totalRecogido += valorNum;
                    }
                });
            });

            const valorPremio = parseFloat(datos.info.premio_valor) || 0; 
            const gananciasActuales = totalRecogido - valorPremio;

            res.json({
                totalDebido: totalPorRecoger,
                totalPagado: totalRecogido,
                ganancia: gananciasActuales > 0 ? gananciasActuales : 0
            });
        } else {
            res.json({ totalDebido: 0, totalPagado: 0, ganancia: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/registrar-gasto-ganancias', async (req, res) => {
    const { monto, detalle } = req.body;
    const pool = await poolPromise;

    try {
        await pool.request()
            .input('monto', sql.Decimal(18, 2), monto)
            .query(`
                UPDATE Prestamos 
                SET InteresesPagados = CASE 
                    WHEN (InteresesPagados - @monto) < 0 THEN 0 
                    ELSE InteresesPagados - @monto 
                END
            `);

        res.json({ success: true, message: "Ganancias actualizadas tras reparto" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ejecutar-reparto-masivo', async (req, res) => {
    const { sociosAptos } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const totalRepartido = sociosAptos.reduce((sum, s) => sum + parseFloat(s.interes), 0);

        for (const s of sociosAptos) {
            await transaction.request()
                .input('id', sql.Int, s.id)
                .input('monto', sql.Decimal(18, 2), s.interes)
                .input('detalle', sql.VarChar(sql.MAX), s.detalle || 'REPARTO UTILIDADES EQUITATIVO (POR DÍAS)')
                .query(`INSERT INTO Ahorros (ID_Persona, Monto, Fecha, FechaAporte, MesesCorrespondientes) 
                        VALUES (@id, @monto, GETDATE(), GETDATE(), @detalle)`);
        }

        await transaction.request()
            .input('totalADescontar', sql.Decimal(18, 2), totalRepartido)
            .query(`
                UPDATE Prestamos 
                SET InteresesPagados = ISNULL(InteresesPagados, 0) - @totalADescontar 
                WHERE ID_Prestamo = (
                    SELECT TOP 1 ID_Prestamo 
                    FROM Prestamos 
                    WHERE InteresesPagados > 0 
                    ORDER BY FechaInicio DESC
                )
            `);

        await transaction.commit();
        res.json({ success: true, totalDescontado: totalRepartido });
    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("Error exacto en DB:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/previsualizar-reparto-diario', async (req, res) => {
    try {
        const pool = await poolPromise;

        const utilidadRes = await pool.request().query(`
            SELECT 
                (SELECT ISNULL(SUM(Monto), 0) FROM HistorialPagos WHERE TipoMovimiento = 'Abono Deuda' AND Detalle LIKE '%INTERES%') -
                (SELECT ISNULL(SUM(Monto), 0) FROM Gastos) as UtilidadNeta
        `);
        const utilidadTotal = utilidadRes.recordset[0].UtilidadNeta;

        const ahorrosRes = await pool.request().query(`
            SELECT 
                A.ID_Persona, 
                P.Nombre, 
                A.Monto, 
                A.Fecha,
                DATEDIFF(DAY, A.Fecha, GETDATE()) as Dias
            FROM Ahorros A
            JOIN Personas P ON A.ID_Persona = P.ID_Persona
        `);

        const ahorros = ahorrosRes.recordset;
        let puntajeGlobal = 0;
        const puntosPorSocio = {};

        ahorros.forEach(ahorro => {
            const diasEfectivos = ahorro.Dias > 0 ? ahorro.Dias : 1;
            const puntos = ahorro.Monto * diasEfectivos;
            
            if (!puntosPorSocio[ahorro.ID_Persona]) {
                puntosPorSocio[ahorro.ID_Persona] = { 
                    id: ahorro.ID_Persona, 
                    nombre: ahorro.Nombre, 
                    puntos: 0 
                };
            }
            puntosPorSocio[ahorro.ID_Persona].puntos += puntos;
            puntajeGlobal += puntos;
        });

        const sociosAptos = Object.values(puntosPorSocio).map(s => {
            const participacion = s.puntos / puntajeGlobal;
            const utilidadAsignada = Math.floor(utilidadTotal * participacion);

            return {
                id: s.id,
                nombre: s.nombre,
                interes: utilidadAsignada,
                detalle: `REPARTO EQUITATIVO: ${s.puntos.toLocaleString()} PTS-DÍA`
            };
        });

        res.json({
            utilidadTotal,
            sociosAptos: sociosAptos.filter(s => s.interes > 0)
        });

    } catch (err) {
        console.error("Error al calcular reparto:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/listar-miembros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                per.ID_Persona as id,
                per.Nombre as nombre,
                per.Documento as documento,
                ISNULL((
                    SELECT SUM(
                        p.SaldoActual + 
                        ( (p.MontoPrestado * (p.TasaInteres / 100.0 / 30.0) * CASE WHEN DATEDIFF(DAY, p.FechaInicio, GETDATE()) < 0 THEN 0 
                           ELSE DATEDIFF(DAY, p.FechaInicio, GETDATE()) END
                          ) - ISNULL(p.InteresesPagados, 0)
                        )
                    )
                    FROM Prestamos p
                    WHERE p.ID_Persona = per.ID_Persona AND p.Estado = 'Activo'
                ), 0) as saldoPendiente
            FROM Personas per
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener miembros" });
    }
});

app.post('/procesar-cruce', async (req, res) => {
    const { idPersona, idPrestamo, monto } = req.body;
    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const prestamoInfo = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT 
                        MontoPrestado, 
                        InteresesPagados,
                        (MontoPrestado * (TasaInteres / 100.0 / 30.0) * DATEDIFF(DAY, FechaInicio, GETDATE())) as InteresCalculado
                    FROM Prestamos WHERE ID_Prestamo = @idP
                `);

            const p = prestamoInfo.recordset[0];
            const interesPendiente = Math.max(0, p.InteresCalculado - p.InteresesPagados);

            let pagoInteres = Math.min(monto, interesPendiente);
            let pagoCapital = monto - pagoInteres;

            await transaction.request()
                .input('idPers', sql.Int, idPersona)
                .input('m', sql.Decimal(18, 2), monto)
                .query(`INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) 
                        VALUES (@idPers, -@m, GETDATE(), 'CRUCE DE CUENTAS POR DEUDA')`);

            await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .input('pInt', sql.Decimal(18, 2), pagoInteres)
                .input('pCap', sql.Decimal(18, 2), pagoCapital)
                .query(`
                    UPDATE Prestamos 
                    SET 
                        InteresesPagados += @pInt,
                        MontoPagado += @pCap,
                        SaldoActual = CASE WHEN (SaldoActual - @pCap) < 0 THEN 0 ELSE SaldoActual - @pCap END,
                        Estado = CASE WHEN (SaldoActual - @pCap) <= 0 AND (MontoInteres - (InteresesPagados + @pInt)) <= 0 THEN 'Pagado' ELSE 'Activo' END
                    WHERE ID_Prestamo = @idP
                `);

            const detalleCruce = `Cruce Ahorros: Int: $${pagoInteres.toLocaleString()} | Cap: $${pagoCapital.toLocaleString()}`;
            await transaction.request()
                .input('idPers', sql.Int, idPersona)
                .input('idP', sql.Int, idPrestamo)
                .input('m', sql.Decimal(18, 2), monto)
                .input('det', sql.VarChar, detalleCruce)
                .query(`INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento, Detalle)
                        VALUES (@idPers, @idP, @m, GETDATE(), 'Cruce de Cuentas', @det)`);

            await transaction.commit();
            res.json({ success: true });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error("Error en cruce:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/prestamos-activos/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.idPersona)
            .query(`
                SELECT 
                    ID_Prestamo, 
                    SaldoActual, 
                    FechaInicio as Fecha 
                FROM Prestamos 
                WHERE ID_Persona = @id AND Estado = 'Activo'
            `);
        
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en api/prestamos-activos:", err.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.put('/api/editar-ahorro', async (req, res) => {
    try {
        const { idAhorro, monto, fecha, MesesCorrespondientes, idPersona } = req.body;

        if (!idAhorro || !monto || !idPersona) {
            return res.status(400).json({ success: false, error: "Faltan datos requeridos" });
        }

        const pool = await poolPromise;

        const rowNum = parseInt(idAhorro);
        const ahorroReal = await pool.request()
            .input('idPersona', sql.Int, idPersona)
            .input('rowNum', sql.Int, rowNum)
            .query(`
                SELECT ID_Ahorro, Monto FROM (
                    SELECT ID_Ahorro, Monto, ROW_NUMBER() OVER (ORDER BY Fecha DESC) as RowNum
                    FROM Ahorros
                    WHERE ID_Persona = @idPersona
                ) t WHERE RowNum = @rowNum
            `);

        if (ahorroReal.recordset.length === 0) {
            return res.status(404).json({ success: false, error: "Ahorro no encontrado" });
        }

        const realIdAhorro = ahorroReal.recordset[0].ID_Ahorro;
        const montoNuevo = parseFloat(monto);

        await pool.request()
            .input('id', sql.Int, realIdAhorro)
            .input('monto', sql.Decimal(18, 2), montoNuevo)
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('meses', sql.VarChar(sql.MAX), MesesCorrespondientes || 'Abono General')
            .query(`
                UPDATE Ahorros
                SET Monto = @monto,
                    Fecha = @fecha,
                    FechaAporte = @fecha,
                    MesesCorrespondientes = @meses
                WHERE ID_Ahorro = @id
            `);

        res.json({ success: true, message: "Ahorro actualizado correctamente" });
    } catch (err) {
        console.error("Error al editar ahorro:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

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
                UPDATE HistorialPagos 
                SET Monto = @monto, 
                    Fecha = @fecha, 
                    Detalle = @detalle
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
                            SaldoActual = CASE 
                                WHEN (SaldoActual - @dif) < 0 THEN 0 
                                ELSE SaldoActual - @dif END,
                            Estado = CASE 
                                WHEN (SaldoActual - @dif) <= 0 THEN 'Pagado' 
                                ELSE 'Activo' END
                        WHERE ID_Prestamo = @idP
                    `);
            } else {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo)
                    .input('dif', sql.Decimal(18, 2), diferencia)
                    .query(`
                        UPDATE Prestamos 
                        SET InteresesPagados = ISNULL(InteresesPagados, 0) + @dif
                        WHERE ID_Prestamo = @idP
                    `);
            }
        }

        res.json({ success: true, message: "Pago actualizado correctamente" });
    } catch (err) {
        console.error("Error al editar pago:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/detalle-ahorro/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Ahorro, 
                    ID_Persona, 
                    Monto, 
                    FORMAT(Fecha, 'yyyy-MM-dd') as Fecha,
                    ISNULL(MesesCorrespondientes, 'Abono General') as MesesCorrespondientes
                FROM Ahorros 
                WHERE ID_Ahorro = @id
            `);
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ error: "Ahorro no encontrado" });
        }
    } catch (err) {
        console.error("Error al obtener detalle de ahorro:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/editar-prestamo', async (req, res) => {
    try {
        const { idPrestamo, monto, tasaInteres, fecha, fechaInteres } = req.body;

        if (!idPrestamo || !monto) {
            return res.status(400).json({ success: false, error: "Faltan datos requeridos" });
        }

        const pool = await poolPromise;

        const prestamoActual = await pool.request()
            .input('id', sql.Int, idPrestamo)
            .query("SELECT MontoPrestado, TasaInteres, FechaInicio FROM Prestamos WHERE ID_Prestamo = @id");

        if (prestamoActual.recordset.length === 0) {
            return res.status(404).json({ success: false, error: "Préstamo no encontrado" });
        }

        const tasaAnterior = parseFloat(prestamoActual.recordset[0].TasaInteres || 0);
        const fechaAnterior = prestamoActual.recordset[0].FechaInicio;

        const tasaNueva = tasaInteres ? parseFloat(tasaInteres) : tasaAnterior;

        let interesNuevo = 0;
        let diasTranscurridos = 0;

        let fechaCalculoInteres;
        if (fechaInteres && fechaInteres !== null && fechaInteres !== '') {
            fechaCalculoInteres = new Date(fechaInteres);
        } else {
            fechaCalculoInteres = new Date();
        }

        const fechaInicioPrestamo = fecha ? new Date(fecha) : new Date(fechaAnterior);

        diasTranscurridos = Math.floor((fechaCalculoInteres - fechaInicioPrestamo) / (1000 * 60 * 60 * 24));

        if (diasTranscurridos < 0) diasTranscurridos = 0;

        if (diasTranscurridos > 0) {
            const interesDiario = (parseFloat(monto) * (tasaNueva / 100)) / 30;
            interesNuevo = interesDiario * diasTranscurridos;
        } else {
            interesNuevo = parseFloat(monto) * (tasaNueva / 100);
        }

        const nuevoSaldo = parseFloat(monto) + interesNuevo;

        await pool.request()
            .input('id', sql.Int, idPrestamo)
            .input('monto', sql.Decimal(18, 2), parseFloat(monto))
            .input('tasa', sql.Decimal(5, 2), tasaNueva)
            .input('interes', sql.Decimal(18, 2), interesNuevo)
            .input('saldo', sql.Decimal(18, 2), nuevoSaldo)
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('fechaInteres', sql.Date, fechaInteres || null)
            .query(`
                UPDATE Prestamos 
                SET MontoPrestado = @monto, 
                    TasaInteres = @tasa, 
                    MontoInteres = @interes,
                    SaldoActual = @saldo,
                    FechaInicio = @fecha,
                    FechaInteres = @fechaInteres
                WHERE ID_Prestamo = @id
            `);

        res.json({ success: true, message: "Préstamo actualizado correctamente" });
    } catch (err) {
        console.error("Error al editar préstamo:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/detalle-pago/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Pago, 
                    ID_Persona, 
                    ID_Prestamo,
                    Monto, 
                    FORMAT(Fecha, 'yyyy-MM-dd') as Fecha,
                    ISNULL(Detalle, 'Abono a deuda') as Detalle,
                    TipoMovimiento
                FROM HistorialPagos 
                WHERE ID_Pago = @id
            `);
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
        } else {
            res.status(404).json({ error: "Pago no encontrado" });
        }
    } catch (err) {
        console.error("Error al obtener detalle de pago:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/backup-database', async (req, res) => {
    try {
        const pool = await poolPromise;
        const personas = await pool.request().query("SELECT * FROM Personas");
        const ahorros = await pool.request().query("SELECT * FROM Ahorros");
        const prestamos = await pool.request().query("SELECT * FROM Prestamos");
        const historial = await pool.request().query("SELECT * FROM HistorialPagos");
        const rifas = await pool.request().query("SELECT * FROM ConfiguracionRifas");

        const backup = {
            fecha: new Date().toISOString(),
            data: {
                personas: personas.recordset,
                ahorros: ahorros.recordset,
                prestamos: prestamos.recordset,
                historial: historial.recordset,
                rifas: rifas.recordset
            }
        };

        res.json(backup);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/restore-database', async (req, res) => {
    const { data } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        await transaction.request().query(`
            DELETE FROM HistorialPagos;
            DELETE FROM Ahorros;
            DELETE FROM Prestamos;
            DELETE FROM Personas;
            DELETE FROM ConfiguracionRifas;
        `);

        if (data.personas && data.personas.length > 0) {
            for (const p of data.personas) {
                await transaction.request()
                    .input('id', sql.Int, p.ID_Persona)
                    .input('nom', sql.VarChar, p.Nombre)
                    .input('doc', sql.VarChar, p.Documento)
                    .input('tel', sql.VarChar, p.Telefono || null)
                    .input('soc', sql.Bit, p.EsSocio)
                    .input('fec', sql.DateTime, p.FechaIngreso)
                    .input('est', sql.VarChar, p.Estado)
                    .query(`
                        SET IDENTITY_INSERT Personas ON;
                        INSERT INTO Personas (ID_Persona, Nombre, Documento, Telefono, EsSocio, FechaIngreso, Estado) 
                        VALUES (@id, @nom, @doc, @tel, @soc, @fec, @est);
                        SET IDENTITY_INSERT Personas OFF;
                    `);
            }
        }

        if (data.prestamos && data.prestamos.length > 0) {
            for (const pr of data.prestamos) {
                await transaction.request()
                    .input('idp', sql.Int, pr.ID_Prestamo)
                    .input('idper', sql.Int, pr.ID_Persona)
                    .input('monto', sql.Decimal(18,2), pr.MontoPrestado)
                    .input('tasa', sql.Decimal(5,2), pr.TasaInteres)
                    .input('fini', sql.DateTime, pr.FechaInicio)
                    .input('est', sql.VarChar, pr.Estado)
                    .input('fec', sql.DateTime, pr.Fecha)
                    .input('pagado', sql.Decimal(18,2), pr.MontoPagado)
                    .input('interes', sql.Decimal(18,2), pr.MontoInteres)
                    .input('saldo', sql.Decimal(18,2), pr.SaldoActual)
                    .input('cuotas', sql.Int, pr.Cuotas)
                    .input('intPag', sql.Decimal(18,2), pr.InteresesPagados || 0)
                    .query(`
                        SET IDENTITY_INSERT Prestamos ON;
                        INSERT INTO Prestamos (ID_Prestamo, ID_Persona, MontoPrestado, TasaInteres, FechaInicio, Estado, Fecha, MontoPagado, MontoInteres, SaldoActual, Cuotas, InteresesPagados) 
                        VALUES (@idp, @idper, @monto, @tasa, @fini, @est, @fec, @pagado, @interes, @saldo, @cuotas, @intPag);
                        SET IDENTITY_INSERT Prestamos OFF;
                    `);
            }
        }

        if (data.ahorros && data.ahorros.length > 0) {
            for (const a of data.ahorros) {
                await transaction.request()
                    .input('ida', sql.Int, a.ID_Ahorro)
                    .input('idp', sql.Int, a.ID_Persona)
                    .input('mon', sql.Decimal(18,2), a.Monto)
                    .input('fap', sql.DateTime, a.FechaAporte)
                    .input('fec', sql.DateTime, a.Fecha)
                    .input('mes', sql.VarChar, a.MesesCorrespondientes)
                    .query(`
                        SET IDENTITY_INSERT Ahorros ON;
                        INSERT INTO Ahorros (ID_Ahorro, ID_Persona, Monto, FechaAporte, Fecha, MesesCorrespondientes) 
                        VALUES (@ida, @idp, @mon, @fap, @fec, @mes);
                        SET IDENTITY_INSERT Ahorros OFF;
                    `);
            }
        }

        if (data.historial && data.historial.length > 0) {
            for (const h of data.historial) {
                await transaction.request()
                    .input('idper', sql.Int, h.ID_Persona)
                    .input('monto', sql.Decimal(18,2), h.Monto)
                    .input('fec', sql.DateTime, h.Fecha)
                    .input('tipo', sql.VarChar, h.TipoMovimiento)
                    .input('idpre', sql.Int, h.ID_Prestamo || null)
                    .input('det', sql.VarChar, h.Detalle)
                    .query(`INSERT INTO HistorialPagos (ID_Persona, Monto, Fecha, TipoMovimiento, ID_Prestamo, Detalle) 
                            VALUES (@idper, @monto, @fec, @tipo, @idpre, @det)`);
            }
        }

        await transaction.commit();
        res.json({ success: true, message: "¡Base de datos restaurada correctamente!" });

    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("❌ Error en Restauración:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR UNIFICADO CORRIENDO EN PUERTO ${PORT}`);
});
