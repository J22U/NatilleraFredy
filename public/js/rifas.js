let syncTimeout;
let ultimaSincronizacionManual = 0;
let timerDebounce;

// --- LÓGICA DE TABLAS ---

function crearTabla(t = {}) {
    const container = document.getElementById('rifasContainer');
    const idTabla = t.idTabla || (container.children.length + 1);
    // Asegurarse de que participantes sea un objeto válido
    const participantes = (t.participantes && typeof t.participantes === 'object') ? t.participantes : {};

    console.log(`🔍 DEBUG crearTabla - Tabla ${idTabla}:`, {
        nombre: t.nombre,
        titulo: t.titulo,
        participantesCount: Object.keys(participantes).length,
        sampleData: Object.keys(participantes).slice(0, 3).map(k => ({num: k, data: participantes[k]}))
    });

    const card = document.createElement('div');
    card.id = `rifa-${idTabla}`; 
    card.className = 'rifa-card'; 

    const header = document.createElement('div');
    header.className = 'rifa-card-header';
    header.style.cursor = 'pointer';
    header.innerHTML = `
        <div>
            <span class="tabla-badge">${idTabla}</span>
            <input type="text" class="input-table-title" 
                   value="${t.nombre || t.titulo || 'Tabla ' + idTabla}" 
                   onclick="event.stopPropagation()">
        </div>
        <i class="fas fa-chevron-down arrow-icon"></i>
    `;

    header.onclick = () => {
        card.classList.toggle('active');
    };

    const body = document.createElement('div');
    body.className = 'rifa-card-body';
    
    const grid = document.createElement('div');
    grid.className = 'numeros-grid';

    for (let i = 0; i < 100; i++) {
        const numStr = i.toString().padStart(2, '0');
        const slot = document.createElement('div');
        slot.className = 'n-slot';
        slot.id = `t${idTabla}-${numStr}`;

        // Obtener datos del participante - verificar que existe y tiene la estructura correcta
        let p = null;
        if (participantes[numStr]) {
            p = participantes[numStr];
        }

        // --- CORRECCIÓN CLAVE: VALIDAR QUE EL NOMBRE NO ESTÉ VACÍO ---
        // Verificamos que p exista, tenga propiedad nombre, y no esté vacío
        if (p && p.nombre && typeof p.nombre === 'string' && p.nombre.trim() !== "") {
            // Solo si tiene nombre real asignamos colores
            if (p.pago) slot.classList.add('paid');
            else slot.classList.add('reserved');
            
            slot.innerHTML = `
                <span class="n-number">${numStr}</span>
                <div class="n-name">${p.nombre}</div>
            `;
            console.log(`✅ Slot ${numStr} tiene datos:`, p);
        } else {
            // Si el nombre es "" o no existe, queda limpio (blanco)
            slot.classList.remove('paid', 'reserved');
            slot.innerHTML = `
                <span class="n-number">${numStr}</span>
                <div class="n-name"></div>
            `;
        }

        slot.onclick = (e) => {
            e.stopPropagation();
            abrirModalCompra(idTabla, numStr);
        };
        
        grid.appendChild(slot);
    }

    body.appendChild(grid);
    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
}

function generarCeldas(tableId, datos) {
    let html = '';
    for (let i = 0; i < 100; i++) {
        const n = i.toString().padStart(2, '0');
        // Ajuste para leer los datos que vienen del servidor
        const info = (datos && datos.participantes && datos.participantes[n]) 
                     ? datos.participantes[n] 
                     : {nombre: '', pago: false};
        
        let clase = info.pago ? 'paid' : (info.nombre && info.nombre.trim() !== '' ? 'reserved' : '');

        html += `
            <div class="n-slot ${clase}" id="slot-${tableId}-${n}">
                <div class="n-header">
                    <span class="n-number">${n}</span>
                    <input type="checkbox" class="pay-check" ${info.pago ? 'checked' : ''} 
                           onchange="actualizarEstado('${tableId}', '${n}')">
                </div>
                <input type="text" class="n-name" placeholder="Nombre..." value="${info.nombre || ''}" 
                       oninput="actualizarColor('${tableId}', '${n}')" 
                       onchange="guardarTodo()">
            </div>`;
    }
    return html;
}

// Agrupa todos los datos y los envía al servidor (Llamada general)
async function guardarTodo() {
    const status = document.getElementById('sync-status');
    if (status) status.className = 'sync-saving';

    const datos = recolectarDatosPantalla();

    // Verificación de seguridad: Si no hay fecha, no mandamos nada para evitar el Error 400
    if (!datos.info.fecha) {
        console.warn("⚠️ Intento de guardado sin fecha abortado.");
        if (status) status.className = 'sync-error';
        return;
    }

    try {
        const response = await fetch('/api/guardar-rifa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (response.ok) {
            if (status) {
                status.className = 'sync-success'; // Luz verde
                setTimeout(() => status.className = 'sync-idle', 2000);
            }
        } else {
            throw new Error("Error 400 o 500 en Render");
        }
    } catch (error) {
        console.error("❌ Error al sincronizar:", error);
        if (status) status.className = 'sync-error'; // Luz roja
    }
}

function guardarProgresoDebounce() {
    clearTimeout(timerDebounce);
    
    const status = document.getElementById('sync-status');
    if (status) status.className = 'sync-saving'; // Luz azul: "Te estoy escuchando..."

    timerDebounce = setTimeout(() => {
        console.log("💾 Guardado automático por inactividad...");
        guardarTodo();
    }, 800); // 800ms es el punto dulce para no interrumpir al que escribe rápido
}

// Extrae los nombres y pagos de una tabla específica
function obtenerParticipantesDeTabla(tablaElemento) {
    const participantes = {};
    const slots = tablaElemento.querySelectorAll('.n-slot');

    slots.forEach(slot => {
        const numero = slot.querySelector('.n-number')?.textContent;
        // IMPORTANTE: Ahora el nombre está en un div/span, no en un input value
        const nombre = slot.querySelector('.n-name')?.textContent.trim(); 

        if (nombre && nombre !== "") {
            participantes[numero] = {
                nombre: nombre,
                // CAMBIO CLAVE: En lugar de .checked, miramos si tiene la clase 'paid'
                pago: slot.classList.contains('paid') 
            };
        }
    });
    return participantes;
}

// Cambia el color del cuadrito (Verde/Naranja/Blanco)
function actualizarColor(tableId, n) {
    const slot = document.getElementById(`t${tableId}-${n}`); // Usamos el ID de tu crearTabla
    const nombre = slot.querySelector('.n-name').innerText.trim();
    const pago = slot.classList.contains('paid');

    // Actualización visual inmediata
    slot.classList.remove('paid', 'reserved');
    if (pago) slot.classList.add('paid');
    else if (nombre !== '') slot.classList.add('reserved');

    // Iniciamos la espera inteligente (Debounce)
    guardarProgresoDebounce();
}

// Se ejecuta al marcar el checkbox de pago
function actualizarEstado(tableId, n) {
    // Al ser un cambio de estado (pago), podemos ser más directos
    actualizarContadoresRifa();
    guardarTodo(); 
}

// --- ACTUALIZACIÓN Y COLORES ---

// En lugar de guardarTodo(), enviamos solo la tabla afectada
function guardarCambioIndividual(tablaId) {
    const status = document.getElementById('sync-status');
    if (status) status.className = 'sync-saving';

    const tablaElemento = document.getElementById(`rifa-${tablaId}`);
    if (!tablaElemento) return;

    // CAPTURAMOS LA FECHA (Vital para el historial)
    // Primero miramos si hay una fecha de historial, si no, la fecha actual de la rifa
    const fechaRifa = document.getElementById('filtroFecha')?.value || document.getElementById('rifaDate')?.value;

    const datosTabla = {
        id: tablaId,
        fecha: fechaRifa, // <--- AHORA EL SERVIDOR SABE QUÉ RIFA ES
        titulo: tablaElemento.querySelector('.input-table-title').value,
        participantes: obtenerParticipantesDeTabla(tablaElemento)
    };

    fetch('/api/guardar-tabla-unica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosTabla)
    })
    .then(res => {
        if(res.ok) {
            if (status) {
                status.className = 'sync-success';
                setTimeout(() => status.className = 'sync-idle', 2000);
            }
        } else {
            if (status) status.className = 'sync-error';
        }
    })
    .catch(() => {
        if (status) status.className = 'sync-error';
    });
}

