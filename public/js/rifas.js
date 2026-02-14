document.addEventListener('DOMContentLoaded', () => {
    cargarRifas();
    document.getElementById('btnNuevaTabla').addEventListener('click', () => crearTabla());
    
    // Guardar cambios en info general
    ['rifaName', 'rifaPrize', 'rifaCost', 'rifaDate'].forEach(id => {
        document.getElementById(id).addEventListener('change', guardarTodo);
    });
});

function crearTabla(datosCargados = null) {
    const id = datosCargados ? datosCargados.id : Date.now();
    const container = document.getElementById('rifasContainer');
    
    // CALCULAR EL NÚMERO DE LA TABLA
    // Contamos cuántas tablas existen actualmente y sumamos 1
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
                       style="border:none; font-weight:bold; outline:none; font-size:1.1rem;">
            </div>
            <button onclick="eliminarTabla(${id})" style="background:none; border:none; color:#ff7675; cursor:pointer; font-size:1.2rem;">
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
        const info = datos ? datos.participantes[n] : {nombre: '', pago: false};
        let clase = info.pago ? 'paid' : (info.nombre.trim() !== '' ? 'reserved' : '');

        html += `
            <div class="n-slot ${clase}" id="slot-${tableId}-${n}">
                <div class="n-header">
                    <span class="n-number">${n}</span>
                    <input type="checkbox" class="pay-check" ${info.pago ? 'checked' : ''} 
                           onchange="actualizarEstado('${tableId}', '${n}', this)">
                </div>
                <input type="text" class="n-name" placeholder="Nombre..." value="${info.nombre}" 
                       oninput="actualizarColor('${tableId}', '${n}')" onchange="guardarTodo()">
            </div>`;
    }
    return html;
}

function actualizarColor(tableId, n) {
    const slot = document.getElementById(`slot-${tableId}-${n}`);
    const nombre = slot.querySelector('.n-name').value.trim();
    const checkbox = slot.querySelector('.pay-check');
    slot.classList.remove('paid', 'reserved');
    if (checkbox.checked) slot.classList.add('paid');
    else if (nombre !== "") slot.classList.add('reserved');
}

function actualizarEstado(tableId, n, checkbox) {
    actualizarColor(tableId, n);
    guardarTodo();
}

function guardarTodo() {
    const infoG = {
        n: document.getElementById('rifaName').value,
        p: document.getElementById('rifaPrize').value,
        c: document.getElementById('rifaCost').value,
        f: document.getElementById('rifaDate').value
    };
    localStorage.setItem('info_gral', JSON.stringify(infoG));

    const tablas = [];
    document.querySelectorAll('.rifa-card').forEach(card => {
        const id = card.id.replace('rifa-', '');
        const titulo = card.querySelector('.input-table-title').value;
        const participantes = {};
        card.querySelectorAll('.n-slot').forEach(slot => {
            const n = slot.querySelector('.n-number').innerText;
            participantes[n] = {
                nombre: slot.querySelector('.n-name').value,
                pago: slot.querySelector('.pay-check').checked
            };
        });
        tablas.push({ id, titulo, participantes });
    });
    localStorage.setItem('mis_rifas', JSON.stringify(tablas));
}

function cargarRifas() {
    const infoG = JSON.parse(localStorage.getItem('info_gral'));
    if(infoG) {
        document.getElementById('rifaName').value = infoG.n || '';
        document.getElementById('rifaPrize').value = infoG.p || '';
        document.getElementById('rifaCost').value = infoG.c || '';
        document.getElementById('rifaDate').value = infoG.f || '';
    }
    const backup = JSON.parse(localStorage.getItem('mis_rifas'));
    if (backup && backup.length > 0) backup.forEach(rifa => crearTabla(rifa));
    else crearTabla();
}

function eliminarTabla(id) {
    if(confirm('¿Eliminar tabla?')) {
        document.getElementById(`rifa-${id}`).remove();
        guardarTodo();
    }
}

function reenumerarTablas() {
    const badges = document.querySelectorAll('.tabla-badge');
    badges.forEach((badge, index) => {
        badge.innerText = `#${index + 1}`;
    });
}

// Modifica tu función eliminarTabla para que use la reenumeración:
async function eliminarTabla(id) {
    if(confirm('¿Eliminar esta tabla permanentemente de la base de datos de la Natillera?')) {
        
        // 1. Llamada al servidor para borrar en SQL
        try {
            const respuesta = await fetch(`EliminarRifa.aspx?id=${id}`, { method: 'DELETE' });
            
            if(respuesta.ok) {
                // 2. Si el servidor confirma el borrado, quitamos del HTML
                document.getElementById(`rifa-${id}`).remove();
                reenumerarTablas();
                alert("Tabla eliminada de la base de datos.");
            }
        } catch (error) {
            alert("Error al conectar con el servidor de Somee.");
        }
    }
}

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

    // 1. Agrupar datos por tabla
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
                resultadosPorTabla[tablaID].items.push({
                    numero: numero,
                    pago: estaPagado
                });
            }
        });
    });

    // 2. Generar el HTML de los desplegables
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
                    <div class="search-group-content" id="det-${id}">
                        ${grupo.items.map(i => `
                            <div class="search-item-detail">
                                <span>Número: <b>${i.numero}</b></span>
                                <span>${i.pago ? '<span class="status-paid">PAGADO</span>' : '<span class="status-debt">DEBE</span>'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        html += `
            <div style="margin-top:15px; padding-top:10px; border-top:2px solid #f1f5f9; text-align:right;">
                <span style="font-weight:bold;">Deuda Total de este cliente: </span>
                <span style="font-size:1.2rem; color:#e74c3c; font-weight:800;">$${totalDeudaGlobal.toLocaleString()}</span>
            </div>
        `;
        content.innerHTML = html;
    } else {
        content.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:20px;">No se encontraron resultados.</p>';
        panel.style.display = 'block';
    }
}

// Función para abrir y cerrar los desplegables
function toggleDetalle(id) {
    const content = document.getElementById(`det-${id}`);
    const isVisible = content.style.display === 'block';
    
    // Cerrar otros si quieres (opcional)
    document.querySelectorAll('.search-group-content').forEach(el => el.style.display = 'none');
    
    // Abrir el actual
    content.style.display = isVisible ? 'none' : 'block';
}