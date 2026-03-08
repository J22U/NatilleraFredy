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
        // Usar la fecha directamente del query string sin normalización problemática
        // El frontend ya envía la fecha en formato YYYY-MM-DD
        let fecha = req.query.fecha;
        
        const pool = await poolPromise;
        
        console.log('🔍 DEBUG cargar-rifas - Fecha recibida del frontend:', fecha);
        
        let query;
        
        if (fecha) {
            query = `
                SELECT Id, TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla, FechaSorteo
                FROM Rifas_Detalle 
                WHERE CONVERT(VARCHAR(10), FechaSorteo, 120) = @fechaBuscada
                ORDER BY TablaId, Numero
            `;
        } else {
            query = `
                SELECT Id, TablaId, Numero, NombreParticipante, EstadoPago, TituloTabla, FechaSorteo
                FROM Rifas_Detalle 
                ORDER BY FechaSorteo DESC, TablaId, Numero
            `;
        }

        console.log('🔍 DEBUG cargar-rifas - Query a ejecutar:', query);
        
        const result = await pool.request()
            .input('fechaBuscada', sql.VarChar(10), fecha || null)
            .query(query);

        console.log('🔍 DEBUG cargar-rifas - Registros encontrados:', result.recordset.length);
        
        if (result.recordset.length === 0) {
            res.json({ 
                sinDatos: true, 
                mensaje: "No hay rifa guardada",
                info: { nombre: '', premio: '', valor: '', fecha: req.query.fecha || '', inversion: '' },
                tabla1: { titulo: 'Tabla 1', participantes: {} },
                tabla2: { titulo: 'Tabla 2', participantes: {} },
                tabla3: { titulo: 'Tabla 3', participantes: {} },
                tabla4: { titulo: 'Tabla 4', participantes: {} }
            });
            return;
        }

        // Ver las fechas que existen en la base de datos
        const fechasExistentes = await pool.request().query('SELECT DISTINCT TOP 5 FechaSorteo FROM Rifas_Detalle ORDER BY FechaSorteo DESC');
        console.log('🔍 DEBUG cargar-rifas - Fechas en BD:', fechasExistentes.recordset.map(r => r.FechaSorteo));

        // Consultar también Rifas_Info para obtener la información de la rifa
        let infoRifa = { nombre: '', premio: '', valor: '', fecha: req.query.fecha || '', inversion: '' };
        try {
            const infoResult = await pool.request()
                .input('fechaBuscada', sql.Date, fecha || null)
                .query("SELECT NombreRifa, Premio, ValorPuesto, CostoPremio, Premios FROM Rifas_Info WHERE FechaSorteo = @fechaBuscada");
            
            if (infoResult.recordset.length > 0) {
                const r = infoResult.recordset[0];
                infoRifa = {
                    nombre: r.NombreRifa || '',
                    premio: r.Premo || r.Premio || '',
                    valor: r.ValorPuesto || '',
                    fecha: fecha || '',
                    inversion: r.CostoPremio || ''
                };
                // Intentar parsear Premios si existe
                if (r.Premios) {
                    try {
                        infoRifa.premios = JSON.parse(r.Premios);
                    } catch(e) {}
                }
            }
        } catch(errInfo) {
            console.log("Error al cargar info de rifa:", errInfo.message);
        }

        const datos = {
            info: infoRifa,
            tabla1: { titulo: 'Tabla 1', participantes: {} },
            tabla2: { titulo: 'Tabla 2', participantes: {} },
            tabla3: { titulo: 'Tabla 3', participantes: {} },
            tabla4: { titulo: 'Tabla 4', participantes: {} }
        };

        // Determinar si TablaId tiene valores
        const tieneTablaId = result.recordset.some(r => r.TablaId !== null && r.TablaId !== undefined);
        
        if (tieneTablaId) {
            // Usar TablaId del registro
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
            // TablaId vacío - los registros ya vienen filtrados por fecha, solo ordenarlos
            const registrosOrdenados = [...result.recordset].sort((a, b) => a.Id - b.Id);
            
            registrosOrdenados.forEach((row, index) => {
                const numTabla = Math.floor(index / 100) + 1;
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
    let transaction;
    
    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);
        await transaction.begin();
        
        const nuevosDatos = req.body;
        console.log('Datos recibidos:', JSON.stringify(nuevosDatos).substring(0, 500));
        
        const fechaSorteo = nuevosDatos.info ? nuevosDatos.info.fecha : null;

        if (!fechaSorteo) {
            if (transaction) await transaction.rollback();
            return res.status(400).json({ success: false, error: "La fecha es obligatoria" });
        }

        // Usar la fecha directamente para evitar problemas de zona horaria
        const fechaParaSQL = fechaSorteo;
        
        console.log('🔍 DEBUG - Fecha guardando rifa:', fechaParaSQL);

        // Eliminar TODOS los registros existentes de Rifas_Detalle para esta fecha específica
        await transaction.request()
            .input('fecha', sql.Date, fechaParaSQL)
            .query("DELETE FROM Rifas_Detalle WHERE FechaSorteo = @fecha");
        
        console.log('🗑️ Datos anteriores eliminados');
        
        // Insertar los nuevos participantes
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
                            .input('fecha', sql.Date, fechaParaSQL)
                            .input('tablaId', sql.Int, numTabla)
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
        console.log('✅ Datos guardados en Rifas_Detalle');
        
        // Guardar información de la rifa en Rifas_Info
        const pool2 = await poolPromise;
        const info = nuevosDatos.info || {};
        const premiosString = info.premios ? JSON.stringify(info.premios) : null;
        
        // Eliminar info anterior de esta fecha y insertar nueva
        await pool2.request()
            .input('fecha', sql.Date, fechaParaSQL)
            .query("DELETE FROM Rifas_Info WHERE FechaSorteo = @fecha");
        
        await pool2.request()
            .input('fecha', sql.Date, fechaParaSQL)
            .input('nombre', sql.VarChar(200), info.nombre || '')
            .input('premio', sql.VarChar(200), info.premio || '')
            .input('valorPuesto', sql.Decimal(18,2), parseFloat(info.valor) || 0)
            .input('costoPremio', sql.Decimal(18,2), parseFloat(info.inversion) || 0)
            .input('premios', sql.NVARCHAR(sql.MAX), premiosString)
            .query(`
                INSERT INTO Rifas_Info (FechaSorteo, NombreRifa, Premio, ValorPuesto, CostoPremio, Premios)
                VALUES (@fecha, @nombre, @premio, @valorPuesto, @costoPremio, @premios)
            `);
        
        console.log('✅ Información de rifa guardada en Rifas_Info');
        res.json({ success: true, message: "Guardado correctamente" });
        
    } catch (err) {
        console.error("❌ Error al guardar:", err.message);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rbError) {
                console.error("Error en rollback:", rbError.message);
            }
        }
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
            .query("INSERT INTO Prestamos (ID_Persona, MontoPrestado, TasaInteres, FechaInicio, MontoPagado, SaldoActual, Estado, InteresesPagados) VALUES (@idPersona, @monto, @tasa, @fechaInicio, 0, @monto, 'Activo', 0)");
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
                -- Solo préstamos ACTIVOS (no los pagados/completados)
                (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo') as CapitalPrestado,
                -- Solo intereses de préstamos ACTIVOS (blindado para que no sea negativo)
                (SELECT ISNULL(SUM(CASE WHEN InteresesPagados < 0 THEN 0 ELSE InteresesPagados END), 0) FROM Prestamos WHERE Estado = 'Activo') as GananciasBrutas,
                -- Caja: Ahorros + Ganancias (blindadas) - Capital Préstamos Activos
                ((SELECT ISNULL(SUM(Monto), 0) FROM Ahorros) + (SELECT ISNULL(SUM(CASE WHEN InteresesPagados < 0 THEN 0 ELSE InteresesPagados END), 0) FROM Prestamos WHERE Estado = 'Activo') - (SELECT ISNULL(SUM(SaldoActual), 0) FROM Prestamos WHERE Estado = 'Activo')) as CajaDisponible
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
            .query("SELECT ID_Pago, Monto as Monto_Abonado, FORMAT(Fecha, 'dd/MM/yyyy') as FechaFormateada, ID_Prestamo, ISNULL(Detalle, '') as Detalle FROM HistorialPagos WHERE ID_Persona = @id AND TipoMovimiento = 'Abono Deuda' ORDER BY Fecha DESC");
        res.json(result.recordset);
    } catch (err) { res.status(500).json([]); }
});

