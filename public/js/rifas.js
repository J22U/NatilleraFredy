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
    const id = datosCargados ? datosCargados.id : Date.now();
    const container = document.getElementById('rifasContainer');
    const numeroTabla = document.querySelectorAll('.rifa-card').length + 1;

    const card = document.createElement('div');
    card.className = 'rifa-card';
    card.id = `rifa-${id}`;
    
    card.innerHTML = `
        <div class="rifa-card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="tabla-badge">#${numeroTabla}</span>
                <input type="text" class="input-table-title" 
                       value="${datosCargados ? datosCargados.titulo : 'Nueva Tabla'}" 
                       onchange="guardarTodo()" 
                       style="border:none; font-weight:bold; outline:none; font-size:1.1rem; background:transparent;">
            </div>
            <button onclick="eliminarTabla('${id}')" style="background:none; border:none; color:#ff7675; cursor:pointer; font-size:1.2rem;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
        <div class="numeros-grid">
            ${generarCeldas(id, datosCargados)}
        </div>
    `;
    container.appendChild(card);
}

function generarCeldas(tableId, datos) {
    let html = '';
    for (let i = 0; i < 100; i++) {
        const n = i.toString().padStart(2, '0');
        const info = (datos && datos.participantes) ? datos.participantes[n] : {nombre: '', pago: false};
        let clase = info.pago ? 'paid' : (info.nombre && info.nombre.trim() !== '' ? 'reserved' : '');

        html += `
            <div class="n-slot ${clase}" id="slot-${tableId}-${n}">
                <div class="n-header">
                    <span class="n-number">${n}</span>
                    <input type="checkbox" class="pay-check" ${info.pago ? 'checked' : ''} 
                           onchange="actualizarEstado('${tableId}', '${n}')">
                </div>
                <input type="text" class="n-name" placeholder="Nombre..." value="${info.nombre || ''}" 
                       oninput="actualizarColor('${tableId}', '${n}')" onchange="guardarTodo()">
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

// --- PERSISTENCIA (LOCAL Y SOMEE) ---

function guardarTodo() {
    const infoGeneral = {
        n: document.getElementById('rifaName').value,
        p: document.getElementById('rifaPrize').value,
        c: document.getElementById('rifaCost').value,
        f: document.getElementById('rifaDate').value
    };
    localStorage.setItem('info_gral_rifa', JSON.stringify(infoGeneral));

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

    localStorage.setItem('mis_rifas', JSON.stringify(todasLasTablas));

    // SINCRONIZACIÓN CON SOMEE
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        sincronizarConSomee({ info: infoGeneral, tablas: todasLasTablas });
    }, 1000); 
}

async function sincronizarConSomee(datos) {
    try {
        const response = await fetch('GuardarRifa.aspx/Sincronizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonDatos: JSON.stringify(datos) })
        });
        const result = await response.json();
        if (result.d === "OK") console.log("Sincronización en la nube exitosa");
    } catch (error) {
        console.error("Error al sincronizar con Somee:", error);
    }
}

async function cargarRifas() {
    const container = document.getElementById('rifasContainer');
    container.innerHTML = '<p id="loading-msg">Cargando desde la base de datos...</p>';

    try {
        // 1. Llamada al servidor Somee
        const response = await fetch('ObtenerRifas.aspx/CargarDatos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        const datos = result.d;

        if (datos && !datos.error) {
            // Llenar Banner
            document.getElementById('rifaName').value = datos.info.n || '';
            document.getElementById('rifaPrize').value = datos.info.p || '';
            document.getElementById('rifaCost').value = datos.info.c || '';
            document.getElementById('rifaDate').value = datos.info.f || '';

            container.innerHTML = ''; // Limpiar mensaje de carga

            // Llenar Tablas
            if (datos.tablas.length > 0) {
                for (let t of datos.tablas) {
                    // Pedir los participantes de esta tabla específica
                    const respP = await fetch('ObtenerRifas.aspx/ObtenerParticipantes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tablaId: t.id })
                    });
                    const resP = await respP.json();
                    
                    crearTabla({
                        id: t.id,
                        titulo: t.titulo,
                        participantes: resP.d
                    });
                }
            } else {
                crearTabla(); // Si no hay tablas en BD, crear una vacía
            }
            return;
        }
    } catch (error) {
        console.error("Error cargando de Somee, usando copia local:", error);
    }

    // --- RESPALDO: Si falla Somee, cargar de LocalStorage ---
    const infoG = JSON.parse(localStorage.getItem('info_gral_rifa'));
    if(infoG) {
        document.getElementById('rifaName').value = infoG.n || '';
        document.getElementById('rifaPrize').value = infoG.p || '';
        document.getElementById('rifaCost').value = infoG.c || '';
        document.getElementById('rifaDate').value = infoG.f || '';
    }

    const backup = JSON.parse(localStorage.getItem('mis_rifas'));
    container.innerHTML = '';
    if (backup && backup.length > 0) {
        backup.forEach(rifa => crearTabla(rifa));
    } else {
        crearTabla();
    }
}

// --- BORRADO ---

async function eliminarTabla(id) {
    if(confirm('¿Eliminar esta tabla permanentemente? Esta acción borrará los datos de Somee también.')) {
        try {
            // Eliminar en Somee
            const respuesta = await fetch(`EliminarRifa.aspx?id=${id}`, { method: 'DELETE' });
            
            // Eliminar localmente
            const elemento = document.getElementById(`rifa-${id}`);
            if (elemento) elemento.remove();
            
            reenumerarTablas();
            guardarTodo();
            alert("Tabla eliminada con éxito.");
        } catch (error) {
            console.error("Error al borrar en servidor:", error);
            const elemento = document.getElementById(`rifa-${id}`);
            if (elemento) elemento.remove();
            reenumerarTablas();
            guardarTodo();
        }
    }
}

function reenumerarTablas() {
    document.querySelectorAll('.rifa-card').forEach((card, index) => {
        const badge = card.querySelector('.tabla-badge');
        if (badge) badge.innerText = `#${index + 1}`;
    });
}

