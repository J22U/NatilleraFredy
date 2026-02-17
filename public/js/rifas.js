let syncTimeout;
let ultimaSincronizacionManual = 0;
let timerDebounce;

// --- LÓGICA DE TABLAS ---

function crearTabla(t = {}) {
    const container = document.getElementById('rifasContainer');
    // Si no hay idTabla, usamos el conteo de hijos + 1
    const idTabla = t.idTabla || (container.children.length + 1);
    const participantes = t.participantes || {};

    // 1. Creamos la estructura del Acordeón (rifa-card)
    const card = document.createElement('div');
card.id = `rifa-${idTabla}`; // Esto es vital para que toggleTabla funcione
card.className = 'rifa-card'; 

    // 2. Cabecera de la tarjeta
    const header = document.createElement('div');
    header.className = 'rifa-card-header';
    header.style.cursor = 'pointer'; // Para que sepa que es un botón
    header.innerHTML = `
        <div>
            <span class="tabla-badge">${idTabla}</span>
            <input type="text" class="input-table-title" 
                   value="${t.nombre || t.titulo || 'Tabla ' + idTabla}" 
                   onclick="event.stopPropagation()">
        </div>
        <i class="fas fa-chevron-down arrow-icon"></i>
    `;

    // --- LÓGICA PARA DESPLEGAR/CONTRAER ---
    header.onclick = () => {
        card.classList.toggle('active');
    };

    // 3. Cuerpo de la tarjeta
    const body = document.createElement('div');
    body.className = 'rifa-card-body';
    
    // 4. LA GRILLA
    const grid = document.createElement('div');
    grid.className = 'numeros-grid';

    // 5. Generar los 100 slots
    for (let i = 0; i < 100; i++) {
        const numStr = i.toString().padStart(2, '0');
        const slot = document.createElement('div');
        slot.className = 'n-slot';
        slot.id = `t${idTabla}-${numStr}`;

        const p = participantes[numStr];
        if (p) {
            if (p.pago) slot.classList.add('paid');
            else slot.classList.add('reserved');
            
            slot.innerHTML = `
                <span class="n-number">${numStr}</span>
                <div class="n-name">${p.nombre}</div>
            `;
        } else {
            slot.innerHTML = `
                <span class="n-number">${numStr}</span>
                <div class="n-name"></div>
            `;
        }

        // Evento para abrir el modal
        slot.onclick = (e) => {
            e.stopPropagation(); // IMPORTANTE: evita que al elegir número se cierre la tabla
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

    try {
        // 2. Intentamos pedir los datos al servidor
        const response = await fetch(`/api/cargar-rifas?fecha=${fechaParaCargar}`); 
        
        if (!response.ok) {
            throw new Error(`Error servidor: ${response.status}`);
        }

        const datos = await response.json();

        // 3. Limpiamos el contenedor antes de dibujar
        container.innerHTML = ''; 

        // 4. Llenamos la información general (si existe)
        if (datos && datos.info) {
            if(document.getElementById('rifaName')) document.getElementById('rifaName').value = datos.info.nombre || '';
            if(document.getElementById('rifaPrize')) document.getElementById('rifaPrize').value = datos.info.premio || '';
            if(document.getElementById('rifaCost')) document.getElementById('rifaCost').value = datos.info.valor || '';
            if(document.getElementById('costoPremio')) document.getElementById('costoPremio').value = datos.info.inversion || '';
        }

        // 5. Dibujamos las 4 tablas (usando datos del servidor o vacías como respaldo)
        for (let i = 1; i <= 4; i++) {
            const llaveTabla = `tabla${i}`;
            const t = datos[llaveTabla] || { nombre: `Tabla ${i}`, participantes: {} };
            
            // Forzamos el ID correcto para que el acordeón funcione
            t.idTabla = i; 
            if (!t.nombre) t.nombre = `Tabla ${i}`;
            
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
    }

    // 7. Actualizamos los cálculos monetarios finales
    if (typeof actualizarContadoresRifa === "function") {
        actualizarContadoresRifa();
    }
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

let autoRefreshTimer;

function iniciarAutoRefresco() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);

    autoRefreshTimer = setInterval(() => {
        const loader = document.getElementById('security-pause-loader');
        const tiempoPasado = Date.now() - ultimaSincronizacionManual;

        // --- ZONA DE SEGURIDAD (8 SEGUNDOS) ---
        if (tiempoPasado < 8000) {
            if (loader) loader.style.display = 'flex'; // Mostramos que estamos esperando
            console.log("⏳ Pausa de seguridad activa...");
            return; 
        }

        // Si ya pasaron los 8 segundos, ocultamos el loader y procedemos
        if (loader) loader.style.display = 'none';

        const status = document.getElementById('sync-status');
        const searchInput = document.getElementById('searchInput');
        const isSaving = status && status.classList.contains('sync-saving');
        const isSearching = searchInput && searchInput.value.trim() !== "";

        if (!isSaving && !isSearching) {
            cargarRifasSilencioso();
        }
    }, 15000); 
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

// Llamar al inicio al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    cargarRifas();
    iniciarAutoRefresco(); // Iniciar aquí
    
    ['rifaName', 'rifaPrize', 'rifaCost', 'rifaDate'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', guardarTodo);
    });
});