app.get('/detalle-prestamo/:id', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Primero, obtener los datos actuales del préstamo para calcular y actualizar el interés anticipado usado
        const prestamosData = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Prestamo, 
                    MontoPrestado, 
                    ISNULL(MontoPagado, 0) as MontoPagado, 
                    ISNULL(InteresesPagados, 0) as InteresesPagados, 
                    ISNULL(InteresAnticipado, 0) as InteresAnticipado,
                    ISNULL(InteresAnticipadoUsado, 0) as InteresAnticipadoUsado,
                    TasaInteres, 
                    ISNULL(FechaInicio, Fecha) as FechaInicio,
                    ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)) as FechaUltimoAbonoCapital,
                    DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE()) as DiasTranscurridos
                FROM Prestamos 
                WHERE ID_Persona = @id AND Estado = 'Activo'
            `);

        // Procesar cada préstamo para calcular el interés anticipado consumido automáticamente
        for (const p of prestamosData.recordset) {
            const capitalPendiente = p.MontoPrestado - p.MontoPagado;
            const interesGenerado = ((capitalPendiente * p.TasaInteres / 100.0) / 30.0) * p.DiasTranscurridos;
            
            // Calcular cuánto del interés anticipado debe consumirse automáticamente
            // El anticipado disponible es: InteresAnticipado - InteresAnticipadoUsado
            const anticipadoDisponible = Math.max(0, p.InteresAnticipado - p.InteresAnticipadoUsado);
            
            // Cuánto interés se ha pagado (regular + lo que ya se usó del anticipado)
            const interesesYaPagados = p.InteresesPagados + p.InteresAnticipadoUsado;
            
            // Cuánto interés pendiente hay actualmente
            const interesPendiente = Math.max(0, interesGenerado - interesesYaPagados);
            
            // Nuevo consumo = cuánto del anticipado disponible se necesita para cubrir el interés pendiente
            let nuevoConsumo = 0;
            if (anticipadoDisponible > 0 && interesPendiente > 0) {
                nuevoConsumo = Math.min(anticipadoDisponible, interesPendiente);
            }
            
            // Solo actualizar si hay un nuevo consumo
            if (nuevoConsumo > 0) {
                const nuevoUsado = p.InteresAnticipadoUsado + nuevoConsumo;
                await pool.request()
                    .input('idP', sql.Int, p.ID_Prestamo)
                    .input('usado', sql.Decimal(18, 2), nuevoUsado)
                    .query("UPDATE Prestamos SET InteresAnticipadoUsado = @usado WHERE ID_Prestamo = @idP");
                
                console.log(`>>> Auto-consumo de anticipado: Préstamo #${p.ID_Prestamo}, Consumido: $${nuevoConsumo.toLocaleString()}`);
            }
        }

        // Ahora obtener los datos actualizados para enviar al frontend
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    ID_Prestamo, 
                    MontoPrestado, 
                    ISNULL(MontoPagado, 0) as MontoPagado, 
                    ISNULL(InteresesPagados, 0) as InteresesPagados, 
                    ISNULL(InteresAnticipado, 0) as InteresAnticipado,
                    ISNULL(InteresAnticipadoUsado, 0) as InteresAnticipadoUsado,
                    TasaInteres, 
                    ISNULL(FechaInicio, Fecha) as FechaInicio,
                    ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)) as FechaUltimoAbonoCapital,
                    ISNULL(FechaInicio, Fecha) as FechaPrestamo,
                    FORMAT(ISNULL(FechaInicio, Fecha), 'dd/MM/yyyy') as FechaInicioFormateada,
                    SaldoActual,
                    Estado,
                    DATEDIFF(DAY, ISNULL(FechaInicio, Fecha), GETDATE()) as DiasTranscurridos,
                    
                    -- 1. Interés generado TOTAL desde que empezó el préstamo (o desde el último abono a capital)
                    -- (Calculado sobre el capital que se debe hoy, desde FechaUltimoAbonoCapital)
                    ((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE()) as InteresGenerado,
                    
                    -- 2. Interés pendiente = MAX(0, Interés Generado - Intereses Pagados - Interés Anticipado Usado)
                    -- Aquí YA NO reste InteresAnticipado directamente, ahora reste InteresAnticipadoUsado
                    CASE 
                        WHEN (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE())) - ISNULL(InteresAnticipadoUsado, 0) - ISNULL(InteresesPagados, 0) < 0 THEN 0
                        ELSE (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE())) - ISNULL(InteresAnticipadoUsado, 0) - ISNULL(InteresesPagados, 0)
                    END as InteresPendiente,
                    
                    -- 3. Saldo total hoy (Capital Pendiente + Interés Pendiente)
                    (MontoPrestado - ISNULL(MontoPagado, 0)) + 
                    CASE 
                        WHEN (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE())) - ISNULL(InteresAnticipadoUsado, 0) - ISNULL(InteresesPagados, 0) < 0 THEN 0
                        ELSE (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE())) - ISNULL(InteresAnticipadoUsado, 0) - ISNULL(InteresesPagados, 0)
                    END as saldoHoy,
                    
                    MontoPrestado - ISNULL(MontoPagado, 0) as capitalHoy
                FROM Prestamos 
                WHERE ID_Persona = @id 
                ORDER BY ISNULL(FechaInicio, Fecha) DESC
            `);
        res.json(result.recordset);
    } catch (err) { 
        console.error("Error en detalle-prestamo:", err.message);
        res.status(500).json({ error: err.message }); 
    }
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
            // DEBUG: Log para ver qué valores llegan
            console.log("DEBUG procesar-movimiento:", {
                idPersona, monto: m, tipoMovimiento, idPrestamo, destinoAbono, MesesCorrespondientes
            });
            
            // OBTENER DATOS ACTUALES DEL PRÉSTAMO PARA VALIDAR
            const prestamoActual = await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT 
                        MontoPrestado, 
                        ISNULL(MontoPagado, 0) as MontoPagado, 
                        ISNULL(InteresesPagados, 0) as InteresesPagados,
                        DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE()) as DiasTranscurridos,
                        TasaInteres
                    FROM Prestamos 
                    WHERE ID_Prestamo = @idP
                `);

            if (prestamoActual.recordset.length === 0) {
                return res.status(400).json({ success: false, error: "Préstamo no encontrado" });
            }

            const p = prestamoActual.recordset[0];
            const capitalPendiente = p.MontoPrestado - p.MontoPagado;
            // Calcular interés pendiente actual
            const interesPendiente = Math.max(0, ((capitalPendiente * p.TasaInteres / 100.0) / 30.0) * p.DiasTranscurridos - p.InteresesPagados);
            
            // Validar explícitamente el destino del abono
            if (destinoAbono === 'capital') {
                console.log(">>> Abono a CAPITAL");
                
                // VALIDACIÓN: No puede abonar más de lo que debe a capital
                if (m > capitalPendiente) {
                    return res.status(400).json({ success: false, error: `No puede abonar más de $${capitalPendiente.toLocaleString()} (capital pendiente)` });
                }
                
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m).input('fAporte', sql.Date, fAporte)
                    .query("UPDATE Prestamos SET MontoPagado = ISNULL(MontoPagado, 0) + @m, SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END, Estado = CASE WHEN (SaldoActual - @m) <= 0 THEN 'Pagado' ELSE 'Activo' END, FechaUltimoAbonoCapital = @fAporte WHERE ID_Prestamo = @idP");
            } else if (destinoAbono === 'interes') {
                // Abono a INTERÉS: se suma a InteresesPagados (el saldo total se recalcula dinámicamente)
                console.log(">>> Abono a INTERÉS");
                
                // VALIDACIÓN: No puede abonar más de lo que hay generado de interés
                if (m > interesPendiente + 100) { // Margen de 100 por redondeo
                    return res.status(400).json({ success: false, error: `No puede abonar más de $${Math.round(interesPendiente).toLocaleString()} (interés pendiente actual)` });
                }
                
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m)
                    .query("UPDATE Prestamos SET InteresesPagados = ISNULL(InteresesPagados, 0) + @m WHERE ID_Prestamo = @idP");
            } else if (destinoAbono === 'interesAnticipado') {
                // Abono a INTERÉS ANTICIPADO: se suma a InteresAnticipado (adelanto de intereses)
                console.log(">>> Abono a INTERÉS ANTICIPADO (ADELANTO)");
                
                // Para interés anticipado, permitimos un monto más flexible (no validamos contra interés pendiente)
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m)
                    .query("UPDATE Prestamos SET InteresAnticipado = ISNULL(InteresAnticipado, 0) + @m WHERE ID_Prestamo = @idP");
            } else {
                // Si destinoAbono es undefined, null o cualquier otro valor -> SE TRATA COMO INTERÉS (sin tocar el SaldoActual)
                console.log(">>> Abono a INTERÉS (default)", destinoAbono);
                
                // VALIDACIÓN: No puede abonar más de lo que hay generado de interés
                if (m > interesPendiente + 100) { // Margen de 100 por redondeo
                    return res.status(400).json({ success: false, error: `No puede abonar más de $${Math.round(interesPendiente).toLocaleString()} (interés pendiente actual)` });
                }
                
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
        const fechaActual = new Date().toISOString().split('T')[0];

        await transaction.request()
            .input('idPrestamo', sql.Int, idPrestamo).input('idPersona', sql.Int, idPersona)
            .input('monto', sql.Decimal(18, 2), m).input('detalle', sql.VarChar, 'Abono a ' + tipo.toUpperCase())
            .query("INSERT INTO HistorialPagos (ID_Prestamo, ID_Persona, Monto, Fecha, Detalle, TipoMovimiento) VALUES (@idPrestamo, @idPersona, @monto, GETDATE(), @detalle, 'Abono Deuda')");

        if (tipo === 'capital') {
            await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo).input('monto', sql.Decimal(18, 2), m).input('fecha', sql.Date, fechaActual)
                .query("UPDATE Prestamos SET MontoPagado = MontoPagado + @monto, SaldoActual = CASE WHEN (SaldoActual - @monto) < 0 THEN 0 ELSE SaldoActual - @monto END, Estado = CASE WHEN (SaldoActual - @monto) <= 0 THEN 'Pagado' ELSE 'Activo' END, FechaUltimoAbonoCapital = @fecha WHERE ID_Prestamo = @idPrestamo");
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
        // Consulta mejorada: calcula saldoPendiente igual que saldoHoy en detalle-prestamo
        // Ahora usa InteresAnticipadoUsado (consumido) en lugar de InteresAnticipado
        const result = await pool.request().query(`
            SELECT 
                per.ID_Persona as id, 
                per.Nombre as nombre, 
                per.Documento as documento,
                ISNULL((
                    -- Calcular saldo total: capital pendiente + intereses generados - intereses pagados - interes anticipado USADO
                    SELECT SUM(
                        (ISNULL(p.MontoPrestado, 0) - ISNULL(p.MontoPagado, 0)) + 
                        -- Interés generado desde el último abono a capital
                        CASE 
                            WHEN p.TasaInteres IS NOT NULL AND p.TasaInteres > 0 THEN
                                ((ISNULL(p.MontoPrestado, 0) - ISNULL(p.MontoPagado, 0)) * (p.TasaInteres / 100.0) / 30.0) * 
                                DATEDIFF(DAY, ISNULL(p.FechaUltimoAbonoCapital, ISNULL(p.FechaInicio, GETDATE())), GETDATE())
                            ELSE 0
                        END
                        - ISNULL(p.InteresesPagados, 0)
                        - ISNULL(p.InteresAnticipadoUsado, 0)
                    )
                    FROM Prestamos p 
                    WHERE p.ID_Persona = per.ID_Persona AND p.Estado = 'Activo'
                ), 0) as saldoPendiente
            FROM Personas per
        `);
        res.json(result.recordset);
    } catch (err) { 
        console.error("Error en /listar-miembros:", err.message);
        res.status(500).json({ error: "Error al obtener miembros" }); 
    }
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