// --- BÚSQUEDA Y DESPLEGABLES ---

function buscarCliente() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const panel = document.getElementById('searchResults');
    const content = document.getElementById('resultsContent');
    
    if (query.length < 2) {
        panel.style.display = 'none';
        return;
    }

    let resultadosPorTabla = {};
    let totalDeudaGlobal = 0;
    const valorPorPuesto = parseFloat(document.getElementById('rifaCost').value) || 0;

    document.querySelectorAll('.rifa-card').forEach((card, index) => {
        const tablaID = card.id;
        const nombreTabla = card.querySelector('.input-table-title').value || `Tabla #${index + 1}`;
        const badgeNum = card.querySelector('.tabla-badge').innerText;
        
        card.querySelectorAll('.n-slot').forEach(slot => {
            const nombreSocio = slot.querySelector('.n-name').value.toLowerCase();
            if (nombreSocio.includes(query)) {
                const numero = slot.querySelector('.n-number').innerText;
                const estaPagado = slot.querySelector('.pay-check').checked;
                
                if (!estaPagado) totalDeudaGlobal += valorPorPuesto;

                if (!resultadosPorTabla[tablaID]) {
                    resultadosPorTabla[tablaID] = {
                        titulo: `${badgeNum} - ${nombreTabla}`,
                        items: []
                    };
                }
                resultadosPorTabla[tablaID].items.push({ numero, pago: estaPagado });
            }
        });
    });

    const tablasEncontradas = Object.keys(resultadosPorTabla);

    if (tablasEncontradas.length > 0) {
        panel.style.display = 'block';
        let html = '';
        tablasEncontradas.forEach(id => {
            const grupo = resultadosPorTabla[id];
            html += `
                <div class="search-group">
                    <div class="search-group-header" onclick="toggleDetalle('${id}')">
                        <b>${grupo.titulo}</b>
                        <span class="badge-count">${grupo.items.length} números</span>
                    </div>
                    <div class="search-group-content" id="det-${id}" style="display:none;">
                        ${grupo.items.map(i => `
                            <div class="search-item-detail">
                                <span>Número: <b>${i.numero}</b></span>
                                <span>${i.pago ? '<span class="status-paid">PAGADO</span>' : '<span class="status-debt">DEBE</span>'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        });

        html += `
            <div style="margin-top:15px; padding-top:10px; border-top:2px solid #f1f5f9; text-align:right;">
                <span style="font-weight:bold;">Deuda Total: </span>
                <span style="font-size:1.2rem; color:#e74c3c; font-weight:800;">$${totalDeudaGlobal.toLocaleString()}</span>
            </div>`;
        content.innerHTML = html;
    } else {
        content.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">No se encontraron resultados.</p>';
        panel.style.display = 'block';
    }
}

function toggleDetalle(id) {
    const content = document.getElementById(`det-${id}`);
    const isVisible = content.style.display === 'block';
    document.querySelectorAll('.search-group-content').forEach(el => el.style.display = 'none');
    content.style.display = isVisible ? 'none' : 'block';
}

function exportarAExcel() {
    let contenidoFinal = `
        <table border="1">
            <tr style="background-color: #0984e3; color: white;">
                <th colspan="4">REPORTE DETALLADO DE RIFAS - NATILLERA</th>
            </tr>
            <tr style="background-color: #f1f5f9;">
                <th>Tabla / Grupo</th>
                <th>Número</th>
                <th>Participante</th>
                <th>Estado de Pago</th>
            </tr>`;

    // Recorremos cada una de las tarjetas de rifa en pantalla
    document.querySelectorAll('.rifa-card').forEach((card, index) => {
        const tituloTabla = card.querySelector('.input-table-title').value || `Tabla #${index + 1}`;
        const badge = card.querySelector('.tabla-badge').innerText;
        
        card.querySelectorAll('.n-slot').forEach(slot => {
            const nombre = slot.querySelector('.n-name').value.trim();
            const numero = slot.querySelector('.n-number').innerText;
            const pagado = slot.querySelector('.pay-check').checked;

            // Solo agregamos a la lista los números que ya tienen dueño
            if (nombre !== "") {
                contenidoFinal += `
                    <tr>
                        <td>${badge} - ${tituloTabla}</td>
                        <td>${numero}</td>
                        <td>${nombre}</td>
                        <td>${pagado ? 'PAGADO' : 'DEBE'}</td>
                    </tr>`;
            }
        });
    });

    contenidoFinal += "</table>";

    // Crear el enlace de descarga
    const dataType = 'application/vnd.ms-excel';
    const filename = 'Reporte_Rifas_Natillera.xls';
    const downloadLink = document.createElement("a");

    document.body.appendChild(downloadLink);
    
    // El "Blob" es lo que permite que el navegador entienda que esto es un archivo
    const blob = new Blob(['\ufeff', contenidoFinal], { type: dataType });
    const url = URL.createObjectURL(blob);
    
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();
    
    document.body.removeChild(downloadLink);
}