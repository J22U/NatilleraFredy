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

    // Guardar copia local por si acaso
    localStorage.setItem('mis_rifas', JSON.stringify(todasLasTablas));

    // Sincronizar con el servidor de Render (Debounce de 1 seg)
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        sincronizarConServidor({ info: infoGeneral, tablas: todasLasTablas });
    }, 1000); 
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
    container.innerHTML = '<div class="loading-spinner">Cargando datos desde la nube...</div>';

    try {
        const response = await fetch('/api/cargar-rifas'); 
        const datos = await response.json();

        if (datos && !datos.error) {
            // Llenar encabezados
            document.getElementById('rifaName').value = datos.info.nombre || '';
            document.getElementById('rifaPrize').value = datos.info.premio || '';
            document.getElementById('rifaCost').value = datos.info.valor || '';
            document.getElementById('rifaDate').value = datos.info.fecha || '';

            container.innerHTML = ''; 

            if (datos.tablas && datos.tablas.length > 0) {
                datos.tablas.forEach(t => crearTabla(t));
            } else {
                crearTabla(); 
            }
        }
    } catch (error) {
        console.error("Error al cargar:", error);
        container.innerHTML = '<p>Error al conectar con el servidor.</p>';
    }
}

// ... (Las funciones de búsqueda y excel se mantienen igual)