// Función helper para normalizar texto (eliminar acentos y convertir a minúsculas)
function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Función helper para determinar si el detalle es "capital" o "interés"
function esTipoCapital(detalle) {
    if (!detalle) return false;
    const normalized = normalizeText(detalle);
    return normalized.includes('capital');
}

app.put('/api/editar-pago-deuda', async (req, res) => {
    try {
        const { idPago, monto, fecha, detalle, idPrestamo } = req.body;
        
        if (!idPago || !monto || !idPrestamo) {
            return res.status(400).json({ success: false, error: "Faltan datos" });
        }

        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);

        try {
            await transaction.begin();

            // 1. Actualizar el registro del pago en el historial
            await transaction.request()
                .input('id', sql.Int, idPago)
                .input('monto', sql.Decimal(18, 2), parseFloat(monto))
                .input('fecha', sql.Date, fecha || new Date().toISOString().split('T')[0])
                .input('detalle', sql.VarChar, detalle || 'Abono a deuda')
                .query("UPDATE HistorialPagos SET Monto = @monto, Fecha = @fecha, Detalle = @detalle WHERE ID_Pago = @id");

            // 2. SINCRONIZACIÓN TOTAL: Sumar TODO el historial del préstamo
            // Manejamos acentos en SQL Server reemplazando caracteres manualmente
            
            // Sumar abonos a INTERÉS REGULAR (contiene 'interes' pero NO 'anticipado' y NO 'capital')
            const resInteres = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as total 
                    FROM HistorialPagos 
                    WHERE ID_Prestamo = @idP 
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) LIKE '%interes%'
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) NOT LIKE '%anticipado%'
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) NOT LIKE '%capital%'
                `);
            
            // Sumar abonos a INTERÉS ANTICIPADO (contiene 'anticipado')
            const resInteresAnticipado = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as total 
                    FROM HistorialPagos 
                    WHERE ID_Prestamo = @idP 
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) LIKE '%anticipado%'
                `);
            
            // Sumar abonos a CAPITAL (contiene 'capital')
            const resCapital = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as total 
                    FROM HistorialPagos 
                    WHERE ID_Prestamo = @idP 
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) LIKE '%capital%'
                `);

            const totalInteres = parseFloat(resInteres.recordset[0]?.total || 0);
            const totalInteresAnticipado = parseFloat(resInteresAnticipado.recordset[0]?.total || 0);
            const totalCapital = parseFloat(resCapital.recordset[0]?.total || 0);

            console.log("DEBUG sincronizacion total:", {
                idPrestamo,
                totalInteres,
                totalCapital
            });

            // 3. Obtener el monto prestado original para calcular el saldo
            const resPrestamo = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            const montoPrestado = parseFloat(resPrestamo.recordset[0]?.MontoPrestado || 0);
            const nuevoSaldo = Math.max(0, montoPrestado - totalCapital);

            // 4. Actualizar el préstamo con los totales recalculados
            await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .input('intereses', sql.Decimal(18, 2), totalInteres)
                .input('interesAnticipado', sql.Decimal(18, 2), totalInteresAnticipado)
                .input('capital', sql.Decimal(18, 2), totalCapital)
                .input('saldo', sql.Decimal(18, 2), nuevoSaldo)
                .query(`
                    UPDATE Prestamos 
                    SET InteresesPagados = @intereses, 
                        InteresAnticipado = @interesAnticipado,
                        MontoPagado = @capital,
                        SaldoActual = @saldo,
                        Estado = CASE WHEN @saldo <= 0 THEN 'Pagado' ELSE 'Activo' END
                    WHERE ID_Prestamo = @idP
                `);

            await transaction.commit();

            res.json({ success: true, message: "Pago actualizado y préstamo sincronizado" });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) { 
        console.error("Error en editar-pago-deuda:", err);
        res.status(500).json({ success: false, error: err.message }); 
    }
});

// Endpoint para eliminar un pago de deuda
app.delete('/api/eliminar-pago-deuda', async (req, res) => {
    try {
        const { idPago, idPrestamo, monto, detalle } = req.body;
        
        if (!idPago || !idPrestamo) {
            return res.status(400).json({ success: false, error: "Faltan datos: idPago e idPrestamo son requeridos" });
        }

        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);

        try {
            await transaction.begin();

            // 1. Eliminar el pago del historial
            await transaction.request()
                .input('id', sql.Int, idPago)
                .query("DELETE FROM HistorialPagos WHERE ID_Pago = @id");

            console.log("DEBUG eliminar-pago-deuda: Pago eliminado", { idPago, idPrestamo });

            // 2. SINCRONIZACIÓN TOTAL: Sumar TODO el historial restante del préstamo
            // Sumar abonos a INTERÉS REGULAR (contiene 'interes' pero NO 'anticipado' y NO 'capital')
            const resInteres = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as total 
                    FROM HistorialPagos 
                    WHERE ID_Prestamo = @idP 
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) LIKE '%interes%'
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) NOT LIKE '%anticipado%'
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) NOT LIKE '%capital%'
                `);
            
            // Sumar abonos a INTERÉS ANTICIPADO (contiene 'anticipado')
            const resInteresAnticipado = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as total 
                    FROM HistorialPagos 
                    WHERE ID_Prestamo = @idP 
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) LIKE '%anticipado%'
                `);
            
            // Sumar abonos a CAPITAL (contiene 'capital')
            const resCapital = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query(`
                    SELECT ISNULL(SUM(Monto), 0) as total 
                    FROM HistorialPagos 
                    WHERE ID_Prestamo = @idP 
                    AND LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(Detalle, 'á','a'), 'é','e'), 'í','i'), 'ó','o'), 'ú','u'), 'Á','A'), 'É','E'), 'Í','I'), 'Ó','O'), 'Ú','U')) LIKE '%capital%'
                `);

            const totalInteres = parseFloat(resInteres.recordset[0]?.total || 0);
            const totalInteresAnticipado = parseFloat(resInteresAnticipado.recordset[0]?.total || 0);
            const totalCapital = parseFloat(resCapital.recordset[0]?.total || 0);

            console.log("DEBUG eliminar-pago-deuda sincronizacion:", {
                idPrestamo,
                totalInteres,
                totalInteresAnticipado,
                totalCapital
            });

            // 3. Obtener el monto prestado original para calcular el saldo
            const resPrestamo = await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado FROM Prestamos WHERE ID_Prestamo = @idP");
            
            const montoPrestado = parseFloat(resPrestamo.recordset[0]?.MontoPrestado || 0);
            const nuevoSaldo = Math.max(0, montoPrestado - totalCapital);

            // 4. Actualizar el préstamo con los totales recalculados
            await transaction.request()
                .input('idP', sql.Int, idPrestamo)
                .input('intereses', sql.Decimal(18, 2), totalInteres)
                .input('interesAnticipado', sql.Decimal(18, 2), totalInteresAnticipado)
                .input('capital', sql.Decimal(18, 2), totalCapital)
                .input('saldo', sql.Decimal(18, 2), nuevoSaldo)
                .query(`
                    UPDATE Prestamos 
                    SET InteresesPagados = @intereses, 
                        InteresAnticipado = @interesAnticipado,
                        MontoPagado = @capital,
                        SaldoActual = @saldo,
                        Estado = CASE WHEN @saldo <= 0 THEN 'Pagado' ELSE 'Activo' END
                    WHERE ID_Prestamo = @idP
                `);

            await transaction.commit();

            res.json({ success: true, message: "Pago eliminado y préstamo sincronizado" });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) { 
        console.error("Error en eliminar-pago-deuda:", err);
        res.status(500).json({ success: false, error: err.message }); 
    }
});

// --- ENDPOINTS DE BACKUP Y RESTORE ---

// Endpoint para descargar backup de la base de datos
app.get('/api/backup-database', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Obtener todas las tablas importantes
        const personas = await pool.request().query("SELECT * FROM Personas");
        const prestamos = await pool.request().query("SELECT * FROM Prestamos");
        const ahorros = await pool.request().query("SELECT * FROM Ahorros");
        const historialPagos = await pool.request().query("SELECT * FROM HistorialPagos");
        
        const backup = {
            fecha: new Date().toISOString(),
            personas: personas.recordset,
            prestamos: prestamos.recordset,
            ahorros: ahorros.recordset,
            historialPagos: historialPagos.recordset
        };
        
        res.json(backup);
    } catch (err) {
        console.error("Error en backup:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint para restaurar la base de datos desde un backup
app.post('/api/restore-database', async (req, res) => {
    try {
        const { data } = req.body;
        
        if (!data || !data.personas) {
            return res.status(400).json({ success: false, error: "Datos de backup inválidos" });
        }
        
        const pool = await poolPromise;
        const transaction = new sql.Transaction(pool);
        
        await transaction.begin();
        
        // Limpiar tablas existentes (en orden inverso por foreign keys)
        await transaction.request().query("DELETE FROM HistorialPagos");
        await transaction.request().query("DELETE FROM Ahorros");
        await transaction.request().query("DELETE FROM Prestamos");
        await transaction.request().query("DELETE FROM Personas");
        
        // Restaurar Personas
        for (const p of data.personas) {
            await transaction.request()
                .input('id', sql.Int, p.ID_Persona)
                .input('nombre', sql.VarChar, p.Nombre)
                .input('documento', sql.VarChar, p.Documento)
                .input('estado', sql.VarChar, p.Estado || 'Activo')
                .input('esSocio', sql.Bit, p.EsSocio || 0)
                .query("INSERT INTO Personas (ID_Persona, Nombre, Documento, Estado, EsSocio) VALUES (@id, @nombre, @documento, @estado, @esSocio)");
        }
        
        // Restaurar Prestamos
        if (data.prestamos) {
            for (const p of data.prestamos) {
                await transaction.request()
                    .input('id', sql.Int, p.ID_Prestamo)
                    .input('idPersona', sql.Int, p.ID_Persona)
                    .input('monto', sql.Decimal(18,2), p.MontoPrestado)
                    .input('tasa', sql.Decimal(5,2), p.TasaInteres)
                    .input('fecha', sql.Date, p.FechaInicio || p.Fecha)
                    .input('montoPagado', sql.Decimal(18,2), p.MontoPagado || 0)
                    .input('saldo', sql.Decimal(18,2), p.SaldoActual)
                    .input('estado', sql.VarChar, p.Estado)
                    .input('interesesPagados', sql.Decimal(18,2), p.InteresesPagados || 0)
                    .input('interesAnticipado', sql.Decimal(18,2), p.InteresAnticipado || 0)
                    .query(`INSERT INTO Prestamos (ID_Prestamo, ID_Persona, MontoPrestado, TasaInteres, FechaInicio, MontoPagado, SaldoActual, Estado, InteresesPagados, InteresAnticipado) 
                            VALUES (@id, @idPersona, @monto, @tasa, @fecha, @montoPagado, @saldo, @estado, @interesesPagados, @interesAnticipado)`);
            }
        }
        
        // Restaurar Ahorros
        if (data.ahorros) {
            for (const a of data.ahorros) {
                await transaction.request()
                    .input('id', sql.Int, a.ID_Ahorro)
                    .input('idPersona', sql.Int, a.ID_Persona)
                    .input('monto', sql.Decimal(18,2), a.Monto)
                    .input('fecha', sql.Date, a.Fecha)
                    .input('meses', sql.VarChar(sql.MAX), a.MesesCorrespondientes || 'Abono General')
                    .query("INSERT INTO Ahorros (ID_Ahorro, ID_Persona, Monto, Fecha, MesesCorrespondientes) VALUES (@id, @idPersona, @monto, @fecha, @meses)");
            }
        }
        
        // Restaurar HistorialPagos
        if (data.historialPagos) {
            for (const hp of data.historialPagos) {
                await transaction.request()
                    .input('id', sql.Int, hp.ID_Pago)
                    .input('idPersona', sql.Int, hp.ID_Persona)
                    .input('idPrestamo', sql.Int, hp.ID_Prestamo)
                    .input('monto', sql.Decimal(18,2), hp.Monto)
                    .input('fecha', sql.Date, hp.Fecha)
                    .input('detalle', sql.VarChar, hp.Detalle || 'Abono a deuda')
                    .input('tipo', sql.VarChar, hp.TipoMovimiento || 'Abono Deuda')
                    .query("INSERT INTO HistorialPagos (ID_Pago, ID_Persona, ID_Prestamo, Monto, Fecha, Detalle, TipoMovimiento) VALUES (@id, @idPersona, @idPrestamo, @monto, @fecha, @detalle, @tipo)");
            }
        }
        
        await transaction.commit();
        res.json({ success: true, message: "Base de datos restaurada correctamente" });
        
    } catch (err) {
        if (transaction) await transaction.rollback();
        console.error("Error en restore:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- RUTAS DE GANANCIAS DE RIFAS ---

// Obtener todas las fechas de rifas guardadas
app.get('/api/fechas-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Obtener fechas únicas de Rifas_Detalle
        const result = await pool.request()
            .query(`SELECT DISTINCT FechaSorteo FROM Rifas_Detalle ORDER BY FechaSorteo DESC`);
        
        const fechas = result.recordset.map(row => row.FechaSorteo);
        res.json(fechas);
    } catch (err) {
        console.error("Error al obtener fechas de rifas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Obtener historial completo de rifas (todas las rifas guardadas con sus datos)
app.get('/api/historial-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // 1. Obtener todas las fechas únicas de rifas guardadas
        const fechasResult = await pool.request()
            .query(`SELECT DISTINCT FechaSorteo FROM Rifas_Detalle ORDER BY FechaSorteo DESC`);
        
        const fechas = fechasResult.recordset.map(row => row.FechaSorteo);
        
        if (fechas.length === 0) {
            res.json([]);
            return;
        }
        
        const historial = [];
        
        // 2. Para cada fecha, obtener los datos de la rifa
        for (const fecha of fechas) {
            // Normalizar la fecha correctamente usando el formato YYYY-MM-DD directamente del SQL Server
            // Agregar hora media para evitar cambios de zona horaria
            let fechaISO;
            try {
                fechaISO = new Date(fecha + 'T12:00:00').toISOString().split('T')[0];
            } catch (e) {
                // Si falla la conversión, usar la fecha directamente
                fechaISO = fecha;
            }
            
            // Obtener información de la rifa
            let infoRifa = { nombre: '', premio: '', valor: 0, costoPremio: 0 };
            try {
                const infoResult = await pool.request()
                    .input('fechaBuscada', sql.Date, fechaISO)
                    .query("SELECT NombreRifa, Premio, ValorPuesto, CostoPremio FROM Rifas_Info WHERE FechaSorteo = @fechaBuscada");
                
                if (infoResult.recordset.length > 0) {
                    const r = infoResult.recordset[0];
                    infoRifa = {
                        nombre: r.NombreRifa || '',
                        premio: r.Premio || '',
                        valor: parseFloat(r.ValorPuesto) || 0,
                        costoPremio: parseFloat(r.CostoPremio) || 0
                    };
                }
            } catch(err) {
                console.log("Error al cargar info de rifa:", err.message);
            }
            
            // Obtener datos de participantes para calcular totals
            const participantesResult = await pool.request()
                .input('fechaBuscada', sql.Date, fechaISO)
                .query("SELECT COUNT(*) as totalParticipantes, SUM(CAST(EstadoPago AS INT)) as totalPagados FROM Rifas_Detalle WHERE FechaSorteo = @fechaBuscada AND NombreParticipante IS NOT NULL AND NombreParticipante != ''");
            
            const totalParticipantes = participantesResult.recordset[0]?.totalParticipantes || 0;
            const totalPagados = participantesResult.recordset[0]?.totalPagados || 0;
            
            // Calcular totales
            const valorPuesto = infoRifa.valor;
            const totalRecaudado = totalPagados * valorPuesto;
            const costoPremio = infoRifa.costoPremio;
            const gananciaNeta = totalRecaudado - costoPremio;
            
            // Obtener ganancias guardadas (si existen)
            let gananciasGuardadas = { TotalRecaudado: 0, CostoPremios: 0, GananciaNeta: 0 };
            try {
                const gananciasResult = await pool.request()
                    .input('fechaBuscada', sql.Date, fechaISO)
                    .query("SELECT TotalRecaudado, CostoPremios, GananciaNeta FROM Rifas_Ganancias WHERE FechaSorteo = @fechaBuscada");
                
                if (gananciasResult.recordset.length > 0) {
                    gananciasGuardadas = gananciasResult.recordset[0];
                }
            } catch(err) {
                console.log("Error al cargar ganancias:", err.message);
            }
            
            // Usar los valores calculados o los guardados
            const recaudoFinal = totalRecaudado > 0 ? totalRecaudado : (parseFloat(gananciasGuardadas.TotalRecaudado) || 0);
            const costoFinal = costoPremio > 0 ? costoPremio : (parseFloat(gananciasGuardadas.CostoPremios) || 0);
            const gananciaFinal = gananciaNeta !== 0 ? gananciaNeta : (parseFloat(gananciasGuardadas.GananciaNeta) || 0);
            
            historial.push({
                fechaSorteo: fechaISO,
                nombre: infoRifa.nombre || 'Rifa del ' + new Date(fechaISO).toLocaleDateString('es-CO'),
                premio: infoRifa.premio || 'No definido',
                valorPuesto: valorPuesto,
                costoPremio: costoPremio,
                totalParticipantes: totalParticipantes,
                totalPagados: totalPagados,
                totalRecaudado: recaudoFinal,
                costoPremios: costoFinal,
                gananciaNeta: gananciaFinal
            });
        }
        
        res.json(historial);
    } catch (err) {
        console.error("Error al obtener historial de rifas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Obtener todas las ganancias de rifas (historial)
app.get('/api/ganancias-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Primero verificamos si la tabla existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Ganancias') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            // La tabla no existe, crearla
            await pool.request()
                .query(`CREATE TABLE Rifas_Ganancias (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    FechaSorteo DATE NOT NULL UNIQUE,
                    TotalRecaudado DECIMAL(18,2) DEFAULT 0,
                    CostoPremios DECIMAL(18,2) DEFAULT 0,
                    GananciaNeta DECIMAL(18,2) DEFAULT 0,
                    FechaRegistro DATETIME DEFAULT GETDATE()
                )`);
            res.json([]);
            return;
        }
        
        const result = await pool.request()
            .query(`SELECT FechaSorteo, TotalRecaudado, CostoPremios, GananciaNeta, FechaRegistro 
                    FROM Rifas_Ganancias 
                    ORDER BY FechaSorteo DESC`);
        
        res.json(result.recordset);
    } catch (err) {
        console.error("Error al obtener ganancias de rifas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Obtener total acumulado de ganancias de rifas
app.get('/api/ganancias-rifas-total', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Verificar si la tabla existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Ganancias') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            res.json({ totalAcumulado: 0 });
            return;
        }
        
        const result = await pool.request()
            .query(`SELECT ISNULL(SUM(GananciaNeta), 0) as totalAcumulado FROM Rifas_Ganancias`);
        
        res.json({ totalAcumulado: result.recordset[0].totalAcumulado });
    } catch (err) {
        console.error("Error al obtener total de ganancias:", err.message);
        res.status(500).json({ totalAcumulado: 0 });
    }
});

// Guardar ganancias de una rifa específica
app.post('/api/ganancias-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        const { fechaSorteo, totalRecaudado, costoPremios, gananciaNeta } = req.body;
        
        if (!fechaSorteo) {
            return res.status(400).json({ success: false, error: "La fecha es obligatoria" });
        }
        
        // Verificar si la tabla existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Ganancias') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            await pool.request()
                .query(`CREATE TABLE Rifas_Ganancias (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    FechaSorteo DATE NOT NULL UNIQUE,
                    TotalRecaudado DECIMAL(18,2) DEFAULT 0,
                    CostoPremios DECIMAL(18,2) DEFAULT 0,
                    GananciaNeta DECIMAL(18,2) DEFAULT 0,
                    FechaRegistro DATETIME DEFAULT GETDATE()
                )`);
        }
        
        // Eliminar registro existente para esta fecha y crear nuevo
        await pool.request()
            .input('fecha', sql.Date, fechaSorteo)
            .query("DELETE FROM Rifas_Ganancias WHERE FechaSorteo = @fecha");
        
        await pool.request()
            .input('fecha', sql.Date, fechaSorteo)
            .input('recaudado', sql.Decimal(18,2), parseFloat(totalRecaudado) || 0)
            .input('costoPremios', sql.Decimal(18,2), parseFloat(costoPremios) || 0)
            .input('gananciaNeta', sql.Decimal(18,2), parseFloat(gananciaNeta) || 0)
            .query(`INSERT INTO Rifas_Ganancias (FechaSorteo, TotalRecaudado, CostoPremios, GananciaNeta) 
                    VALUES (@fecha, @recaudado, @costoPremios, @gananciaNeta)`);
        
        res.json({ success: true });
    } catch (err) {
        console.error("Error al guardar ganancias de rifa:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;

// Endpoint para eliminar una rifa por fecha
app.delete('/api/eliminar-rifa', async (req, res) => {
    try {
        const { fecha } = req.body;
        
        if (!fecha) {
            return res.status(400).json({ success: false, error: "La fecha es obligatoria" });
        }
        
        const pool = await poolPromise;
        
        // Eliminar detalles de la rifa
        await pool.request()
            .input('fecha', sql.Date, fecha)
            .query("DELETE FROM Rifas_Detalle WHERE FechaSorteo = @fecha");
        
        // Eliminar información de la rifa
        await pool.request()
            .input('fecha', sql.Date, fecha)
            .query("DELETE FROM Rifas_Info WHERE FechaSorteo = @fecha");
        
        // Eliminar ganancias de la rifa
        await pool.request()
            .input('fecha', sql.Date, fecha)
            .query("DELETE FROM Rifas_Ganancias WHERE FechaSorteo = @fecha");
        
        console.log('🗑️ Rifa eliminada:', fecha);
        res.json({ success: true, message: "Rifa eliminada correctamente" });
        
    } catch (err) {
        console.error("Error al eliminar rifa:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Verificar y crear columnas necesarias al iniciar
async function inicializarBaseDeDatos() {
    try {
        const pool = await poolPromise;
        
        // Verificar si existe la columna InteresesPagados en Prestamos
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Prestamos' AND COLUMN_NAME = 'InteresesPagados')
            BEGIN
                ALTER TABLE Prestamos ADD InteresesPagados DECIMAL(18,2) DEFAULT 0
            END`);
        
        // Verificar si existe la columna FechaUltimoAbonoCapital
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Prestamos' AND COLUMN_NAME = 'FechaUltimoAbonoCapital')
            BEGIN
                ALTER TABLE Prestamos ADD FechaUltimoAbonoCapital DATETIME NULL
            END`);
        
        // Verificar si existe la columna InteresAnticipado (para abonos anticipados a intereses)
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Prestamos' AND COLUMN_NAME = 'InteresAnticipado')
            BEGIN
                ALTER TABLE Prestamos ADD InteresAnticipado DECIMAL(18,2) DEFAULT 0
            END`);

        // Verificar si existe la columna InteresAnticipadoUsado (para rastrear cuánto se ha consumido del anticipado)
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Prestamos' AND COLUMN_NAME = 'InteresAnticipadoUsado')
            BEGIN
                ALTER TABLE Prestamos ADD InteresAnticipadoUsado DECIMAL(18,2) DEFAULT 0
            END`);

        // Verificar si existe la tabla Rifas_Info
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Info')
            BEGIN
                CREATE TABLE Rifas_Info (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    FechaSorteo DATE NOT NULL,
                    NombreRifa VARCHAR(200),
                    Premio VARCHAR(200),
                    ValorPuesto DECIMAL(18,2),
                    CostoPremio DECIMAL(18,2),
                   Premios NVARCHAR(MAX)
                )
            END`);

        // Verificar si existe la tabla Rifas_Ganancias
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Ganancias')
            BEGIN
                CREATE TABLE Rifas_Ganancias (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    FechaSorteo DATE NOT NULL UNIQUE,
                    TotalRecaudado DECIMAL(18,2) DEFAULT 0,
                    CostoPremios DECIMAL(18,2) DEFAULT 0,
                    GananciaNeta DECIMAL(18,2) DEFAULT 0,
                    FechaRegistro DATETIME DEFAULT GETDATE()
                )
            END`);

        console.log('✅ Verificación de columnas completadas');
    } catch (err) {
        console.error('❌ Error al inicializar columnas:', err.message);
    }
}

inicializarBaseDeDatos().then(() => {
    app.listen(PORT, () => {
        console.log('SERVIDOR CORRIENDO EN PUERTO ' + PORT);
    });
});