function generarPDF() {
    const elemento = document.querySelector('.app-container') || document.body; // Si no encuentra el container, usa el body
    
    if (!elemento) return;

    elemento.classList.add('pdf-mode');

    const opciones = {
        margin: [10, 10],
        filename: 'Rifas.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true }, // Añadido useCORS para imágenes externas
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'after'], before: '.rifa-card' }
    };

    // Usar try/catch para evitar que el error bloquee el resto del código
    try {
        html2pdf().set(opciones).from(elemento).save().then(() => {
            elemento.classList.remove('pdf-mode');
        });
    } catch (err) {
        console.error("Error al generar PDF:", err);
        elemento.classList.remove('pdf-mode');
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
            inversion: document.getElementById('costoPremio')?.value || ''
        }
    };

    const tablas = document.querySelectorAll('.rifa-card');
    
    tablas.forEach((card) => {
        const idTablaMatch = card.id.match(/\d+/);
        const numeroDeTabla = idTablaMatch ? idTablaMatch[0] : null;
        if (!numeroDeTabla) return;

        const participantes = {};

        // --- SOLUCIÓN RADICAL: Recorremos los 100 números posibles ---
        for (let i = 0; i <= 99; i++) {
            const numStr = i.toString().padStart(2, '0');
            const slot = card.querySelector(`[data-numero="${numStr}"]`) || 
                         document.getElementById(`t${numeroDeTabla}-${numStr}`);

            if (slot) {
                const nombre = slot.querySelector('.n-name')?.textContent.trim() || "";
                const pagado = slot.classList.contains('paid');
                const adelantado = slot.getAttribute('data-adelantado') === 'true';

                // MANDAMOS TODO: Si el nombre está vacío, mandamos ""
                participantes[numStr] = {
                    nombre: nombre,
                    pago: pagado,
                    adelantado: adelantado
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
    const nombre = document.getElementById('modalNombre').value.trim();
    const pago = document.getElementById('modalPago').checked;
    const adelantado = document.getElementById('modalAdelantado').checked;

    const tablaId = window.currentTablaId;
    const numStr = window.currentNumStr;

    const slot = document.getElementById(`t${tablaId}-${numStr}`);
    if (!slot) return;

    // 1. LIMPIEZA VISUAL INMEDIATA
    if (nombre === "") {
        slot.classList.remove('paid', 'reserved');
        slot.querySelector('.n-name').textContent = "";
        slot.removeAttribute('data-pago');
        slot.removeAttribute('data-adelantado');
        console.log("🧹 Puesto marcado para liberar...");
    } else {
        slot.querySelector('.n-name').textContent = nombre;
        slot.classList.remove('paid', 'reserved');
        pago ? slot.classList.add('paid') : slot.classList.add('reserved');
        slot.setAttribute('data-pago', pago);
        slot.setAttribute('data-adelantado', adelantado);
    }

    // 2. CIERRE DE MODAL
    cerrarModal();

    // 3. EL TRUCO PARA QUE NO VUELVAN: Guardado forzado
    // Bloqueamos visualmente el status para que sepas que se está borrando en la nube
    const status = document.getElementById('sync-status');
    if (status) status.className = 'sync-saving';

    try {
        // Llamamos a los contadores para que el dinero se actualice
        actualizarContadoresRifa();
        
        // Enviamos la foto actual de la pantalla al servidor
        await guardarTodo(); 
        
        console.log("✅ Base de datos actualizada con éxito");
        if (status) {
            status.className = 'sync-success';
            setTimeout(() => status.className = 'sync-idle', 2000);
        }
    } catch (error) {
        console.error("❌ Error al intentar liberar el puesto:", error);
        if (status) status.className = 'sync-error';
        alert("No se pudo sincronizar con la nube. El nombre podría volver a aparecer al recargar.");
    }
}

function cerrarModal() {
    const modal = document.getElementById('modalCompra');
    if (modal) {
        modal.style.display = 'none';
        
        // Opcional: Limpiar los campos para que la próxima vez estén vacíos
        document.getElementById('modalNombre').value = '';
        document.getElementById('modalPago').checked = false;
        document.getElementById('modalAdelantado').checked = false;
    }
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
    const inversionPorTabla = parseFloat(document.getElementById('costoPremio').value) || 0;
    
    // Contamos cuántas tablas hay actualmente en el contenedor
    const cantidadTablas = document.querySelectorAll('.rifa-card').length;
    const inversionTotalPremios = inversionPorTabla * cantidadTablas;
    
    let potencialTotal = 0; 
    let totalRecogido = 0;  

    // Escaneamos todos los slots
    document.querySelectorAll('.n-slot').forEach(slot => {
        potencialTotal += costoPuesto;
        if (slot.classList.contains('paid')) {
            totalRecogido += costoPuesto;
        }
    });

    // NUEVO CÁLCULO: Recogido menos (Inversión unidad * número de tablas)
    const gananciaReal = totalRecogido - inversionTotalPremios;

    const formato = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', maximumFractionDigits: 0
    });

    // Actualizar la interfaz
    document.getElementById('stats-total-debe').innerText = formato.format(potencialTotal);
    document.getElementById('stats-total-pago').innerText = formato.format(totalRecogido);
    
    const txtGanancia = document.getElementById('stats-ganancia');
    txtGanancia.innerText = formato.format(gananciaReal);
    
    // Feedback visual
    txtGanancia.style.color = gananciaReal < 0 ? "#e74c3c" : (gananciaReal > 0 ? "#00b894" : "#2d3436");
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
    // 1. Cargar los datos actuales del servidor/local
    const datos = await cargarDatosDesdeNube(); 
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

        // 4. Guardar automáticamente y Notificar
        try {
            // Guardamos el nuevo objeto
            await guardarTodo(nuevaRifa);

            // Mostramos el SweetAlert antes de recargar
            await Swal.fire({
                title: '¡Nueva Quincena Detectada!',
                text: `Se ha generado automáticamente el sorteo para el viernes ${nuevaFecha}. Se mantuvieron los nombres y se procesaron los pagos adelantados.`,
                icon: 'success',
                confirmButtonColor: '#0984e3',
                confirmButtonText: 'Entendido',
                allowOutsideClick: false
            });

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

    // Determinar a qué objetivo apuntamos (quincena o fin de mes)
    let diaObjetivo = diaMes <= 15 ? 15 : (new Date(año, mes + 1, 0).getDate() >= 30 ? 30 : 28);
    let fechaObjetivo = new Date(año, mes, diaObjetivo);

    // Si hoy ya pasó el viernes de esta quincena, saltar a la siguiente quincena
    if (fecha > fechaObjetivo && fecha.getDay() !== 5) {
        // Lógica para saltar al siguiente periodo si es necesario
    }

    // Retroceder hasta encontrar el viernes (5)
    // Si el día objetivo ya es viernes, se queda ahí.
    while (fechaObjetivo.getDay() !== 5) {
        fechaObjetivo.setDate(fechaObjetivo.getDate() - 1);
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