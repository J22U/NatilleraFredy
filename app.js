const express = require('express');
const path = require('path');
const { sql, poolPromise } = require('./db');

const app = express();

// 1. Configuraciones básicas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Servir archivos estáticos (CSS, JS, Imágenes)
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

// 3. RUTA DE LOGIN (POST) - Déjala aquí arriba
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

// Cuando alguien entre a la URL limpia (ej: natillera.onrender.com),
// lo mandamos SIEMPRE al login primero.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Esta ruta la usaremos para redireccionar después de que el login sea exitoso
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Por si alguien escribe /login manualmente
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// ... Aquí siguen todas tus rutas de base de datos (/reporte-general, etc.)

app.get('/reporte-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                -- 1. TOTAL AHORRADO (Caja Real): 
                -- Es todo el dinero que ha entrado por ahorros (neto) 
                -- MENOS el capital que está prestado actualmente ("en la calle").
                (
                    (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) - 
                    (SELECT ISNULL(SUM(MontoPrestado - (MontoPagado - InteresesPagados)), 0) FROM Prestamos WHERE Estado = 'Activo')
                ) as TotalAhorrado,

                -- 2. CAPITAL PRESTADO (Lo que nos deben):
                -- Solo el saldo de capital base que falta por cobrar (sin contar intereses).
                (SELECT ISNULL(SUM(MontoPrestado - (MontoPagado - InteresesPagados)), 0) 
                 FROM Prestamos 
                 WHERE Estado = 'Activo') as CapitalPrestado,
                
                -- 3. GANANCIAS BRUTAS (Utilidad):
                -- La suma de todos los intereses que ya han sido pagados efectivamente.
                (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas
        `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error("Error en reporte:", err);
        res.status(500).json({ TotalAhorrado: 0, CapitalPrestado: 0, GananciasBrutas: 0 });
    }
});

// 2. LISTAR MIEMBROS
app.get('/listar-miembros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                p.ID_Persona as id, 
                p.Nombre as nombre, 
                p.Documento as cedula, 
                CASE WHEN p.EsSocio = 1 THEN 'SOCIO' ELSE 'EXTERNO' END as tipo,
                -- ESTO ES LO QUE FALTABA: Sumar el saldo de todos sus préstamos
                ISNULL((
                    SELECT SUM(SaldoActual) 
                    FROM Prestamos 
                    WHERE ID_Persona = p.ID_Persona
                ), 0) as deudaTotal
            FROM Personas p
            ORDER BY p.ID_Persona DESC
        `);
        res.json(result.recordset);
    } catch (err) { 
        console.error(err);
        res.status(500).json([]); 
    }
});

// 3. REGISTRAR PRÉSTAMO
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

