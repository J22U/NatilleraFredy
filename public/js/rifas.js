let syncTimeout;

document.addEventListener('DOMContentLoaded', () => {
    cargarRifas();
    document.getElementById('btnNuevaTabla').addEventListener('click', () => {
        crearTabla();
        guardarTodo(); 
    });
    
    ['rifaName', 'rifaPrize', 'rifaCost', 'rifaDate'].forEach(id => {
        document.getElementById(id).addEventListener('change', guardarTodo);
    });
});

// --- LÓGICA DE TABLAS ---

function crearTabla(datosCargados = null) {
    // Si viene de la DB usamos su ID, si es nueva usamos Date.now()
    const id = datosCargados ? datosCargados.id : Date.now();
    const container = document.getElementById('rifasContainer');
    const numeroTabla = document.querySelectorAll('.rifa-card').length + 1;

    const card = document.createElement('div');
    card.className = 'rifa-card collapsed'; 
    card.id = `rifa-${id}`;
    
    card.innerHTML = `
        <div class="rifa-card-header" onclick="toggleTabla('${id}')" style="cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px; flex:1;">
                <i class="fas fa-chevron-right arrow-icon" id="arrow-${id}"></i>
                <span class="tabla-badge">#${numeroTabla}</span>
                <input type="text" class="input-table-title" 
                       value="${datosCargados ? datosCargados.titulo : 'Nueva Tabla'}" 
                       onclick="event.stopPropagation()" 
                       onchange="guardarTodo()" 
                       style="border:none; font-weight:bold; outline:none; font-size:1.1rem; background:transparent;">
            </div>
            <button onclick="event.stopPropagation(); eliminarTabla('${id}')" class="btn-delete">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
        <div class="rifa-card-body" id="body-${id}">
            <div class="numeros-grid">
                ${generarCeldas(id, datosCargados)}
            </div>
        </div>
    `;
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

// --- ACTUALIZACIÓN Y COLORES ---

function actualizarEstado(tableId, n) {
    actualizarColor(tableId, n);
    guardarTodo();
}

function actualizarColor(tableId, numero) {
    const slot = document.getElementById(`slot-${tableId}-${numero}`);
    if (!slot) return;

    const nombre = slot.querySelector('.n-name').value.trim();
    const pagado = slot.querySelector('.pay-check').checked;

    slot.classList.remove('reserved', 'paid');
    if (pagado) {
        slot.classList.add('paid');
    } else if (nombre !== '') {
        slot.classList.add('reserved');
    }
}

// --- PERSISTENCIA (RENDER API) ---

function guardarTodo() {
    // 1. Cambiar estado a "Guardando"
    const status = document.getElementById('sync-status');
    if(status) {
        status.className = 'sync-saving';
    }

    const infoGeneral = {
        nombre: document.getElementById('rifaName').value,
        premio: document.getElementById('rifaPrize').value,
        valor: document.getElementById('rifaCost').value,
        fecha: document.getElementById('rifaDate').value
    };

    const todasLasTablas = [];
    document.querySelectorAll('.rifa-card').forEach(card => {
        const id = card.id.replace('rifa-', '');
        const titulo = card.querySelector('.input-table-title').value;
        const participantes = {};

        card.querySelectorAll('.n-slot').forEach(slot => {
            const num = slot.querySelector('.n-number').innerText;
            participantes[num] = {
                nombre: slot.querySelector('.n-name').value,
                pago: slot.querySelector('.pay-check').checked
            };
        });
        todasLasTablas.push({ id, titulo, participantes });
    });

    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        sincronizarConServidor({ info: infoGeneral, tablas: todasLasTablas });
    }, 1000); 
}

