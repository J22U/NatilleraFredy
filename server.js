const express = require('express');
const fs = require('fs');
const path = require('path');
const { sql, poolPromise } = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

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

// --- RUTAS DE RIFAS ---

// Obtener los datos de las rifas desde Rifas_Detalle
app.get('/api/cargar-rifas', async (req, res) => {
    try {
        const { fecha } = req.query;
        const pool = await poolPromise;
        
        let query;
        
        if (fecha) {
            query = `
                SELECT Id, TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla, FechaSorteo
                FROM Rifas_Detalle 
                WHERE FechaSorteo = @fechaBuscada
                ORDER BY Id, Numero
            `;
        } else {
            query = `
                SELECT Id, TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla, FechaSorteo
                FROM Rifas_Detalle 
                ORDER BY Id DESC
            `;
        }

        const result = await pool.request()
            .input('fechaBuscada', sql.Date, fecha || null)
            .query(query);

        if (result.recordset.length === 0) {
            res.json({ 
                sinDatos: true, 
                mensaje: "No hay rifa guardada",
                info: { nombre: '', premio: '', valor: '', fecha: fecha || '' }, 
                tabla1: { titulo: 'Tabla 1', participantes: {} }, 
                tabla2: { titulo: 'Tabla 2', participantes: {} }, 
                tabla3: { titulo: 'Tabla 3', participantes: {} }, 
                tabla4: { titulo: 'Tabla 4', participantes: {} }
            });
            return;
        }

        const datos = {
            info: { nombre: '', premio: '', valor: '', fecha: result.recordset[0].FechaSorteo || fecha || '' },
            tabla1: { titulo: 'Tabla 1', participantes: {} },
            tabla2: { titulo: 'Tabla 2', participantes: {} },
            tabla3: { titulo: 'Tabla 3', participantes: {} },
            tabla4: { titulo: 'Tabla 4', participantes: {} }
        };

        // Determinar cuántas tablas existen basadas en los IDs de registro
        // Si TablaId está vacío, usamos el Id del registro para dividir en grupos de 100
        const tieneTablaId = result.recordset.some(r => r.TablaId !== null && r.TablaId !== undefined);
        
        if (tieneTablaId) {
            // Usar TablaId como antes
            result.recordset.forEach(row => {
                const numTabla = parseInt(row.TablaId);
                const numStr = row.Numero ? row.Numero.trim() : '';
                const nombre = row.NombreParticipante || '';
                const estaPagado = row.EstadoPago === 1 || row.EstadoPago === true;
                const titulo = row.TituloTabla || 'Tabla ' + numTabla;

                if (numTabla >= 1 && numTabla <= 4 && numStr) {
                    const keyTabla = 'tabla' + numTabla;
                    
                    if (!datos[keyTabla].titulo || datos[keyTabla].titulo === 'Tabla ' + numTabla) {
                        datos[keyTabla].titulo = titulo;
                    }

                    if (nombre && nombre.trim() !== '') {
                        datos[keyTabla].participantes[numStr] = {
                            nombre: nombre.trim(),
                            pago: estaPagado
                        };
                    }
                }
            });
        } else {
            // TablaId está vacío - inferir tabla basándose en el Id del registro
            // Dividir los registros en grupos de 100 para asignar tablas
            const registrosOrdenados = [...result.recordset].sort((a, b) => a.Id - b.Id);
            
            registrosOrdenados.forEach((row, index) => {
                const numTabla = Math.floor(index / 100) + 1; // Primeros 100 = tabla 1, siguientes 100 = tabla 2, etc.
                const numStr = row.Numero ? row.Numero.trim() : '';
                const nombre = row.NombreParticipante || '';
                const estaPagado = row.EstadoPago === 1 || row.EstadoPago === true;
                const titulo = row.TituloTabla || 'Tabla ' + numTabla;

                if (numTabla >= 1 && numTabla <= 4 && numStr) {
                    const keyTabla = 'tabla' + numTabla;
                    
                    if (!datos[keyTabla].titulo || datos[keyTabla].titulo === 'Tabla ' + numTabla) {
                        datos[keyTabla].titulo = titulo;
                    }

                    if (nombre && nombre.trim() !== '') {
                        datos[keyTabla].participantes[numStr] = {
                            nombre: nombre.trim(),
                            pago: estaPagado
                        };
                    }
                }
            });
        }

        console.log("DATOS DESDE Rifas_Detalle:", datos);
        res.json(datos);

    } catch (err) {
        console.error("Error al leer:", err.message);
        res.status(500).json({ error: "Error: " + err.message });
    }
});