// 4. PROCESAR MOVIMIENTOS (AHORROS Y PAGOS)
app.post('/procesar-movimiento', async (req, res) => {
    try {
        const { idPersona, monto, tipoMovimiento, idPrestamo } = req.body;
        const pool = await poolPromise;
        const m = parseFloat(monto);

        if (tipoMovimiento === 'deuda') {
            // 1. OBTENEMOS EL ESTADO ACTUAL DEL PRÉSTAMO
            const prestamoReq = await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, MontoPagado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            const p = prestamoReq.recordset[0];
            const capitalOriginal = parseFloat(p.MontoPrestado);
            const pagadoAntes = parseFloat(p.MontoPagado || 0);

            // 2. LÓGICA DE GANANCIA REAL:
            // ¿Cuánto le faltaba para cubrir el capital?
            const faltanteCapital = capitalOriginal - pagadoAntes;
            let paraInteres = 0;

            if (faltanteCapital <= 0) {
                // Si ya pagó todo el capital, TODO el abono actual es ganancia (interés)
                paraInteres = m;
            } else if (m > faltanteCapital) {
                // Si el abono es mayor a lo que faltaba de capital, el sobrante es interés
                paraInteres = m - faltanteCapital;
            }

            // 3. ACTUALIZAR EL PRÉSTAMO
            // Sumamos el abono al MontoPagado y el excedente a InteresesPagados
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

            // 4. REGISTRAR EN EL HISTORIAL
            await pool.request()
                .input('idPers', sql.Int, idPersona)
                .input('idPre', sql.Int, idPrestamo)
                .input('monto', sql.Decimal(18,2), m)
                .query(`
                    INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento) 
                    VALUES (@idPers, @idPre, @monto, GETDATE(), 'Abono Deuda')
                `);
            
        } else if (tipoMovimiento === 'ahorro') {
            // ... (Tu lógica de ahorro se mantiene igual)
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

// 5. HISTORIALES PARA EL RESUMEN
app.get('/historial-ahorros/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.id)
            .query("SELECT Monto, FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada FROM Ahorros WHERE ID_Persona = @id ORDER BY Fecha DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
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
                    TasaInteres, -- <--- ESTA ES LA QUE FALTA
                    MontoInteres, 
                    SaldoActual, 
                    Estado, 
                    Cuotas,
                    FORMAT(Fecha, 'dd/MM/yyyy') as FechaPrestamo
                FROM Prestamos 
                WHERE ID_Persona = @id
                ORDER BY Fecha DESC -- Para que el más nuevo salga arriba
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
            .query(`SELECT 
                    (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros WHERE ID_Persona = @id) as totalAhorrado,
                    ISNULL((SELECT SUM(SaldoActual) FROM Prestamos WHERE ID_Persona = @id AND Estado = 'Activo'), 0) as deudaTotal`);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ totalAhorrado: 0, deudaTotal: 0 }); }
});

// 6. GUARDAR NUEVO MIEMBRO
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

// Agrega esta ruta que es la que pide el botón "Resumen"
app.get('/historial-abonos-deuda/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
        h.Monto as Monto_Abonado, 
        FORMAT(h.Fecha, 'dd/MM/yyyy') as FechaFormateada,
        (p.MontoPrestado + p.MontoInteres) as PrestamoRef -- Sumamos ambos para que sea el total
    FROM HistorialPagos h
    JOIN Prestamos p ON h.ID_Prestamo = p.ID_Prestamo
    WHERE h.ID_Persona = @id AND h.TipoMovimiento = 'Abono Deuda'
`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Ruta para obtener préstamos activos de un socio (para el selector)
// --- OBTENER SOLO PRÉSTAMOS ACTIVOS DE UN USUARIO ---
app.get('/prestamos-activos/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.idPersona)
            .query(`
                SELECT ID_Prestamo, 
                       SaldoActual as saldoAMostrar, -- <--- Nombre claro para el frente
                       SaldoActual, 
                       MontoPrestado 
                FROM Prestamos 
                WHERE ID_Persona = @id AND Estado = 'Activo'
            `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

// --- 7. ACTUALIZAR SOCIO ---
// --- ACTUALIZAR SOCIO ---
// Nota: Cambié la ruta a 'editar-socio' para que coincida con lo que busca tu frontend
app.post('/editar-socio/:id', async (req, res) => {
    try {
        const { nombre, cedula } = req.body; // Quitamos esSocio de aquí si no lo envías
        const { id } = req.params;
        const pool = await poolPromise;

        await pool.request()
            .input('id', sql.Int, id)
            .input('n', sql.VarChar, nombre)
            .input('d', sql.VarChar, cedula)
            .query(`
                UPDATE Personas 
                SET Nombre = @n, Documento = @d
                WHERE ID_Persona = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error("Error al editar:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});
// --- ELIMINAR SOCIO ---
// --- ELIMINAR SOCIO (POST) ---
app.post('/eliminar-socio', async (req, res) => {
    try {
        const { id } = req.body; // El servidor busca la propiedad "id"
        const pool = await poolPromise;
        
        await pool.request()
            .input('id', sql.Int, id)
            .query("DELETE FROM Personas WHERE ID_Persona = @id");
            
        res.json({ success: true });
    } catch (err) {
        console.error("Error al eliminar:", err.message);
        
        // Si el socio tiene préstamos o ahorros, SQL bloquea el borrado
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
            SELECT 
                -- Capital Real: Lo que la gente ahorró + TODO lo que ha entrado por pagos (Capital + Interés)
                (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + 
                (SELECT ISNULL(SUM(MontoPagado), 0) FROM Prestamos) as CapitalTotal,
                
                -- Ganancias Reales: Todos los intereses de los préstamos
                (SELECT ISNULL(SUM(MontoInteres), 0) FROM Prestamos) as Ganancias
        `);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).send(err.message); }
});

// RUTA DE LOGIN (Credenciales fijas)
app.post('/login', (req, res) => {
    const { user, pass } = req.body;
    
    // AQUÍ defines tu usuario y contraseña
    const USUARIO_MASTER = "admin";
    const CLAVE_MASTER = "natillera2026"; 

    if (user === USUARIO_MASTER && pass === CLAVE_MASTER) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Datos incorrectos" });
    }
});

app.post('/procesar-cruce', async (req, res) => {
    try {
        const { idPersona, idPrestamo, monto } = req.body;
        const pool = await poolPromise;
        const m = parseFloat(monto);
        
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // 1. Obtener datos del préstamo para saber cuánto es capital
            const pRes = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, MontoPagado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            const p = pRes.recordset[0];
            const capOriginal = parseFloat(p.MontoPrestado);
            const pagadoAntes = parseFloat(p.MontoPagado || 0);

            // 2. LÓGICA DE INTERÉS: ¿Cuánto de este pago es ganancia?
            const faltanteCap = capOriginal - pagadoAntes;
            let paraInteres = 0;

            if (faltanteCap <= 0) {
                paraInteres = m; // Todo es ganancia si ya pagó el capital
            } else if (m > faltanteCap) {
                paraInteres = m - faltanteCap; // El excedente es ganancia
            }

            // 3. Registrar el "retiro" de ahorros (Monto negativo)
            await transaction.request()
                .input('id', sql.Int, idPersona)
                .input('m', sql.Decimal(18,2), -m)
                .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha) VALUES (@id, @m, GETDATE())");

            // 4. Actualizar el préstamo sumando la ganancia
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR CORRIENDO EN PUERTO ${PORT}`);
});