async function sincronizarConServidor(datos) {
    const status = document.getElementById('sync-status');
    // Forzamos luz azul al empezar
    if (status) status.className = 'sync-saving';

    try {
        const response = await fetch('/api/guardar-rifa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        // Verificamos si la respuesta es JSON o texto
        const result = await response.json();
        
        if (response.ok && (result.success || result.mensaje)) {
            console.log("✅ Servidor actualizado");
            if (status) {
                status.className = 'sync-success'; // Luz Verde
                setTimeout(() => status.className = 'sync-idle', 2000);
            }
        } else {
            throw new Error("Respuesta del servidor no válida");
        }
    } catch (error) {
        console.error("❌ Error de red:", error);
        if (status) {
            status.className = 'sync-error'; // Luz Roja (añádela a tu CSS)
            // Si falla, volvemos a idle tras 4 segundos para que no asuste
            setTimeout(() => status.className = 'sync-idle', 4000);
        }
    }
}

async function cargarRifas() {
    const container = document.getElementById('rifasContainer');
    
    // 1. Intentamos obtener la fecha de cualquiera de los dos inputs
    const filtroFecha = document.getElementById('filtroFecha');
    const rifaDate = document.getElementById('rifaDate');
    const fechaParaCargar = filtroFecha?.value || rifaDate?.value || new Date().toISOString().split('T')[0];

    // Aseguramos que ambos calendarios muestren la misma fecha
    if (filtroFecha) filtroFecha.value = fechaParaCargar;
    if (rifaDate) rifaDate.value = fechaParaCargar;

    // Declarar datos aquí para que esté disponible en todo el ámbito de la función
    let datos = { info: {} };

    try {
        // 2. Intentamos pedir los datos al servidor
        const response = await fetch(`/api/cargar-rifas?fecha=${fechaParaCargar}`); 
        
        if (!response.ok) {
            throw new Error(`Error servidor: ${response.status}`);
        }

        datos = await response.json();

        // DEBUG: Ver qué datos llegan del servidor
        console.log("🔍 DATOS RECIBIDOS DEL SERVIDOR:", JSON.stringify(datos).substring(0, 1000));

        // 3. Limpiamos el contenedor antes de dibujar
        container.innerHTML = ''; 

        // Verificar si hay datos reales o no
        if (datos && datos.sinDatos) {
            console.log("⚠️ No hay datos para esta fecha:", datos.mensaje);
            // Mostrar mensaje de que no hay datos
            container.innerHTML = `<div style="text-align:center; padding: 50px; color: #636e72;">
                <i class="fas fa-info-circle" style="font-size: 3rem; color: #0984e3;"></i>
                <p style="font-size: 1.2rem; margin-top: 15px;">${datos.mensaje || 'No hay rifa guardada para esta fecha'}</p>
                <p style="font-size: 0.9rem;">Puedes agregar participantes y se guardará automáticamente.</p>
            </div>`;
            
            // Dibujar tablas vacías para que pueda trabajar
            for (let i = 1; i <= 4; i++) {
                crearTabla({ nombre: `Tabla ${i}`, idTabla: i, participantes: {} });
            }
            
            // Actualizar contadores y cargar premios vacíos
            actualizarContadoresRifa();
            cargarPremios({ info: {} });
            return;
        }

        // 4. Llenamos la información general (si existe)
        if (datos && datos.info) {
            console.log("🔍 DEBUG - Llenando info de rifa:", datos.info);
            if(document.getElementById('rifaName')) document.getElementById('rifaName').value = datos.info.nombre || '';
            if(document.getElementById('rifaPrize')) document.getElementById('rifaPrize').value = datos.info.premio || '';
            if(document.getElementById('rifaCost')) document.getElementById('rifaCost').value = datos.info.valor || '';
            if(document.getElementById('costoPremio')) document.getElementById('costoPremio').value = datos.info.inversion || '';
            
            // Also fill date fields
            if(document.getElementById('rifaDate') && datos.info.fecha) {
                document.getElementById('rifaDate').value = datos.info.fecha;
            }
            if(document.getElementById('filtroFecha') && datos.info.fecha) {
                document.getElementById('filtroFecha').value = datos.info.fecha;
            }
        } else {
            console.log("⚠️ DEBUG - No hay datos.info en la respuesta");
        }

        // 5. Dibujamos las 4 tablas (usando datos del servidor o vacías como respaldo)
        for (let i = 1; i <= 4; i++) {
            const llaveTabla = `tabla${i}`;
            console.log(`🔍 DEBUG - Procesando ${llaveTabla}:`, datos[llaveTabla]);
            
            const t = datos[llaveTabla] || { nombre: `Tabla ${i}`, participantes: {} };
            
            // Forzamos el ID correcto para que el acordeón funcione
            t.idTabla = i; 
            if (!t.nombre) t.nombre = `Tabla ${i}`;
            
            // Ensure participantes is a valid object
            if (!t.participantes || typeof t.participantes !== 'object') {
                t.participantes = {};
                console.log(`⚠️ DEBUG - Tabla ${i} no tenía participantes, se inicializó como objeto vacío`);
            }
            
            crearTabla(t);
        }

    } catch (error) {
        console.error("⚠️ Error al cargar, generando tablas de emergencia:", error);
        
        // 6. RESPALDO: Si el servidor falla, dibujamos las tablas vacías para que puedas trabajar
        container.innerHTML = ''; 
        for (let i = 1; i <= 4; i++) {
            crearTabla({ 
                nombre: `Tabla ${i}`, 
                idTabla: i, 
                participantes: {} 
            });
        }
        
        // Datos vacíos para la función cargarPremios
        datos = { info: {} };
    }

// 7. Actualizamos los cálculos monetarios finales
    if (typeof actualizarContadoresRifa === "function") {
        actualizarContadoresRifa();
    }
    
    // 8. Cargamos los datos de premios
    cargarPremios(datos);
}

function toggleTabla(id) {
    const card = document.getElementById(`rifa-${id}`);
    const arrow = document.getElementById(`arrow-${id}`);
    
    // Usamos 'active' para que coincida con tu CSS (línea 161 de tu CSS)
    if (!card.classList.contains('active')) {
        card.classList.add('active');
        if (arrow) arrow.style.transform = 'rotate(90deg)'; 
    } else {
        card.classList.remove('active');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

// Evitar cerrar la pestaña si se está guardando
window.onbeforeunload = function (e) {
    const status = document.getElementById('sync-status');
    if (status && status.classList.contains('sync-saving')) {
        const message = "Se están guardando los cambios en la nube. ¿Estás seguro de que quieres salir?";
        e.returnValue = message; // Estándar para la mayoría de navegadores
        return message;          // Estándar para algunos otros
    }
};

function buscarCliente() {
    const texto = document.getElementById('searchInput').value.toLowerCase().trim();
    const panel = document.getElementById('searchResults');
    const valorPuesto = parseFloat(document.getElementById('rifaCost').value) || 0;
    
    panel.innerHTML = ''; 
    if (texto.length < 2) { panel.style.display = 'none'; return; }

    let resultados = {};

    document.querySelectorAll('.rifa-card').forEach(card => {
        const tituloTabla = card.querySelector('.input-table-title').value;
        const badgeTabla = card.querySelector('.tabla-badge').innerText;
        const slots = card.querySelectorAll('.n-slot');

        slots.forEach(slot => {
            const nombre = slot.querySelector('.n-name').textContent.toLowerCase().trim();
            const numero = slot.querySelector('.n-number').innerText;
            const pagado = slot.classList.contains('paid');

            if (nombre.includes(texto)) {
                if (!resultados[nombre]) {
                    resultados[nombre] = { tablas: {}, totalDeudaGlobal: 0, totalPuestosDebe: 0, nombreOriginal: nombre };
                }
                
                if (!resultados[nombre].tablas[card.id]) {
                    resultados[nombre].tablas[card.id] = { 
                        titulo: tituloTabla, 
                        numeroTabla: badgeTabla, 
                        numeros: [], 
                        cardRef: card 
                    };
                }
                
                resultados[nombre].tablas[card.id].numeros.push({ num: numero, pago: pagado });
                
                if (!pagado) {
                    resultados[nombre].totalPuestosDebe++;
                    resultados[nombre].totalDeudaGlobal += valorPuesto;
                }
            }
        });
    });

    const nombresHallados = Object.keys(resultados);
    
    if (nombresHallados.length === 0) {
        panel.innerHTML = '<div style="padding:15px; text-align:center; color:gray;">No se encontraron resultados.</div>';
    } else {
        nombresHallados.forEach(nombre => {
            const cliente = resultados[nombre];
            const clienteDiv = document.createElement('div');
            clienteDiv.className = 'cliente-resumen';
            
            let tablasHTML = '';
            for (const idTabla in cliente.tablas) {
                const data = cliente.tablas[idTabla];
                const deudas = data.numeros.filter(n => !n.pago).map(n => n.num);
                const pagados = data.numeros.filter(n => n.pago).map(n => n.num);
                
                tablasHTML += `
                    <div class="tabla-item" onclick="irATabla('${data.cardRef.id}')">
                        <div class="tabla-nombre">
                            <span class="resumen-badge">${data.numeroTabla}</span> ${data.titulo}
                        </div>
                        <div class="numeros-lista">
                            ${deudas.length > 0 ? `<span class="badge-debe">Debe: ${deudas.join(', ')}</span>` : ''}
                            ${pagados.length > 0 ? `<span class="badge-pago">Pagó: ${pagados.join(', ')}</span>` : ''}
                        </div>
                    </div>
                `;
            }

            const totalDinero = cliente.totalDeudaGlobal.toLocaleString('es-CO', { 
                style: 'currency', currency: 'COP', maximumFractionDigits: 0 
            });

            // BOTÓN DE PAGO MASIVO (Solo si debe)
            const botonPagoMasivo = cliente.totalPuestosDebe > 0 
    ? `<button onclick='pagarDeudaTotal(${JSON.stringify(cliente.nombreOriginal)})' class="btn-saldar-busqueda">
        <i class="fas fa-money-bill-wave"></i> SALDAR TODO
       </button>` 
    : '';

            clienteDiv.innerHTML = `
                <div class="cliente-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 800; font-size: 1.1rem;">${nombre.toUpperCase()}</span>
                        ${cliente.totalPuestosDebe > 0 
                            ? `<span class="total-deuda-tag">DEUDA TOTAL: ${totalDinero}</span>` 
                            : `<span class="total-pago-tag">AL DÍA ✅</span>`}
                    </div>
                    ${botonPagoMasivo}
                </div>
                <div class="cliente-tablas">${tablasHTML}</div>
            `;
            panel.appendChild(clienteDiv);
        });
    }
    panel.style.display = 'block';
}

async function pagarDeudaTotal(nombreCliente) {
    const nombreBuscado = nombreCliente.toLowerCase().trim();

    // 1. Confirmación elegante
    const result = await Swal.fire({
        title: '¿Confirmar pago total?',
        html: `¿Deseas marcar todos los puestos de <b>${nombreBuscado.toUpperCase()}</b> como pagados en este sorteo?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#00b894',
        cancelButtonColor: '#dfe6e9',
        confirmButtonText: '<i class="fas fa-check"></i> Sí, pagar todo',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        focusConfirm: false
    });

    if (result.isConfirmed) {
        let cambios = 0;
        const slots = document.querySelectorAll('.n-slot');

        slots.forEach(slot => {
            const txtNombre = slot.querySelector('.n-name').textContent.toLowerCase().trim();
            if (txtNombre === nombreBuscado && !slot.classList.contains('paid')) {
                slot.classList.add('paid');
                slot.setAttribute('data-pago', 'true'); 
                cambios++;
            }
        });

        if (cambios > 0) {
            actualizarContadoresRifa();
            
            try {
                // Mostramos un loader mientras guarda
                Swal.fire({
                    title: 'Guardando...',
                    didOpen: () => { Swal.showLoading(); },
                    allowOutsideClick: false
                });

                await guardarTodo();

                // 2. Mensaje de éxito
                Swal.fire({
                    title: '¡Pago Registrado!',
                    text: `Se actualizaron ${cambios} puestos correctamente.`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });

                document.getElementById('searchResults').style.display = 'none';
                document.getElementById('searchInput').value = '';
                
            } catch (error) {
                console.error("Error al guardar:", error);
                Swal.fire('Error', 'Se hizo el cambio visual pero no se pudo guardar en la nube.', 'error');
            }
        } else {
            Swal.fire({
                title: 'Sin cambios',
                text: 'Este cliente ya no tiene deudas pendientes en esta rifa.',
                icon: 'info'
            });
        }
    }
}

// Función para navegar y resaltar
function irATabla(cardId) {
    const card = document.getElementById(cardId);
    const panel = document.getElementById('searchResults');
    
    if (card) {
        card.classList.add('active'); // Abrir acordeón
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Efecto visual de flash
        card.style.boxShadow = "0 0 20px rgba(9, 132, 227, 0.4)";
        setTimeout(() => card.style.boxShadow = "", 2000);
        
        panel.style.display = 'none'; // Cerrar buscador
        document.getElementById('searchInput').value = ''; 
    }
}

// Función auxiliar para no perder los colores verde/naranja al buscar
function actualizarColorAlVuelo(slot) {
    const nombre = slot.querySelector('.n-name').value.trim();
    const pagado = slot.querySelector('.pay-check').checked;
    slot.classList.remove('reserved', 'paid');
    if (pagado) slot.classList.add('paid');
    else if (nombre !== '') slot.classList.add('reserved');
}

async function cargarRifasSilencioso() {
    try {
        const response = await fetch('/api/cargar-rifas');
        const datos = await response.json();

        if (datos && !datos.error) {
            // RECORREMOS DEL 1 AL 4 (Estructura de tu BD)
            for (let i = 1; i <= 4; i++) {
                const llave = `tabla${i}`;
                const infoTabla = datos[llave];

                if (infoTabla && infoTabla.participantes) {
                    actualizarSoloNombres(i, infoTabla.participantes);
                }
            }
        }
    } catch (error) {
        console.error("Error en auto-refresco silencioso:", error);
    }
}

// Función auxiliar para que no se refresque toda la pantalla y se cierren las tablas
function actualizarSoloNombres(idTabla, participantes) {
    for (let i = 0; i < 100; i++) {
        const numStr = i.toString().padStart(2, '0');
        const slot = document.getElementById(`t${idTabla}-${numStr}`);
        
        if (slot) {
            const p = participantes[numStr];
            const nameDiv = slot.querySelector('.n-name');
            
            if (p && nameDiv) {
                nameDiv.innerText = p.nombre;
                
                // MANTENER EL COLOR NARANJA EN EL REFRESCO
                if (!p.pago && !p.adelantado) {
                    nameDiv.style.color = '#e67e22';
                    nameDiv.style.fontWeight = 'bold';
                } else {
                    nameDiv.style.color = '';
                    nameDiv.style.fontWeight = 'normal';
                }

                slot.classList.toggle('paid', p.pago);
                slot.classList.toggle('reserved', !p.pago);
                slot.setAttribute('data-adelantado', p.adelantado ? 'true' : 'false');
            } else if (nameDiv) {
                nameDiv.innerText = '';
                slot.classList.remove('paid', 'reserved');
            }
        }
    }
}

// Función para cargar las ganancias acumuladas de rifas
let gananciasAcumuladasRifas = 0;

async function cargarGananciasAcumuladas() {
    try {
        const response = await fetch('/api/ganancias-rifas-acumuladas');
        const data = await response.json();
        gananciasAcumuladasRifas = data.gananciaTotal || 0;
        actualizarDisplayGanancias();
    } catch (error) {
        console.error("Error al cargar ganancias acumuladas:", error);
    }
}

function actualizarDisplayGanancias() {
    const elemento = document.getElementById('stats-ganancia');
    if (elemento) {
        const formato = new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', maximumFractionDigits: 0
        });
        elemento.textContent = formato.format(gananciasAcumuladasRifas);
        
        // Color según ganancia positiva o negativa
        if (gananciasAcumuladasRifas > 0) {
            elemento.style.color = '#00b894'; // Verde
        } else if (gananciasAcumuladasRifas < 0) {
            elemento.style.color = '#e74c3c'; // Rojo
        } else {
            elemento.style.color = '';
        }
    }
}

// Función para guardar las ganancias acumuladas
async function guardarGananciasAcumuladas() {
    try {
        await fetch('/api/ganancias-rifas-acumuladas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gananciaAcumulada: gananciasAcumuladasRifas })
        });
    } catch (error) {
        console.error("Error al guardar ganancias acumuladas:", error);
    }
}

// Función para acumular la ganancia de la rifa actual al total
async function acumularGananciaRifa() {
    // Primero calculamos la ganancia de la rifa actual
    const costoPuesto = parseFloat(document.getElementById('rifaCost').value) || 0;
    const inversionPorTabla = parseFloat(document.getElementById('costoPremio').value) || 0;
    const cantidadTablas = document.querySelectorAll('.rifa-card').length;
    const inversionTotalPremios = inversionPorTabla * cantidadTablas;
    
    let totalRecogido = 0;
    document.querySelectorAll('.n-slot').forEach(slot => {
        if (slot.classList.contains('paid')) {
            totalRecogido += costoPuesto;
        }
    });
    
    // Ganancia de esta rifa específica
    const gananciaEstaRifa = totalRecogido - inversionTotalPremios;
    
    // Solo acumulamos si hay una ganancia positiva
    if (gananciaEstaRifa > 0) {
        // Sumamos al total acumulado
        gananciasAcumuladasRifas += gananciaEstaRifa;
        
        // Guardamos en el servidor
        await guardarGananciasAcumuladas();
        
        // Actualizamos el display
        actualizarDisplayGanancias();
        
        console.log(`Ganancia de esta rifa: $${gananciaEstaRifa.toLocaleString()} - Total acumulado: $${gananciasAcumuladasRifas.toLocaleString()}`);
        
        return true;
    }
    
    return false;
}

// Función para cargar los datos de la rifa al iniciar
function inicializarRifa() {
    cargarRifas();
    cargarGananciasAcumuladas();
    
    // Renderizar el panel de premios aunque no haya datos cargados
    renderizarPanelPremios();
    
    // Agregar listeners a los campos de información
    ['rifaName', 'rifaPrize', 'rifaCost', 'rifaDate', 'costoPremio'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            // Usar 'change' para inputs y selects, 'input' para cambios en tiempo real
            el.addEventListener('change', () => {
                guardarTodo();
                actualizarContadoresRifa();
            });
        }
    });
}

// Llamar al inicio al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar rifa y cargar datos
    inicializarRifa();
    
    // Lógica de fechas (sincronizar los dos calendarios)
    const f1 = document.getElementById('filtroFecha');
    const f2 = document.getElementById('rifaDate');

    // Si ambos están vacíos, ponemos la fecha de hoy
    if (f1 && !f1.value) {
        const hoy = new Date().toISOString().split('T')[0];
        f1.value = hoy;
        if (f2) f2.value = hoy;
    }

    // Sincronizar: si cambias uno, se cambia el otro
    f1?.addEventListener('change', () => { if(f2) f2.value = f1.value; cargarRifas(); });
    f2?.addEventListener('change', () => { if(f1) f1.value = f2.value; cargarRifas(); });
});

function generarPDF() {
    // Recolectar datos actuales
    const datos = recolectarDatosPantalla();
    const fecha = document.getElementById('filtroFecha')?.value || document.getElementById('rifaDate')?.value || new Date().toISOString().split('T')[0];
    const nombreRifa = document.getElementById('rifaName')?.value || 'Rifa';
    const valorPuesto = parseFloat(document.getElementById('rifaCost')?.value) || 0;
    const costoPremio = parseFloat(document.getElementById('costoPremio')?.value) || 0;
    const premio = document.getElementById('rifaPrize')?.value || 'No definido';
    
    // Calcular estadísticas
    let totalPagados = 0;
    let totalPendientes = 0;
    let listaPagados = [];
    let listaPendientes = [];
    
    Object.keys(datos).forEach(key => {
        if (key.startsWith('tabla')) {
            const participantes = datos[key].participantes || {};
            Object.keys(participantes).forEach(num => {
                const p = participantes[num];
                if (p.nombre && p.nombre.trim() !== '') {
                    const info = { numero: num, tabla: key.replace('tabla', ''), nombre: p.nombre };
                    if (p.pago) {
                        totalPagados += valorPuesto;
                        listaPagados.push(info);
                    } else {
                        totalPendientes += valorPuesto;
                        listaPendientes.push(info);
                    }
                }
            });
        }
    });
    
    const cantidadTablas = document.querySelectorAll('.rifa-card').length;
    const inversionTotal = costoPremio * cantidadTablas;
    const gananciaNeta = totalPagados - inversionTotal;
    
    const formato = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    });
    
    // Crear contenido del reporte
    const reporteHTML = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; background: white;">
        <!-- Encabezado -->
        <div style="text-align: center; border-bottom: 3px solid #0984e3; padding-bottom: 15px; margin-bottom: 20px;">
            <h1 style="color: #2d3436; margin: 0; font-size: 24px;">📋 REPORTE DE RIFA</h1>
            <p style="color: #636e72; margin: 5px 0; font-size: 14px;">Natillera - Control de Rifas</p>
        </div>
        
        <!-- Información General -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td style="padding: 10px; border: 1px solid #dfe6e9; background: #f8f9fa; width: 50%;">
                    <strong>📅 Fecha Sorteo:</strong> ${fecha}
                </td>
                <td style="padding: 10px; border: 1px solid #dfe6e9; background: #f8f9fa; width: 50%;">
                    <strong>🎯 Premio:</strong> ${premio}
                </td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #dfe6e9;">
                    <strong>💰 Valor Puesto:</strong> ${formato.format(valorPuesto)}
                </td>
                <td style="padding: 10px; border: 1px solid #dfe6e9;">
                    <strong>🏆 Costo Premio:</strong> ${formato.format(costoPremio)} c/u
                </td>
            </tr>
        </table>
        
        <!-- Resumen Financiero -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 15px; border-radius: 10px; margin-bottom: 20px; color: white;">
            <h3 style="margin: 0 0 10px 0; text-align: center;">💵 RESUMEN FINANCIERO</h3>
            <table style="width: 100%; color: white; font-size: 14px;">
                <tr>
                    <td style="padding: 8px;">✅ <strong>Total Recaudado:</strong></td>
                    <td style="text-align: right; font-size: 18px;"><strong>${formato.format(totalPagados)}</strong></td>
                </tr>
                <tr>
                    <td style="padding: 8px;">⏳ <strong>Total Pendiente:</strong></td>
                    <td style="text-align: right;">${formato.format(totalPendientes)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px;">📊 <strong>Inversión Premios:</strong></td>
                    <td style="text-align: right;">${formato.format(inversionTotal)}</td>
                </tr>
                <tr style="border-top: 2px solid white;">
                    <td style="padding: 10px 8px; font-size: 16px;">💚 <strong>GANANCIA NETA:</strong></td>
                    <td style="text-align: right; font-size: 20px;"><strong>${formato.format(gananciaNeta)}</strong></td>
                </tr>
            </table>
        </div>
        
        <!-- Lista de Pagados -->
        <div style="margin-bottom: 20px;">
            <h3 style="color: #00b894; border-bottom: 2px solid #00b894; padding-bottom: 5px;">✅ PARTICIPANTES QUE PAGARON (${listaPagados.length})</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <tr style="background: #00b894; color: white;">
                    <th style="padding: 8px; text-align: left;">#</th>
                    <th style="padding: 8px; text-align: left;">Tabla</th>
                    <th style="padding: 8px; text-align: left;">Número</th>
                    <th style="padding: 8px; text-align: left;">Nombre</th>
                </tr>
                ${listaPagados.map((p, i) => `
                <tr style="${i % 2 === 0 ? 'background: #f8fff8;' : 'background: white;'}">
                    <td style="padding: 6px; border: 1px solid #dfe6e9;">${i + 1}</td>
                    <td style="padding: 6px; border: 1px solid #dfe6e9;">Tabla ${p.tabla}</td>
                    <td style="padding: 6px; border: 1px solid #dfe6e9; font-weight: bold;">${p.numero}</td>
                    <td style="padding: 6px; border: 1px solid #dfe6e9;">${p.nombre}</td>
                </tr>
                `).join('')}
            </table>
        </div>
        
        <!-- Lista de Pendientes -->
        <div style="margin-bottom: 20px;">
            <h3 style="color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 5px;">⏳ PARTICIPANTES PENDIENTES (${listaPendientes.length})</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <tr style="background: #e74c3c; color: white;">
                    <th style="padding: 8px; text-align: left;">#</th>
                    <th style="padding: 8px; text-align: left;">Tabla</th>
                    <th style="padding: 8px; text-align: left;">Número</th>
                    <th style="padding: 8px; text-align: left;">Nombre</th>
                </tr>
                ${listaPendientes.length > 0 ? listaPendientes.map((p, i) => `
                <tr style="${i % 2 === 0 ? 'background: #fff8f8;' : 'background: white;'}">
                    <td style="padding: 6px; border: 1px solid #dfe6e9;">${i + 1}</td>
                    <td style="padding: 6px; border: 1px solid #dfe6e9;">Tabla ${p.tabla}</td>
                    <td style="padding: 6px; border: 1px solid #dfe6e9; font-weight: bold;">${p.numero}</td>
                    <td style="padding: 6px; border: 1px solid #dfe6e9;">${p.nombre}</td>
                </tr>
                `).join('') : '<tr><td colspan="4" style="padding: 15px; text-align: center; color: #636e72;">Sin participantes pendientes</td></tr>'}
            </table>
        </div>
        
        <!-- Pie de página -->
        <div style="text-align: center; padding-top: 15px; border-top: 1px solid #dfe6e9; color: #636e72; font-size: 11px;">
            <p>Reporte generado el ${new Date().toLocaleString('es-CO')}</p>
            <p>📊 Sistema de Control de Natillera</p>
        </div>
    </div>
    `;
    
    // Crear elemento temporal para el PDF
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = reporteHTML;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '800px';
    document.body.appendChild(tempDiv);
    
    const opciones = {
        margin: [10, 10],
        filename: `Rifa_${fecha}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        html2pdf().set(opciones).from(tempDiv).save().then(() => {
            document.body.removeChild(tempDiv);
        });
    } catch (err) {
        console.error("Error al generar PDF:", err);
        if (tempDiv.parentNode) {
            document.body.removeChild(tempDiv);
        }
    }
}

function eliminarTabla(id) {
    if (!confirm('¿Estás seguro de eliminar esta tabla?')) return;

    const card = document.getElementById(`rifa-${id}`);
    if (card) {
        card.remove();
        console.log("🗑️ Tabla eliminada visualmente.");
        
        // 1. REGISTRAMOS EL TIEMPO PARA BLOQUEAR REFRESCO
        ultimaSincronizacionManual = Date.now(); 
        
        // 2. ACTUALIZAMOS EL SNAPSHOT LOCAL INMEDIATAMENTE
        // Esto es vital: le decimos al navegador "esta es la realidad ahora"
        const datosActuales = recolectarDatosPantalla(); 
        localStorage.setItem('ultimo_snapshot_tablas', JSON.stringify(datosActuales.tablas));
        
        // 3. ENVIAMOS AL SERVIDOR
        sincronizarConServidor(datosActuales);
        console.log("📤 Sincronización de borrado enviada.");
    }
}

// Función auxiliar para que los números de las tablas se ajusten solos
function reordenarBadges() {
    const badges = document.querySelectorAll('.tabla-badge');
    badges.forEach((badge, index) => {
        badge.innerText = `#${index + 1}`;
    });
}

/**
 * Escanea la pantalla actual y genera un objeto con todos los datos
 * para guardarlos en el LocalStorage y enviarlos al servidor.
 */
function recolectarDatosPantalla() {
    const fechaSeleccionada = document.getElementById('rifaDate')?.value || 
                              document.getElementById('filtroFecha')?.value;

    const payload = {
        info: {
            nombre: document.getElementById('rifaName')?.value || '',
            premio: document.getElementById('rifaPrize')?.value || '',
            valor: document.getElementById('rifaCost')?.value || '',
            fecha: fechaSeleccionada,
            inversion: document.getElementById('costoPremio')?.value || '',
            premios: datosPremios // Incluir los premios por tabla
        }
    };

    const tablas = document.querySelectorAll('.rifa-card');
    
    tablas.forEach((card) => {
        const idTablaMatch = card.id.match(/\d+/);
        const numeroDeTabla = idTablaMatch ? idTablaMatch[0] : null;
        if (!numeroDeTabla) return;

        const participantes = {};

        // Recorremos los 100 números (00-99) para asegurar que los vacíos se limpien en la DB
        for (let i = 0; i <= 99; i++) {
            const numStr = i.toString().padStart(2, '0');
            const slot = document.getElementById(`t${numeroDeTabla}-${numStr}`);

            if (slot) {
                const nombre = slot.querySelector('.n-name')?.textContent.trim() || "";
                
                // IMPORTANTE: Enviamos el número SIEMPRE. 
                // Si nombre es "", el servidor borrará al participante anterior.
                participantes[numStr] = {
                    nombre: nombre,
                    pago: slot.classList.contains('paid'),
                    adelantado: slot.getAttribute('data-adelantado') === 'true'
                };
            }
        }

        payload[`tabla${numeroDeTabla}`] = {
            titulo: card.querySelector('.input-table-title')?.value || `Tabla ${numeroDeTabla}`,
            participantes: participantes
        };
    });

    return payload;
}

function abrirModalCompra(idTabla, numStr) {
    // Guardamos estos datos globalmente para usarlos al confirmar
    window.currentTablaId = idTabla;
    window.currentNumStr = numStr;

    const slot = document.getElementById(`t${idTabla}-${numStr}`);
    const nombreActual = slot.querySelector('.n-name').textContent;
    const esPagado = slot.classList.contains('paid');

    document.getElementById('modalNombre').value = nombreActual;
    document.getElementById('modalPago').checked = esPagado;
    
    document.getElementById('modalCompra').style.display = 'flex';
}

async function confirmarCompra() {
    const nombreInput = document.getElementById('modalNombre').value.trim();
    const pago = document.getElementById('modalPago').checked;
    const adelantado = document.getElementById('modalAdelantado').checked;

    const tablaId = window.currentTablaId;
    const numStr = window.currentNumStr;

    const slot = document.getElementById(`t${tablaId}-${numStr}`);
    if (!slot) return;

    const nameElement = slot.querySelector('.n-name');

    if (nombreInput === "") {
        // --- LIMPIEZA TOTAL ---
        nameElement.textContent = ""; 
        slot.classList.remove('paid', 'reserved'); // Quitamos verde y naranja
        slot.removeAttribute('data-pago');
        slot.removeAttribute('data-adelantado');
    } else {
        // --- ASIGNACIÓN DE COLOR ---
        nameElement.textContent = nombreInput;
        slot.classList.remove('paid', 'reserved');
        
        if (pago) {
            slot.classList.add('paid'); // Verde
        } else {
            slot.classList.add('reserved'); // Naranja
        }
        
        slot.setAttribute('data-pago', pago);
        slot.setAttribute('data-adelantado', adelantado);
    }

    cerrarModal();

    // Sincronizamos con el servidor
    setTimeout(async () => {
        actualizarContadoresRifa();
        await guardarTodo();
    }, 500);
}

function actualizarContadoresVisuales() {
    const datos = recolectarDatosPantalla();
    const costoPuesto = parseFloat(datos.info.valor) || 0;
    const premioValor = 0; // Si tienes un campo para valor del premio, úsalo aquí

    let totalRecogido = 0;
    let totalPendiente = 0;

    // Recorremos las tablas del objeto que generó recolectarDatosPantalla
    Object.keys(datos).forEach(llave => {
        if (llave.startsWith('tabla')) {
            const participantes = datos[llave].participantes;
            Object.values(participantes).forEach(p => {
                if (p.pago) {
                    totalRecogido += costoPuesto;
                } else {
                    totalPendiente += costoPuesto;
                }
            });
        }
    });

    // Actualizar el HTML
    document.getElementById('stats-total-debe').innerText = `$ ${totalPendiente.toLocaleString()}`;
    document.getElementById('stats-total-pago').innerText = `$ ${totalRecogido.toLocaleString()}`;
    
    // Ganancia: Aquí tú decides si es el total recogido o el total proyectado
    document.getElementById('stats-ganancia').innerText = `$ ${totalRecogido.toLocaleString()}`;
}

function actualizarContadoresRifa() {
    const costoPuesto = parseFloat(document.getElementById('rifaCost').value) || 0;
    const costoPremio = parseFloat(document.getElementById('costoPremio').value) || 0;
    
    // Contamos cuántas tablas hay actualmente en el contenedor
    const cantidadTablas = document.querySelectorAll('.rifa-card').length;
    
    // Calcular el dinero recogido (total de pagos recibidos)
    let potencialTotal = 0; 
    let totalRecogido = 0;  

    // Escaneamos todos los slots
    document.querySelectorAll('.n-slot').forEach(slot => {
        potencialTotal += costoPuesto;
        if (slot.classList.contains('paid')) {
            totalRecogido += costoPuesto;
        }
    });

    // Calcular el COSTO REAL DE PREMIOS basado en los ganadores registrados
    // Solo cuenta los premios que están marcados como "entregados"
    let costoPremiosReales = 0;
    let cantidadGanadores = 0;
    
    if (datosPremios) {
        for (let i = 1; i <= 4; i++) {
            const key = `tabla${i}`;
            if (datosPremios[key] && datosPremios[key].ganadores) {
                datosPremios[key].ganadores.forEach(ganador => {
                    // Solo cuenta si el premio está marcado como entregado Y tiene número y nombre
                    if (ganador.entregado && ganador.numero && ganador.nombre) {
                        costoPremiosReales += costoPremio;
                        cantidadGanadores++;
                    }
                });
            }
        }
    }

    // Ganancia de la rifa actual = Recogido - Costo real de premios
    const gananciaEstaRifa = totalRecogido - costoPremiosReales;

    const formato = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    });

    // Actualizar la interfaz
    // Valor Total Rifa = Lo que searía si todos pagaran
    document.getElementById('stats-total-debe').innerText = formato.format(potencialTotal);
    
    // Total Recogido = Dinero que ya has recibido
    document.getElementById('stats-total-pago').innerText = formato.format(totalRecogido);
    
    const txtGanancia = document.getElementById('stats-ganancia');
    // Mostramos la GANANCIA DE ESTA RIFA (no la acumulada)
    txtGanancia.innerText = formato.format(gananciaEstaRifa);
    
    // Feedback visual - Color según ganancia positiva o negativa
    if (gananciaEstaRifa > 0) {
        txtGanancia.style.color = "#00b894"; // Verde - ganacias
    } else if (gananciaEstaRifa < 0) {
        txtGanancia.style.color = "#e74c3c"; // Rojo - pérdida
    } else {
        txtGanancia.style.color = "#2d3436"; // Neutral
    }
    
    // Guardamos la ganancia de esta rifa también para referencia
    window.gananciaEstaRifa = gananciaEstaRifa;
    window.costoPremiosReales = costoPremiosReales;
    window.cantidadGanadores = cantidadGanadores;
}

async function actualizarManual() {
    const icon = document.getElementById('sync-icon-manual');
    
    // 1. Añadimos animación de giro
    icon.classList.add('fa-spin');
    
    try {
        // 2. Llamamos a la función que ya tenemos para cargar datos
        // Esta función ya limpia el contenedor y vuelve a dibujar todo
        await cargarRifas();
        
        console.log("Datos actualizados desde el servidor");
    } catch (error) {
        console.error("Error al actualizar:", error);
        alert("No se pudo actualizar la información.");
    } finally {
        // 3. Quitamos la animación después de un segundo
        setTimeout(() => {
            icon.classList.remove('fa-spin');
        }, 1000);
    }
}

async function cargarRifasPorFecha() {
    const fechaSeleccionada = document.getElementById('filtroFecha').value;
    if (!fechaSeleccionada) return;

    const container = document.getElementById('rifasContainer');
    container.innerHTML = '<p style="text-align:center; padding:50px;">Buscando registros...</p>';

    try {
        const response = await fetch(`/api/cargar-rifas?fecha=${fechaSeleccionada}`);
        const datos = await response.json();

        // LOG DE SEGURIDAD: Mira esto en la consola (F12)
        console.log("Datos recibidos del servidor para la fecha:", fechaSeleccionada, datos);

        // Verificamos si la fecha que llegó es la misma que pedimos
        if (datos && datos.info && datos.info.fecha !== fechaSeleccionada) {
            console.warn("¡El servidor ignoró el filtro y mandó otra fecha!");
            container.innerHTML = `<p style="text-align:center; padding:50px; color: orange;">
                El servidor no encontró datos para el ${fechaSeleccionada}. <br>
                (Se recibió la rifa del: ${datos.info.fecha})
            </p>`;
            return; // Detenemos aquí para no mostrar la rifa equivocada
        }

        if (datos && !datos.error) {
            container.innerHTML = ''; 
            // ... resto de tu lógica de crear tablas ...
        }
    } catch (error) {
        console.error("Error historial:", error);
    }
}

function obtenerProximaFechaSorteo(fechaReferencia = new Date()) {
    const dia = fechaReferencia.getDate();
    const mes = fechaReferencia.getMonth();
    const año = fechaReferencia.getFullYear();

    // Objetivos: día 15 o día 30
    let objetivo = dia <= 15 ? 15 : 30;
    let fechaObjetivo = new Date(año, mes, objetivo);

    // Buscar el viernes más cercano (0=Dom, 5=Vie)
    // Esto busca el viernes de esa semana específica
    const diaSemana = fechaObjetivo.getDay();
    const diferencia = 5 - diaSemana; 
    fechaObjetivo.setDate(fechaObjetivo.getDate() + diferencia);

    // Si la fecha calculada ya pasó, buscar la del siguiente ciclo
    if (fechaObjetivo < fechaReferencia) {
        return obtenerProximaFechaSorteo(new Date(año, mes, objetivo === 15 ? 16 : 31));
    }

    return fechaObjetivo.toISOString().split('T')[0]; // Formato YYYY-MM-DD
}

async function verificarCambioCiclo() {
    // 1. Cargar los datos actuales del servidor
    const fechaActual = document.getElementById('filtroFecha')?.value || document.getElementById('rifaDate')?.value || new Date().toISOString().split('T')[0];
    const response = await fetch(`/api/cargar-rifas?fecha=${fechaActual}`);
    const datos = await response.json();
    const hoy = new Date().toISOString().split('T')[0];
    
    // 2. Si la rifa guardada ya "venció" (la fecha del sorteo es menor a hoy)
    if (datos.info && datos.info.fecha < hoy) {
        console.log("Ciclo vencido. Creando nueva rifa automática...");

        // Calculamos la base para la nueva fecha: mañana mismo para evitar repetir la fecha actual
        let manana = new Date();
        manana.setDate(manana.getDate() + 1);
        
        const nuevaFecha = obtenerViernesSorteo(manana); 
        
        const nuevaRifa = {
            info: {
                ...datos.info,
                fecha: nuevaFecha,
                nombre: `Rifa - Ciclo ${nuevaFecha}`
            }
        };

        // 3. REUTILIZAR TABLAS Y RESPETAR PAGOS ADELANTADOS
        Object.keys(datos).forEach(key => {
            if (key.startsWith('tabla')) {
                const tablaOriginal = datos[key];
                const participantesNuevos = {};

                Object.keys(tablaOriginal.participantes).forEach(num => {
                    const p = tablaOriginal.participantes[num];
                    
                    participantesNuevos[num] = {
                        nombre: p.nombre,
                        // Si p.adelantado era true, ahora p.pago es true
                        pago: p.adelantado === true || p.adelantado === "true", 
                        adelantado: false // El adelanto se consume
                    };
                });

                nuevaRifa[key] = {
                    titulo: tablaOriginal.titulo,
                    participantes: participantesNuevos
                };
            }
        });

        // 4. Acumular la ganancia de la rifa actual antes de cambiar
        await acumularGananciaRifa();
        
        // 5. Guardar automáticamente y Notificar
        try {
            // Guardamos el nuevo objeto
            await guardarTodo(nuevaRifa);

            // Mostramos el SweetAlert antes de recargar
            await Swal.fire({
                title: '¡Nueva Quincena Detectada!',
                text: `Se ha generado automáticamente el sorteo para el viernes ${nuevaFecha}. Se mantuvieron los nombres, se procesaron los pagos adelantados y la ganancia se acumuló al total.`,
                icon: 'success',
                confirmButtonColor: '#0984e3',
                confirmButtonText: 'Entendido',
                allowOutside            });

            // 5. Recargar para mostrar la nueva rifa
            location.reload(); 
            
        } catch (error) {
            console.error("Error al automatizar el cambio de ciclo:", error);
            Swal.fire('Error', 'No se pudo crear el nuevo ciclo automáticamente.', 'error');
        }
    }
}

function obtenerViernesSorteo(fechaReferencia = new Date()) {
    let fecha = new Date(fechaReferencia);
    let diaMes = fecha.getDate();
    let mes = fecha.getMonth();
    let año = fecha.getFullYear();

    let diaObjetivo;
    let fechaObjetivo;

    // Determinar el próximo objetivo (15 o 30)
    if (diaMes < 15) {
        // Estamos en la primera quincena (del 1 al 14)
        // El próximo objetivo es el día 15
        diaObjetivo = 15;
    } else if (diaMes >= 15 && diaMes <= 30) {
        // Estamos en la segunda quincena (del 15 al 30)
        // El próximo objetivo es el día 30 (o fin de mes si es menor a 30)
        const diasEnMes = new Date(año, mes + 1, 0).getDate();
        diaObjetivo = Math.min(30, diasEnMes);
    } else {
        // Ya pasó el 30, entonces vamos al siguiente mes
        // El próximo objetivo es el día 15 del siguiente mes
        mes += 1;
        if (mes > 11) {
            mes = 0;
            año += 1;
        }
        diaObjetivo = 15;
    }

    // Crear la fecha objetivo
    fechaObjetivo = new Date(año, mes, diaObjetivo);

    // Ahora buscar el viernes (día 5) más cercano a esa fecha
    // Si la fecha objetivo es viernes, usar esa
    // Si no, avanzar al siguiente viernes
    while (fechaObjetivo.getDay() !== 5) {
        fechaObjetivo.setDate(fechaObjetivo.getDate() + 1);
    }

    // Si el viernes calculado ya pasó (es antes que la fecha de referencia),
    // entonces vamos al siguiente ciclo
    if (fechaObjetivo < fecha) {
        // Volver a calcular para el siguiente ciclo
        return obtenerViernesSorteo(new Date(año, mes + 1, 1));
    }

    return fechaObjetivo.toISOString().split('T')[0]; // Retorna YYYY-MM-DD
}

// Al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    const f1 = document.getElementById('filtroFecha');
    const f2 = document.getElementById('rifaDate');

    // Si ambos están vacíos, ponemos la fecha de hoy
    if (f1 && !f1.value) {
        const hoy = new Date().toISOString().split('T')[0];
        f1.value = hoy;
        if (f2) f2.value = hoy;
    }

    // Sincronizar: si cambias uno, se cambia el otro
    f1?.addEventListener('change', () => { if(f2) f2.value = f1.value; cargarRifas(); });
    f2?.addEventListener('change', () => { if(f1) f1.value = f2.value; cargarRifas(); });

    // Carga inicial
    cargarRifas();
});

