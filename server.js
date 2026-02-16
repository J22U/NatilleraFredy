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
        const pool = await poolPromise;
        
        // Buscamos la fila con Id = 1 que es donde guardas la configuración de la rifa
        const result = await pool.request()
            .query("SELECT DatosJSON FROM ConfiguracionRifas WHERE Id = 1");
        
        if (result.recordset.length > 0 && result.recordset[0].DatosJSON) {
            // Convertimos el texto largo de la base de datos en un objeto JSON
            const datosParseados = JSON.parse(result.recordset[0].DatosJSON);
            
            // Enviamos el JSON al navegador
            res.json(datosParseados);
        } else {
            // Si la base de datos está vacía, enviamos una estructura base
            // para que el frontend no falle y sepa que debe crear tablas nuevas
            res.json({ 
                info: { nombre: '', premio: '', valor: '', fecha: '' }, 
                tablas: [] 
            });
        }
    } catch (err) {
        console.error("❌ Error al leer la base de datos:", err.message);
        res.status(500).json({ 
            success: false, 
            error: "Error interno del servidor al cargar los datos." 
        });
    }
});

app.post('/api/guardar-rifa', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // 1. Primero leemos lo que ya hay para no borrar las otras tablas
        const current = await pool.request()
            .query("SELECT DatosJSON FROM ConfiguracionRifas WHERE Id = 1");
        
        let datosExistentes = { info: {}, tablas: [] };
        if (current.recordset.length > 0 && current.recordset[0].DatosJSON) {
            datosExistentes = JSON.parse(current.recordset[0].DatosJSON);
        }

        // 2. Fusionamos los datos nuevos con los viejos
        // Esto asegura que si guardas la Tabla 2, no se borre la 1, 3 o 4
        const datosActualizados = { ...datosExistentes, ...req.body };

        // 3. Guardamos en la tabla CORRECTA (ConfiguracionRifas)
        await pool.request()
            .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datosActualizados))
            .query("UPDATE ConfiguracionRifas SET DatosJSON = @datos, UltimaActualizacion = GETDATE() WHERE Id = 1");
        
        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error real en SQL:", err.message);
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
                P.EsSocio,
                -- Saldo Total
                ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) as saldoTotal,
                -- CÁLCULO DE PUNTOS POR QUINCENAS DETECTADAS
                ISNULL((
                    SELECT SUM(
                        Monto * (
                            (CASE WHEN MesesCorrespondientes LIKE '%Enero (Q1)%' THEN 24 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Enero (Q2)%' THEN 23 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Febrero (Q1)%' THEN 22 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Febrero (Q2)%' THEN 21 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Marzo (Q1)%' THEN 20 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Marzo (Q2)%' THEN 19 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Abril (Q1)%' THEN 18 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Abril (Q2)%' THEN 17 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Mayo (Q1)%' THEN 16 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Mayo (Q2)%' THEN 15 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Junio (Q1)%' THEN 14 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Junio (Q2)%' THEN 13 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Julio (Q1)%' THEN 12 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Julio (Q2)%' THEN 11 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Agosto (Q1)%' THEN 10 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Agosto (Q2)%' THEN 9 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Septiembre (Q1)%' THEN 8 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Septiembre (Q2)%' THEN 7 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Octubre (Q1)%' THEN 6 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Octubre (Q2)%' THEN 5 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Noviembre (Q1)%' THEN 4 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Noviembre (Q2)%' THEN 3 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Diciembre (Q1)%' THEN 2 ELSE 0 END) +
                            (CASE WHEN MesesCorrespondientes LIKE '%Diciembre (Q2)%' THEN 1 ELSE 0 END)
                        )
                    )
                    FROM Ahorros 
                    WHERE ID_Persona = P.ID_Persona
                ), 0) as puntosEsfuerzo
            FROM Personas P
            WHERE P.Estado = 'Activo'
        `);
        res.json(result.recordset);
    } catch (err) {
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
        const { idPersona, monto, tasaInteresMensual } = req.body;
        const pool = await poolPromise;

        await pool.request()
            .input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), monto)
            .input('tasa', sql.Decimal(18, 2), tasaInteresMensual)
            .query(`
                INSERT INTO Prestamos (
                    ID_Persona, 
                    MontoPrestado, 
                    TasaInteres,     -- Nombre corregido según tu imagen
                    FechaInicio,     -- Nombre corregido según tu imagen
                    MontoPagado, 
                    SaldoActual, 
                    Estado
                ) 
                VALUES (
                    @idPersona, 
                    @monto, 
                    @tasa, 
                    GETDATE(), 
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
                -- 1. Total Ahorrado (Suma de todos los ahorros menos retiros)
                (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) as TotalAhorrado,

                -- 2. Capital Prestado (SUMA SOLO EL MONTO ORIGINAL de préstamos activos)
                -- Cambiamos SaldoActual por MontoPrestado para ignorar el interés
                (SELECT ISNULL(SUM(MontoPrestado), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,

                -- 3. Ganancias Brutas (Lo que ya se cobró de intereses)
                (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas
        `);
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error en reporte-general:", err);
        res.status(500).json({ TotalAhorrado: 0, CapitalPrestado: 0, GananciasBrutas: 0 });
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
                    TasaInteres,         -- Nombre real en tu DB
                    FechaInicio,         -- Nombre real en tu DB
                    -- Cálculo de días y de interés acumulado (100.0 y 30.0 para forzar decimales)
                    DATEDIFF(DAY, FechaInicio, GETDATE()) as DiasTranscurridos,
                    (MontoPrestado * (TasaInteres / 100.0 / 30.0) * DATEDIFF(DAY, FechaInicio, GETDATE())) as InteresAcumulado
                FROM Prestamos 
                WHERE ID_Persona = @id
            `);

        const prestamosCalculados = result.recordset.map(p => {
            // Aseguramos que los valores sean números para evitar el 'undefined'
            const capital = Number(p.MontoPrestado || 0);
            const interes = Number(p.InteresAcumulado || 0);
            const pagado = Number(p.MontoPagado || 0);
            
            const saldoActual = (capital + interes) - pagado;

            return {
                ID_Prestamo: p.ID_Prestamo,
                MontoPrestado: capital,
                MontoPagado: pagado,
                TasaInteres: p.TasaInteres, // Este es el que el frontend busca para el %
                FechaInicio: p.FechaInicio,
                DiasTranscurridos: p.DiasTranscurridos || 0,
                InteresGenerado: interes,    // Nombre que espera tu función renderPrestamos
                saldoHoy: saldoActual > 0 ? saldoActual : 0,
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
        
        // 1. Capturamos los datos
        const mesesParaSQL = req.body.MesesCorrespondientes || req.body.meses || "Abono General";
        const { idPersona, monto, tipoMovimiento, idPrestamo } = req.body;
        const m = parseFloat(monto);

        console.log("Servidor procesando:", { tipo: tipoMovimiento, detalle: mesesParaSQL });

        // --- CASO A: ES UNA DEUDA ---
        if (tipoMovimiento === 'deuda') {
            const pRes = await pool.request().input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, MontoPagado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            if (pRes.recordset.length > 0) {
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
            }
        } 
        // --- CASO B: ES UN AHORRO (CON VALIDACIÓN DE DUPLICADOS) ---
        else if (tipoMovimiento === 'ahorro') {
            
            // VALIDACIÓN: Si no es abono general, verificar si las quincenas ya existen
            if (mesesParaSQL !== "Abono General") {
                const checkRes = await pool.request()
                    .input('id', sql.Int, idPersona)
                    .query("SELECT MesesCorrespondientes FROM Ahorros WHERE ID_Persona = @id");

                const quincenasNuevas = mesesParaSQL.split(',').map(s => s.trim());
                let duplicadas = [];

                checkRes.recordset.forEach(reg => {
                    if (reg.MesesCorrespondientes) {
                        const existentes = reg.MesesCorrespondientes.split(',').map(s => s.trim());
                        quincenasNuevas.forEach(q => {
                            if (existentes.includes(q)) {
                                duplicadas.push(q);
                            }
                        });
                    }
                });

                if (duplicadas.length > 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Error: Las quincenas [${duplicadas.join(', ')}] ya fueron registradas anteriormente para este socio.` 
                    });
                }
            }

            // Si pasa la validación, procedemos al INSERT
            await pool.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18, 2), m)
                .input('txtMeses', sql.VarChar(sql.MAX), mesesParaSQL) 
                .query(`
                    INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) 
                    VALUES (@id, @m, GETDATE(), @txtMeses)
                `);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Error en servidor:", err.message);
        res.status(500).json({ success: false, error: err.message });
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

        // 1. Registrar el movimiento en el historial
        await transaction.request()
            .input('idPrestamo', sql.Int, idPrestamo)
            .input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), monto)
            .input('detalle', sql.VarChar, `Abono a ${tipo}`)
            .query(`INSERT INTO HistorialPagos (ID_Prestamo, ID_Persona, Monto, Fecha, Detalle) 
                    VALUES (@idPrestamo, @idPersona, @monto, GETDATE(), @detalle)`);

        // 2. Si es abono a CAPITAL, restamos del MontoPrestado inicial
        if (tipo === 'capital') {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18, 2), monto)
                .query(`UPDATE Prestamos 
                        SET MontoPrestado = MontoPrestado - @monto 
                        WHERE ID_Prestamo = @idPrestamo`);
        } 
        // 3. Si es a INTERES, lo sumamos a MontoPagado (para registro)
        else {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18, 2), monto)
                .query(`UPDATE Prestamos 
                        SET MontoPagado = MontoPagado + @monto 
                        WHERE ID_Prestamo = @idPrestamo`);
        }

        await transaction.commit();
        res.json({ success: true });

    } catch (err) {
        await transaction.rollback();
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
            -- Sumamos todos los ingresos (intereses, multas) y restamos egresos si los hay
            SELECT ISNULL(SUM(Monto), 0) as total 
            FROM Ganancias -- O como se llame tu tabla de utilidades
        `);
        res.json({ saldo: result.recordset[0].total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR UNIFICADO CORRIENDO EN PUERTO ${PORT}`);
});