async function sincronizarConServidor(datos) {
    const status = document.getElementById('sync-status');
    try {
        const response = await fetch('/api/guardar-rifa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const result = await response.json();
        
        if (result.success) {
            // 2. Cambiar a éxito
            if(status) {
                status.className = 'sync-success';
                // Volver a gris después de 3 segundos
                setTimeout(() => { status.className = 'sync-idle'; }, 3000);
            }
            console.log("Sincronizado");
        }
    } catch (error) {
        console.error("Error:", error);
        if(status) status.style.backgroundColor = 'red'; // Error crítico
    }
}

async function sincronizarConServidor(datos) {
    try {
        const response = await fetch('/api/guardar-rifa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });
        const result = await response.json();
        if (result.success) console.log("Sincronización en Render/Somee exitosa");
    } catch (error) {
        console.error("Error al guardar en el servidor:", error);
    }
}

async function cargarRifas() {
    const container = document.getElementById('rifasContainer');
    // No borramos todo de inmediato para evitar saltos visuales bruscos
    
    try {
        const response = await fetch('/api/cargar-rifas'); 
        const datos = await response.json();

        if (datos && !datos.error) {
            // 1. Llenar inputs de arriba
            if(datos.info) {
                document.getElementById('rifaName').value = datos.info.nombre || '';
                document.getElementById('rifaPrize').value = datos.info.premio || '';
                document.getElementById('rifaCost').value = datos.info.valor || '';
                document.getElementById('rifaDate').value = datos.info.fecha || '';
            }

            // 2. Limpiar y dibujar tablas
            container.innerHTML = ''; 

            if (datos.tablas && datos.tablas.length > 0) {
                datos.tablas.forEach(t => crearTabla(t));
            } else {
                crearTabla(); // Crear una vacía por defecto
            }
        }
    } catch (error) {
        console.error("Error al cargar:", error);
        container.innerHTML = '<p style="padding:20px; color:red;">Error de conexión. Revisa el servidor.</p>';
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
    // Obtenemos el valor de cada puesto del input general
    const valorPuesto = parseFloat(document.getElementById('rifaCost').value) || 0;
    
    panel.innerHTML = ''; 

    if (texto.length < 2) {
        panel.style.display = 'none';
        return;
    }

    let resultados = {};

    document.querySelectorAll('.rifa-card').forEach(card => {
        const tituloTabla = card.querySelector('.input-table-title').value;
        const badgeTabla = card.querySelector('.tabla-badge').innerText;
        const slots = card.querySelectorAll('.n-slot');

        slots.forEach(slot => {
            const nombre = slot.querySelector('.n-name').value.toLowerCase().trim();
            const numero = slot.querySelector('.n-number').innerText;
            const pagado = slot.querySelector('.pay-check').checked;

            if (nombre.includes(texto)) {
                if (!resultados[nombre]) {
                    // Inicializamos al cliente con total de deuda en 0
                    resultados[nombre] = { tablas: {}, totalDeudaGlobal: 0, totalPuestosDebe: 0 };
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
                
                // Si no ha pagado, sumamos al contador global del cliente
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

            // Formatear el dinero a moneda local
            const totalDinero = cliente.totalDeudaGlobal.toLocaleString('es-CO', { 
                style: 'currency', 
                currency: 'COP', 
                maximumFractionDigits: 0 
            });

            clienteDiv.innerHTML = `
                <div class="cliente-header">
                    <span>${nombre.toUpperCase()}</span>
                    ${cliente.totalPuestosDebe > 0 
                        ? `<span class="total-deuda-tag">DEUDA TOTAL: ${totalDinero}</span>` 
                        : `<span class="total-pago-tag">AL DÍA ✅</span>`}
                </div>
                <div class="cliente-tablas">${tablasHTML}</div>
            `;
            panel.appendChild(clienteDiv);
        });
    }
    panel.style.display = 'block';
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
    // Cancelar cualquier temporizador previo para no duplicar
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);

    autoRefreshTimer = setInterval(() => {
        // REGLA DE SEGURIDAD: 
        // No refrescar si el usuario tiene el buscador abierto 
        // o si hay una sincronización pendiente (luz azul)
        const status = document.getElementById('sync-status');
        const searchInput = document.getElementById('searchInput');
        const isSaving = status && status.classList.contains('sync-saving');
        const isSearching = searchInput && searchInput.value.trim() !== "";

        if (!isSaving && !isSearching) {
            console.log("🔄 Sincronizando cambios de otros dispositivos...");
            cargarRifasSilencioso();
        }
    }, 15000); // 15 segundos
}

// Versión de carga que no borra la pantalla para que no parpadee
async function cargarRifasSilencioso() {
    try {
        const response = await fetch('/api/cargar-rifas');
        const datos = await response.json();

        if (datos && !datos.error) {
            // Actualizar solo los inputs de arriba si no tienen el foco
            const inputs = ['rifaName', 'rifaPrize', 'rifaCost', 'rifaDate'];
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (document.activeElement !== el) {
                    const campo = id.replace('rifa', '').toLowerCase();
                    // Ajuste según los nombres de tu JSON
                    const mapa = { name: 'nombre', prize: 'premio', cost: 'valor', date: 'fecha' };
                    el.value = datos.info[mapa[campo]] || '';
                }
            });

            // NOTA: Para actualizar las tablas sin que el usuario pierda su posición,
            // lo ideal es comparar el JSON. Si es diferente al actual, redibujar.
            const nuevoJSON = JSON.stringify(datos.tablas);
            const viejoJSON = localStorage.getItem('ultimo_snapshot_tablas');
            const status = document.getElementById('sync-status');
status.classList.add('sync-refresh');
setTimeout(() => status.classList.remove('sync-refresh'), 500);

            if (nuevoJSON !== viejoJSON) {
                localStorage.setItem('ultimo_snapshot_tablas', nuevoJSON);
                // Si el usuario no está escribiendo en ninguna tabla, redibujamos
                if (!document.querySelector('.n-name:focus')) {
                    const container = document.getElementById('rifasContainer');
                    container.innerHTML = ''; 
                    datos.tablas.forEach(t => crearTabla(t));
                }
            }
        }
    } catch (error) {
        console.error("Error en auto-refresco:", error);
    }
}

// Llamar al inicio al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    iniciarAutoRefresco();
});

async function generarPDF() {
    // 1. Validar la librería
    if (typeof html2pdf === 'undefined') {
        alert("Falta la librería PDF. Asegúrate de tener el script en tu HTML.");
        return;
    }

    // 2. Intentar capturar el contenedor (ajustado para que no de NULL)
    // Probemos con el body directamente si .app-container falla
    const elemento = document.querySelector('.app-container') || document.body;

    const opciones = {
        margin: [10, 10],
        filename: 'Reporte_Rifa.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        // Abrir todas las tablas para que salgan en el PDF
        document.querySelectorAll('.rifa-card').forEach(card => {
            card.classList.add('active');
        });

        // Generar
        await html2pdf().set(opciones).from(elemento).save();
        
    } catch (error) {
        console.error("Error detallado:", error);
    }
}
// ... (Las funciones de búsqueda y excel se mantienen igual)