// Función para cerrar el modal de registro
function cerrarModal() {
    const modal = document.getElementById('modalCompra');
    if (modal) {
        modal.style.display = 'none';
        
        // Limpiamos los campos para que no queden datos viejos al abrirlo después
        document.getElementById('modalNombre').value = '';
        document.getElementById('modalPago').checked = false;
        document.getElementById('modalAdelantado').checked = false;
    }
}

// Opcional: Cerrar el modal si el usuario hace clic en el fondo oscuro
window.onclick = function(event) {
    const modal = document.getElementById('modalCompra');
    if (event.target == modal) {
        cerrarModal();
    }
}

// ==================== SISTEMA DE PREMIOS POR TABLA ====================

// Variable para almacenar los datos de premios (3 ganadores por tabla)
let datosPremios = {
    tabla1: { 
        ganadores: [
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false }
        ]
    },
    tabla2: { 
        ganadores: [
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false }
        ]
    },
    tabla3: { 
        ganadores: [
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false }
        ]
    },
    tabla4: { 
        ganadores: [
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false }
        ]
    }
};

// Función para renderizar el panel de premios con 3 ganadores separados por tabla
function renderizarPanelPremios() {
    const container = document.getElementById('listaPremios');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (let i = 1; i <= 4; i++) {
        const key = `tabla${i}`;
        
        // Asegurar que datosPremios[key] existe y tiene la estructura correcta
        let premioData = datosPremios[key];
        
        // Si no existe o no tiene ganadores, inicializar
        if (!premioData || !premioData.ganadores || !Array.isArray(premioData.ganadores)) {
            premioData = { 
                ganadores: [
                    { numero: '', nombre: '', entregado: false },
                    { numero: '', nombre: '', entregado: false },
                    { numero: '', nombre: '', entregado: false }
                ]
            };
        }
        
        // Verificar si todos los premios están entregados
        const todosEntregados = premioData.ganadores && premioData.ganadores.every(g => g && g.entregado && g.numero && g.nombre);
        const algunosLlenos = premioData.ganadores && premioData.ganadores.some(g => g && (g.numero || g.nombre));
        
        const card = document.createElement('div');
        card.style.cssText = `
            border: 2px solid ${todosEntregados ? '#00b894' : '#dfe6e9'};
            border-radius: 12px;
            padding: 15px;
            background: ${todosEntregados ? '#f0fff4' : '#fafafa'};
        `;
        
        // Generar los 3 campos de ganadores
        let htmlGanadores = '';
        const posiciones = ['1er Premio', '2do Premio', '3er Premio'];
        const iconos = ['🥇', '🥈', '🥉'];
        const colores = ['#f1c40f', '#95a5a6', '#cd7f32'];
        
        for (let g = 0; g < 3; g++) {
            const ganador = premioData.ganadores[g] || { numero: '', nombre: '', entregado: false };
            const posicion = posiciones[g];
            const icono = iconos[g];
            const color = colores[g];
            
            htmlGanadores += `
                <div style="margin-bottom: 15px; padding: 12px; background: ${ganador.entregado ? '#d4edda' : '#f8f9fa'}; border-radius: 8px; border-left: 4px solid ${color};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 700; font-size: 0.85rem; color: ${color};">${icono} ${posicion}</span>
                        <span style="font-size: 0.7rem; color: ${ganador.entregado ? '#00b894' : '#e74c3c'}; font-weight: 700;">
                            ${ganador.entregado ? '✓ ENTREGADO' : '⏳ PENDIENTE'}
                        </span>
                    </div>
                    
                    <div style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.65rem; font-weight: 700; color: #636e72; text-transform: uppercase; margin-bottom: 3px;">
                            Número (00-99)
                        </label>
                        <input type="text" 
                            id="premio-numero-${i}-${g}" 
                            value="${ganador.numero}"
                            maxlength="2"
                            placeholder="00"
                            onchange="actualizarPremio(${i}, ${g}, 'numero', this.value)"
                            style="width: 100%; padding: 6px; border: 2px solid ${color}40; border-radius: 6px; font-size: 0.9rem; font-weight: 700; text-align: center;">
                    </div>
                    
                    <div style="margin-bottom: 8px;">
                        <label style="display: block; font-size: 0.65rem; font-weight: 700; color: #636e72; text-transform: uppercase; margin-bottom: 3px;">
                            Nombre del Ganador
                        </label>
                        <input type="text" 
                            id="premio-nombre-${i}-${g}"
                            value="${ganador.nombre}"
                            placeholder="Nombre del ganador..."
                            onchange="actualizarPremio(${i}, ${g}, 'nombre', this.value)"
                            style="width: 100%; padding: 6px; border: 2px solid ${color}40; border-radius: 6px; font-size: 0.85rem;">
                    </div>
                    
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; background: ${ganador.entregado ? '#c3e6cb' : '#fff3cd'}; border-radius: 6px;">
                        <input type="checkbox" 
                            id="premio-entregado-${i}-${g}"
                            ${ganador.entregado ? 'checked' : ''}
                            onchange="actualizarPremio(${i}, ${g}, 'entregado', this.checked)"
                            style="width: 16px; height: 16px;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: ${ganador.entregado ? '#155724' : '#856404'};">
                            Entregado
                        </span>
                    </label>
                </div>
            `;
        }
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-weight: 800; font-size: 1.1rem; color: #2d3436;">🏆 Tabla ${i}</span>
                ${algunosLlenos ? `<span style="font-size: 0.75rem; color: #0984e3; font-weight: 600;">${premioData.ganadores.filter(g => g.numero && g.nombre).length}/3 ganadores</span>` : ''}
            </div>
            ${htmlGanadores}
        `;
        
        container.appendChild(card);
    }
}

// Función para actualizar un premio específico (tabla, posicion del ganador, campo, valor)
function actualizarPremio(numeroTabla, posicionGanador, campo, valor) {
    console.log('🔄 actualizarPremio llamado:', numeroTabla, posicionGanador, campo, valor);

    const key = `tabla${numeroTabla}`;
    
    // Asegurar que existe la estructura
    if (!datosPremios[key]) {
        datosPremios[key] = {
            ganadores: [
                { numero: '', nombre: '', entregado: false },
                { numero: '', nombre: '', entregado: false },
                { numero: '', nombre: '', entregado: false }
            ]
        };
    }
    
    // Asegurar que existe el array de ganadores
    if (!datosPremios[key].ganadores || datosPremios[key].ganadores.length !== 3) {
        datosPremios[key].ganadores = [
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false },
            { numero: '', nombre: '', entregado: false }
        ];
    }

    // Mapear los nombres de campos del input a los campos de datosPremios
    if (campo === 'numero') {
        // Validar que sea un número de 2 dígitos
        valor = valor.replace(/[^0-9]/g, '').substring(0, 2);
        const inputEl = document.getElementById(`premio-numero-${numeroTabla}-${posicionGanador}`);
        if (inputEl) inputEl.value = valor;
        datosPremios[key].ganadores[posicionGanador].numero = valor;
    } else if (campo === 'nombre') {
        datosPremios[key].ganadores[posicionGanador].nombre = valor;
    } else if (campo === 'entregado') {
        datosPremios[key].ganadores[posicionGanador].entregado = valor;
    }
    
    console.log('💾 datosPremios actualizado:', datosPremios);

    // Actualizar estilos visuales
    renderizarPanelPremios();

    // Guardar en el servidor
    console.log('📤 Llamando a guardarPremiosEnRifa...');
    guardarPremiosEnRifa();
}

// Función para guardar los premios en la rifa actual
function guardarPremiosEnRifa() {
    // Los premios ya están incluidos en recolectarDatosPantalla()
    const datos = recolectarDatosPantalla();
    
    console.log('📤 Enviando datos al servidor:', JSON.stringify(datos).substring(0, 300));
    
    fetch('/api/guardar-rifa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    }).then(res => {
        if (res.ok) {
            console.log('✅ Premios guardados correctamente');
            return res.json();
        } else {
            console.error('❌ Error del servidor:', res.status, res.statusText);
            return res.json().then(err => console.error('❌ Detalle del error:', err));
        }
    }).then(data => {
        if (data) {
            console.log('📬 Respuesta del servidor:', data);
        }
    }).catch(err => {
        console.error('❌ Error de red guardando premios:', err);
    });
}

// Función para cargar los premios al cargar la rifa
function cargarPremios(datos) {
    console.log('🔍 DEBUG - datos.info:', datos?.info);
    console.log('🔍 DEBUG - datos.info.premios:', datos?.info?.premios);

    // Intentar cargar premios desde diferentes ubicaciones posibles
    let premiosCargados = null;

    if (datos && datos.info && datos.info.premios) {
        premiosCargados = datos.info.premios;
        console.log('✅ Premios cargados desde datos.info.premios');
    } else if (datos && datos.premios) {
        premiosCargados = datos.premios;
        console.log('✅ Premios cargados desde datos.premios');
    } else {
        console.log('⚠️ No se encontraron premios en la respuesta del servidor');
    }

    // Si encontramos premios, actualizar los datos globales
    if (premiosCargados) {
        datosPremios = premiosCargados;
        console.log('💾 datosPremios actualizados:', datosPremios);
    } else {
        // Solo reiniciar si no hay datos actuales (primera carga)
        if (!datosPremios || Object.keys(datosPremios).length === 0) {
            datosPremios = {
                tabla1: { 
                    ganadores: [
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false }
                    ]
                },
                tabla2: { 
                    ganadores: [
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false }
                    ]
                },
                tabla3: { 
                    ganadores: [
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false }
                    ]
                },
                tabla4: { 
                    ganadores: [
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false },
                        { numero: '', nombre: '', entregado: false }
                    ]
                }
            };
            console.log('🔄 Inicializando datosPremios vacíos');
        } else {
            console.log('🔍 Manteniendo datosPremios existentes:', datosPremios);
        }
    }

    // Forzar renderizado del panel
    renderizarPanelPremios();
}

// Función para preparar una nueva quincena manualmente
async function prepararNuevaQuincena() {
    try {
        // 1. Confirmar con el usuario
        const result = await Swal.fire({
            title: '¿Crear Nueva Quincena?',
            html: `Se creará una nueva rifa manteniendo los nombres de los participantes.<br>
                   Los pagos adelantados de la rifa anterior将成为 pagos en la nueva rifa.<br>
                   Los demás cuadros quedarán pendientes por pagar.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#0984e3',
            cancelButtonColor: '#dfe6e9',
            confirmButtonText: '<i class="fas fa-forward"></i> Crear Nueva Quincena',
            cancelButtonText: 'Cancelar',
            reverseButtons: true
        });

        if (!result.isConfirmed) return;

        // 2. Cargar los datos actuales del servidor
        const fechaActual = document.getElementById('rifaDate')?.value || document.getElementById('filtroFecha')?.value;
        const response = await fetch(`/api/cargar-rifas?fecha=${fechaActual}`);
        const datos = await response.json();

        if (!datos || datos.error) {
            throw new Error('No se pudieron cargar los datos');
        }

        // 3. Calcular la nueva fecha (siguiente viernes)
        let manana = new Date();
        manana.setDate(manana.getDate() + 1);
        const nuevaFecha = obtenerViernesSorteo(manana);

        // 4. Crear la nueva rifa con los nombres conservados
        const nuevaRifa = {
            info: {
                nombre: datos.info?.nombre ? `${datos.info.nombre} - Continúa` : `Rifa - Ciclo ${nuevaFecha}`,
                premio: datos.info?.premio || '',
                valor: datos.info?.valor || '',
                fecha: nuevaFecha,
                inversion: datos.info?.inversion || ''
            }
        };

        // 5. Copiar las tablas manteniendo nombres, pero:
        // - Los que tenían "pago adelinado" pasan a estar pagados
        // - Los demás quedan pendientes (pago = false)
        for (let i = 1; i <= 4; i++) {
            const llaveTabla = `tabla${i}`;
            const tablaOriginal = datos[llaveTabla];
            
            if (tablaOriginal && tablaOriginal.participantes) {
                const participantesNuevos = {};
                
                Object.keys(tablaOriginal.participantes).forEach(num => {
                    const p = tablaOriginal.participantes[num];
                    
                    // Si tenía pago adelantado, pasa a estar pagado
                    // Si ya estaba pagado, sigue pagado
                    // Solo los que pagaron ADELANTADO pasan a pagados en la nueva rifa
                    // Los que pagaron normalmente esta quincena quedan pendientes (ya pagaron por esta, no por la siguiente)
                    const esPagado = (p.adelantado === true || p.adelantado === "true");
                    
                    participantesNuevos[num] = {
                        nombre: p.nombre,
                        pago: esPagado,  // true solo si era adelantado o ya estaba pagado
                        adelantado: false // Se consume el adelantar
                    };
                });

                nuevaRifa[llaveTabla] = {
                    titulo: tablaOriginal.titulo || `Tabla ${i}`,
                    participantes: participantesNuevos
                };
            } else {
                // Crear tabla vacía si no existía
                nuevaRifa[llaveTabla] = {
                    titulo: `Tabla ${i}`,
                    participantes: {}
                };
            }
        }

        // 6. Acumular la ganancia de la rifa actual antes de cambiar
        await acumularGananciaRifa();
        
        // 7. Guardar la nueva rifa
        await fetch('/api/guardar-rifa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevaRifa)
        });

        // 8. Notificar y recargar
        await Swal.fire({
            title: '¡Nueva Quincena Creada!',
            text: `Se ha creado la rifa para el ${nuevaFecha} con los nombres de la rifa anterior. La ganancia se ha acumulado al total.`,
            icon: 'success',
            confirmButtonColor: '#0984e3',
            confirmButtonText: 'Aceptar'
        });

        // Recargar con la nueva fecha
        document.getElementById('filtroFecha').value = nuevaFecha;
        document.getElementById('rifaDate').value = nuevaFecha;
        cargarRifas();

    } catch (error) {
        console.error("Error al crear nueva quincena:", error);
        Swal.fire('Error', 'No se pudo crear la nueva quincena. Intenta de nuevo.', 'error');
    }
}

