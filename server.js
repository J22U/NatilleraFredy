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

app.get('/api/cargar-rifas', async (req, res) => {
    try {
        const { fecha } = req.query; // Capturamos la fecha que viene del navegador (?fecha=...)
        const pool = await poolPromise;
        let query;
        let request = pool.request();

        if (fecha) {
            // SI HAY FECHA: Buscamos específicamente esa rifa en el historial
            // Usamos el formato de fecha para buscar en la columna nueva que creamos
            query = "SELECT DatosJSON FROM ConfiguracionRifas WHERE FechaSorteo = @fechaBuscada";
            request.input('fechaBuscada', fecha); 
        } else {
            // SI NO HAY FECHA: Traemos la rifa actual (la última guardada)
            query = "SELECT TOP 1 DatosJSON FROM ConfiguracionRifas ORDER BY Id DESC";
        }

        const result = await request.query(query);
        
        if (result.recordset.length > 0 && result.recordset[0].DatosJSON) {
            const datosParseados = JSON.parse(result.recordset[0].DatosJSON);
            res.json(datosParseados);
        } else {
            // Si no encuentra nada para esa fecha, enviamos estructura vacía
            res.json({ 
                info: { nombre: '', premio: '', valor: '', fecha: fecha || '' }, 
                tabla1: null, tabla2: null, tabla3: null, tabla4: null 
            });
        }
    } catch (err) {
        console.error("❌ Error al leer la base de datos:", err.message);
        res.status(500).json({ error: "Error al cargar datos." });
    }
});