// Guardar rifa en Rifas_Detalle
app.post('/api/guardar-rifa', async (req, res) => {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    
    try {
        await transaction.begin();
        
        const nuevosDatos = req.body;
        console.log('Datos recibidos:', JSON.stringify(nuevosDatos).substring(0, 500));
        
        const fechaSorteo = nuevosDatos.info ? nuevosDatos.info.fecha : null;

        if (!fechaSorteo) {
            return res.status(400).json({ success: false, error: "La fecha es obligatoria" });
        }

        // Eliminar registros existentes para esa fecha
        await transaction.request()
            .input('fecha', sql.Date, fechaSorteo)
            .query("DELETE FROM Rifas_Detalle WHERE FechaSorteo = @fecha");

        // Insertar cada número como un registro separado
        for (let numTabla = 1; numTabla <= 4; numTabla++) {
            const keyTabla = 'tabla' + numTabla;
            const tablaData = nuevosDatos[keyTabla];
            
            if (tablaData && tablaData.participantes) {
                const titulo = tablaData.titulo || 'Tabla ' + numTabla;
                
                for (let num = 0; num <= 99; num++) {
                    const numStr = num.toString().padStart(2, '0');
                    const participante = tablaData.participantes[numStr];
                    
                    if (participante && participante.nombre && participante.nombre.trim() !== "") {
                        await transaction.request()
                            .input('fecha', sql.Date, fechaSorteo)
                            .input('tablaId', sql.BigInt, numTabla)
                            .input('numero', sql.Char(2), numStr)
                            .input('nombre', sql.VarChar(100), participante.nombre.trim())
                            .input('pago', sql.Bit, participante.pago ? 1 : 0)
                            .input('titulo', sql.VarChar(100), titulo)
                            .query(`
                                INSERT INTO Rifas_Detalle 
                                (FechaSorteo, TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla) 
                                VALUES (@fecha, @tablaId, @numero, @nombre, @pago, @titulo)
                            `);
                    }
                }
            }
        }

        await transaction.commit();
        console.log('Datos guardados correctamente en Rifas_Detalle');
        res.json({ success: true, message: "Guardado correctamente" });
        
    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("Error al guardar:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- OTRAS RUTAS ---

app.get('/api/socios-esfuerzo', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT P.ID_Persona as id, P.Nombre as nombre, P.Documento as documento, P.EsSocio,
            CASE WHEN P.EsSocio = 1 THEN 'SOCIO' ELSE 'EXTERNO' END as tipo,
            ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) as totalAhorrado
            FROM Personas P WHERE P.Estado = 'Activo'
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/guardar-miembro', async (req, res) => {
    try {
        const { nombre, cedula, esSocio } = req.body;
        if (!nombre || !cedula) return res.status(400).json({ success: false, error: "Faltan datos" });
        
        const pool = await poolPromise;
        await pool.request()
            .input('n', sql.VarChar, nombre).input('d', sql.VarChar, cedula).input('s', sql.Bit, esSocio)
            .query("INSERT INTO Personas (Nombre, Documento, EsSocio) VALUES (@n, @d, @s)");
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
});

app.post('/editar-socio', async (req, res) => {
    try {
        const { id, nombre, cedula, esSocio } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, id).input('nombre', sql.VarChar, nombre)
            .input('cedula', sql.VarChar, cedula).input('esSocio', sql.Int, esSocio)
            .query("UPDATE Personas SET Nombre = @nombre, Documento = @cedula, EsSocio = @esSocio WHERE ID_Persona = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/eliminar-socio', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, req.body.id)
            .query("DELETE FROM Personas WHERE ID_Persona = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: "No se puede eliminar" }); }
});

app.post('/registrar-prestamo-diario', async (req, res) => {
    try {
        const { idPersona, monto, tasaInteresMensual, fechaInicio } = req.body;
        const pool = await poolPromise;
        await pool.request()
            .input('idPersona', sql.Int, idPersona).input('monto', sql.Decimal(18, 2), monto)
            .input('tasa', sql.Decimal(18, 2), tasaInteresMensual).input('fechaInicio', sql.Date, fechaInicio)
            .query("INSERT INTO Prestamos (ID_Persona, MontoPrestado, TasaInteres, FechaInicio, MontoPagado, SaldoActual, Estado) VALUES (@idPersona, @monto, @tasa, @fechaInicio, 0, @monto, 'Activo')");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/retirar-ahorro', async (req, res) => {
    const { id, tipo, monto } = req.body;
    try {
        const pool = await poolPromise;
        const resultSaldo = await pool.request()
            .input('id', sql.Int, id)
            .query('SELECT ISNULL(SUM(Monto), 0) as SaldoTotal FROM Ahorros WHERE ID_Persona = @id');
        
        const saldoActual = resultSaldo.recordset[0].SaldoTotal;
        let montoARetirar = (tipo === 'total') ? saldoActual : parseFloat(monto);

        if (montoARetirar > saldoActual) return res.status(400).json({ success: false, message: "Saldo insuficiente" });
        if (montoARetirar <= 0) return res.status(400).json({ success: false, message: "Monto inválido" });

        await pool.request()
            .input('id', sql.Int, id).input('monto', sql.Decimal(18, 2), montoARetirar * -1)
            .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) VALUES (@id, @monto, GETDATE(), 'RETIRO DE AHORRO')");

        res.json({ success: true, message: 'Retiro procesado' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/reporte-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT 
                (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) as TotalAhorrado,
                (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,
                (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) as GananciasBrutas,
                ((SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + (SELECT ISNULL(SUM(InteresesPagados), 0) FROM Prestamos) - (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo')) as CajaDisponible
        `);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ TotalAhorrado: 0, CapitalPrestado: 0, GananciasBrutas: 0, CajaDisponible: 0 }); }
});

app.get('/estado-cuenta/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT (SELECT ISNULL(SUM(Monto), 0) FROM Ahorros WHERE ID_Persona = @id) as totalAhorrado, ISNULL((SELECT SUM(SaldoActual) FROM Prestamos WHERE ID_Persona = @id AND Estado = 'Activo'), 0) as deudaTotal");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ totalAhorrado: 0, deudaTotal: 0 }); }
});

app.get('/historial-ahorros/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT ROW_NUMBER() OVER (ORDER BY Fecha DESC) as RowNum, ID_Ahorro, Monto, FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada, ISNULL(MesesCorrespondientes, 'Abono General') as Detalle FROM Ahorros WHERE ID_Persona = @id ORDER BY Fecha DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

app.get('/historial-abonos-deuda/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT ID_Pago, Monto as Monto_Abonado, FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada, ID_Prestamo FROM HistorialPagos WHERE ID_Persona = @id AND TipoMovimiento = 'Abono Deuda' ORDER BY Fecha DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

app.get('/detalle-prestamo/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query("SELECT ID_Prestamo, MontoPrestado, MontoPagado, ISNULL(InteresesPagados, 0) as InteresesPagados, TasaInteres, FechaInicio FROM Prestamos WHERE ID_Persona = @id");
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cobro-general', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT p.ID_Persona, per.Nombre, SUM(p.SaldoActual) as TotalCapital FROM Prestamos p INNER JOIN Personas per ON p.ID_Persona = per.ID_Persona WHERE p.Estado = 'Activo' GROUP BY p.ID_Persona, per.Nombre");
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/procesar-movimiento', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { idPersona, monto, tipoMovimiento, idPrestamo, destinoAbono, MesesCorrespondientes, fechaManual } = req.body;
        
        const m = parseFloat(monto);
        if (isNaN(m) || m <= 0) return res.status(400).json({ success: false, error: "Monto inválido" });

        const mesesParaSQL = MesesCorrespondientes || "Abono General";
        const fAporte = fechaManual || new Date().toISOString().split('T')[0];

        if (tipoMovimiento === 'deuda') {
            if (destinoAbono === 'capital') {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m)
                    .query("UPDATE Prestamos SET MontoPagado = ISNULL(MontoPagado, 0) + @m, SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END, Estado = CASE WHEN (SaldoActual - @m) <= 0 THEN 'Pagado' ELSE 'Activo' END WHERE ID_Prestamo = @idP");
            } else {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m)
                    .query("UPDATE Prestamos SET InteresesPagados = ISNULL(InteresesPagados, 0) + @m WHERE ID_Prestamo = @idP");
            }
            
            await pool.request()
                .input('idPers', sql.Int, idPersona).input('idPre', sql.Int, idPrestamo)
                .input('m', sql.Decimal(18, 2), m).input('det', sql.VarChar, mesesParaSQL).input('fAporte', sql.Date, fAporte)
                .query("INSERT INTO HistorialPagos (ID_Persona, ID_Prestamo, Monto, Fecha, TipoMovimiento, Detalle) VALUES (@idPers, @idPre, @m, @fAporte, 'Abono Deuda', @det)");
        } else if (tipoMovimiento === 'ahorro') {
            await pool.request()
                .input('id', sql.Int, idPersona).input('m', sql.Decimal(18, 2), m).input('txtMeses', sql.VarChar(sql.MAX), mesesParaSQL).input('fAporte', sql.Date, fAporte)
                .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha, FechaAporte, MesesCorrespondientes) VALUES (@id, @m, @fAporte, @fAporte, @txtMeses)");
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/quincenas-pagas/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.idPersona).query("SELECT MesesCorrespondientes FROM Ahorros WHERE ID_Persona = @id");
        let pagas = [];
        result.recordset.forEach(reg => { if (reg.MesesCorrespondientes) { const lista = reg.MesesCorrespondientes.split(',').map(s => s.trim());argas =argas.concat(lista); } });
        res.json(pagas);
    } catch (err) { res.status(500).json([]); }
});

app.post('/registrar-abono-dinamico', async (req, res) => {
    const { idPrestamo, idPersona, monto, tipo } = req.body;
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();
        const m = parseFloat(monto);

        await transaction.request()
            .input('idPrestamo', sql.Int, idPrestamo).input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), m).input('detalle', sql.VarChar, 'Abono a ' + tipo.toUpperCase())
            .query("INSERT INTO HistorialPagos (ID_Prestamo, ID_Persona, Monto, Fecha, Detalle, TipoMovimiento) VALUES (@idPrestamo, @idPersona, @monto, GETDATE(), @detalle, 'Abono Deuda')");

        if (tipo === 'capital') {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo).input('monto', sql.Decimal(18, 2), m)
                .query("UPDATE Prestamos SET MontoPagado = MontoPagado + @monto, SaldoActual = CASE WHEN (SaldoActual - @monto) < 0 THEN 0 ELSE SaldoActual - @monto END, Estado = CASE WHEN (SaldoActual - @monto) <= 0 THEN 'Pagado' ELSE 'Activo' END WHERE ID_Prestamo = @idPrestamo");
        } else {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo).input('monto', sql.Decimal(18, 2), m)
                .query("UPDATE Prestamos SET InteresesPagados = InteresesPagados + @monto WHERE ID_Prestamo = @idPrestamo");
        }

        await transaction.commit();
        res.json({ success: true });
    } catch (err) {
        if (transaction) await transaction.rollback();
        res.status(500).json({ error: err.message });
    }
});

app.post('/cambiar-estado-socio', async (req, res) => {
    try {
        const { id, nuevoEstado } = req.body;
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, id).input('estado', sql.VarChar, nuevoEstado).query("UPDATE Personas SET Estado = @estado WHERE ID_Persona = @id");
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/listar-inactivos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT ID_Persona as id, Nombre as nombre FROM Personas WHERE Estado = 'Inactivo'");
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ganancias-disponibles', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT ISNULL(SUM(InteresesPagados), 0) as saldo FROM Prestamos");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/caja-disponible', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT ((SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + (SELECT ISNULL(SUM(Monto), 0) FROM HistorialGanancias)) - (SELECT ISNULL(SUM(MontoPrestado - MontoPagado), 0) FROM Prestamos WHERE Estado = 'Activo') as total");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ total: 0 }); }
});

app.get('/api/total-ahorros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT ISNULL(SUM(Monto), 0) as total FROM Ahorros");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ total: 0 }); }
});

app.get('/api/total-prestamos', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT ISNULL(SUM(MontoPrestado - MontoPagado), 0) as total FROM Prestamos WHERE Estado = 'Activo'");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ total: 0 }); }
});

app.get('/listar-miembros', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT per.ID_Persona as id, per.Nombre as nombre, per.Documento as documento FROM Personas per");
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: "Error al obtener miembros" }); }
});

app.get('/api/prestamos-activos/:idPersona', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.idPersona)
            .query("SELECT ID_Prestamo, SaldoActual, FechaInicio as Fecha FROM Prestamos WHERE ID_Persona = @id AND Estado = 'Activo'");
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: "Error interno" }); }
});

app.put('/api/editar-ahorro', async (req, res) => {
    try {
        const { idAhorro, monto, fecha, MesesCorrespondientes, idPersona } = req.body;
        if (!idAhorro || !monto || !idPersona) return res.status(400).json({ success: false, error: "Faltan datos" });

        const pool = await poolPromise;
        const rowNum = parseInt(idAhorro);
        const ahorroReal = await pool.request()
            .input('idPersona', sql.Int, idPersona).input('rowNum', sql.Int, rowNum)
            .query("SELECT ID_Ahorro FROM (SELECT ID_Ahorro, ROW_NUMBER() OVER (ORDER BY Fecha DESC) as RowNum FROM Ahorros WHERE ID_Persona = @idPersona) t WHERE RowNum = @rowNum");

        if (ahorroReal.recordset.length === 0) return res.status(404).json({ success: false, error: "Ahorro no encontrado" });

        const realIdAhorro = ahorroReal.recordset[0].ID_Ahorro;
        await pool.request()
            .input('id', sql.Int, realIdAhorro).input('monto', sql.Decimal(18, 2), parseFloat(monto))
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('meses', sql.VarChar(sql.MAX), MesesCorrespondientes || 'Abono General')
            .query("UPDATE Ahorros SET Monto = @monto, Fecha = @fecha, FechaAporte = @fecha, MesesCorrespondientes = @meses WHERE ID_Ahorro = @id");

        res.json({ success: true, message: "Ahorro actualizado" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/detalle-ahorro/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.id)
            .query("SELECT ID_Ahorro, ID_Persona, Monto, FORMAT(Fecha, 'yyyy-MM-dd') as Fecha, ISNULL(MesesCorrespondientes, 'Abono General') as MesesCorrespondientes FROM Ahorros WHERE ID_Ahorro = @id");
        if (result.recordset.length > 0) res.json(result.recordset[0]);
        else res.status(404).json({ error: "No encontrado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/editar-prestamo', async (req, res) => {
    try {
        const { idPrestamo, monto, tasaInteres, fecha, fechaInteres } = req.body;
        if (!idPrestamo || !monto) return res.status(400).json({ success: false, error: "Faltan datos" });

        const pool = await poolPromise;
        const tasaNueva = tasaInteres ? parseFloat(tasaInteres) : 0;
        const interesNuevo = parseFloat(monto) * (tasaNueva / 100);
        const nuevoSaldo = parseFloat(monto) + interesNuevo;

        await pool.request()
            .input('id', sql.Int, idPrestamo).input('monto', sql.Decimal(18, 2), parseFloat(monto))
            .input('tasa', sql.Decimal(5, 2), tasaNueva).input('interes', sql.Decimal(18, 2), interesNuevo)
            .input('saldo', sql.Decimal(18, 2), nuevoSaldo)
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('fechaInteres', sql.Date, fechaInteres || null)
            .query("UPDATE Prestamos SET MontoPrestado = @monto, TasaInteres = @tasa, MontoInteres = @interes, SaldoActual = @saldo, FechaInicio = @fecha, FechaInteres = @fechaInteres WHERE ID_Prestamo = @id");

        res.json({ success: true, message: "Préstamo actualizado" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/detalle-pago/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().input('id', sql.Int, req.params.id)
            .query("SELECT ID_Pago, ID_Persona, ID_Prestamo, Monto, FORMAT(Fecha, 'yyyy-MM-dd') as Fecha, ISNULL(Detalle, 'Abono a deuda') as Detalle, TipoMovimiento FROM HistorialPagos WHERE ID_Pago = @id");
        if (result.recordset.length > 0) res.json(result.recordset[0]);
        else res.status(404).json({ error: "No encontrado" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/editar-pago-deuda', async (req, res) => {
    try {
        const { idPago, monto, fecha, detalle, idPrestamo, montoAnterior } = req.body;
        if (!idPago || !monto || !idPrestamo) return res.status(400).json({ success: false, error: "Faltan datos" });

        const pool = await poolPromise;
        const montoNuevo = parseFloat(monto);
        const montoAnt = montoAnterior ? parseFloat(montoAnterior) : 0;
        const diferencia = montoNuevo - montoAnt;

        await pool.request()
            .input('id', sql.Int, idPago).input('monto', sql.Decimal(18, 2), montoNuevo)
            .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
            .input('detalle', sql.VarChar, detalle || 'Abono a deuda')
            .query("UPDATE HistorialPagos SET Monto = @monto, Fecha = @fecha, Detalle = @detalle WHERE ID_Pago = @id");

        const esCapital = String(detalle || '').toLowerCase().includes('capital');
        
        if (diferencia !== 0) {
            if (esCapital) {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('dif', sql.Decimal(18, 2), diferencia)
                    .query("UPDATE Prestamos SET MontoPagado = ISNULL(MontoPagado, 0) + @dif, SaldoActual = CASE WHEN (SaldoActual - @dif) < 0 THEN 0 ELSE SaldoActual - @dif END, Estado = CASE WHEN (SaldoActual - @dif) <= 0 THEN 'Pagado' ELSE 'Activo' END WHERE ID_Prestamo = @idP");
            } else {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('dif', sql.Decimal(18, 2), diferencia)
                    .query("UPDATE Prestamos SET InteresesPagados = ISNULL(InteresesPagados, 0) + @dif WHERE ID_Prestamo = @idP");
            }
        }

        res.json({ success: true, message: "Pago actualizado" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('SERVIDOR CORRIENDO EN PUERTO ' + PORT);
});