// ==================== COMPRA MÚLTIPLE DE NÚMEROS ====================

function asignarNumerosMultiples() {
    const nombre = document.getElementById('nombreClienteMultiple').value.trim();
    const numerosInput = document.getElementById('numerosClienteMultiple').value.trim();
    const pagado = document.getElementById('pagadoClienteMultiple').checked;
    const adelantado = document.getElementById('adelantadoClienteMultiple').checked;
    const tablaSeleccionada = document.getElementById('tablaClienteMultiple').value;
    const resultadoDiv = document.getElementById('resultadoAsignacion');
    
    if (!nombre) {
        Swal.fire('Error', 'Por favor ingresa el nombre del cliente', 'warning');
        return;
    }
    
    if (!numerosInput) {
        Swal.fire('Error', 'Por favor ingresa los números a comprar', 'warning');
        return;
    }
    
    // Parsear los números (separados por coma, espacio o ambos)
    const numeros = numerosInput.split(/[,\s]+/)
        .map(n => n.trim())
        .filter(n => n !== '')
        .map(n => {
            let num = n.replace(/[^0-9]/g, '');
            if (num.length === 1) num = '0' + num;
            return num;
        })
        .filter(n => n.length === 2 && parseInt(n) >= 0 && parseInt(n) <= 99);
    
    if (numeros.length === 0) {
        Swal.fire('Error', 'No se encontraron números válidos (00-99)', 'warning');
        return;
    }
    
    let asignados = 0;
    let errores = [];
    
    // Usar solo la tabla seleccionada
    numeros.forEach(numero => {
        const slot = document.getElementById(`t${tablaSeleccionada}-${numero}`);
        
        if (slot) {
            const nombreElement = slot.querySelector('.n-name');
            const nombreExistente = nombreElement.textContent.trim();
            
            if (nombreExistente && nombreExistente !== '') {
                // El número ya está ocupado
                errores.push(`${numero} (ya tiene: ${nombreExistente})`);
            } else {
                // Asignar el número a la tabla seleccionada
                nombreElement.textContent = nombre;
                slot.classList.remove('paid', 'reserved');
                
                if (pagado || adelantado) {
                    // Si está pagado o es adelantado, se marca como pagado (verde)
                    slot.classList.add('paid');
                    slot.setAttribute('data-pago', 'true');
                } else {
                    // Si no está pagado ni adelantado, queda pendiente (naranja)
                    slot.classList.add('reserved');
                    slot.setAttribute('data-pago', 'false');
                }
                
                // Guardar el estado de adelantado
                slot.setAttribute('data-adelantado',adelantado ? 'true' : 'false');
                asignados++;
            }
        }
    });
    
    resultadoDiv.style.display = 'block';
    if (asignados > 0) {
        let mensaje = `<div style="padding: 10px; background: #d4edda; color: #155724; border-radius: 8px; border: 1px solid #c3e6cb;">
            <i class="fas fa-check-circle"></i> Se asignaron <b>${asignados}</b> número(s) a <b>${nombre}</b> en Tabla ${tablaSeleccionada}`;
        
        if (adelantado) {
            mensaje += `<br><small style="color: #856404;"><i class="fas fa-clock"></i> Pago adelantado activado</small>`;
        }
        
        mensaje += `</div>`;
        resultadoDiv.innerHTML = mensaje;
        
        document.getElementById('nombreClienteMultiple').value = '';
        document.getElementById('numerosClienteMultiple').value = '';
        document.getElementById('pagadoClienteMultiple').checked = false;
        document.getElementById('adelantadoClienteMultiple').checked = false;
        
        actualizarContadoresRifa();
        guardarTodo();
        
        if (errores.length > 0) {
            resultadoDiv.innerHTML += `<div style="margin-top: 10px; padding: 10px; background: #fff3cd; color: #856404; border-radius: 8px; border: 1px solid #ffeeba;">
                <i class="fas fa-exclamation-triangle"></i> Los siguientes números no se asignaron: ${errores.join(', ')}
            </div>`;
        }
    } else {
        resultadoDiv.innerHTML = `<div style="padding: 10px; background: #f8d7da; color: #721c24; border-radius: 8px; border: 1px solid #f5c6cb;">
            <i class="fas fa-times-circle"></i> No se asignaron números. Verifica que los números estén disponibles.
        </div>`;
    }
}

