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

// --- RUTAS DE RIFAS (POR NOMBRE/ID - SIMPLE) ---

// Obtener lista de todas las rifas
app.get('/api/lista-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Verificar si la tabla Rifas_Datos existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Datos') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            res.json([]);
            return;
        }
        
        // Obtener los IDs únicos de rifas guardadas (usando el ID como identificador)
        // Ahora parseamos los Datos JSON para obtener el nombre
        const result = await pool.request()
            .query("SELECT ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
        
        const listaRifas = result.recordset.map(row => {
            try {
                const datos = JSON.parse(row.Datos);
                return {
                    id: row.ID,
                    nombre: datos.info?.nombre || 'Rifa #' + row.ID,
                    fecha: datos.info?.fecha || '',
                    premio: datos.info?.premio || ''
                };
            } catch (e) {
                return {
                    id: row.ID,
                    nombre: 'Rifa #' + row.ID,
                    fecha: '',
                    premio: ''
                };
            }
        });
        
        res.json(listaRifas);
    } catch (err) {
        console.error("Error al obtener lista de rifas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Cargar rifa - Puede recibir una fecha específica o retorna la más reciente
app.get('/api/cargar-rifas', async (req, res) => {
    try {
        const { fecha } = req.query;
        const pool = await poolPromise;
        
        // Verificar si la tabla Rifas_Datos existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Datos') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            // La tabla no existe, crear estructura vacía
            res.json({ 
                sinDatos: true, 
                mensaje: "No hay rifas guardadas",
                info: { nombre: '', premio: '', valor: '', fecha: '', inversion: '', premios: {} },
                tabla1: { titulo: 'Tabla 1', participantes: {} },
                tabla2: { titulo: 'Tabla 2', participantes: {} },
                tabla3: { titulo: 'Tabla 3', participantes: {} },
                tabla4: { titulo: 'Tabla 4', participantes: {} }
            });
            return;
        }
        
        let result;
        
        if (fecha) {
            // Buscar rifa por fecha específica
            result = await pool.request()
                .query("SELECT TOP 1 ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
            
            // Filtrar manualmente por fecha si hay datos
            let rifaEncontrada = null;
            for (const row of result.recordset) {
                try {
                    const datos = JSON.parse(row.Datos);
                    if (datos.info && datos.info.fecha === fecha) {
                        rifaEncontrada = { id: row.ID, datos };
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (rifaEncontrada) {
                rifaEncontrada.datos.idRifa = rifaEncontrada.id;
                res.json(rifaEncontrada.datos);
                return;
            } else {
                // No se encontró rifa para esa fecha, buscar la más reciente
                result = await pool.request()
                    .query("SELECT TOP 1 ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
            }
        } else {
            // Sin fecha: cargar la rifa más reciente
            result = await pool.request()
                .query("SELECT TOP 1 ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
        }
        
        if (result.recordset.length === 0 || !result.recordset[0].Datos) {
            res.json({ 
                sinDatos: true, 
                mensaje: "No hay rifas guardadas",
                info: { nombre: '', premio: '', valor: '', fecha: '', inversion: '', premios: {} },
                tabla1: { titulo: 'Tabla 1', participantes: {} },
                tabla2: { titulo: 'Tabla 2', participantes: {} },
                tabla3: { titulo: 'Tabla 3', participantes: {} },
                tabla4: { titulo: 'Tabla 4', participantes: {} }
            });
            return;
        }
        
        try {
            const datos = JSON.parse(result.recordset[0].Datos);
            datos.idRifa = result.recordset[0].ID;
            res.json(datos);
        } catch (parseError) {
            console.error("Error al parsear datos de rifa:", parseError);
            res.status(500).json({ error: "Error al leer los datos de la rifa" });
        }
    } catch (err) {
        console.error("Error al cargar rifa:", err.message);
        res.status(500).json({ error: "Error: " + err.message });
    }
});

// Obtener rifa por ID
app.get('/api/cargar-rifa-id', async (req, res) => {
    try {
        const { id } = req.query;
        
        if (!id) {
            return res.status(400).json({ error: "ID de rifa requerido" });
        }
        
        const pool = await poolPromise;
        
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query("SELECT TOP 1 Datos FROM Rifas_Datos WHERE ID = @id");
        
        if (result.recordset.length === 0 || !result.recordset[0].Datos) {
            res.json({ 
                sinDatos: true, 
                mensaje: "Rifa no encontrada",
                info: { nombre: '', premio: '', valor: '', fecha: '', inversion: '' },
                tabla1: { titulo: 'Tabla 1', participantes: {} },
                tabla2: { titulo: 'Tabla 2', participantes: {} },
                tabla3: { titulo: 'Tabla 3', participantes: {} },
                tabla4: { titulo: 'Tabla 4', participantes: {} }
            });
            return;
        }
        
        try {
            const datos = JSON.parse(result.recordset[0].Datos);
            datos.idRifa = id;
            res.json(datos);
        } catch (parseError) {
            console.error("Error al parsear datos de rifa:", parseError);
            res.status(500).json({ error: "Error al leer los datos de la rifa" });
        }
    } catch (err) {
        console.error("Error al cargar rifa:", err.message);
        res.status(500).json({ error: "Error: " + err.message });
    }
});

// Guardar rifa - Simple: todo en un JSON
app.post('/api/guardar-rifa', async (req, res) => {
    try {
        const pool = await poolPromise;
        const nuevosDatos = req.body;
        
        // Verificar si la tabla existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Datos') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            // Crear la tabla si no existe
            await pool.request()
                .query(`CREATE TABLE Rifas_Datos (
                    ID INT IDENTITY(1,1) PRIMARY KEY,
                    Datos NVARCHAR(MAX)
                )`);
        }
        
        // Si tiene ID, actualizar; si no, crear nuevo
        const datosJSON = JSON.stringify(nuevosDatos);
        
        if (nuevosDatos.idRifa) {
            // Actualizar rifa existente
            await pool.request()
                .input('id', sql.Int, nuevosDatos.idRifa)
                .input('datos', sql.NVARCHAR(sql.MAX), datosJSON)
                .query("UPDATE Rifas_Datos SET Datos = @datos WHERE ID = @id");
            
            console.log('✅ Rifa #' + nuevosDatos.idRifa + ' actualizada');
            res.json({ success: true, message: "Guardado correctamente", id: nuevosDatos.idRifa });
        } else {
            // Insertar nueva rifa
            const result = await pool.request()
                .input('datos', sql.NVARCHAR(sql.MAX), datosJSON)
                .query("INSERT INTO Rifas_Datos (Datos) VALUES (@datos); SELECT SCOPE_IDENTITY() as newId");
            
            const newId = result.recordset[0].newId;
            console.log('✅ Nueva rifa creada con ID:', newId);
            res.json({ success: true, message: "Guardado correctamente", id: newId });
        }
        
    } catch (err) {
        console.error("❌ Error al guardar rifa:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Eliminar rifa por ID
app.delete('/api/eliminar-rifa', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({ success: false, error: "ID de rifa requerido" });
        }
        
        const pool = await poolPromise;
        
        await pool.request()
            .input('id', sql.Int, id)
            .query("DELETE FROM Rifas_Datos WHERE ID = @id");
        
        console.log('🗑️ Rifa #' + id + ' eliminada');
        res.json({ success: true, message: "Rifa eliminada correctamente" });
        
    } catch (err) {
        console.error("Error al eliminar rifa:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Obtener historial de rifas
app.get('/api/historial-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        const result = await pool.request()
            .query("SELECT ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
        
        if (result.recordset.length === 0) {
            res.json([]);
            return;
        }
        
        const historial = result.recordset.map(row => {
            try {
                const datos = JSON.parse(row.Datos);
                const costoPuesto = parseFloat(datos.info?.valor) || 0;
                const costoPremio = parseFloat(datos.info?.inversion) || 0;
                
                let totalParticipantes = 0;
                let totalPagados = 0;
                
                // Contar participantes y pagos
                for (let i = 1; i <= 4; i++) {
                    const key = 'tabla' + i;
                    if (datos[key] && datos[key].participantes) {
                        Object.values(datos[key].participantes).forEach(p => {
                            if (p.nombre && p.nombre.trim() !== '') {
                                totalParticipantes++;
                                if (p.pago) totalPagados++;
                            }
                        });
                    }
                }
                
                // Calcular costo REAL de premios: solo contar los premios ENTREGADOS
                // Ganancia = Total Recogido - (Premios Entregados × CostoPremio)
                let cantidadGanadoresEntregados = 0;
                let costoPremiosReales = 0;
                
                if (datos.info && datos.info.premios) {
                    for (let i = 1; i <= 4; i++) {
                        const key = 'tabla' + i;
                        if (datos.info.premios[key] && datos.info.premios[key].ganadores) {
                            datos.info.premios[key].ganadores.forEach(ganador => {
                                // Solo contar si el premio está marcado como entregado Y tiene número y nombre
                                if (ganador.numero &&ganador.nombre) {
                                    cantidadGanadoresEntregados++;
                                    costoPremiosReales += costoPremio;
                                }
                            });
                        }
                    }
                }
                
                const totalRecaudado = totalPagados * costoPuesto;
                // Usar costoPremiosReales (solo premios entregados) para la ganancia
                const gananciaNeta = totalRecaudado - costoPremiosReales;
                
                return {
                    id: row.ID,
                    fechaSorteo: datos.info?.fecha || '',
                    nombre: datos.info?.nombre || 'Rifa #' + row.ID,
                    premio: datos.info?.premio || '',
                    valorPuesto: costoPuesto,
                    costoPremio: costoPremio,
                    cantidadGanadoresEntregados: cantidadGanadoresEntregados,
                    costoPremiosReales: costoPremiosReales,
                    totalParticipantes: totalParticipantes,
                    totalPagados: totalPagados,
                    totalRecaudado: totalRecaudado,
                    costoPremios: costoPremiosReales,
                    gananciaNeta: gananciaNeta
                };
            } catch (e) {
                return {
                    id: row.ID,
                    nombre: 'Rifa #' + row.ID,
                    error: true
                };
            }
        }).filter(r => !r.error);
        
        res.json(historial);
    } catch (err) {
        console.error("Error al obtener historial:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- OTRAS RUTAS ---

// Obtener premios pendientes de todas las rifas
app.get('/api/premios-pendientes', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Verificar si la tabla Rifas_Datos existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Datos') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            res.json([]);
            return;
        }
        
        // Obtener todas las rifas
        const result = await pool.request()
            .query("SELECT ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
        
        const premiosPendientes = [];
        
        for (const row of result.recordset) {
            try {
                const datos = JSON.parse(row.Datos);
                const nombreRifa = datos.info?.nombre || 'Rifa #' + row.ID;
                const fechaSorteo = datos.info?.fecha || '';
                
                // Revisar cada tabla por premios
                if (datos.info && datos.info.premios) {
                    for (let i = 1; i <= 4; i++) {
                        const key = `tabla${i}`;
                        if (datos.info.premios[key] && datos.info.premios[key].ganadores) {
                            datos.info.premios[key].ganadores.forEach((ganador, index) => {
                                // Solo mostrar si tiene número y nombre pero NO está entregado
                                if (ganador.numero && ganador.nombre && !ganador.entregado) {
                                    premiosPendientes.push({
                                        idRifa: row.ID,
                                        nombreRifa: nombreRifa,
                                        fechaSorteo: fechaSorteo,
                                        tabla: i,
                                        posicion: index + 1,
                                        numero: ganador.numero,
                                        nombreGanador: ganador.nombre
                                    });
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                console.log("Error al procesar rifa:", e.message);
            }
        }
        
        res.json(premiosPendientes);
    } catch (err) {
        console.error("Error al obtener premios pendientes:", err.message);
        res.status(500).json({ error: err.message });
    }
});

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
                ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) as totalAhorrado,
                -- Calcular puntos de esfuerzo basados en antigüedad (fecha del primer ahorro) y ahorro
                -- Puntos = (Meses de antigüedad desde primer ahorro * 10) + (Total Ahorrado / 1000)
                -- Esto da más peso a quienes llevan más tiempo ahorrando Y tienen más ahorro
                ISNULL((SELECT MIN(Fecha) FROM Ahorros WHERE ID_Persona = P.ID_Persona), GETDATE()) as primeraFechaAhorro,
                DATEDIFF(MONTH, (SELECT MIN(Fecha) FROM Ahorros WHERE ID_Persona = P.ID_Persona), GETDATE()) as mesesAntiguedad,
                ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) as saldoTotal,
                -- Calcular puntos de esfuerzo: mínimo 1 punto si tiene ahorro (para que no sea 0)
                CASE 
                    WHEN ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) > 0 THEN
                        ISNULL(DATEDIFF(MONTH, (SELECT MIN(Fecha) FROM Ahorros WHERE ID_Persona = P.ID_Persona), GETDATE()), 0) * 10 + 
                        ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) / 1000
                    ELSE 0
                END as puntosEsfuerzo
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

        // 1. PROCESO DE AUTO-CONSUMO DE ANTICIPADOS
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
                    ISNULL(InteresPendienteAcumulado, 0) as InteresPendienteAcumulado,
                    TasaInteres, 
                    ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)) as FechaCalculo
                FROM Prestamos 
                WHERE ID_Persona = @id AND Estado = 'Activo'
            `);

        for (const p of prestamosData.recordset) {
            const capitalPendiente = p.MontoPrestado - p.MontoPagado;
            const dias = Math.max(0, Math.floor((new Date() - new Date(p.FechaCalculo)) / (1000 * 60 * 60 * 24)));
            
            // Interés Generado = Lo acumulado históricamente + lo generado en este periodo actual
            const interesGenerado = p.InteresPendienteAcumulado + (((capitalPendiente * p.TasaInteres / 100.0) / 30.0) * dias);
            
            const anticipadoDisponible = Math.max(0, p.InteresAnticipado - p.InteresAnticipadoUsado);
            const interesPendiente = Math.max(0, interesGenerado - (p.InteresesPagados + p.InteresAnticipadoUsado));
            
            if (anticipadoDisponible > 0 && interesPendiente > 0) {
                const nuevoConsumo = Math.min(anticipadoDisponible, interesPendiente);
                const nuevoUsado = p.InteresAnticipadoUsado + nuevoConsumo;
                await pool.request()
                    .input('idP', sql.Int, p.ID_Prestamo)
                    .input('usado', sql.Decimal(18, 2), nuevoUsado)
                    .query("UPDATE Prestamos SET InteresAnticipadoUsado = @usado WHERE ID_Prestamo = @idP");
            }
        }

        // 2. CONSULTA FINAL PARA EL FRONTEND
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
                    ISNULL(InteresPendienteAcumulado, 0) as InteresPendienteAcumulado,
                    TasaInteres, 
                    Estado,
                    FORMAT(ISNULL(FechaInicio, Fecha), 'dd/MM/yyyy') as FechaInicioFormateada,
                    DATEDIFF(DAY, ISNULL(FechaInicio, Fecha), GETDATE()) as DiasTranscurridos,
                    
                    -- Interés Generado: Acumulado + Nuevo interés desde el último abono
                    CAST(
                        ISNULL(InteresPendienteAcumulado, 0) +
                        (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE())) 
                    AS DECIMAL(18,2)) as InteresGenerado,
                    
                    -- Interés Pendiente: (Total Generado) - (Pagos + Anticipados Usados)
                    CAST(
                        (ISNULL(InteresPendienteAcumulado, 0) + (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE()))) 
                        - (ISNULL(InteresesPagados, 0) + ISNULL(InteresAnticipadoUsado, 0))
                    AS DECIMAL(18,2)) as InteresPendiente,
                    
                    (MontoPrestado - ISNULL(MontoPagado, 0)) as capitalHoy,
                    
                    -- Saldo Total: Capital Actual + Interés Pendiente
                    CAST(
                        (MontoPrestado - ISNULL(MontoPagado, 0)) + 
                        ((ISNULL(InteresPendienteAcumulado, 0) + (((MontoPrestado - ISNULL(MontoPagado, 0)) * (TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), GETDATE()))) 
                        - (ISNULL(InteresesPagados, 0) + ISNULL(InteresAnticipadoUsado, 0)))
                    AS DECIMAL(18,2)) as saldoHoy

                FROM Prestamos 
                WHERE ID_Persona = @id 
                ORDER BY ID_Prestamo ASC
            `);

        res.json(result.recordset);
    } catch (err) { 
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
            
            // OBTENER DATOS ACTUALES DEL PRÉSTAMO PARA VALIDAR + ACCUMULATE INTEREST
            const prestamoActual = await pool.request()
                .input('idP', sql.Int, idPrestamo)
                .input('fAporte', sql.Date, fAporte)
                .query(`
                    SELECT 
                        SaldoActual,
                        ISNULL(MontoPagado, 0) as MontoPagado, 
                        ISNULL(InteresesPagados, 0) as InteresesPagados,
                        ISNULL(InteresPendienteAcumulado, 0) as InteresPendienteAcumulado,
                        DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, ISNULL(FechaInicio, Fecha)), @fAporte) as DiasTranscurridos,
                        TasaInteres
                    FROM Prestamos 
                    WHERE ID_Prestamo = @idP
                `);

            if (prestamoActual.recordset.length === 0) {
                return res.status(400).json({ success: false, error: "Préstamo no encontrado" });
            }

            const p = prestamoActual.recordset[0];
            
            // 🎯 STEP 2: CALCULAR Y ACUMULAR INTERÉS PENDIENTE DESDE ÚLTIMO ABONO HASTA @fAporte
            const diasTranscurridos = p.DiasTranscurridos;
            const interesDiario = (p.SaldoActual * p.TasaInteres / 100.0) / 30.0;
            const interesGenerado = interesDiario * diasTranscurridos;
            const nuevoAcumulado = p.InteresPendienteAcumulado + interesGenerado;
            
            // Acumular antes de cualquier pago - ✅ Persistencia garantizada
            await pool.request()
    .input('idP', sql.Int, idPrestamo)
    .input('nuevoAcum', sql.Decimal(18, 2), nuevoAcumulado)
    .query("UPDATE Prestamos SET InteresPendienteAcumulado = @nuevoAcum WHERE ID_Prestamo = @idP");

            console.log(`>>> Acumulado intereses hasta ${fAporte}: +$${interesGenerado.toFixed(2)} (total: $${nuevoAcumulado.toFixed(2)})`);

            const capitalPendiente = p.SaldoActual;  // Use SaldoActual as current capital
            // Calcular interés pendiente actual (legacy for validation)
            const interesPendiente = Math.max(0, interesGenerado - p.InteresesPagados);
            
            // Validar explícitamente el destino del abono
            if (destinoAbono === 'capital') {
                console.log(">>> Abono a CAPITAL");
                
                // VALIDACIÓN: No puede abonar más de lo que debe a capital
                if (m > capitalPendiente) {
                    return res.status(400).json({ success: false, error: `No puede abonar más de $${capitalPendiente.toLocaleString()} (capital pendiente)` });
                }
                
                // Verificar si este abono completó el préstamo
                const nuevoSaldo = capitalPendiente - m;
                
                if (nuevoSaldo <= 0) {
                    // El préstamo quedó pagado completamente - guardar fecha de pago completo
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m).input('fAporte', sql.Date, fAporte).input('fPago', sql.Date, fAporte)
                    .query("UPDATE Prestamos SET MontoPagado = ISNULL(MontoPagado, 0) + @m, SaldoActual = 0, Estado = 'Pagado', FechaUltimoAbonoCapital = @fAporte, FechaPagoCompleto = @fPago WHERE ID_Prestamo = @idP");
                } else {
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m).input('fAporte', sql.Date, fAporte)
                    .query("UPDATE Prestamos SET MontoPagado = ISNULL(MontoPagado, 0) + @m, SaldoActual = CASE WHEN (SaldoActual - @m) < 0 THEN 0 ELSE SaldoActual - @m END, Estado = 'Activo', FechaUltimoAbonoCapital = @fAporte WHERE ID_Prestamo = @idP");
                }
            } else if (destinoAbono === 'interes') {
                // Abono a INTERÉS: se suma a InteresesPagados (el saldo total se recalcula dinámicamente)
                console.log(">>> Abono a INTERÉS");
                
                // VALIDACIÓN: No puede abonar más de lo que hay generado de interés
                if (m > interesPendiente + 100) { // Margen de 100 por redondeo
                    return res.status(400).json({ success: false, error: `No puede abonar más de $${Math.round(interesPendiente).toLocaleString()} (interés pendiente actual)` });
                }
                
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m).input('acum', sql.Decimal(18, 2), nuevoAcumulado).input('fAporte', sql.Date, fAporte)
                    .query(`
                        UPDATE Prestamos 
                        SET InteresesPagados = ISNULL(InteresesPagados, 0) + @m,
                            InteresPendienteAcumulado = CASE WHEN (@acum - @m) < 0 THEN 0 ELSE (@acum - @m) END,
                            FechaUltimoAbonoCapital = @fAporte
                        WHERE ID_Prestamo = @idP
                    `);
            } else if (destinoAbono === 'interesAnticipado') {
                // Abono a INTERÉS ANTICIPADO: se suma a InteresAnticipado (adelanto de intereses)
                console.log(">>> Abono a INTERÉS ANTICIPADO (ADELANTO)");
                
                // Para interés anticipado, permitimos un monto más flexible (no validamos contra interés pendiente)
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m).input('fAporte', sql.Date, fAporte)
                    .query("UPDATE Prestamos SET InteresAnticipado = ISNULL(InteresAnticipado, 0) + @m, FechaUltimoAbonoCapital = @fAporte WHERE ID_Prestamo = @idP");
            } else {
                // Si destinoAbono es undefined, null o cualquier otro valor -> SE TRATA COMO INTERÉS (sin tocar el SaldoActual)
                console.log(">>> Abono a INTERÉS (default)", destinoAbono);
                
                // VALIDACIÓN: No puede abonar más de lo que hay generado de interés
                if (m > interesPendiente + 100) { // Margen de 100 por redondeo
                    return res.status(400).json({ success: false, error: `No puede abonar más de $${Math.round(interesPendiente).toLocaleString()} (interés pendiente actual)` });
                }
                
                await pool.request()
                    .input('idP', sql.Int, idPrestamo).input('m', sql.Decimal(18, 2), m).input('acum', sql.Decimal(18, 2), nuevoAcumulado).input('fAporte', sql.Date, fAporte)
                    .query(`
                        UPDATE Prestamos 
                        SET InteresesPagados = ISNULL(InteresesPagados, 0) + @m,
                            InteresPendienteAcumulado = CASE WHEN (@acum - @m) < 0 THEN 0 ELSE (@acum - @m) END,
                            FechaUltimoAbonoCapital = @fAporte
                        WHERE ID_Prestamo = @idP
                    `);
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
            // Verificar si este abono completó el préstamo
            // Primero obtener el saldo actual
            const prestamoActual = await transaction.request()
                .input('idPrestamo', sql.Int, idPrestamo)
                .query("SELECT MontoPrestado, ISNULL(MontoPagado, 0) as MontoPagado FROM Prestamos WHERE ID_Prestamo = @idPrestamo");
            
            const p = prestamoActual.recordset[0];
            const capitalPendiente = p.MontoPrestado - p.MontoPagado;
            const nuevoSaldo = capitalPendiente - m;
            
            if (nuevoSaldo <= 0) {
                // El préstamo quedó pagado completamente - guardar fecha de pago completo
                await transaction.request()
                    .input('idPrestamo', sql.Int, idPrestamo).input('monto', sql.Decimal(18, 2), m).input('fecha', sql.Date, fechaActual)
                    .query("UPDATE Prestamos SET MontoPagado = MontoPagado + @monto, SaldoActual = 0, Estado = 'Pagado', FechaUltimoAbonoCapital = @fecha, FechaPagoCompleto = @fecha WHERE ID_Prestamo = @idPrestamo");
            } else {
                await transaction.request()
                    .input('idPrestamo', sql.Int, idPrestamo).input('monto', sql.Decimal(18, 2), m).input('fecha', sql.Date, fechaActual)
                    .query("UPDATE Prestamos SET MontoPagado = MontoPagado + @monto, SaldoActual = CASE WHEN (SaldoActual - @monto) < 0 THEN 0 ELSE SaldoActual - @monto END, Estado = CASE WHEN (SaldoActual - @monto) <= 0 THEN 'Pagado' ELSE 'Activo' END, FechaUltimoAbonoCapital = @fecha WHERE ID_Prestamo = @idPrestamo");
            }
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
        const result = await pool.request().query("SELECT ISNULL(SUM(CASE WHEN InteresesPagados < 0 THEN 0 ELSE InteresesPagados END), 0) as saldo FROM Prestamos WHERE Estado = 'Activo'");
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint para ejecutar el reparto masivo de intereses
app.post('/api/ejecutar-reparto-masivo', async (req, res) => {
    try {
        const { sociosAptos } = req.body;
        
        if (!sociosAptos || !Array.isArray(sociosAptos) || sociosAptos.length === 0) {
            return res.status(400).json({ success: false, error: "No hay socios para distribuir" });
        }

        const pool = await poolPromise;
        let insertados = 0;
        
        for (const socio of sociosAptos) {
            if (socio.interes && socio.interes > 0) {
                await pool.request()
                    .input('id', sql.Int, socio.id)
                    .input('monto', sql.Decimal(18, 2), socio.interes)
                    .input('detalle', sql.VarChar, `REPARTO DE GANANCIAS - ${new Date().getFullYear()}`)
                    .query("INSERT INTO Ahorros (ID_Persona, Monto, Fecha, MesesCorrespondientes) VALUES (@id, @monto, GETDATE(), @detalle)");
                insertados++;
            }
        }

        res.json({ success: true, message: `Intereses distribuidos a ${insertados} socios` });
    } catch (err) {
        console.error("Error en reparto masivo:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint para obtener datos del reparto para PDF
app.get('/api/datos-reparto', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Obtener ganancias disponibles
        const resultGanancias = await pool.request().query("SELECT ISNULL(SUM(CASE WHEN InteresesPagados < 0 THEN 0 ELSE InteresesPagados END), 0) as saldo FROM Prestamos WHERE Estado = 'Activo'");
        const gananciasDisponibles = parseFloat(resultGanancias.recordset[0].saldo || 0);
        
        // Obtener el TOTAL de socios ahorradores (todos los activos con EsSocio = 1)
        const resultTotalSocios = await pool.request().query("SELECT COUNT(*) as total FROM Personas WHERE Estado = 'Activo' AND EsSocio = 1");
        const totalSociosAhorradores = resultTotalSocios.recordset[0].total || 0;
        
        // Obtener socios con esfuerzo
        const resultSocios = await pool.request().query(`
            SELECT 
                P.ID_Persona as id, 
                P.Nombre as nombre, 
                ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) as totalAhorrado,
                CASE 
                    WHEN ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) > 0 THEN
                        ISNULL(DATEDIFF(MONTH, (SELECT MIN(Fecha) FROM Ahorros WHERE ID_Persona = P.ID_Persona), GETDATE()), 0) * 10 + 
                        ISNULL((SELECT SUM(Monto) FROM Ahorros WHERE ID_Persona = P.ID_Persona), 0) / 1000
                    ELSE 0
                END as puntosEsfuerzo
            FROM Personas P 
            WHERE P.Estado = 'Activo' AND P.EsSocio = 1
        `);
        
        const socios = resultSocios.recordset;
        const totalPuntosNatillera = socios.reduce((acc, s) => acc + parseFloat(s.puntosEsfuerzo || 0), 0);
        
        let sociosConReparto = [];
        const valorPunto = totalPuntosNatillera > 0 ? gananciasDisponibles / totalPuntosNatillera : 0;
        
        socios.forEach(socio => {
            const puntosSocio = parseFloat(socio.puntosEsfuerzo || 0);
            const saldoReal = parseFloat(socio.totalAhorrado || 0);

            if (puntosSocio > 0) {
                const interesJusto = Math.floor(puntosSocio * valorPunto);
                sociosConReparto.push({
                    id: socio.id,
                    nombre: socio.nombre,
                    ahorroActual: saldoReal,
                    puntos: puntosSocio,
                    interes: interesJusto,
                    nuevoSaldo: saldoReal + interesJusto
                });
            } else {
                // Socio no beneficiado - guardar para el reporte
                socioNoBeneficiado = {
                    id: socio.id,
                    nombre: socio.nombre,
                    ahorroActual: saldoReal,
                    puntos: 0,
                    motivo: saldoReal > 0 ? 'Sin antigüedad mínima (0 puntos de esfuerzo)' : 'Sin ahorros registrados'
                };
            }
        });

        res.json({
            totalGanancias: gananciasDisponibles,
            totalPuntos: totalPuntosNatillera,
            valorPunto: valorPunto,
            socios: sociosConReparto,
            totalRepartido: sociosConReparto.reduce((acc, s) => acc + s.interes, 0),
            totalSociosAhorradores: totalSociosAhorradores,
            sociosBeneficiados: sociosConReparto.length,
            socioNoBeneficiado: socioNoBeneficiado
        });
    } catch (err) {
        console.error("Error en /api/datos-reparto:", err.message);
        res.status(500).json({ error: err.message });
    }
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
        if (!pool || !pool.request) {
            return res.status(500).json({ error: "Pool no disponible" });
        }
        const result = await pool.request().query(`
            WITH SaldosPrestamos AS (
                SELECT 
                    p.ID_Persona,
                    CAST(
                        (p.MontoPrestado - ISNULL(p.MontoPagado, 0)) + 
                        (
                          (ISNULL(p.InteresPendienteAcumulado, 0) + 
                          (((p.MontoPrestado - ISNULL(p.MontoPagado, 0)) * (p.TasaInteres / 100.0) / 30.0) * DATEDIFF(DAY, ISNULL(p.FechaUltimoAbonoCapital, ISNULL(p.FechaInicio, p.Fecha)), GETDATE()))) 
                          - (ISNULL(p.InteresesPagados, 0) + ISNULL(p.InteresAnticipadoUsado, 0))
                        ) -- <-- Este paréntesis cierra el bloque de intereses
                    AS DECIMAL(18,2)) as saldoHoy -- <-- Ahora el CAST cierra correctamente
                FROM Prestamos p
                WHERE p.Estado = 'Activo'
            )
            SELECT 
                per.ID_Persona as id,
                per.Nombre as nombre, 
                per.Documento as documento,
                ISNULL(SUM(sp.saldoHoy), 0) as saldoHistoricoDetallado
            FROM Personas per
            LEFT JOIN SaldosPrestamos sp ON per.ID_Persona = sp.ID_Persona
            GROUP BY per.ID_Persona, per.Nombre, per.Documento
            HAVING ISNULL(SUM(sp.saldoHoy), 0) > 0
            ORDER BY ISNULL(SUM(sp.saldoHoy), 0) DESC
        `);
        res.json(result.recordset);
    } catch (err) { 
        console.error("Error en /listar-miembros:", err.message);
        res.status(500).json({ error: "Error al obtener miembros", detalle: err.message }); 
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

// Endpoint para descargar backup de SOLO las rifas
app.get('/api/backup-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Obtener todas las rifas guardadas
        let rifas = [];
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Datos') 
                SELECT 1 as existe ELSE SELECT 0 as existe`);
        
        if (tableCheck.recordset[0].existe === 1) {
            const rifasResult = await pool.request()
                .query("SELECT ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
            
            rifas = rifasResult.recordset.map(row => {
                try {
                    const datos = JSON.parse(row.Datos);
                    return {
                        id: row.ID,
                        nombre: datos.info?.nombre || 'Rifa #' + row.ID,
                        fecha: datos.info?.fecha || '',
                        premio: datos.info?.premio || '',
                        datos: datos
                    };
                } catch (e) {
                    return {
                        id: row.ID,
                        nombre: 'Rifa #' + row.ID,
                        datos: null
                    };
                }
            });
        }
        
        const backup = {
            fecha: new Date().toISOString(),
            tipo: 'rifas',
            rifas: rifas
        };
        
        res.json(backup);
    } catch (err) {
        console.error("Error en backup de rifas:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint para descargar backup de la base de datos (solo personas, prestamos, ahorros, historialPagos)
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
            tipo: 'sistema',
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
// Este endpoint agrupa por NOMBRE de rifa en lugar de por fecha
app.get('/api/historial-rifas', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Verificar si la tabla Rifas_Datos existe
        const tableCheck = await pool.request()
            .query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Rifas_Datos') 
                SELECT 1 as existe ELSE SELECT 0 como existe`);
        
        if (tableCheck.recordset[0].existe === 0) {
            res.json([]);
            return;
        }
        
        // Obtener todas las rifas guardadas
        const result = await pool.request()
            .query("SELECT ID, Datos FROM Rifas_Datos ORDER BY ID DESC");
        
        if (result.recordset.length === 0) {
            res.json([]);
            return;
        }
        
        // Procesar cada rifa y crear historial agrupado por NOMBRE
        const historial = [];
        
        for (const row of result.recordset) {
            try {
                const datos = JSON.parse(row.Datos);
                const costoPuesto = parseFloat(datos.info?.valor) || 0;
                const costoPremio = parseFloat(datos.info?.inversion) || 0;
                const nombreRifa = datos.info?.nombre || 'Rifa #' + row.ID;
                const fechaSorteo = datos.info?.fecha || '';
                
                let totalParticipantes = 0;
                let totalPagados = 0;
                
                for (let i = 1; i <= 4; i++) {
                    const key = 'tabla' + i;
                    if (datos[key] && datos[key].participantes) {
                        Object.values(datos[key].participantes).forEach(p => {
                            if (p.nombre && p.nombre.trim() !== '') {
                                totalParticipantes++;
                                if (p.pago) totalPagados++;
                            }
                        });
                    }
                }
                
                const totalRecaudado = totalPagados * costoPuesto;
                const gananciaNeta = totalRecaudado - costoPremio;
                
                historial.push({
                    id: row.ID,
                    nombre: nombreRifa,
                    fechaSorteo: fechaSorteo,
                    premio: datos.info?.premio || '',
                    valorPuesto: costoPuesto,
                    costoPremio: costoPremio,
                    totalParticipantes: totalParticipantes,
                    totalPagados: totalPagados,
                    totalRecaudado: totalRecaudado,
                    costoPremios: costoPremio,
                    gananciaNeta: gananciaNeta
                });
            } catch (e) {
                console.log("Error al procesar rifa:", e.message);
            }
        }
        
        // Ordenar por ID descendente (más recientes primero)
        historial.sort((a, b) => b.id - a.id);
        
        res.json(historial);
    } catch (err) {
        console.error("Error al obtener historial:", err.message);
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
        
        // Verificar si existe la columna FechaRegistro en Personas (para calcular antigüedad)
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Personas' AND COLUMN_NAME = 'FechaRegistro')
            BEGIN
                ALTER TABLE Personas ADD FechaRegistro DATETIME DEFAULT GETDATE()
            END`);
        
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

// Verificar si existe la columna FechaPagoCompleto (para guardar la fecha cuando el préstamo se pagó totalmente)
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Prestamos' AND COLUMN_NAME = 'FechaPagoCompleto')
            BEGIN
                ALTER TABLE Prestamos ADD FechaPagoCompleto DATETIME NULL
            END`);

        // 🎯 FIX: Llenar fechas NULL en préstamos legacy para evitar "S/F" en frontend
        await pool.request()
            .query(`
                UPDATE Prestamos 
                SET 
                    FechaInicio = ISNULL(FechaInicio, ISNULL(Fecha, GETDATE())),
                    Fecha = ISNULL(Fecha, GETDATE())
                WHERE FechaInicio IS NULL OR Fecha IS NULL
            `);
        console.log('✅ Fechas legacy de préstamos corregidas (S/F → fechas válidas)');

        // ✅ NEW: InteresPendienteAcumulado para acumular intereses generados
        await pool.request()
            .query(`IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Prestamos' AND COLUMN_NAME = 'InteresPendienteAcumulado')
            BEGIN
                ALTER TABLE Prestamos ADD InteresPendienteAcumulado DECIMAL(18,2) DEFAULT 0
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