app.post('/api/guardar-rifa', async (req, res) => {
    try {
        const pool = await poolPromise;
        const nuevosDatos = req.body;
        
        // Sacamos la fecha del objeto info
        const fechaSorteo = nuevosDatos.info ? nuevosDatos.info.fecha : null;

        if (!fechaSorteo) {
            return res.status(400).json({ success: false, error: "La fecha es obligatoria para guardar." });
        }

        // 1. Buscamos si ya existe un registro para esa fecha
        const check = await pool.request()
            .input('fecha', sql.Date, fechaSorteo)
            .query("SELECT Id, DatosJSON FROM ConfiguracionRifas WHERE FechaSorteo = @fecha");

        let datosFinales;

        if (check.recordset.length > 0) {
            // --- CORRECCIÓN AQUÍ ---
            // En lugar de hacer {...datosViejos, ...nuevosDatos} que mantenía los nombres borrados,
            // ahora reemplazamos las tablas y la info con lo que viene del frontend.
            
            const datosExistentes = JSON.parse(check.recordset[0].DatosJSON);

            datosFinales = {
                ...datosExistentes,       // Mantenemos otros datos si existieran
                info: nuevosDatos.info,   // Sobrescribimos la info general
                tabla1: nuevosDatos.tabla1, // Reemplazo total de la tabla (esto borra lo que falte)
                tabla2: nuevosDatos.tabla2,
                tabla3: nuevosDatos.tabla3,
                tabla4: nuevosDatos.tabla4
            };

            await pool.request()
                .input('id', sql.Int, check.recordset[0].Id)
                .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datosFinales))
                .query("UPDATE ConfiguracionRifas SET DatosJSON = @datos, UltimaActualizacion = GETDATE() WHERE Id = @id");
        } else {
            // Si la fecha no existe, guardamos todo el objeto nuevo
            datosFinales = nuevosDatos;
            await pool.request()
                .input('fecha', sql.Date, fechaSorteo)
                .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datosFinales))
                .query("INSERT INTO ConfiguracionRifas (FechaSorteo, DatosJSON, UltimaActualizacion) VALUES (@fecha, @datos, GETDATE())");
        }

        res.json({ success: true, message: "Guardado correctamente en historial" });
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
                
                -- LÓGICA DE PUNTOS POR DÍAS EXACTOS CON RETROACTIVIDAD
                ISNULL((
                    SELECT SUM(Monto * (
                        DATEDIFF(DAY, 
                            CASE 
                                -- DICIEMBRE
                                WHEN MesesCorrespondientes LIKE '%Diciembre%Quincena 1%' THEN '2025-12-02'
                                WHEN MesesCorrespondientes LIKE '%Diciembre%Quincena 2%' THEN '2025-12-17'
                                -- ENERO
                                WHEN MesesCorrespondientes LIKE '%Enero%Quincena 1%'     THEN '2026-01-02'
                                WHEN MesesCorrespondientes LIKE '%Enero%Quincena 2%'     THEN '2026-01-17'
                                -- FEBRERO
                                WHEN MesesCorrespondientes LIKE '%Febrero%Quincena 1%'   THEN '2026-02-02'
                                WHEN MesesCorrespondientes LIKE '%Febrero%Quincena 2%'   THEN '2026-02-17'
                                -- Por defecto usa la fecha real si no coincide con las etiquetas
                                ELSE FechaAporte 
                            END, 
                            GETDATE()) + 1 -- El +1 asegura que si ahorró hoy, al menos tenga 1 día de esfuerzo
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
        const pool = await poolPromise;
        await pool.request()
            .input('n', sql.VarChar, nombre).input('d', sql.VarChar, cedula).input('s', sql.Bit, esSocio)
            .query("INSERT INTO Personas (Nombre, Documento, EsSocio) VALUES (@n, @d, @s)");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
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
        // Recibimos fechaInicio del body enviada por el frontend
        const { idPersona, monto, tasaInteresMensual, fechaInicio } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), monto)
            .input('tasa', sql.Decimal(18, 2), tasaInteresMensual)
            .input('fechaInicio', sql.Date, fechaInicio) // <-- Nuevo input para la fecha
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
                    @fechaInicio, -- Ahora usa la fecha manual en lugar de GETDATE()
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

        // 1. Obtener el saldo actual del socio
        const resultSaldo = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ISNULL(SUM(Monto), 0) as SaldoTotal FROM Ahorros WHERE ID_Persona = @id');
        
        const saldoActual = resultSaldo.recordset[0].SaldoTotal;

        // 2. Determinar el monto final a retirar
        let montoARetirar = (tipo === 'total') ? saldoActual : parseFloat(monto);

        // 3. VALIDACIONES
        if (montoARetirar > saldoActual) {
            return res.status(400).json({ 
                success: false, 
                message: `Saldo insuficiente. Máximo disponible: $${saldoActual.toLocaleString()}` 
            });
        }

        if (montoARetirar <= 0) {
            return res.status(400).json({ success: false, message: "El monto debe ser mayor a 0." });
        }

        // 4. Insertar el retiro (Monto en NEGATIVO)
        // Usamos una descripción para saber que fue un retiro
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
                -- 1. TOTAL AHORRADO: El pasivo con tus socios.
                (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) as TotalAhorrado,

                -- 2. CAPITAL PRESTADO: Dinero que está "en la calle" trabajando.
                (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,

                -- 3. GANANCIAS BRUTAS: Solo los intereses recolectados (Lo que pediste).
                (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas,

                -- 4. EFECTIVO EN CAJA: 
                -- Es: (Ahorros + Ganancias) - (Lo que está prestado actualmente)
                (
                    (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + 
                    (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) - 
                    (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo')
                ) as CajaDisponible
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error en reporte-general:", err);
        res.status(500).json({ TotalAhorrado: 0, CapitalPrestado: 0, GananciasBrutas: 0, CajaDisponible: 0 });
    }
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
            .query(`SELECT Monto, 
                           FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada, 
                           -- Forzamos el nombre a 'Detalle' para el frontend
                           ISNULL(MesesCorrespondientes, 'Abono General') as Detalle 
                    FROM Ahorros 
                    WHERE ID_Persona = @id ORDER BY Fecha DESC`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

// 3. Historial de Abonos a Deuda
app.get('/historial-abonos-deuda/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    Monto as Monto_Abonado, 
                    FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada,
                    ID_Prestamo -- Para saber a qué préstamo se le aplicó
                FROM HistorialPagos 
                WHERE ID_Persona = @id AND TipoMovimiento = 'Abono Deuda'
                ORDER BY Fecha DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en historial-abonos:", err);
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
                    MontoPagado,
                    TasaInteres,         
                    FechaInicio,         
                    -- Calculamos días desde la FechaInicio grabada hasta hoy
                    CASE 
                        WHEN DATEDIFF(DAY, FechaInicio, GETDATE()) < 0 THEN 0 
                        ELSE DATEDIFF(DAY, FechaInicio, GETDATE()) 
                    END as DiasTranscurridos,
                    -- Interés basado en la fecha manual seleccionada
                    (MontoPrestado * (TasaInteres / 100.0 / 30.0) * CASE 
                            WHEN DATEDIFF(DAY, FechaInicio, GETDATE()) < 0 THEN 0 
                            ELSE DATEDIFF(DAY, FechaInicio, GETDATE()) 
                        END) as InteresAcumulado
                FROM Prestamos 
                WHERE ID_Persona = @id
            `);

        const prestamosCalculados = result.recordset.map(p => {
            const capital = Number(p.MontoPrestado || 0);
            const interes = Number(p.InteresAcumulado || 0);
            const pagado = Number(p.MontoPagado || 0);
            
            const saldoActual = (capital + interes) - pagado;

            return {
                ID_Prestamo: p.ID_Prestamo,
                MontoPrestado: capital,
                MontoPagado: pagado,
                TasaInteres: p.TasaInteres,
                FechaInicio: p.FechaInicio,
                DiasTranscurridos: p.DiasTranscurridos || 0,
                InteresGenerado: interes,
                saldoHoy: saldoActual > 0 ? saldoActual : 0,
                // Formateo de la fecha manual para el frontend
                FechaInicioFormateada: p.FechaInicio ? new Date(p.FechaInicio).toLocaleDateString('es-CO') : 'S/F'
            };
        });

        res.json(prestamosCalculados);
    } catch (err) {
        console.error("Error detallado:", err.message);
        res.status(500).json({ error: err.message });
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
                       FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada
                FROM Prestamos 
                WHERE ID_Persona = @id AND Estado = 'Activo'
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error al obtener préstamos:", err);
        res.status(500).json([]);
    }
});

app.post('/procesar-movimiento', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { idPersona, monto, tipoMovimiento, idPrestamo, destinoAbono, MesesCorrespondientes } = req.body;
        
        const m = parseFloat(monto);
        if (isNaN(m) || m <= 0) {
            return res.status(400).json({ success: false, error: "El monto debe ser un número válido." });
        }

        const mesesParaSQL = MesesCorrespondientes || "Abono General";

        if (tipoMovimiento === 'deuda') {
            // 1. OBTENEMOS EL ESTADO REAL Y CALCULAMOS EL INTERÉS DINÁMICO
            const checkPrestamo = await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT 
                        SaldoActual, 
                        MontoPrestado, 
                        TasaInteres, 
                        FechaInicio, 
                        ISNULL(InteresesPagados, 0) as InteresesPagados,
                        -- Calculamos el interés generado a la fecha
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
                // Bloqueo si no hay deuda de interés
                if (interesPendiente <= 0.01) { // Pequeño margen para evitar errores de redondeo
                    return res.status(400).json({ 
                        success: false, 
                        error: "No hay intereses pendientes por pagar a la fecha de hoy." 
                    });
                }

                // Validación de monto
                if (m > (interesPendiente + 0.1)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `El monto excede el interés pendiente ($${Math.round(interesPendiente).toLocaleString()}).` 
                    });
                }

                // Actualizamos InteresesPagados
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
            
            // Historial de Pagos
            await pool.request()
                .input('idPers', sql.Int, idPersona).input('idPre', sql.Int, idPrestamo)
                .input('m', sql.Decimal(18, 2), m).input('det', sql.VarChar, mesesParaSQL)
                .query(`INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento, Detalle) 
                        VALUES (@idPers, @idPre, @m, GETDATE(), 'Abono Deuda', @det)`);
        } 
        else if (tipoMovimiento === 'ahorro') {
            await pool.request()
                .input('id', sql.Int, idPersona).input('m', sql.Decimal(18, 2), m)
                .input('txtMeses', sql.VarChar(sql.MAX), mesesParaSQL) 
                .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) VALUES (@id, @m, GETDATE(), @txtMeses)");
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

        // Convertimos todos los registros en una sola lista de quincenas
        let pagas = [];
        result.recordset.forEach(reg => {
            if (reg.MesesCorrespondientes) {
                // Separamos por coma y limpiamos espacios
                const lista = reg.MesesCorrespondientes.split(',').map(s => s.trim());
                pagas = pagas.concat(lista);
            }
        });

        res.json(pagas); // Devuelve algo como ["Enero (Q1)", "Enero (Q2)"]
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

        // 1. Registrar el movimiento en el historial (Usando la columna 'Detalle' que creamos)
        await transaction.request()
            .input('idPrestamo', sql.Int, idPrestamo)
            .input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), m)
            .input('detalle', sql.VarChar, `Abono a ${tipo.toUpperCase()}`)
            .query(`INSERT INTO HistorialPagos (ID_Prestamo, ID_Persona, Monto, Fecha, Detalle, TipoMovimiento) 
                    VALUES (@idPrestamo, @idPersona, @monto, GETDATE(), @detalle, 'Abono Deuda')`);

        // 2. Si es abono a CAPITAL
        if (tipo === 'capital') {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18, 2), m)
                .query(`UPDATE Prestamos 
                        SET MontoPagado = MontoPagado + @monto, -- Registra cuánto capital ha devuelto
                            SaldoActual = CASE WHEN (SaldoActual - @monto) < 0 THEN 0 ELSE SaldoActual - @monto END,
                            Estado = CASE WHEN (SaldoActual - @monto) <= 0 THEN 'Pagado' ELSE 'Activo' END 
                        WHERE ID_Prestamo = @idPrestamo`);
        } 
        // 3. Si es a INTERES (Esto es lo que el Reparto Global necesita ver)
        else {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18, 2), m)
                .query(`UPDATE Prestamos 
                        SET InteresesPagados = InteresesPagados + @monto -- AQUÍ SE SUMA LA GANANCIA REAL
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

// 1. Cambiar estado (Habilitar/Inhabilitar)
// BUSCA ESTA RUTA EN SERVER.JS Y DÉJALA ASÍ:
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

// Y ESTA PARA LOS INACTIVOS:
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
            -- Sumamos los intereses pagados de todos los préstamos
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
        res.json(result.recordset[0]); // Esto devolverá { "total": X }
    } catch (err) {
        res.status(500).json({ total: 0 });
    }
});

// --- RUTAS FALTANTES PARA LOS CUADROS DEL DASHBOARD ---

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
        // Calculamos el capital que está en la calle (lo prestado menos lo que ya devolvieron)
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

app.get('/api/estadisticas-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT DatosJSON FROM ConfiguracionRifas WHERE Id = 1");
        
        if (result.recordset.length > 0 && result.recordset[0].DatosJSON) {
            const datos = JSON.parse(result.recordset[0].DatosJSON);
            let totalPorRecoger = 0;
            let totalRecogido = 0;

            // Recorremos todas las tablas y sus números
            datos.tablas.forEach(tabla => {
                tabla.numeros.forEach(n => {
                    const valorNum = parseFloat(datos.info.valor) || 0;
                    totalPorRecoger += valorNum;
                    if (n.pagado) {
                        totalRecogido += valorNum;
                    }
                });
            });

            // Ganancia (Asumiendo que la ganancia es lo recogido menos el valor del premio)
            // Si el premio se paga aparte, la ganancia es el total recogido.
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
        // Esta consulta resta de la columna donde se acumulan los intereses
        // O resetea a 0 si prefieres un reparto total
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

// --- RUTA PARA EJECUTAR EL REPARTO REAL A LOS SOCIOS ---
app.post('/api/ejecutar-reparto-masivo', async (req, res) => {
    const { sociosAptos } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        // 1. Sumamos el total a repartir
        const totalRepartido = sociosAptos.reduce((sum, s) => sum + parseFloat(s.interes), 0);

        for (const s of sociosAptos) {
            await transaction.request()
                .input('id', sql.Int, s.id)
                .input('monto', sql.Decimal(18, 2), s.interes)
                .input('detalle', sql.VarChar(sql.MAX), s.detalle || 'REPARTO UTILIDADES EQUITATIVO')
                .query(`INSERT INTO Ahorros (ID_Persona, Monto, Fecha, FechaAporte, MesesCorrespondientes) 
                        VALUES (@id, @monto, GETDATE(), GETDATE(), @detalle)`);
        }

        // 2. RESTA PROPORCIONAL usando los nombres reales: ID_Prestamo e InteresesPagados
        await transaction.request()
            .input('totalADescontar', sql.Decimal(18, 2), totalRepartido)
            .query(`
                UPDATE Prestamos 
                SET InteresesPagados = InteresesPagados - @totalADescontar 
                WHERE ID_Prestamo = (
                    SELECT TOP 1 ID_Prestamo 
                    FROM Prestamos 
                    WHERE InteresesPagados > 0 
                    ORDER BY Fecha DESC
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

// Agrega esto en tu server.js
app.get('/listar-miembros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                P.ID_Persona as id, 
                P.Nombre as nombre, 
                P.Documento as documento,
                -- Identificamos si es Socio o Externo para el frontend
                CASE WHEN P.EsSocio = 1 THEN 'SOCIO' ELSE 'EXTERNO' END as tipo,
                ISNULL((
                    SELECT SUM(SaldoActual) 
                    FROM Prestamos 
                    WHERE ID_Persona = P.ID_Persona 
                    AND SaldoActual > 0
                ), 0) as saldoPendiente
            FROM Personas P
            WHERE 
                -- Condición 1: Que tenga una deuda activa (No importa si es externo)
                EXISTS (
                    SELECT 1 FROM Prestamos Pr 
                    WHERE Pr.ID_Persona = P.ID_Persona AND Pr.SaldoActual > 0
                )
                -- Condición 2: O que sea un Socio Activo (aunque no deba)
                OR (P.EsSocio = 1 AND P.Estado = 'Activo')
            ORDER BY P.Nombre ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error("Error en /listar-miembros:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/procesar-cruce', async (req, res) => {
    const { idPersona, idPrestamo, monto } = req.body;
    try {
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. OBTENER EL INTERÉS ACUMULADO AL DÍA DE HOY
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

            // Determinar cuánto va para interés y cuánto para capital
            let pagoInteres = Math.min(monto, interesPendiente);
            let pagoCapital = monto - pagoInteres;

            // 2. DESCONTAR DE AHORROS
            await transaction.request()
                .input('idPers', sql.Int, idPersona)
                .input('m', sql.Decimal(18, 2), monto)
                .query(`INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) 
                        VALUES (@idPers, -@m, GETDATE(), 'CRUCE DE CUENTAS POR DEUDA')`);

            // 3. ACTUALIZAR PRÉSTAMO (Repartiendo el pago)
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

            // 4. REGISTRAR EN HISTORIAL (Detallando el reparto)
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
// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR UNIFICADO CORRIENDO EN PUERTO ${PORT}`);
});