// Función para exportar a Excel
function exportarAExcel() {
    // Crear un libro de trabajo de Excel
    let contenido = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body>';
    
    // Obtener datos de la rifa actual
    const datos = recolectarDatosPantalla();
    const fecha = document.getElementById('filtroFecha')?.value || document.getElementById('rifaDate')?.value || new Date().toISOString().split('T')[0];
    const nombreRifa = document.getElementById('rifaName')?.value || 'Rifa';
    const valorPuesto = parseFloat(document.getElementById('rifaCost')?.value) || 0;
    
    // Título
    contenido += '<h1>Reporte de Rifa - ' + nombreRifa + '</h1>';
    contenido += '<p>Fecha: ' + fecha + '</p>';
    contenido += '<p>Valor Puesto: $' + valorPuesto.toLocaleString() + '</p><br>';
    
    // Tabla de participantes
    contenido += '<table border="1" style="border-collapse: collapse; width: 100%;">';
    contenido += '<tr style="background-color: #0984e3; color: white;"><th>Tabla</th><th>Número</th><th>Nombre</th><th>Estado</th></tr>';
    
    Object.keys(datos).forEach(key => {
        if (key.startsWith('tabla')) {
            const tablaNum = key.replace('tabla', '');
            const participantes = datos[key].participantes || {};
            
            Object.keys(participantes).forEach(num => {
                const p = participantes[num];
                if (p.nombre && p.nombre.trim() !== '') {
                    const estado = p.pago ? 'Pagado' : 'Pendiente';
                    const bgColor = p.pago ? '#d4edda' : '#fff3cd';
                    contenido += '<tr style="background-color: ' + bgColor + ';">';
                    contenido += '<td>Tabla ' + tablaNum + '</td>';
                    contenido += '<td>' + num + '</td>';
                    contenido += '<td>' + p.nombre + '</td>';
                    contenido += '<td>' + estado + '</td>';
                    contenido += '</tr>';
                }
            });
        }
    });
    
    contenido += '</table></body></html>';
    
    // Crear y descargar el archivo
    const blob = new Blob([contenido], { type: 'application/vnd.ms-excel' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Rifa_' + fecha + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ==================== PANEL DE DEUDORES ====================

// Función para mostrar el panel de deudores
async function mostrarPanelDeudores() {
    const panel = document.getElementById('panelDeudores');
    const lista = document.getElementById('listaDeudores');
    
    // Ocultar otros paneles y mostrar el de deudores
    document.getElementById('panelCompraMultiple').style.display = 'none';
    document.getElementById('panelPremios').style.display = 'none';
    document.getElementById('rifasContainer').style.display = 'none';
    panel.style.display = 'block';
    
    // Mostrar loading
    lista.innerHTML = '<div style="text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #0984e3;"></i><p>Cargando deudores...</p></div>';
    
    try {
        // Obtener datos de la rifa actual
        const fechaActual = document.getElementById('filtroFecha')?.value || document.getElementById('rifaDate')?.value || new Date().toISOString().split('T')[0];
        const valorPuesto = parseFloat(document.getElementById('rifaCost')?.value) || 0;
        
        const response = await fetch(`/api/cargar-rifas?fecha=${fechaActual}`);
        const datos = await response.json();
        
        // Agrupar deudores por nombre
        const deudores = {};
        
        // Recorrer todas las tablas
        for (let i = 1; i <= 4; i++) {
            const key = `tabla${i}`;
            const tabla = datos[key];
            
            if (tabla && tabla.participantes) {
                Object.keys(tabla.participantes).forEach(num => {
                    const p = tabla.participantes[num];
                    
                    // Solo mostrar los que deben (no pagados)
                    if (p.nombre && p.nombre.trim() !== '' && !p.pago) {
                        const nombreKey = p.nombre.toUpperCase().trim();
                        
                        if (!deudores[nombreKey]) {
                            deudores[nombreKey] = {
                                nombre: p.nombre,
                                numeros: [],
                                totalDeuda: 0,
                                tabla: i
                            };
                        }
                        
                        deudores[nombreKey].numeros.push({
                            numero: num,
                            tabla: i
                        });
                        deudores[nombreKey].totalDeuda += valorPuesto;
                    }
                });
            }
        }
        
        // Generar HTML
        const nombresDeudores = Object.keys(deudores);
        
        if (nombresDeudores.length === 0) {
            lista.innerHTML = '<div style="text-align: center; padding: 30px; color: #00b894;"><i class="fas fa-check-circle" style="font-size: 3rem;"></i><p style="font-size: 1.2rem; margin-top: 10px;">¡No hay personas con deudas!</p></div>';
            return;
        }
        
        const formato = new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', maximumFractionDigits: 0
        });
        
        let html = '';
        
        // Calcular total general
        let totalGeneral = 0;
        nombresDeudores.forEach(nombre => {
            totalGeneral += deudores[nombre].totalDeuda;
        });
        
        // Card de total
        html += `
            <div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding: 20px; border-radius: 12px; color: white; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 0.9rem; opacity: 0.9;">TOTAL DE DEUDAS</span>
                        <h2 style="margin: 5px 0 0 0; font-size: 2rem;">${formato.format(totalGeneral)}</h2>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.9rem; opacity: 0.9;">${nombresDeudores.length} persona(s) deben</span>
                    </div>
                </div>
            </div>
        `;
        
        // Cards de cada deudor
        nombresDeudores.forEach(nombre => {
            const d = deudores[nombre];
            
            html += `
                <div style="border: 2px solid #e74c3c; border-radius: 12px; padding: 15px; background: #fff5f5;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                        <div>
                            <h4 style="margin: 0; color: #2d3436; font-size: 1.1rem;">${d.nombre}</h4>
                            <span style="font-size: 0.8rem; color: #636e72;">${d.numeros.length} número(s) sin pagar</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-size: 1.3rem; font-weight: 800; color: #e74c3c;">${formato.format(d.totalDeuda)}</span>
                        </div>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${d.numeros.map(n => `
                            <span style="background: #e74c3c; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">
                                #${n.numero} (Tabla ${n.tabla})
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        lista.innerHTML = html;
        
    } catch (error) {
        console.error("Error al cargar deudores:", error);
        lista.innerHTML = '<div style="text-align: center; padding: 30px; color: #e74c3c;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i><p>Error al cargar los deudores</p></div>';
    }
}

// Función para cerrar el panel de deudores
function cerrarPanelDeudores() {
    const panel = document.getElementById('panelDeudores');
    panel.style.display = 'none';
    
    // Mostrar los otros paneles de nuevo
    document.getElementById('panelCompraMultiple').style.display = 'block';
    document.getElementById('panelPremios').style.display = 'block';
    document.getElementById('rifasContainer').style.display = 'block';
}
