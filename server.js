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
                           ISNULL(MesesCorrespondientes, 'No especificado') as Meses 
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
                    ID_Prestamo, MontoPrestado, TasaInteres, MontoInteres,
                    Cuotas, SaldoActual, Estado, Fecha,
                    FORMAT(Fecha, 'dd/MM/yyyy') as FechaPrestamo 
                FROM Prestamos 
                WHERE ID_Persona = @id 
                ORDER BY Fecha ASC
            `);
        
        // CORRECCIÓN MENOR: Enviamos result.recordset o un array vacío si es null
        res.json(result.recordset || []); 

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
        const { idPersona, monto, tipoMovimiento, MesesCorrespondientes } = req.body;
        
        // Log para ver qué llega exactamente a la terminal negra
        console.log("RECIBIDO EN SERVER:", MesesCorrespondientes);

        const pool = await poolPromise;
        
        // Aseguramos que no vaya vacío
        const valorFinal = (MesesCorrespondientes && MesesCorrespondientes.trim() !== "") 
                           ? MesesCorrespondientes 
                           : "Abono General";

        if (tipoMovimiento === 'ahorro') {
            await pool.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18,2), monto)
                .input('txtMeses', sql.VarChar(sql.MAX), valorFinal) // MAX para evitar recortes
                .query(`
                    INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) 
                    VALUES (@id, @m, GETDATE(), @txtMeses)
                `);
        }
        // Aquí podrías agregar el ELSE para 'deuda' si lo necesitas
        
        res.json({ success: true });
    } catch (err) {
        console.error("ERROR SQL:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR UNIFICADO CORRIENDO EN PUERTO ${PORT}`);
});