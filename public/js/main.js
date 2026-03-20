// DECLARACIÓN GLOBAL
// DECLARACIÓN GLOBAL
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
window.mapeoIdentificadores = {};
let miembrosGlobal = []; 
// ==================== CRITICAL: ID MAPPING SYSTEM ====================
/**
 * ✅ mapeoIdentificadores CRITICAL DOCUMENTATION:
 * 
 * STRUCTURE: 
 * 1️⃣ mapeoIdentificadores[visualPos] = m.id  → DB Position → Real DB ID (PRIMARY)
 * 2️⃣ mapeoIdentificadores[m.id] = m.id      → Real DB ID → itself (BACKUP)
 * 
 * USAGE RULES (MANDATORY):
 * ✅ ALWAYS use window.mapeoIdentificadores[idPantalla] to resolve to m.id (DB ID)
 * ✅ visualPos (m.posicion) = STABLE UI REFERENCE ONLY (ROW_NUMBER BY ID_Persona)
 * ✅ Disabling ID 18 → NO visual shifts (positions stable)
 * ✅ Backend /api/socios-esfuerzo → stable DB order
 * 
 * BACKEND GUARANTEE: SQL ROW_NUMBER(ORDER BY ID_Persona) = FIXED POSITIONS
 */
window.mapeoIdentificadores = {}; 

let quincenasSeleccionadas = [];
let mesesSeleccionadosTemporales = "Abono General";
const mesesDelAño = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function cargarTodo() { cargarDashboard(); listarMiembros(); }
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    cargarTodo();
    cargarMesesEnInterfaz(); // <--- AGREGA ESTA LÍNEA AQUÍ
});

async function cargarDashboard() {
    try {
        const res = await fetch('/reporte-general');
        const data = await res.json();
        
        document.getElementById('dash-ahorro').innerText = `$ ${Number(data.TotalAhorrado || 0).toLocaleString()}`;
        document.getElementById('dash-deuda-total').innerText = `$ ${Number(data.DeudaTotalConIntereses || 0).toLocaleString()}`;
        document.getElementById('dash-prestamos').innerText = `$ ${Number(data.CapitalPrestado || 0).toLocaleString()}`;
        document.getElementById('dash-intereses-pendientes').innerText = `$ ${Number(data.InteresesPendientesTotales || 0).toLocaleString()}`;
        document.getElementById('dash-ganancia').innerText = `$ ${Number(data.GananciasBrutas || 0).toLocaleString()}`;
        document.getElementById('dash-caja').innerText = `$ ${Number(data.CajaDisponible || 0).toLocaleString()}`;
        
    } catch (err) { console.error(err); }
}
// Función para alternar la visibilidad de los detalles de un miembro
window.toggleExpandirMiembro = async function(id) {
    const details = document.getElementById(`detalles-${id}`);
    const icon = document.getElementById(`icon-expand-${id}`);
    const card = document.getElementById(`card-${id}`);
    
    if (details.classList.contains('hidden')) {
        // Ocultar otros detalles primero
        document.querySelectorAll('[id^="detalles-"]:not(.hidden)').forEach(el => {
            el.classList.add('hidden');
        });
        document.querySelectorAll('[id^="icon-expand-"]').forEach(el => {
            el.classList.remove('fa-chevron-up');
            el.classList.add('fa-chevron-down');
        });
        
        // Cargar datos si no existen
        if (details.innerHTML.trim() === '') {
            details.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin text-indigo-500 text-xl"></i><span class="ml-2 text-slate-500">Cargando...</span></div>';
            await cargarDetallesMiembro(id);
        }
        
        details.classList.remove('hidden');
        if(card) {
            card.classList.remove('bg-white');
            card.classList.add('bg-indigo-50');
        }
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        details.classList.add('hidden');
        if(card) {
            card.classList.remove('bg-indigo-50');
            card.classList.add('bg-white');
        }
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
};

// Función para cargar los detalles de un miembro
async function cargarDetallesMiembro(id) {
    try {
        const rowDetails = document.getElementById(`detalles-${id}`);
        
        // Obtener datos del miembro
        const [a, p, totales] = await Promise.all([
            fetch(`/historial-ahorros/${id}`).then(r => r.json()).catch(() => []),
            fetch(`/detalle-prestamo/${id}`).then(r => r.json()).catch(() => []),
            fetch(`/estado-cuenta/${id}`).then(r => r.json()).catch(() => ({ totalAhorrado: 0, deudaTotal: 0 }))
        ]);

        const totalAhorrado = Number(totales.totalAhorrado || 0);
        const deudaTotal = Number(totales.deudaTotal || 0);
        
        // Ensure p is always an array before filtering
        const prestamos = Array.isArray(p) ? p : [];
        // Calcular préstamos activos
        const prestamosActivos = prestamos.filter(pr => Number(pr.saldoHoy || 0) > 0);
        const tienePrestamos = prestamosActivos.length > 0;
        
        // Últimos 3 ahorros
        const ultimosAhorros = a.slice(-3).reverse().map(ah => `
            <div class="flex justify-between items-center p-2 bg-emerald-50 rounded-lg">
                <span class="text-[10px] text-slate-500">${ah.FechaFormateada || ''}</span>
                <span class="text-xs font-bold text-emerald-600">+$${Number(ah.Monto).toLocaleString()}</span>
            </div>
        `).join('') || '<p class="text-[10px] text-slate-400 italic">Sin ahorros registrados</p>';
        
        // Préstamos activos resumidos
        let prestamosHTML = '';
        if (tienePrestamos) {
            prestamosHTML = prestamosActivos.slice(0, 2).map(pr => `
                <div class="p-2 bg-rose-50 rounded-lg">
                    <div class="flex justify-between items-center">
                        <span class="text-[9px] font-black text-rose-600">DÍA ${pr.diasActivo || pr.DiasTranscurridos || 0}</span>
                        <span class="text-xs font-bold text-rose-600">$${Number(pr.saldoHoy || 0).toLocaleString()}</span>
                    </div>
                </div>
            `).join('');
        } else {
            prestamosHTML = '<p class="text-[10px] text-emerald-500 italic">Sin deudas activas ✓</p>';
        }

        // Detect if we're in a card container or a table row
        const isCardContainer = rowDetails.tagName === 'DIV';
        
        let detailsContent = '';
        
        if (isCardContainer) {
            // Render for card container (div)
            detailsContent = `
                <div class="p-4">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <!-- Resumen financiero -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-wallet text-indigo-500"></i> Estado de Cuenta
                            </h4>
                            <div class="space-y-2">
                                <div class="flex justify-between items-center p-2 bg-emerald-50 rounded-xl">
                                    <span class="text-xs font-medium text-slate-600">Ahorros</span>
                                    <span class="text-sm font-black text-emerald-600">$${totalAhorrado.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between items-center p-2 bg-rose-50 rounded-xl">
                                    <span class="text-xs font-medium text-slate-600">Deuda</span>
                                    <span class="text-sm font-black text-rose-600">$${deudaTotal.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between items-center p-2 ${deudaTotal > totalAhorrado ? 'bg-amber-50' : 'bg-indigo-50'} rounded-xl">
                                    <span class="text-xs font-medium text-slate-600">Neto</span>
                                    <span class="text-sm font-black ${deudaTotal > totalAhorrado ? 'text-amber-600' : 'text-indigo-600'}">$${(totalAhorrado - deudaTotal).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Últimos ahorros -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-piggy-bank text-emerald-500"></i> Últimos Ahorros
                            </h4>
                            <div class="space-y-1 max-h-32 overflow-y-auto">
                                ${ultimosAhorros}
                            </div>
                        </div>
                        
                        <!-- Préstamos activos -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-hand-holding-usd text-rose-500"></i> Préstamos Activos
                            </h4>
                            <div class="space-y-1 max-h-32 overflow-y-auto">
                                ${prestamosHTML}
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 flex gap-2 justify-end">
                        <button onclick="verHistorialFechas(${id}, document.querySelector('#card-${id} .nombre-socio')?.textContent || 'Socio')" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition-all">
                            <i class="fas fa-history mr-1"></i> Ver Historial Completo
                        </button>
                        <button onclick="document.getElementById('mov_id').value = '${id}'; toggleExpandirMiembro(${id});" class="bg-amber-100 text-amber-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-amber-600 hover:text-white transition-all">
                            <i class="fas fa-plus mr-1"></i> Hacer Movimiento
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Render for table row (td)
            detailsContent = `
                <td colspan="4" class="px-4 py-4 bg-slate-50">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <!-- Resumen financiero -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-wallet text-indigo-500"></i> Estado de Cuenta
                            </h4>
                            <div class="space-y-2">
                                <div class="flex justify-between items-center p-2 bg-emerald-50 rounded-xl">
                                    <span class="text-xs font-medium text-slate-600">Ahorros</span>
                                    <span class="text-sm font-black text-emerald-600">$${totalAhorrado.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between items-center p-2 bg-rose-50 rounded-xl">
                                    <span class="text-xs font-medium text-slate-600">Deuda</span>
                                    <span class="text-sm font-black text-rose-600">$${deudaTotal.toLocaleString()}</span>
                                </div>
                                <div class="flex justify-between items-center p-2 ${deudaTotal > totalAhorrado ? 'bg-amber-50' : 'bg-indigo-50'} rounded-xl">
                                    <span class="text-xs font-medium text-slate-600">Neto</span>
                                    <span class="text-sm font-black ${deudaTotal > totalAhorrado ? 'text-amber-600' : 'text-indigo-600'}">$${(totalAhorrado - deudaTotal).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Últimos ahorros -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-piggy-bank text-emerald-500"></i> Últimos Ahorros
                            </h4>
                            <div class="space-y-1 max-h-32 overflow-y-auto">
                                ${ultimosAhorros}
                            </div>
                        </div>
                        
                        <!-- Préstamos activos -->
                        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <i class="fas fa-hand-holding-usd text-rose-500"></i> Préstamos Activos
                            </h4>
                            <div class="space-y-1 max-h-32 overflow-y-auto">
                                ${prestamosHTML}
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 flex gap-2 justify-end">
                        <button onclick="verHistorialFechas(${id}, this.closest('tr').previousElementSibling.querySelector('.nombre-socio').textContent)" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-600 hover:text-white transition-all">
                            <i class="fas fa-history mr-1"></i> Ver Historial Completo
                        </button>
                        <button onclick="document.getElementById('mov_id').value = '${id}'; this.closest('[id^=\'detalles-\']').classList.add('hidden'); document.getElementById('icon-expand-${id}').classList.replace('fa-chevron-up', 'fa-chevron-down');" class="bg-amber-100 text-amber-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-amber-600 hover:text-white transition-all">
                            <i class="fas fa-plus mr-1"></i> Hacer Movimiento
                        </button>
                    </div>
                </td>
            `;
        }
        
        rowDetails.innerHTML = detailsContent;
    } catch (err) {
        console.error("Error cargando detalles:", err);
        const rowDetails = document.getElementById(`detalles-${id}`);
        if (rowDetails) {
            rowDetails.innerHTML = '<td colspan="4" class="px-4 py-4 text-center text-red-500">Error al cargar detalles</td>';
        }
    }
}

async function listarMiembros() {
    try {
        const res = await fetch('/api/socios-esfuerzo');
        if (!res.ok) throw new Error("Error en servidor");
        
        miembrosGlobal = await res.json(); 
        
        const contenedor = document.getElementById('contenedor-miembros');
        if (!contenedor) {
            // Fallback: buscar tabla
            const tbody = document.getElementById('tabla-recientes');
            if (tbody) {
                tbody.innerHTML = '';
                return; // Mantener modo tabla
            }
        }
        if (contenedor) contenedor.innerHTML = '';
        window.mapeoIdentificadores = {}; 

let cAhorro = 0, cExtra = 0;
        const totalMiembros = miembrosGlobal.length;

        const container = contenedor || tbody;
        
// ==================== CRITICAL RENDERING RULES ====================
/**
 * 🎯 ID RENDERING MANDATORY:
 * ✅ <strong>ID ${m.id}</strong> → ALWAYS REAL DB ID (m.id)
 * ✅ m.posicion = Visual Pos (stable) → UI ONLY
 * ✅ onclick="${m.id}" → Backend operations use DB ID exclusively
 * ✅ Filter/Disable → Positions stable, DB IDs unchanged
 * ✅ ALL onclick="${m.id}" verified ✓ (no loop index)
 */
        // ✅ FIXED ID STABILITY: Visual position secondary, DB ID primary & permanent
        // Backend returns stable DB order → no reverse()
miembrosGlobal.forEach((m, index) => {
            const visualPos = m.posicion; // ✅ STABLE DB POSITION (no cambia al inhabilitar)
            window.mapeoIdentificadores[visualPos] = m.id;  // POS ESTABLE → Real DB ID
            window.mapeoIdentificadores[m.id] = m.id;      // Real DB ID → itself (primary)

            const esSocioReal = (m.tipo === 'SOCIO'); 
            esSocioReal ? cAhorro++ : cExtra++;

            if (contenedor) {
                // Render as expandable cards
                contenedor.innerHTML += `
<div id="card-${m.id}" data-socio-id="${m.id}" class="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer mb-3" onclick="toggleExpandirMiembro(${m.id})">
                        <div class="p-4 flex items-center justify-between">
                            <div class="flex items-center gap-4 flex-1">
<div class="flex flex-col items-center gap-1">
                                    <div class="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center">
                                    <strong class="text-success font-black text-lg">ID ${m.id}</strong>
                                    </div>
                                    <!-- POS removed to prevent confusion - uses real DB ID -->
                                </div>
                                <div class="flex-1">
<h3 class="font-bold text-slate-700 text-lg nombre-socio"><strong class="text-success">ID ${m.id}</strong> - ${m.nombre}</h3>
                                    <p class="text-[10px] text-slate-400 uppercase tracking-tighter">
                                        DOC: ${m.documento} | 
                                        <span class="${esSocioReal ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'} px-2 py-0.5 rounded-full font-black text-[9px] ml-2">
                                            ${m.tipo}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                                <button onclick="verHistorialFechas(${m.id}, '${m.nombre}')" class="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">Resumen</button>
                                <button onclick="abrirModalRetiro(${m.id}, '${m.nombre}')" class="bg-amber-50 text-amber-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 hover:text-white transition-all flex items-center gap-1">
                                    <i class="fas fa-hand-holding-usd"></i> Retirar
                                </button>
                                <button onclick="editarSocio(${m.id}, '${m.nombre}', '${m.documento}', '${m.tipo}')" class="text-amber-500 p-2 hover:scale-110 transition-transform" title="Editar">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button onclick="cambiarEstadoSocio(${m.id}, '${m.nombre}', 'Activo')" class="text-slate-400 p-2 hover:text-orange-500 hover:scale-110 transition-all" title="Inhabilitar Socio">
                                    <i class="fas fa-user-slash"></i>
                                </button>
                                <button onclick="eliminarSocio(${m.id})" class="text-rose-400 p-2 hover:scale-110 transition-transform" title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                                <button class="text-slate-400 hover:text-indigo-500 transition-colors ml-2">
                                    <i id="icon-expand-${m.id}" class="fas fa-chevron-down text-sm"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="detalles-${m.id}" class="hidden rounded-2xl bg-slate-50 border border-slate-100 overflow-hidden mb-3"></div>
                `;
            } else {
                // Render as table rows (fallback)
                tbody.innerHTML += `
<tr class="hover:bg-slate-50 transition-colors item-socio cursor-pointer" data-socio-id="${m.id}" onclick="toggleExpandirMiembro(${m.id})">
                        <td class="px-4 py-5 text-center">
                            <button class="text-slate-400 hover:text-indigo-500 transition-colors">
                                <i id="icon-expand-${m.id}" class="fas fa-chevron-down text-sm"></i>
                            </button>
                        </td>
                        <td class="px-4 py-5 font-black text-indigo-500 text-xl">#${m.id}</td>
                        <td class="px-4 py-5">
                            <div class="font-semibold text-slate-700 nombre-socio text-lg">${m.nombre}</div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-tighter">
                                DOC: ${m.documento} | 
                                <span class="${esSocioReal ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'} px-2 py-0.5 rounded-full font-black text-[9px] ml-2">
                                    ${m.tipo}
                                </span>
                            </div>
                        </td>
                        <td class="px-4 py-5 text-center" onclick="event.stopPropagation()">
                            <div class="flex justify-center gap-2 items-center flex-wrap">
                                <button onclick="verHistorialFechas(${m.id}, '${m.nombre}')" class="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">Resumen</button>
                                <button onclick="abrirModalRetiro(${m.id}, '${m.nombre}')" class="bg-amber-50 text-amber-600 px-3 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 hover:text-white transition-all flex items-center gap-1">
                                    <i class="fas fa-hand-holding-usd"></i> Retirar
                                </button>
                                <button onclick="editarSocio(${m.id}, '${m.nombre}', '${m.documento}', '${m.tipo}')" class="text-amber-500 p-2 hover:scale-110 transition-transform" title="Editar">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button onclick="cambiarEstadoSocio(${m.id}, '${m.nombre}', 'Activo')" class="text-slate-400 p-2 hover:text-orange-500 hover:scale-110 transition-all" title="Inhabilitar Socio">
                                    <i class="fas fa-user-slash"></i>
                                </button>
                                <button onclick="eliminarSocio(${m.id})" class="text-rose-400 p-2 hover:scale-110 transition-transform" title="Eliminar">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                    <tr id="detalles-${m.id}" class="hidden bg-slate-50"></tr>`;
            }
        });
        document.getElementById('count-ahorradores').innerText = `${cAhorro} Ahorradores`;
        document.getElementById('count-prestamos').innerText = `${cExtra} Externos`;
    } catch (err) { 
        console.error("Error al listar miembros:", err); 
    }
}

async function actualizarCaja() {
    const res = await fetch('/api/caja-disponible');
    const data = await res.json();
    document.getElementById('caja-disponible').innerText = 
        `$${data.disponible.toLocaleString()}`;
}

async function abrirModalRetiro(id, nombre) {
    const { value: formValues } = await Swal.fire({
        title: `<span class="text-sm font-black">RETIRAR AHORROS: ${nombre}</span>`,
        html: `
            <div class="p-4 text-left">
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">Opción de retiro</label>
                <select id="tipoRetiro" class="w-full p-3 bg-slate-100 rounded-xl mb-4 text-sm font-bold" 
                    onchange="document.getElementById('montoCont').style.display = (this.value === 'parcial' ? 'block' : 'none')">
                    <option value="parcial">RETIRO PARCIAL</option>
                    <option value="total">RETIRO TOTAL (TODO)</option>
                </select>
                
                <div id="montoCont">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">Monto a retirar ($)</label>
                    <input id="montoRetiro" type="number" class="w-full p-3 bg-slate-100 rounded-xl font-mono" placeholder="Ej: 50000">
                </div>
            </div>
        `,
        confirmButtonText: 'PROCESAR RETIRO',
        confirmButtonColor: '#f59e0b',
        showCancelButton: true,
        preConfirm: () => {
            const tipo = document.getElementById('tipoRetiro').value;
            const monto = document.getElementById('montoRetiro').value;
            return { tipo, monto };
        }
    });

    if (formValues) {
        try {
            const response = await fetch('/api/retirar-ahorro', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...formValues })
            });

            const data = await response.json();

            if (data.success) {
                Swal.fire('¡Éxito!', data.message, 'success');
                cargarTodo(); // Recarga la tabla y los contadores del dashboard
            } else {
                // Aquí se muestra el error de "Saldo insuficiente" que viene del servidor
                Swal.fire('Atención', data.message, 'warning');
            }
        } catch (error) {
            Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
        }
    }
}

async function actualizarListaDeudas() {
    const inputVal = document.getElementById('mov_id').value.trim();
    let idReal;
    
    // ==================== CRITICAL INPUT RESOLUTION ====================
    /**
     * /mov_id INPUT RESOLUTION (MANDATORY):
     * ✅ Accepts: Visual Pos (#18) OR Real DB ID (#18)
     * ✅ window.mapeoIdentificadores[pos] → m.id (DB ID)
     * ✅ Filter/Disable ID 18 → Mapping intact, resolution safe
     * ✅ Fallback: Direct parseInt(inputVal) as DB ID
     * ✅ NEVER use loop index - ALWAYS resolve via mapping
     * ✅ Verified: Works with filtered lists ✓
     */
    // FIXED: Flexible input - accepts visual pos OR real ID
    // DIRECT DB ID ONLY - NO visual position mapping
    idReal = parseInt(inputVal);
    if (isNaN(idReal)) {
        document.getElementById('mov_prestamo_id').innerHTML = '<option value="">ID de socio inválido</option>';
        return;
    }
    // Validate ID exists in global members list
    const socioExiste = miembrosGlobal.find(m => m.id == idReal);
    if (!socioExiste) {
        document.getElementById('mov_prestamo_id').innerHTML = '<option value="">Socio no encontrado</option>';
        return;
    }
    
    // Validation warning for filtered lists
    if (Object.keys(miembrosGlobal).length < Object.keys(window.mapeoIdentificadores).length / 2) {
        Toast.fire({
            icon: 'warning',
            title: '⚠️ Lista filtrada - usa ID real del socio'
        });
    }
    const select = document.getElementById('mov_prestamo_id');
    const inputMonto = document.getElementById('mov_monto'); 
    
    if (!idReal) {
        select.innerHTML = '<option value="">Ingrese ID de socio</option>';
        return;
    }

    try {
        // Consultamos el detalle completo que ya trae SaldoActual e intereses
        const res = await fetch(`/detalle-prestamo/${idReal}`);
        const prestamos = await res.json();
        
        // Ordenar préstamos por fecha de inicio (mismo orden que en renderPrestamos y renderAbonosDetallados)
        const prestamosOrdenados = [...prestamos].sort((a, b) => new Date(a.FechaInicio || a.FechaPrestamo || 0) - new Date(b.FechaInicio || b.FechaPrestamo || 0));
        
        // Filtramos solo los que tengan deuda según el SaldoActual de la DB
        const activos = prestamosOrdenados.filter(p => Number(p.SaldoActual) > 0);
        
        if (activos.length > 0) {
            select.innerHTML = activos.map((p, index) => {
                // AQUÍ ESTÁ EL ARREGLO: 
                // No restamos nada a mano, usamos el saldo que manda SQL
                const saldoReal = Number(p.SaldoActual); 
                const numPrestamoSocio = index + 1; 
                
                // Guardamos el interés generado en un atributo data para usarlo después
                const interesGenerado = Number(p.InteresGenerado || 0);

                return `<option value="${p.ID_Prestamo}" data-saldo="${saldoReal}" data-index="${index}" data-interes="${interesGenerado}">
                    Préstamo #${numPrestamoSocio} (Saldo: $${saldoReal.toLocaleString()})
                </option>`;
            }).join('');
            
            select.onchange = () => {
                const saldo = select.options[select.selectedIndex].getAttribute('data-saldo');
                const interes = select.options[select.selectedIndex].getAttribute('data-interes');
                inputMonto.placeholder = `Máximo: $${Number(saldo).toLocaleString()}`;
                // Guardar el interés actual para mostrar cuando se seleccione "A Interés"
                window.interesActualPrestamo = interes;
                actualizarInfoInteres();
            };
            select.onchange();
            
        } else {
            select.innerHTML = '<option value="">Sin deudas activas</option>';
            inputMonto.placeholder = "Monto $";
            window.interesActualPrestamo = 0;
        }
    } catch (e) { console.error("Error al actualizar deudas:", e); }
}

// Función para mostrar/ocultar la info de intereses según la opción seleccionada
function actualizarInfoInteres() {
    const radioInteres = document.querySelector('input[name="destinoAbono"]:checked');
    const infoInteres = document.getElementById('info-interes');
    const montoInteres = document.getElementById('monto-interes-pendiente');
    
    if (!radioInteres || !infoInteres || !montoInteres) return;
    
    if (radioInteres.value === 'interes') {
        // Mostrar el interés pendiente
        const interes = Number(window.interesActualPrestamo || 0);
        montoInteres.textContent = `$${interes.toLocaleString()}`;
        infoInteres.classList.remove('hidden');
        
        // También actualizar el placeholder del monto con el máximo de interés
        const inputMonto = document.getElementById('mov_monto');
        if (inputMonto) {
            inputMonto.placeholder = `Máximo: $${interes.toLocaleString()}`;
        }
    } else if (radioInteres.value === 'interesAnticipado') {
        // Para interés anticipado, no hay límite (se puede pagar por adelantado)
        infoInteres.classList.add('hidden');
        
        // Placeholder flexible para interés anticipado
        const inputMonto = document.getElementById('mov_monto');
        if (inputMonto) {
            inputMonto.placeholder = "Monto a adelantar";
        }
    } else {
        // Ocultar el info de interés y restaurar el placeholder normal (para capital)
        infoInteres.classList.add('hidden');
        const select = document.getElementById('mov_prestamo_id');
        const inputMonto = document.getElementById('mov_monto');
        if (select && inputMonto) {
            const saldo = select.options[select.selectedIndex]?.getAttribute('data-saldo');
            if (saldo) {
                inputMonto.placeholder = `Máximo: $${Number(saldo).toLocaleString()}`;
            }
        }
    }
}

async function verHistorialFechas(id, nombre) {
    console.log(`📊 verHistorialFechas: Loading data for ID=${id} (${nombre})`);
    
    Swal.fire({
        title: 'Cargando datos...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const fetchSeguro = async (url) => {
            console.log(`   → Fetching: ${url}`);
            const res = await fetch(url);
            if (!res.ok) {
                console.warn(`   ❌ ${url}: ${res.status}`);
                return [];
            }
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.warn(`   ❌ ${url}: Invalid JSON`);
                return [];
            }
            const data = await res.json();
            console.log(`   ✅ ${url}: ${Array.isArray(data) ? data.length : Object.keys(data).length} items`);
            return data;
        };

        const [a, p, ab, totales] = await Promise.all([
            fetchSeguro(`/historial-ahorros/${id}`),
            fetchSeguro(`/detalle-prestamo/${id}`),
            fetchSeguro(`/historial-abonos-deuda/${id}`),
            fetchSeguro(`/estado-cuenta/${id}`)
        ]);

        console.log(`📊 Data loaded for ID=${id}: Ahorros=${a.length}, Préstamos=${p.length || p.prestamos?.length || 0}, Abonos=${ab.length}, Totales=OK`);

        // Normalize préstamos response (handles both [] and {prestamos: []})
        const prestamos = Array.isArray(p) ? p : (p.prestamos || []);

        // --- CORRECCIÓN DE DEUDA DINÁMICA ---
        // Ahora usamos saldoHoy que ya viene calculado del servidor (Capital Pendiente + Interés Pendiente)
        // Solo incluimos préstamos con saldo mayor a 0
        const deudaRealActualizada = prestamos.reduce((acc, m) => {
            const saldo = Number(m.saldoHoy || 0);
            // Solo incluir si el saldo es mayor a 0 (excluir préstamos pagados)
            return acc + (saldo > 0 ? saldo : 0);
        }, 0);

        console.log(`   → Deuda calculada: $${deudaRealActualizada.toLocaleString()}`);

        // Actualizamos el objeto totales para que el modal use el valor con intereses
        totales.deudaTotal = deudaRealActualizada;


        const renderSimple = (data, key, color) => {
            if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin movimientos</p>';
            return data.map((m, index) => {
                const esRetiro = Number(m[key]) < 0;
                const colorFinal = esRetiro ? 'rose' : color;
                // Usar RowNum del servidor (número secuencial basado en fecha)
                const rowNum = m.RowNum || (index + 1);
                const monto = Number(m[key]);
                const fecha = m.FechaFormateada || '';
                const detalle = (m.Detalle || '').replace(/'/g, "\\'");
                console.log("DEBUG - Datos del ahorro:", m, "RowNum:", rowNum);
                return `
                <div class="flex justify-between items-center p-3 border-b border-slate-100 text-[11px]">
                    <div class="flex flex-col">
                        <span class="text-slate-500 font-medium">${fecha}</span>
                        <span class="text-[9px] font-black uppercase ${esRetiro ? 'text-rose-400' : 'text-indigo-400'} mt-0.5">${m.Detalle || 'Ahorro'}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-${colorFinal}-600">${esRetiro ? '' : '+'}$${Math.abs(monto).toLocaleString()}</span>
                        ${!esRetiro ? `<button onclick="window.abrirEditarAhorro(${rowNum}, ${monto}, '${fecha}', '${detalle}', ${id})" class="text-indigo-400 hover:text-indigo-600 p-1" title="Editar"><i class="fas fa-edit text-xs"></i></button>` : ''}
                    </div>
                </div>`;
            }).join('');
        };

        const renderPrestamos = (data) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin préstamos</p>';
    
    // Ordenar préstamos por fecha de inicio ASC (más antiguo = #1)
    const prestamosOrdenados = [...data].sort((a, b) => 
        new Date(a.FechaInicio || a.FechaPrestamo || '1970-01-01') - 
        new Date(b.FechaInicio || b.FechaPrestamo || '1970-01-01')
    );
    
    return prestamosOrdenados.map((m, index) => {
          // Ahora usamos los valores que envía el servidor directamente
          const interesGenerado = Number(m.InteresGenerado || 0);
          const interesPendiente = Number(m.InteresPendiente || 0);
          const interesAnticipado = Number(m.InteresAnticipado || 0);
          const interesAnticipadoUsado = Number(m.InteresAnticipadoUsado || 0);
          const interesesPagados = Number(m.InteresesPagados || 0);
          
          // El anticipado剩余 disponible es: Total Anticipado - Anticipado Usado
          const interesPrepagadoConsumido = interesAnticipadoUsado;
          const interesPrepagadoRestante = Math.max(0, interesAnticipado - interesAnticipadoUsado);
        const capitalOriginal = Number(m.MontoPrestado || 0);
        const capitalHoy = Number(m.capitalHoy || 0);
        // Usar saldoHoy que ya viene calculado del servidor
        const saldoTotal = Number(m.saldoHoy || 0);
        const estaPago = m.Estado === 'Pagado' || saldoTotal <= 0;
        
        const dias = m.diasActivo !== undefined ? m.diasActivo : m.DiasTranscurridos;

        // Calcular cuánto se ha abonado a capital
        const abonadoACapital = capitalOriginal - capitalHoy;
        const tieneAbonosCapital = abonadoACapital > 0;

        // Breakdown: Capital Hoy = Capital Original - Abonos a Capital
        const breakdownCapital = tieneAbonosCapital ? `
            <div class="mt-1 pt-1 border-t border-slate-200/30">
                <span class="text-[6px] text-slate-400 uppercase">Detalle:</span>
                <div class="flex justify-between text-[7px] mt-0.5">
                    <span class="text-slate-500">Capital Inicial:</span>
                    <span class="font-medium">$${capitalOriginal.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-[7px]">
                    <span class="text-emerald-500">- Abonos a Capital:</span>
                    <span class="font-medium text-emerald-600">$${abonadoACapital.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-[7px] font-bold bg-emerald-100/50 px-1 rounded mt-0.5">
                    <span class="text-emerald-700">= Capital Hoy:</span>
                    <span class="text-emerald-700">$${capitalHoy.toLocaleString()}</span>
                </div>
            </div>
        ` : '';

        // Mostrar detalle de intereses: generado, prepagado usado, pagos realizados
        const mostrarDetalleInteres = `
            <div class="text-[8px] mt-1 space-y-0.5">
                <div class="flex justify-between">
                    <span class="text-slate-500">Int. Generado:</span>
                    <span class="font-medium">$${interesGenerado.toLocaleString()}</span>
                </div>
                ${interesPrepagadoConsumido > 0 ? `
                <div class="flex justify-between text-emerald-600">
                    <span>- Int. Prepagado Usado:</span>
                    <span class="font-medium">-$${interesPrepagadoConsumido.toLocaleString()}</span>
                </div>
                ` : ''}
                ${interesPrepagadoRestante > 0 ? `
                <div class="flex justify-between text-indigo-600">
                    <span>+ Int. Prepagado Disponible:</span>
                    <span class="font-medium">+$${interesPrepagadoRestante.toLocaleString()}</span>
                </div>
                ` : ''}
                ${interesesPagados > 0 ? `
                <div class="flex justify-between text-emerald-600">
                    <span>- Int. Pagado:</span>
                    <span class="font-medium">-$${interesesPagados.toLocaleString()}</span>
                </div>
                ` : ''}
                <div class="flex justify-between border-t border-slate-200 pt-0.5 font-bold">
                    <span class="text-rose-500">= Int. Pendiente:</span>
                    <span class="text-rose-600">$${interesPendiente.toLocaleString()}</span>
                </div>
            </div>
        `;

        return `
        <div class="p-3 mb-3 rounded-2xl border ${estaPago ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'} shadow-sm">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full shadow-sm">PRÉSTAMO #${index + 1}</span>
                    <button onclick="window.abrirEditarPrestamo(${m.ID_Prestamo}, ${capitalOriginal}, ${m.TasaInteres}, '${m.FechaInicioFormateada || m.FechaPrestamo || ''}')" class="text-amber-500 hover:text-amber-700 text-[10px] font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 hover:bg-amber-100 transition-all" title="Editar Préstamo">
                        <i class="fas fa-edit mr-1"></i>Editar
                    </button>
                </div>
                <span class="text-[10px] ${estaPago ? 'text-emerald-700' : 'text-slate-500'} font-bold">
                    ${estaPago ? '✅ PAGADO' : '📅 ' + (m.FechaInicioFormateada || m.FechaPrestamo || 'S/F')}
                </span>
            </div>

            <div class="flex flex-wrap gap-2 mb-2">
                <span class="bg-slate-100 text-[9px] font-bold text-slate-600 px-2 py-1 rounded-lg border border-slate-200">
                    <i class="fas fa-percentage mr-1 text-indigo-400"></i>Int: ${m.TasaInteres}%
                </span>
                
                ${(dias !== undefined && dias !== null) ? `
                <span class="bg-indigo-100 text-[9px] font-black text-indigo-700 px-2 py-1 rounded-lg border border-indigo-200 ${dias > 0 ? 'animate-pulse' : ''}">
                    <i class="fas fa-clock mr-1"></i>${dias} DÍAS
                </span>` : ''}
            </div>

            <div class="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                <div class="flex flex-col text-left">
                    <span class="text-[8px] uppercase font-black text-slate-400 leading-tight">Resumen</span>
                    <span class="text-[11px] font-bold text-slate-700">Capital: $${capitalOriginal.toLocaleString()}</span>
                    ${mostrarDetalleInteres}
                </div>
                
                ${!estaPago ? `
                <div class="flex flex-col text-right">
                    <span class="text-[8px] uppercase font-black text-rose-500 leading-tight">Saldo Total</span>
                    <span class="text-[14px] font-black text-rose-600 tracking-tight">$${Math.max(0, saldoTotal).toLocaleString()}</span>
                    ${breakdownCapital}
                </div>` : `
                <div class="text-right text-emerald-600 font-black text-[10px] pt-2">COMPLETADO ✓</div>`}
            </div>
        </div>`;
    }).join('');
};

        const renderAbonosDetallados = (data, listaPrestamos) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin abonos realizados</p>';
    
    const prestamosSeguros = Array.isArray(listaPrestamos) ? listaPrestamos : [];
    const prestamosOrdenados = [...prestamosSeguros].sort((a, b) => new Date(a.FechaInicio || a.FechaPrestamo || 0) - new Date(b.FechaInicio || b.FechaPrestamo || 0));
    
    return data.map(m => {
        // ✅ FIXED: Robust numeric ID matching + fallback
        const safeId = Number(m.ID_Prestamo);
        const indicePrestamo = Number.isFinite(safeId) 
            ? prestamosOrdenados.findIndex(p => Number(p.ID_Prestamo) === safeId)
            : -1;
        const numeroAmigable = indicePrestamo + 1;
        
        // --- LÓGICA DE DESTINO ---
        // Verificar si es CAPITAL, INTERÉS ANTICIPADO, o INTERÉS regular
        const detalleLower = String(m.MesesCorrespondientes || m.Detalle || '').toLowerCase();
        const esCapital = detalleLower.includes('capital');
        const esAnticipado = detalleLower.includes('anticipado');
        
        let colorBadge, textoDestino;
        if (esCapital) {
            colorBadge = 'bg-emerald-100 text-emerald-700';
            textoDestino = 'CAPITAL';
        } else if (esAnticipado) {
            colorBadge = 'bg-amber-100 text-amber-700';
            textoDestino = 'INTERÉS ANTICIPADO';
        } else {
            colorBadge = 'bg-amber-100 text-amber-700';
            textoDestino = 'INTERÉS';
        }

        const idPago = m.ID_Pago || 0;
        const idPrestamo = m.ID_Prestamo || 0;
        const montoAbono = Number(m.Monto_Abonado || m.Monto || 0);

        return `
            <div class="p-2 border-b border-slate-100 text-[11px]">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-slate-500 font-medium">${m.FechaFormateada || 'S/F'}</span>
                        <p class="text-[9px] text-indigo-500 font-bold uppercase mt-0.5">Aplicado a: Préstamo #${numeroAmigable}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="text-right">
                            <span class="font-bold text-rose-600 block">-$${montoAbono.toLocaleString()}</span>
                            <span class="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase mt-1 ${colorBadge}">
                                ${textoDestino}
                            </span>
                        </div>
                        ${idPago > 0 ? `<button onclick="abrirEditarPago(${idPago}, ${montoAbono}, '${m.FechaFormateada || ''}', '${m.Detalle || ''}', ${idPrestamo}, ${montoAbono})" class="text-indigo-400 hover:text-indigo-600 p-1" title="Editar"><i class="fas fa-edit text-xs"></i></button>` : ''}
                        ${idPago > 0 ? `<button onclick="eliminarPago(${idPago}, ${montoAbono}, '${m.Detalle || ''}', ${idPrestamo})" class="text-rose-400 hover:text-rose-600 p-1" title="Eliminar"><i class="fas fa-trash text-xs"></i></button>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');
};

        Swal.fire({
            title: `<span class="text-xl font-black">${nombre}</span>`,
            html: `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-emerald-50 p-2 rounded-xl text-center border border-emerald-100 shadow-sm">
                        <p class="text-[8px] uppercase font-bold text-emerald-600">Total Ahorrado</p>
                        <p class="font-black text-emerald-700 text-sm">$${Number(totales.totalAhorrado || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-rose-50 p-2 rounded-xl text-center border border-rose-100 shadow-sm">
                        <p class="text-[8px] uppercase font-bold text-rose-600">Deuda Total (Con Int.)</p>
                        <p class="font-black text-rose-700 text-sm">$${Number(totales.deudaTotal).toLocaleString()}</p>
                    </div>
                </div>
                <div class="text-left space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    <div class="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onclick="toggleAcordeon('acc-ahorros', this)" class="w-full flex justify-between items-center p-4 bg-white hover:bg-emerald-50 transition-colors">
                            <span class="text-[10px] font-black uppercase text-emerald-600"><i class="fas fa-piggy-bank mr-2"></i> Historial de Ahorros</span>
                            <i class="fas fa-chevron-down text-emerald-400 transition-transform duration-300"></i>
                        </button>
                        <div id="acc-ahorros" class="max-h-0 overflow-hidden transition-all duration-300 ease-in-out">
                            <div class="p-1 border-t border-slate-50">${renderSimple(a, 'Monto', 'emerald')}</div>
                        </div>
                    </div>
                    <div class="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onclick="toggleAcordeon('acc-prestamos', this)" class="w-full flex justify-between items-center p-4 bg-white hover:bg-blue-50 transition-colors">
                            <span class="text-[10px] font-black uppercase text-blue-600"><i class="fas fa-hand-holding-dollar mr-2"></i> Préstamos Detallados</span>
                            <i class="fas fa-chevron-down text-blue-400 transition-transform duration-300"></i>
                        </button>
                        <div id="acc-prestamos" class="max-h-0 overflow-hidden transition-all duration-300 ease-in-out">
<div class="p-3 border-t border-slate-50 bg-slate-50/30">${renderPrestamos(prestamos)}</div>
                        </div>
                    </div>
                    <div class="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onclick="toggleAcordeon('acc-abonos', this)" class="w-full flex justify-between items-center p-4 bg-white hover:bg-rose-50 transition-colors">
                            <span class="text-[10px] font-black uppercase text-rose-600"><i class="fas fa-receipt mr-2"></i> Abonos a Préstamos</span>
                            <i class="fas fa-chevron-down text-rose-400 transition-transform duration-300"></i>
                        </button>
                        <div id="acc-abonos" class="max-h-0 overflow-hidden transition-all duration-300 ease-in-out">
                            <div class="p-3 border-t border-slate-50">${renderAbonosDetallados(ab, p)}</div>
                        </div>
                    </div>
                </div>`,
            showDenyButton: true,
            confirmButtonText: 'Cerrar',
            denyButtonText: '📥 Descargar PDF',
            denyButtonColor: '#059669',
            confirmButtonColor: '#64748b',
            customClass: { popup: 'rounded-[2.5rem]' }
        }).then((result) => {
            if (result.isDenied) generarPDFMovimientos(nombre, a, p, ab, totales);
        });

    } catch (e) {
        console.error("Error crítico en historial:", e);
        Swal.fire('Error', 'Error al procesar los datos del servidor.', 'error');
    }
}

function toggleAcordeon(id, btn) {
    const content = document.getElementById(id);
    const icon = btn.querySelector('.fa-chevron-down');
    
    // Si ya está abierto, lo mantenemos abierto (no cerramos al hacer click en el mismo)
    // Solo cerramos si está en height = '0px'
    const isClosed = !content.style.maxHeight || content.style.maxHeight === '0px';
    
    if (isClosed) {
        // Cerramos todos los demás primero
        document.querySelectorAll('[id^="acc-"]').forEach(el => {
            if (el.id !== id) {
                el.style.maxHeight = '0px';
            }
        });
        document.querySelectorAll('.fa-chevron-down').forEach(i => {
            if (i !== icon) {
                i.style.transform = 'rotate(0deg)';
            }
        });

        // Abrimos el actual
        content.style.maxHeight = content.scrollHeight + "px";
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        // Si ya está abierto, lo cerramos
        content.style.maxHeight = '0px';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

     async function registrarMovimiento() {
    const numPantalla = document.getElementById('mov_id').value;
    const montoInput = document.getElementById('mov_monto');
    const monto = parseFloat(montoInput.value);
    const tipo = document.getElementById('mov_tipo').value;
    const selectDeuda = document.getElementById('mov_prestamo_id');
    const idReal = window.mapeoIdentificadores[numPantalla];
    // Capturamos la fecha manual que agregamos al HTML
    const fechaManual = document.getElementById('mov_fecha_manual')?.value || new Date().toISOString().split('T')[0];

    const radioDestino = document.querySelector('input[name="destinoAbono"]:checked');
    const destinoAbono = radioDestino ? radioDestino.value : 'capital';

    if (!idReal || isNaN(monto)) {
        return Swal.fire('Faltan datos', 'Ingresa un monto válido', 'warning');
    }

    // --- VALIDACIÓN LOCAL CORREGIDA Y TOLERANTE ---
    if (tipo === 'deuda' && destinoAbono === 'interes') {
        const optionSeleccionado = selectDeuda.options[selectDeuda.selectedIndex];
        if (optionSeleccionado) {
            // Leemos el atributo crudo para saber si realmente existe
            const rawInteres = optionSeleccionado.getAttribute('data-interes');
            
            // Solo validamos si el atributo existe (no es null). 
            // Si es null (como pasa con algunos externos), dejamos que el servidor decida.
            if (rawInteres !== null) {
                const pendiente = parseFloat(rawInteres);
                
                if (pendiente <= 0) {
                    return Swal.fire('No permitido', 'Este préstamo no tiene intereses pendientes a la fecha.', 'info');
                }
                // Añadimos un pequeño margen de 100 pesos por temas de redondeo
                if (monto > (pendiente + 100)) { 
                    return Swal.fire('Monto excesivo', `El interés pendiente es solo de $${Math.round(pendiente).toLocaleString()}`, 'warning');
                }
            }
        }
    }

    let mesesParaEnviar = (tipo === 'ahorro') ? mesesSeleccionadosTemporales : `Abono a ${destinoAbono.toUpperCase()}`;

    const confirmacion = await Swal.fire({
        title: '¿Confirmar movimiento?',
        text: `Registro de ${tipo.toUpperCase()} (${destinoAbono}) por $${monto.toLocaleString()}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, registrar'
    });

    if (!confirmacion.isConfirmed) return;

    try {
        const respuesta = await fetch('/procesar-movimiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idPersona: idReal,
                monto: monto,
                tipoMovimiento: tipo,
                idPrestamo: (tipo === 'deuda') ? selectDeuda.value : null,
                MesesCorrespondientes: mesesParaEnviar,
                destinoAbono: (tipo === 'deuda') ? destinoAbono : null,
                fechaManual: fechaManual // Enviamos la fecha al servidor
            })
        });

        const resultado = await respuesta.json();

        if (resultado.success) {
            Swal.fire('¡Éxito!', 'Guardado correctamente', 'success');
            montoInput.value = '';
            cargarTodo();
        } else {
            Swal.fire('Error', resultado.error, 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Falla de conexión', 'error');
    }
}

async function cargarEstadisticas() {
    try {
        // Pedimos los 4 datos al tiempo
        const [resA, resP, resG, resC] = await Promise.all([
            fetch('/api/total-ahorros'),
            fetch('/api/total-prestamos'),
            fetch('/api/ganancias-disponibles'),
            fetch('/api/caja-disponible')
        ]);

        const a = await resA.json();
        const p = await resP.json();
        const g = await resG.json();
        const c = await resC.json();

        // Pintamos en los IDs del HTML que revisamos antes
        document.getElementById('dash-ahorro').innerText = `$ ${parseFloat(a.total).toLocaleString()}`;
        document.getElementById('dash-prestamos').innerText = `$ ${parseFloat(p.total).toLocaleString()}`;
        document.getElementById('dash-ganancia').innerText = `$ ${parseFloat(g.saldo).toLocaleString()}`;
        document.getElementById('dash-caja').innerText = `$ ${parseFloat(c.total).toLocaleString()}`;

    } catch (error) {
        console.error("Error cargando cuadros:", error);
    }
}


async function crearPersona() {
    // 1. Validamos que los elementos existan antes de leer su .value
    const inputNombre = document.getElementById('p_Nombre') || document.getElementById('p_nombre');
    const inputDocumento = document.getElementById('p_documento');
    const inputSocio = document.getElementById('p_esSocio');

    if (!inputNombre || !inputDocumento) {
        console.error("Error: No se encontraron los inputs en el HTML.");
        return;
    }

    const n = inputNombre.value.trim();
    const d = inputDocumento.value.trim();
    const s = inputSocio ? inputSocio.value : "0";

    if (!n || !d) return Toast.fire({ icon: 'warning', title: 'Faltan datos' });

    try {
        // Usamos variables claras para evitar el "nombre is not defined"
        await apiCall('/guardar-miembro', { 
            nombre: n, 
            cedula: d, 
            esSocio: s === "1" ? 1 : 0 
        }, "Miembro guardado");

        // Limpieza segura
        inputNombre.value = '';
        inputDocumento.value = '';
    } catch (e) {
        console.error("Error en la llamada:", e);
    }
}
        async function apiCall(ruta, datos, msg) {
            try {
                const res = await fetch(ruta, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos) });
                const r = await res.json();
                if(r.success) { Toast.fire({ icon: 'success', title: msg }); cargarTodo(); } else throw new Error(r.message);
            } catch (e) { Swal.fire({ icon: 'error', title: 'Error', text: e.message }); }
        }

function filtrarSocios() {
    let input = document.getElementById("inputBusqueda").value.toLowerCase();
    let contenedor = document.getElementById("contenedor-miembros");
    if (!contenedor) return;
    
    // Buscar tarjetas de miembros (card-ID)
    let cards = contenedor.querySelectorAll('[id^="card-"]');
    Array.from(cards).forEach(card => {
        let nombre = card.querySelector(".nombre-socio") ? card.querySelector(".nombre-socio").innerText.toLowerCase() : "";
        // También buscar en el ID para buscar por número
        let idCard = card.id.replace("card-", "");
        
        if (nombre.includes(input) || idCard.includes(input)) {
            card.style.display = "";
            // También mostrar/ocultar la fila de detalles asociada
            let detalles = document.getElementById("detalles-" + idCard);
            if (detalles) {
                detalles.style.display = "";
            }
        } else {
            card.style.display = "none";
            // Ocultar también la fila de detalles
            let detalles = document.getElementById("detalles-" + idCard);
            if (detalles) {
                detalles.style.display = "none";
            }
        }
    });
    
    // Rebuild mapeoIdentificadores for visible items only
    window.mapeoIdentificadores = {};
    const visibleCards = contenedor.querySelectorAll('[id^="card-"][style*="display: "]');
    visibleCards.forEach(card => {
        const idCard = card.id.replace("card-", "");
        const socioId = card.getAttribute('data-socio-id') || idCard;
        window.mapeoIdentificadores[idCard] = socioId;
        window.mapeoIdentificadores[socioId] = socioId;
    });
}

        async function modalPrestamoRapido() {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Préstamo',
        html: `
            <div class="text-left space-y-3">
                <div class="grid grid-cols-2 gap-4">
    <div>
        <label class="swal-input-label">ID SOCIO (Base de Datos)</label>
        <input id="p-id" type="number" class="swal-custom-input" placeholder="ID real (ej: 75)">
    </div>
    <div>
        <label class="swal-input-label">Fecha de Préstamo</label>
        <input id="p-fecha" type="date" class="swal-custom-input" value="${new Date().toISOString().split('T')[0]}">
    </div>
</div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="swal-input-label">Monto Capital ($)</label>
                        <input id="p-m" type="number" class="swal-custom-input" placeholder="0">
                    </div>
                    <div>
                        <label class="swal-input-label">Interés Mensual (%)</label>
                        <input id="p-tasa" type="number" class="swal-custom-input" value="10">
                    </div>
                </div>

                <div class="bg-indigo-950 p-5 rounded-2xl text-white shadow-xl border border-indigo-500/30">
                    <div class="flex justify-between text-[10px] text-indigo-300 font-black uppercase mb-4 tracking-widest">
                        <span>Simulador de Interés Diario</span>
                        <i class="fas fa-bolt text-amber-400"></i>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="border-r border-white/10">
                            <p class="text-[9px] text-slate-400 uppercase font-bold">Costo por día</p>
                            <span id="calc-dia" class="text-xl font-black text-amber-400">$ 0</span>
                        </div>
                        <div class="pl-2">
                            <p class="text-[9px] text-slate-400 uppercase font-bold">Costo por semana</p>
                            <span id="calc-semana" class="text-xl font-black text-emerald-400">$ 0</span>
                        </div>
                    </div>

                    <div class="mt-4 pt-3 border-t border-white/10">
                        <p class="text-[9px] text-slate-400 uppercase font-bold mb-1">Impacto a 30 días</p>
                        <div class="flex justify-between items-end">
                            <span id="calc-mes" class="text-sm font-bold text-white">$ 0</span>
                            <span class="text-[8px] text-indigo-300 italic">* Basado en mes de 30 días</span>
                        </div>
                    </div>
                </div>
                
                <p class="text-[10px] text-slate-500 italic px-2">
                    * El sistema sumará el interés automáticamente cada día transcurrido.
                </p>
            </div>`,
        didOpen: () => {
            const inputs = ['p-m', 'p-tasa'];
            const calcularDiario = () => {
                const capital = parseFloat(document.getElementById('p-m').value) || 0;
                const tasaMensual = parseFloat(document.getElementById('p-tasa').value) || 0;

                // Cálculo Natillero: (Capital * %Mensual) / 30 días
                const interesPorDia = (capital * (tasaMensual / 100)) / 30;
                const interesPorSemana = interesPorDia * 7;
                const interesPorMes = interesPorDia * 30;

                document.getElementById('calc-dia').innerText = `$ ${Math.round(interesPorDia).toLocaleString()}`;
                document.getElementById('calc-semana').innerText = `$ ${Math.round(interesPorSemana).toLocaleString()}`;
                document.getElementById('calc-mes').innerText = `$ ${Math.round(interesPorMes).toLocaleString()}`;
            };
            
            inputs.forEach(id => {
                const el = document.getElementById(id);
                el.addEventListener('input', calcularDiario);
            });
        },
        preConfirm: () => {
            const idIngresado = document.getElementById('p-id').value;
            const socioReal = miembrosGlobal.find(m => m.id == idIngresado);
            
            if (!socioReal) return Swal.showValidationMessage('Ese ID de socio no existe');
            
            const monto = parseFloat(document.getElementById('p-m').value);
            const tasa = parseFloat(document.getElementById('p-tasa').value);
            const fecha = document.getElementById('p-fecha').value;
            
            if (!monto || monto <= 0) return Swal.showValidationMessage(`Monto inválido`);
            if (!tasa || tasa <= 0) return Swal.showValidationMessage(`Tasa inválida`);
            if (!fecha) return Swal.showValidationMessage(`Seleccione una fecha`);
            
            return { 
                idPersona: socioReal.id, 
                nombreSocio: socioReal.nombre,
                monto, 
                tasaInteresMensual: tasa,
                fechaInicio: fecha,
                esDiario: true 
            };
        }
    });

    async function modalAbonoPrestamo(idPrestamo, idPersona) {
    const { value: formValues } = await Swal.fire({
        title: 'Registrar Abono',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="swal-input-label">Monto del Pago ($)</label>
                    <input id="a-monto" type="number" class="swal-custom-input" placeholder="0">
                </div>
                <div>
                    <label class="swal-input-label">Tipo de Abono</label>
                    <select id="a-tipo" class="swal-custom-input cursor-pointer">
                        <option value="interes">Solo Intereses (No reduce deuda principal)</option>
                        <option value="capital">Abono a Capital (Reduce la deuda principal)</option>
                    </select>
                </div>
                <div class="bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <p class="text-[10px] text-amber-700 leading-tight">
                        <i class="fas fa-info-circle mr-1"></i> 
                        <b>Abono a Capital:</b> El interés diario bajará porque el monto prestado será menor a partir de mañana.
                    </p>
                </div>
            </div>`,
        preConfirm: () => {
            const monto = parseFloat(document.getElementById('a-monto').value);
            const tipo = document.getElementById('a-tipo').value;
            if (!monto || monto <= 0) return Swal.showValidationMessage('Ingresa un monto válido');
            return { idPrestamo, idPersona, monto, tipo };
        }
    });

    if (formValues) apiCall('/registrar-abono-dinamico', formValues, "Abono registrado con éxito");
}

    if (formValues) {
        // Mostrar modal de confirmación antes de registrar
        const confirmacion = await Swal.fire({
            title: '¿Confirmar Préstamo?',
            html: `
                <div class="text-left bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                    <div class="flex justify-between items-center p-3 bg-indigo-50 rounded-xl mb-3">
                        <span class="text-indigo-700 font-bold">👤 ${formValues.nombreSocio}</span>
                        <span class="text-indigo-600 font-black text-lg">#${formValues.idPersona}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500 text-xs font-bold uppercase">Monto:</span>
                        <span class="text-rose-600 font-black">$${Number(formValues.monto).toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500 text-xs font-bold uppercase">Tasa Mensual:</span>
                        <span class="text-amber-600 font-black">${formValues.tasaInteresMensual}%</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500 text-xs font-bold uppercase">Fecha:</span>
                        <span class="text-slate-600 font-bold">${formValues.fechaInicio}</span>
                    </div>
                </div>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, Registrar Préstamo',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#f1f5f9',
            customClass: {
                cancelButton: 'text-slate-500'
            }
        });

        if (confirmacion.isConfirmed) {
            apiCall('/registrar-prestamo-diario', formValues, "Préstamo dinámico registrado");
        }
    }
}

async function toggleEstadoSocio(id, nombre, estadoActual) {
    const nuevoEstado = estadoActual === 'Activo' ? 'Inactivo' : 'Activo';
    const accion = nuevoEstado === 'Inactivo' ? 'Inhabilitar' : 'Habilitar';

    const result = await Swal.fire({
        title: `¿${accion} socio?`,
        text: `Vas a pasar a ${nombre} a la lista de ${nuevoEstado}s.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: `Sí, ${accion}`,
        confirmButtonColor: nuevoEstado === 'Inactivo' ? '#ef4444' : '#10b981'
    });

    if (result.isConfirmed) {
        const res = await fetch('/cambiar-estado-socio', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id, nuevoEstado })
        });
        if (res.ok) {
            Swal.fire('Actualizado', `${nombre} ahora está ${nuevoEstado}`, 'success');
            cargarTodo(); // Recarga la lista principal
        }
    }
}

async function abrirVentanaInactivos() {
    const res = await fetch('/listar-inactivos');
    const inactivos = await res.json();

    let htmlInactivos = inactivos.length === 0 
        ? '<p class="text-center text-slate-400 py-4">No hay socios inactivos</p>'
        : inactivos.map(s => `
            <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl mb-2 border border-slate-200">
                <div>
                    <p class="text-xs font-black text-slate-700">#${s.ID_Persona} - ${s.Nombre}</p>
                    <p class="text-[9px] text-slate-400 uppercase">Estado: Inactivo</p>
                </div>
                <button onclick="toggleEstadoSocio(${s.ID_Persona}, '${s.Nombre}', 'Inactivo')" 
                        class="bg-emerald-500 text-white p-2 rounded-lg hover:bg-emerald-600 transition-all">
                    <i class="fas fa-user-plus"></i> Re-activar
                </button>
            </div>
        `).join('');

    Swal.fire({
        title: 'Socios Inactivos',
        html: `<div class="max-h-[60vh] overflow-y-auto pr-2">${htmlInactivos}</div>`,
        showConfirmButton: false,
        customClass: { popup: 'rounded-[2rem]' }
    });
}

function eliminarSocio(id) {
    Swal.fire({ 
        title: '¿Eliminar socio?', 
        text: "Esta acción no se puede deshacer.", 
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then((r) => { 
        if (r.isConfirmed) {
            // Enviamos un objeto donde la propiedad se llame "id"
            // Debe coincidir con la ruta del servidor '/eliminar-socio'
            apiCall('/eliminar-socio', { id: id }, "Socio eliminado"); 
        } 
    });
}

async function editarSocio(id, nombreActual, cedulaActual, tipoActual) {
    // Determinamos qué opción debe aparecer seleccionada por defecto
    const esSocio = tipoActual === 'SOCIO' ? 'selected' : '';
    const esExterno = tipoActual === 'EXTERNO' ? 'selected' : '';

    const { value: formValues } = await Swal.fire({
        title: 'Editar Miembro',
        html: `
            <div class="text-left">
                <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Nombre Completo</label>
                <input id="swal-nombre" class="swal2-input !mt-1 !mb-4" value="${nombreActual}">
                
                <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Documento / Cédula</label>
                <input id="swal-cedula" class="swal2-input !mt-1 !mb-4" value="${cedulaActual}">
                
                <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Tipo de Miembro</label>
                <select id="swal-tipo" class="swal2-input !mt-1">
                    <option value="1" ${esSocio}>Socio (Ahorrador)</option>
                    <option value="0" ${esExterno}>Externo (Solo Préstamos)</option>
                </select>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        confirmButtonColor: '#4f46e5',
        preConfirm: () => {
            return {
                id: id,
                nombre: document.getElementById('swal-nombre').value,
                cedula: document.getElementById('swal-cedula').value,
                esSocio: document.getElementById('swal-tipo').value
            }
        }
    });

    if (formValues) {
        try {
            const res = await fetch('/editar-socio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formValues)
            });

            if (res.ok) {
                Swal.fire('Actualizado', 'Los datos se guardaron correctamente', 'success');
                listarMiembros(); // Recarga la tabla
            }
        } catch (error) {
            console.error("Error al editar:", error);
        }
    }
}

function generarPDFMovimientos(nombre, ahorros, prestamos, abonos, totales) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fechaDoc = new Date().toLocaleString('es-CO');

    // 1. ENCABEZADO (Slate 800)
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("EXTRACTO FINANCIERO DETALLADO", 14, 20);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`TITULAR: ${nombre.toUpperCase()}`, 14, 30);
    doc.text(`FECHA DE EMISIÓN: ${fechaDoc}`, 140, 30);

    // 2. RESUMEN DE SALDOS (TARJETAS)
    doc.autoTable({
        startY: 45,
        head: [['RESUMEN DE CUENTAS', 'VALOR TOTAL']],
        body: [
            ['CAPITAL TOTAL AHORRADO', `$ ${Number(totales.totalAhorrado || 0).toLocaleString('es-CO')}`],
            ['DEUDA PENDIENTE (CAPITAL + INT)', `$ ${Number(totales.deudaTotal || 0).toLocaleString('es-CO')}`]
        ],
        theme: 'striped',
        headStyles: { fillStyle: [79, 70, 229], halign: 'center' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold', textColor: [31, 41, 55] } }
    });

    // 3. SECCIÓN: AHORROS (SIN DÍAS DE ESFUERZO)
    doc.setFontSize(11);
    doc.setTextColor(5, 150, 105); // Emerald 600
    doc.text("1. DETALLE DE AHORROS Y APORTES", 14, doc.lastAutoTable.finalY + 12);
    
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['ID', 'Fecha Registro', 'Concepto / Periodo', 'Monto']],
        body: ahorros.map(a => [
            `#${a.ID_Ahorro || '---'}`,
            a.FechaFormateada || 'S/F',
            (a.Detalle || "Ahorro").toUpperCase(),
            `$ ${Number(a.Monto).toLocaleString('es-CO')}`
        ]),
        headStyles: { fillStyle: [16, 185, 129] },
        styles: { fontSize: 8 },
        columnStyles: { 
            0: { cellWidth: 20 }, 
            3: { halign: 'right', fontStyle: 'bold' } 
        }
    });

    // 4. SECCIÓN: PRÉSTAMOS CON DETALLE DE INTERESES
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235); // Blue 600
    doc.text("2. ESTADO DE CRÉDITOS ACTIVOS (CON DETALLE DE INTERESES)", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['REF', 'Fecha', 'Tasa', 'Capital', 'Int. Generado', 'Int. Prepagado Usado', 'Int. Prepagado Disp.', 'Int. Pagado', 'Int. Pend.', 'Saldo Total']],
        body: prestamos.map(p => {
            const interesGenerado = Number(p.InteresGenerado || 0);
            const interesAnticipadoUsado = Number(p.InteresAnticipadoUsado || 0);
            const interesAnticipadoTotal = Number(p.InteresAnticipado || 0);
            const interesAnticipadoDisp = Math.max(0, interesAnticipadoTotal - interesAnticipadoUsado);
            const interesesPagados = Number(p.InteresesPagados || 0);
            const interesPendiente = Number(p.InteresPendiente || 0);
            const capitalRestante = Number(p.MontoPrestado) - Number(p.MontoPagado || 0);
            const saldoTotal = capitalRestante + interesPendiente;
            
            return [
                `PR-${p.ID_Prestamo}`,
                p.FechaInicioFormateada || 'S/F',
                `${p.TasaInteres}%`,
                `$ ${Number(p.MontoPrestado).toLocaleString('es-CO')}`,
                `$ ${interesGenerado.toLocaleString('es-CO')}`,
                `$ ${interesAnticipadoUsado.toLocaleString('es-CO')}`,
                `$ ${interesAnticipadoDisp.toLocaleString('es-CO')}`,
                `$ ${interesesPagados.toLocaleString('es-CO')}`,
                `$ ${interesPendiente.toLocaleString('es-CO')}`,
                `$ ${Math.max(0, saldoTotal).toLocaleString('es-CO')}`
            ];
        }),
        headStyles: { fillStyle: [59, 130, 246], fontSize: 6 },
        styles: { fontSize: 6 },
        columnStyles: { 
            3: { halign: 'right' }, 
            4: { halign: 'right' },
            5: { halign: 'right', textColor: [5, 150, 105] },
            6: { halign: 'right', textColor: [79, 70, 229] },
            7: { halign: 'right', textColor: [5, 150, 105] },
            8: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] },
            9: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] } 
        }
    });

    // 5. SECCIÓN: ABONOS
    doc.setFontSize(11);
    doc.setTextColor(225, 29, 72); // Rose 600
    doc.text("3. RELACIÓN DE PAGOS REALIZADOS", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['Fecha Pago', 'Referencia', 'Detalle de Aplicación', 'Monto Pagado']],
        body: abonos.map(ab => [
            ab.FechaFormateada || 'S/F',
            `PR-${ab.ID_Prestamo}`,
            (ab.MesesCorrespondientes || 'Abono a capital/interés').toUpperCase(),
            `$ ${Number(ab.Monto_Abonado || ab.Monto || 0).toLocaleString('es-CO')}`
        ]),
        headStyles: { fillStyle: [225, 29, 72] },
        styles: { fontSize: 8 },
        columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
    });

    // PIE DE PÁGINA
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Este documento es un extracto informativo del estado de cuenta actual.`, 14, 285);
        doc.text(`Página ${i} de ${totalPages}`, 185, 285, { align: 'right' });
    }

    doc.save(`Extracto_${nombre.replace(/\s+/g, '_')}.pdf`);
}

async function verListaRapidaDeudores() {
    try {
        const res = await fetch('/listar-miembros');
        if (!res.ok) {
            const errorText = await res.text();
            console.error("Error HTTP:", res.status, errorText);
            throw new Error(`Error ${res.status}: ${errorText}`);
        }
        const data = await res.json();
        
        // Verificar si es error del servidor
        if (data.error) {
            console.error("Error del servidor:", data.error);
            return Swal.fire({
                title: 'Sin deudores o error DB',
                text: data.error === 'Pool no disponible' ? 'No hay conexión con la base de datos en este momento.' : data.error,
                icon: 'warning'
            });
        }
        
        // Si no es array, mostrar mensaje
        if (!Array.isArray(data)) {
            console.error("Respuesta no es array:", data);
            return Swal.fire({
                title: 'Datos inválidos',
                text: 'La respuesta del servidor no tiene el formato esperado.',
                icon: 'warning'
            });
        }

        console.log("Datos recibidos del servidor:", data);

        // Filtramos asegurando que el saldo sea tratado como número
        // Usar saldoHistoricoDetallado (nuevo campo) o fallback a saldoPendiente
        const deudores = data
            .filter(m => {
                const saldo = Number(m.saldoHistoricoDetallado || m.saldoPendiente || 0);
                return !isNaN(saldo) && saldo > 0;
            })
            .sort((a, b) => {
                const saldoA = Number(b.saldoHistoricoDetallado || b.saldoPendiente || 0);
                const saldoB = Number(a.saldoHistoricoDetallado || a.saldoPendiente || 0);
                return saldoA - saldoB;
            });

        if (deudores.length === 0) {
            return Swal.fire({
                title: '¡Cuentas Limpias! 🎉',
                text: 'No hay saldos pendientes detectados en la base de datos.',
                icon: 'success',
                confirmButtonColor: '#10b981'
            });
        }

        const totalCartera = deudores.reduce((sum, m) => {
            const saldo = Number(m.saldoHistoricoDetallado || m.saldoPendiente || 0);
            return sum + saldo;
        }, 0);

        let htmlDeudores = `
            <div class="recaudo-container text-left font-sans">
                <div class="grid grid-cols-2 gap-3 mb-6 p-4 bg-gradient-to-r from-indigo-50 to-slate-50 rounded-2xl">
                    <div class="bg-indigo-600 p-4 rounded-2xl text-white shadow-md">
                        <p class="text-[10px] uppercase opacity-80 font-bold">CARTERA POR RECOGER</p>
                        <p class="text-xl font-black">${totalCartera.toLocaleString()}</p>
                    </div>
                    <div class="bg-white border-2 border-slate-100 p-4 rounded-2xl shadow-sm flex items-center justify-center">
                        <p class="text-[10px] text-slate-400 uppercase font-bold">Personas con Deuda</p>
                        <p class="text-xl font-black text-slate-700">${deudores.length}</p>
                    </div>
                </div>
                <div class="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                    ${deudores.map((d, index) => {
                        const saldo = Number(d.saldoHistoricoDetallado || d.saldoPendiente || 0);
                        const campoSaldo = d.saldoHistoricoDetallado ? 'saldoHistoricoDetallado' : 'saldoPendiente';
                        return `
                        <div class="bg-gradient-to-r from-white to-slate-50 border-2 border-slate-50 hover:border-indigo-200 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer" onclick="verHistorialFechas(${d.id}, '${d.nombre.replace(/'/g, "\\'")}')">
                            <div class="flex justify-between items-start gap-4">
                                <div class="flex-1">
                                    <h4 class="font-bold text-slate-800 text-lg">${d.nombre}</h4>
                                    <p class="text-[10px] text-slate-500 flex items-center gap-2">
                                        <span class="bg-slate-100 px-2 py-0.5 rounded-full text-[8px] font-bold">${d.documento || 'S/D'}</span>
                                    </p>
                                </div>
                                <div class="text-right flex-shrink-0">
                                    <p class="text-[9px] uppercase font-bold text-rose-500 tracking-wider mb-1">Deuda Histórica Completa</p>
                                    <p class="text-xl font-black text-rose-600">${saldo.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        Swal.fire({ 
            html: htmlDeudores, 
            width: '600px', 
            showConfirmButton: false, 
            showCloseButton: true,
            customClass: { popup: 'rounded-[2.5rem]' }
        });

    } catch (err) {
        console.error("Error cargando deudores:", err);
        Swal.fire('Error', `Error de conexión: ${err.message}`, 'error');
    }
}

async function toggleDeudas() {
    const numPantalla = document.getElementById('mov_id').value;
    const tipo = document.getElementById('mov_tipo').value;
    const select = document.getElementById('mov_prestamo_id');
    const divSelector = document.getElementById('div_selector_deuda');

    // 1. Obtener ID real desde el mapeo
    let idValue = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : null;
    
    // Si el id viene como "2:1", tomamos solo el "2" (ID_Persona)
    const idReal = idValue && String(idValue).includes(':') ? idValue.split(':')[0] : idValue;

    // LOG DE DEPURACIÓN: Mira esto en la consola del navegador
    console.log(`Intentando buscar deudas para Persona ID: ${idReal} (Num Pantalla: ${numPantalla})`);

    if (tipo === 'deuda' && idReal) {
        try {
            // Ajustamos la petición
            const res = await fetch(`/api/prestamos-activos/${idReal}`);
            
            if (res.status === 404) {
                Swal.fire('Sin deudas', 'No se encontraron préstamos activos para este ID en el servidor.', 'info');
                document.getElementById('mov_tipo').value = 'ahorro';
                divSelector.classList.add('hidden');
                return;
            }

            if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);

            const deudas = await res.json();

            if (deudas && Array.isArray(deudas) && deudas.length > 0) {
        // Ordenar por fecha ASC (más antiguo = #1)
        const deudasOrdenadas = deudas.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
                
                select.innerHTML = deudasOrdenadas.map((d, index) => `
                    <option value="${d.ID_Prestamo}">
                        Préstamo #${index + 1} - Saldo: $${Number(d.SaldoActual).toLocaleString()}
                    </option>
                `).join('');
                
                divSelector.classList.remove('hidden');
            } else {
                Swal.fire('Atención', 'Este socio no tiene deudas activas.', 'info');
                document.getElementById('mov_tipo').value = 'ahorro';
                divSelector.classList.add('hidden');
            }
        } catch (error) {
            console.error("Error en la petición:", error);
            divSelector.classList.add('hidden');
            Swal.fire('Error de conexión', 'No se pudo contactar con el servidor de préstamos.', 'error');
        }
    } else {
        divSelector.classList.add('hidden');
    }
}



async function verificarTipoMovimiento() {
    const tipo = document.getElementById('tipoMovimiento').value;
    const grupoPrestamos = document.getElementById('grupo-prestamos');
    const selectPrestamo = document.getElementById('selectPrestamo');
    
    // IMPORTANTE: Asegúrate de tener guardado el ID del socio al que le diste click
    const idSocio = document.getElementById('idSocioMovimiento').value; 

    if (tipo === 'deuda') {
        try {
            const response = await fetch(`/api/prestamos-activos/${idSocio}`);
            const prestamos = await response.json();

            if (prestamos.length === 0) {
                alert("Este socio no tiene deudas activas.");
                document.getElementById('tipoMovimiento').value = 'ahorro';
                grupoPrestamos.style.display = 'none';
                return;
            }

            // Llenamos el select con los préstamos encontrados
            selectPrestamo.innerHTML = prestamos.map(p => `
                <option value="${p.ID_Prestamo}">
                    Prestamo: $${p.MontoPrestado} - Saldo: $${p.SaldoActual} (${p.FechaFormateada})
                </option>
            `).join('');

            grupoPrestamos.style.display = 'block'; // Mostramos el select
        } catch (error) {
            console.error("Error cargando préstamos:", error);
        }
    } else {
        grupoPrestamos.style.display = 'none'; // Es ahorro, escondemos el select
    }
}

function renderizarSelectorMeses() {
    const contenedor = document.getElementById('contenedor-meses');
    contenedor.innerHTML = mesesDelAño.map(mes => `
        <label class="mes-item">
            <input type="checkbox" name="mes-ahorro" value="${mes}"> ${mes}
        </label>
    `).join('');
}

// Al enviar el ahorro, recolectamos los seleccionados
function obtenerMesesSeleccionados() {
    const checkboxes = document.querySelectorAll('input[name="mes-ahorro"]:checked');
    return Array.from(checkboxes).map(cb => cb.value).join(', ');
}

function cargarMesesEnInterfaz() {
    const contenedor = document.getElementById('contenedor-meses');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const mesesDelAño = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    mesesDelAño.forEach(mes => {
        const grupoMes = document.createElement('div');
        grupoMes.className = 'col-span-3 mb-2';
        grupoMes.innerHTML = `<p class="text-[9px] font-black text-slate-400 uppercase mb-1 border-b border-slate-100">${mes}</p>`;
        
        const botonesCont = document.createElement('div');
        botonesCont.className = 'grid grid-cols-2 gap-1';

        ['Q1', 'Q2'].forEach(q => {
            const btn = document.createElement('button');
            btn.type = 'button'; // Evita que el formulario se envíe solo
            btn.textContent = q;
            btn.value = `${mes} (${q})`; 
            btn.className = 'btn-quincena py-1 px-2 text-[10px] font-bold rounded-lg border-2 border-slate-100 hover:bg-red-50 transition-all';
            
            btn.onclick = (e) => {
                e.preventDefault();
                // Toggle de clases
                btn.classList.toggle('active'); 
                btn.classList.toggle('bg-red-500');
                btn.classList.toggle('text-white');
                btn.classList.toggle('border-red-500');
            };
            botonesCont.appendChild(btn);
        });

        grupoMes.appendChild(botonesCont);
        contenedor.appendChild(grupoMes);
    });
}

async function abrirModalMeses() {
    const numPantalla = document.getElementById('mov_id').value;
    const idReal = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : null;

    if (!idReal) {
        return Swal.fire('Atención', 'Primero ingresa el ID del socio para ver su historial.', 'warning');
    }

    try {
        // Consultamos las quincenas que ya existen en la base de datos para este ID
        const resp = await fetch(`/api/quincenas-pagas/${idReal}`);
        const quincenasYaPagas = await resp.json(); 

        const modal = document.getElementById('modalMeses');
        modal.classList.remove('hidden');

        // Pasamos la lista de pagas a la función que dibuja los botones
        dibujarBotonesModal(quincenasYaPagas);
        
    } catch (error) {
        console.error("Error al pintar quincenas:", error);
    }
}

function dibujarBotonesModal(pagas = []) {
    const contenedor = document.getElementById('contenedorMesesModal');
    if (!contenedor) return;

    contenedor.innerHTML = ""; 

    const añoActual = new Date().getFullYear(); 
    const añoPasado = añoActual - 1; 

    const estructuraCiclo = [
        { mes: "Diciembre", año: añoPasado, qs: ["Q2"], label: `Diciembre ${añoPasado} (Inicio)` },
        { mes: "Enero", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Febrero", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Marzo", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Abril", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Mayo", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Junio", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Julio", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Agosto", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Septiembre", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Octubre", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Noviembre", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Diciembre", año: añoActual, qs: ["Q1"], label: `Diciembre ${añoActual} (Cierre)` }
    ];

    estructuraCiclo.forEach(item => {
        const divEtiqueta = document.createElement("div");
        divEtiqueta.className = "col-span-2 mb-1";
        const titulo = item.label ? item.label : `${item.mes} ${item.año}`;
        divEtiqueta.innerHTML = `<p class="text-[9px] font-black text-slate-400 uppercase mt-2 border-b border-slate-100">${titulo}</p>`;
        contenedor.appendChild(divEtiqueta);

        item.qs.forEach(q => {
            const nombreNuevo = `${item.mes} ${item.año} (${q})`; // Ej: "Enero 2026 (Q1)"
            const nombreViejo = `${item.mes} (${q})`;           // Ej: "Enero (Q1)"

            // BUSQUEDA FLEXIBLE: Tacha si encuentra el nombre con año O el nombre sin año
            const estaPaga = pagas.some(p => p === nombreNuevo || p === nombreViejo);

            const btn = document.createElement("button");
            btn.type = "button";
            btn.innerText = q;
            btn.value = nombreNuevo; // Los nuevos se guardarán con año

            if (estaPaga) {
                btn.className = "p-2 text-[10px] font-bold border bg-red-50 text-red-500 border-red-200 cursor-not-allowed line-through rounded-xl opacity-70";
                btn.onclick = () => Swal.fire('Ya registrado', `Este periodo ya cuenta con un pago.`, 'info');
            } else {
                btn.className = "btn-quincena p-2 text-[10px] font-bold border border-slate-200 rounded-xl hover:bg-indigo-50 transition-all text-slate-600 shadow-sm";
                btn.onclick = () => {
                    btn.classList.toggle("active");
                };
            }
            contenedor.appendChild(btn);
        });
    });
}

function cargarMesesEnContenedor(idContenedor, quincenasPagas = []) {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;

    const meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    contenedor.innerHTML = ""; 

    meses.forEach(mes => {
        for (let q = 1; q <= 2; q++) {
            const nombreQ = `${mes} (Q${q})`;
            const yaPaga = quincenasPagas.includes(nombreQ);
            
            const btn = document.createElement("button");
            btn.type = "button";
            btn.value = nombreQ;
            btn.innerText = nombreQ;

            if (yaPaga) {
                // ESTILO PARA YA PAGADAS (Bloqueado)
                btn.className = "p-2 text-[10px] font-bold border bg-red-50 text-red-400 border-red-100 cursor-not-allowed line-through rounded-lg opacity-60";
                btn.onclick = () => Swal.fire('Periodo Ocupado', `La quincena ${nombreQ} ya fue pagada anteriormente.`, 'info');
            } else {
                // ESTILO PARA DISPONIBLES
                btn.className = "btn-quincena p-2 text-[10px] font-bold border border-slate-200 rounded-lg hover:bg-indigo-50 transition-all";
                btn.onclick = () => {
                    btn.classList.toggle("active");
                    btn.classList.toggle("bg-indigo-600");
                    btn.classList.toggle("text-white");
                };
            }
            contenedor.appendChild(btn);
        }
    });
}

function cerrarModalMeses() {
    document.getElementById('modalMeses').classList.add('hidden');
}

function confirmarSeleccionMeses() {
    const activos = document.querySelectorAll('#contenedorMesesModal .btn-quincena.active');
    
    if (activos.length > 0) {
        mesesSeleccionadosTemporales = Array.from(activos).map(btn => btn.value).join(', ');
    } else {
        mesesSeleccionadosTemporales = "Abono General";
    }
    
    const indicador = document.getElementById('indicadorMeses');
    if(indicador) indicador.textContent = mesesSeleccionadosTemporales;
    
    cerrarModalMeses();
}

function cargarMesesEnContenedor(idContenedor, quincenasPagas = []) {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;

    contenedor.innerHTML = ""; 

    const añoActual = new Date().getFullYear();
    const añoPasado = añoActual - 1;
    const añoProximo = añoActual + 1;

    // Estructura con años específicos
    const estructuraCiclo = [
        { mes: "Diciembre", año: añoPasado, qs: ["Q2"], label: `Diciembre ${añoPasado} (Inicio)` },
        { mes: "Enero", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Febrero", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Marzo", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Abril", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Mayo", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Junio", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Julio", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Agosto", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Septiembre", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Octubre", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Noviembre", año: añoActual, qs: ["Q1", "Q2"] },
        { mes: "Diciembre", año: añoActual, qs: ["Q1"], label: `Diciembre ${añoActual} (Cierre)` }
    ];

    estructuraCiclo.forEach(item => {
        const divMes = document.createElement("div");
        divMes.className = "col-span-2 mb-1";
        // Si no hay label especial, usamos el nombre del mes y el año
        const titulo = item.label ? item.label : `${item.mes} ${item.año}`;
        divMes.innerHTML = `<p class="text-[9px] font-black text-slate-400 uppercase mt-2 border-b border-slate-100">${titulo}</p>`;
        contenedor.appendChild(divMes);

        item.qs.forEach(q => {
            // EL NOMBRE AHORA INCLUYE EL AÑO: "Enero 2026 (Q1)"
            const nombreQ = `${item.mes} ${item.año} (${q})`;
            const yaPaga = quincenasPagas.includes(nombreQ);
            
            const btn = document.createElement("button");
            btn.type = "button";
            btn.value = nombreQ;
            btn.innerText = q; 

            if (yaPaga) {
                btn.className = "p-2 text-[10px] font-bold border bg-red-50 text-red-500 border-red-200 cursor-not-allowed line-through rounded-xl opacity-70";
                btn.onclick = () => Swal.fire('Ya registrado', `${nombreQ} ya fue pagada.`, 'info');
            } else {
                btn.className = "btn-quincena p-2 text-[10px] font-bold border border-slate-200 rounded-xl hover:bg-indigo-50 transition-all text-slate-600";
                btn.onclick = () => {
                    btn.classList.toggle("active");
                    btn.classList.toggle("bg-indigo-600");
                    btn.classList.toggle("text-white");
                    btn.classList.toggle("border-indigo-600");
                };
            }
            contenedor.appendChild(btn);
        });
    });
}

function calcularInteresDiario() {
    const monto = parseFloat(document.getElementById('pre_monto').value) || 0;
    const tasaMensual = parseFloat(document.getElementById('pre_tasa_mensual').value) || 0;

    if (monto > 0 && tasaMensual > 0) {
        // Cálculo: (Monto * % mensual) / 100 / 30 días
        const interesDia = (monto * (tasaMensual / 100)) / 30;
        const interesSemana = interesDia * 7;

        document.getElementById('calc_interes_dia').textContent = `$ ${interesDia.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
        document.getElementById('calc_interes_semana').textContent = `$ ${interesSemana.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
    } else {
        document.getElementById('calc_interes_dia').textContent = "$ 0";
        document.getElementById('calc_interes_semana').textContent = "$ 0";
    }
}

async function guardarPrestamoDiario() {
    const idSocNum = document.getElementById('pre_id_socio').value;
    const idReal = window.mapeoIdentificadores[idSocNum];
    const monto = parseFloat(document.getElementById('pre_monto').value);
    const tasa = parseFloat(document.getElementById('pre_tasa_mensual').value);
    const fecha = document.getElementById('pre_fecha')?.value || new Date().toISOString().split('T')[0];

    if (!idReal || !monto || !tasa) {
        return Swal.fire('Error', 'Completa todos los campos', 'error');
    }

    // Mostrar modal de confirmación antes de guardar
    const nombreSocio = miembrosGlobal.find(m => m.id == idReal)?.nombre || 'Socio';
    const confirmResult = await Swal.fire({
        title: '¿Confirmar Préstamo?',
        html: '<p>Socio: ' + nombreSocio + '</p><p>Monto: $' + monto.toLocaleString() + '</p><p>Tasa: ' + tasa + '% mensual</p><p>Fecha: ' + fecha + '</p>',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, Registrar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b'
    });

    if (!confirmResult.isConfirmed) {
        return;
    }

    try {
        const res = await fetch('/crear-prestamo-diario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idPersona: idReal,
                monto: monto,
                tasaMensual: tasa
            })
        });

        const data = await res.json();
        if (data.success) {
            Swal.fire('¡Éxito!', 'Préstamo iniciado con éxito', 'success');
            cerrarModalPrestamo();
            cargarTodo();
        }
    } catch (err) {
        Swal.fire('Error', 'No se pudo guardar el préstamo', 'error');
    }
}

function renderizarDeudaDinamica(prestamo) {
    // prestamo viene con los datos calculados del backend
    const dias = prestamo.DiasTranscurridos;
    const interesGenerado = Math.round(prestamo.interesHoy);
    const saldoFinal = Math.round(prestamo.saldoHoy);

    return `
        <div class="bg-slate-900 text-white p-4 rounded-3xl shadow-lg border-l-4 border-amber-500">
            <div class="flex justify-between items-center mb-2">
                <span class="text-[10px] font-black uppercase text-slate-400">Estado de Deuda (Día ${dias})</span>
                <span class="bg-amber-500/20 text-amber-500 text-[9px] px-2 py-0.5 rounded-full font-bold italic">INTERÉS DIARIO</span>
            </div>
            
            <div class="space-y-1">
                <div class="flex justify-between text-sm">
                    <span class="text-slate-400">Capital inicial:</span>
                    <span class="font-bold">$ ${prestamo.MontoPrestado.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-slate-400 text-xs">Intereses (+${dias}d):</span>
                    <span class="font-bold text-rose-400">$ ${interesGenerado.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-sm border-b border-white/10 pb-2">
                    <span class="text-slate-400">Abonos realizados:</span>
                    <span class="font-bold text-emerald-400">- $ ${prestamo.MontoPagado.toLocaleString()}</span>
                </div>
                <div class="flex justify-between items-center pt-2">
                    <span class="text-xs font-black uppercase text-indigo-300">Saldo Total Hoy:</span>
                    <span class="text-xl font-black text-white">$ ${saldoFinal.toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}

// 1. FUNCIÓN PARA CAMBIAR EL ESTADO (ACTIVO/INACTIVO)
async function cambiarEstadoSocio(id, nombre, estadoActual) {
    const nuevoEstado = estadoActual === 'Activo' ? 'Inactivo' : 'Activo';
    
    const confirmacion = await Swal.fire({
        title: `¿${nuevoEstado === 'Inactivo' ? 'Inhabilitar' : 'Habilitar'} socio?`,
        text: `El socio #${id} (${nombre}) cambiará de estado.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        confirmButtonColor: nuevoEstado === 'Inactivo' ? '#f59e0b' : '#10b981',
        cancelButtonText: 'Cancelar'
    });

    if (confirmacion.isConfirmed) {
        try {
            const res = await fetch('/cambiar-estado-socio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, nuevoEstado })
            });

            if (res.ok) {
                Swal.fire('Éxito', `Estado actualizado correctamente`, 'success');
                // Recargamos la lista principal y si estamos en el modal de inactivos, lo refrescamos
                listarMiembros(); 
                if (nuevoEstado === 'Activo') abrirVentanaInactivos(); 
            }
        } catch (error) {
            console.error("Error cambiando estado:", error);
        }
    }
}

// 2. FUNCIÓN PARA MOSTRAR LA VENTANA DE SOCIOS INACTIVOS
async function abrirVentanaInactivos() {
    try {
        const res = await fetch('/listar-inactivos');
        const inactivos = await res.json();

        let listadoHTML = inactivos.length === 0 
            ? '<div class="text-center py-8 text-slate-400 italic">No hay socios inactivos</div>'
            : inactivos.map(s => `
                <div class="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl mb-2 shadow-sm">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400">
                            ${s.id || s.ID_Persona}
                        </div>
                        <div>
                            <p class="text-sm font-black text-slate-700">${s.nombre || s.Nombre}</p>
                            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-left">Inactivo</p>
                        </div>
                    </div>
                    <button onclick="cambiarEstadoSocio(${s.id || s.ID_Persona}, '${s.nombre || s.Nombre}', 'Inactivo')" 
                            class="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black hover:bg-emerald-600 hover:text-white transition-all">
                        HABILITAR
                    </button>
                </div>
            `).join('');

        Swal.fire({
            title: '<span class="text-xl font-black text-slate-800 tracking-tighter">Socios Inactivos</span>',
            html: `
                <div class="max-h-[60vh] overflow-y-auto pr-2 bg-slate-50/50 p-2 rounded-3xl mt-4">
                    ${listadoHTML}
                </div>`,
            showConfirmButton: false,
            customClass: { popup: 'rounded-[2.5rem]' }
        });
    } catch (error) {
        console.error("Error al cargar inactivos:", error);
    }
}

// --- 1. PAGO PARCIAL (CAPITALIZAR A UN SOCIO ESPECÍFICO) ---
async function liquidarInteresParcial() {
    // 1. Obtener el ID de la pantalla como ya lo haces
    const numPantalla = document.getElementById('mov_id').value;
    const idReal = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : null;

    if (!idReal) {
        return Swal.fire('Atención', 'Ingresa el ID del socio en el campo de Abonos para procesar su interés.', 'warning');
    }

    // 2. Pedir el monto
    const { value: monto } = await Swal.fire({
        title: 'Capitalizar Interés Parcial',
        input: 'number',
        inputLabel: 'Monto a sumar al saldo del socio',
        inputPlaceholder: 'Monto en $',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'Sumar al Saldo'
    });

    if (monto && monto > 0) {
        try {
            Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            // 3. CAMBIO CLAVE: Usamos el fetch a la ruta masiva enviando solo UN socio
            // Esto asegura que se guarde en la tabla Ahorros correctamente
            const respuesta = await fetch('/api/ejecutar-reparto-masivo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sociosAptos: [{ 
                        id: idReal, 
                        nombre: "Socio " + numPantalla, // Nombre genérico para el log
                        interes: parseFloat(monto) 
                    }] 
                })
            });

            const resultado = await respuesta.json();

            if (resultado.success) {
                Swal.fire('¡Éxito!', 'El interés ha sido sumado al capital del socio.', 'success');
                
                // 4. Limpiar el campo y refrescar
                document.getElementById('mov_id').value = '';
                if (typeof cargarTodo === 'function') cargarTodo(); 
                
                // Si tienes abierto el perfil del socio, refrescarlo
                if (typeof verDetallesSocio === 'function') verDetallesSocio(idReal);
            } else {
                throw new Error(resultado.error);
            }
        } catch (error) {
            console.error("Error:", error);
            Swal.fire('Error', 'No se pudo registrar el interés individual.', 'error');
        }
    }
}

// --- 2. REPARTO GLOBAL (10% A TODOS LOS AHORRADORES) ---
async function distribuirInteresesMasivos() {
    try {
        // 1. Pedir IDs a excluir antes de empezar
        const { value: excluidosStr } = await Swal.fire({
            title: 'Configurar Reparto',
            text: 'Ingresa los IDs de los socios a EXCLUIR (separados por coma) o deja vacío para incluir a todos:',
            input: 'text',
            inputPlaceholder: 'Ej: 5, 12, 18',
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Cancelar'
        });

        if (excluidosStr === undefined) return; // Si el usuario cancela

        // Convertir string de IDs en un array de números
        const idsExcluidos = excluidosStr.split(',')
            .map(id => parseInt(id.trim()))
            .filter(id => !isNaN(id));

        Swal.fire({ 
            title: 'Calculando reparto equitativo...', 
            text: 'Evaluando tiempo y montos ahorrados',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); } 
        });

        // 1. Obtener Ganancias Brutas Reales
        const respG = await fetch('/api/ganancias-disponibles'); 
        const dataG = await respG.json();
        const gananciasDisponibles = parseFloat(dataG.saldo || 0);

        if (gananciasDisponibles <= 0) {
            Swal.fire('Sin Fondos', 'No hay ganancias brutas para distribuir.', 'warning');
            return;
        }

        // 2. Obtener Socios con su "Esfuerzo"
        const respS = await fetch('/api/socios-esfuerzo'); 
        if (!respS.ok) throw new Error("No se pudo obtener la lista de socios");
        const sociosRaw = await respS.json();

        // --- FILTRAR SOCIOS EXCLUIDOS ---
        const socios = sociosRaw.filter(s => !idsExcluidos.includes(parseInt(s.id)));

        // --- INICIO DE LA LÓGICA DE PUNTOS ---
        const totalPuntosNatillera = socios.reduce((acc, s) => acc + parseFloat(s.puntosEsfuerzo || 0), 0);

        if (totalPuntosNatillera === 0) {
            Swal.fire('Atención', 'No hay socios aptos con antigüedad suficiente para el cálculo.', 'info');
            return;
        }

        const valorPunto = gananciasDisponibles / totalPuntosNatillera;
        let sociosAptos = [];
        let filasTablaHTML = "";

        socios.forEach(socio => {
            const esAhorrador = socio.tipo === 'SOCIO' || socio.esSocio == 1 || socio.EsSocio == 1;
            const puntosSocio = parseFloat(socio.puntosEsfuerzo || 0);
            const saldoReal = parseFloat(socio.saldoTotal || socio.totalAhorrado || 0);

            if (esAhorrador && puntosSocio > 0) {
                const interesJusto = Math.floor(puntosSocio * valorPunto);
                
                sociosAptos.push({ 
                    id: socio.id, 
                    nombre: socio.nombre, 
                    interes: interesJusto 
                });

                filasTablaHTML += `
                    <tr class="border-b border-slate-50">
                        <td class="p-2 text-left font-medium text-slate-700">
                            ${socio.nombre} <span class="text-[8px] text-slate-400">(ID: ${socio.id})</span>
                        </td>
                        <td class="p-2 text-right text-slate-400 font-mono">$${saldoReal.toLocaleString()}</td>
                        <td class="p-2 text-right font-bold text-emerald-600 font-mono">+$${interesJusto.toLocaleString()}</td>
                    </tr>`;
            }
        });
        // --- FIN DE LA LÓGICA DE PUNTOS ---

        // 4. Construcción del modal (Vista Previa)
        let listaHTML = `
            <div class="mt-4">
                ${idsExcluidos.length > 0 ? `<p class="text-[9px] text-red-500 mb-2 font-bold">IDs Excluidos: ${idsExcluidos.join(', ')}</p>` : ''}
                <div class="mb-3 p-3 bg-emerald-900 text-white rounded-xl shadow-inner">
                    <p class="text-[10px] opacity-80 uppercase font-bold">Ganancia Total a Repartir</p>
                    <p class="text-2xl font-black">$${gananciasDisponibles.toLocaleString()}</p>
                    <p class="text-[9px] mt-1 opacity-70">* Reparto basado en tiempo y monto ahorrado (Equitativo)</p>
                </div>
                <div class="max-h-60 overflow-y-auto border border-slate-100 rounded-xl mb-4 custom-scroll">
                    <table class="w-full text-[10px] border-collapse">
                        <thead class="sticky top-0 bg-slate-50 shadow-sm">
                            <tr>
                                <th class="p-2 text-left text-slate-500 uppercase">Socio</th>
                                <th class="p-2 text-right text-slate-500 uppercase">Ahorro Actual</th>
                                <th class="p-2 text-right text-emerald-600 uppercase">Ganancia Justa</th>
                            </tr>
                        </thead>
                        <tbody>${filasTablaHTML}</tbody>
                    </table>
                </div>
            </div>`;

        const { isConfirmed, dismiss } = await Swal.fire({
            title: 'Reparto Proporcional de Utilidades',
            html: listaHTML,
            width: '550px',
            showCancelButton: true,
            confirmButtonText: 'Confirmar y Aplicar',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#059669',
        });

        // Si el usuario cerró el modal sin confirmar pero quiere descargar PDF
        if (dismiss === Swal.DismissReason.cancel && sociosAptos.length > 0) {
            // Descargar PDF
            try {
                const respPDF = await fetch('/api/datos-reparto');
                const dataPDF = await respPDF.json();
                
                if (dataPDF && dataPDF.socios && dataPDF.socios.length > 0) {
                    generarPDFReparto(dataPDF);
                }
            } catch (err) {
                console.error("Error al generar PDF:", err);
            }
            return;
        }

        if (!isConfirmed || sociosAptos.length === 0) return;

        // 5. Aplicar cambios en DB (CORRECCIÓN: Envío Masivo al Servidor)
        Swal.fire({ title: 'Capitalizando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const respuesta = await fetch('/api/ejecutar-reparto-masivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sociosAptos: sociosAptos })
        });

        const resultado = await respuesta.json();

        if (resultado.success) {
            Swal.fire('¡Éxito!', 'Se han distribuido las ganancias de forma equitativa.', 'success');
            if (typeof cargarTodo === 'function') cargarTodo();
        } else {
            throw new Error(resultado.error || "Fallo en la transacción");
        }

    } catch (error) {
        console.error("Error:", error);
        Swal.fire('Error', 'No se pudo procesar el reparto equitativo.', 'error');
    }
}

// --- FUNCIÓN PARA GENERAR EL PDF DEL REPARTO ---
function generarPDFReparto(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString('es-CO');
    const añoActual = new Date().getFullYear();

    // Encabezado
    doc.setFillColor(5, 150, 105); // Emerald
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("REPARTO GLOBAL DE INTERESES A SOCIOS", 14, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Natillera - Ciclo Fiscal ${añoActual}`, 14, 26);
    doc.text(`Fecha de generación: ${fecha}`, 14, 32);

    // Resumen
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text("RESUMEN DEL REPARTO", 14, 45);

    doc.autoTable({
        startY: 48,
        head: [['CONCEPTO', 'VALOR']],
        body: [
            ['Total Ganancias Disponibles', `$ ${Number(data.totalGanancias || 0).toLocaleString('es-CO')}`],
            ['Total Puntos Natillera', `${Number(data.totalPuntos || 0).toLocaleString('es-CO')}`],
            ['Valor por Punto', `$ ${Number(data.valorPunto || 0).toLocaleString('es-CO')}`],
            ['Total Repartido', `$ ${Number(data.totalRepartido || 0).toLocaleString('es-CO')}`],
            ['Total Socios Ahorradores', `${data.totalSociosAhorradores || 0}`],
            ['Socios Beneficiados', `${data.sociosBeneficiados || 0}`]
        ],
        theme: 'striped',
        headStyles: { fillStyle: [5, 150, 105], halign: 'center' },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    // SOCIO NO BENEFICIADO
    if (data.socioNoBeneficiado) {
        doc.setFontSize(11);
        doc.setTextColor(185, 28, 28); // Rose 600
        doc.text("SOCIO NO BENEFICIADO", 14, doc.lastAutoTable.finalY + 12);
        
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            head: [['ID', 'NOMBRE', 'AHORRO ACTUAL', 'PUNTOS', 'MOTIVO']],
            body: [[
                data.socioNoBeneficiado.id,
                data.socioNoBeneficiado.nombre,
                `$ ${Number(data.socioNoBeneficiado.ahorroActual || 0).toLocaleString('es-CO')}`,
                data.socioNoBeneficiado.puntos || 0,
                data.socioNoBeneficiado.motivo || 'Sin antigüedad mínima'
            ]],
            theme: 'striped',
            headStyles: { fillStyle: [220, 38, 38], halign: 'center' },
            styles: { fontSize: 9, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 50 },
                2: { halign: 'right' },
                3: { halign: 'center' },
                4: { cellWidth: 60 }
            }
        });
    }

    // Detalle por Socio
    doc.setFontSize(11);
    doc.text("DETALLE POR SOCIO", 14, doc.lastAutoTable.finalY + 12);

    const filas = data.socios.map(s => [
        s.nombre,
        s.id,
        `$${Number(s.ahorroActual || 0).toLocaleString('es-CO')}`,
        s.puntos ? s.puntos.toFixed(2) : '0',
        `$${Number(s.interes || 0).toLocaleString('es-CO')}`,
        `$${Number(s.nuevoSaldo || 0).toLocaleString('es-CO')}`
    ]);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['SOCIO', 'ID', 'AHORRO ACTUAL', 'PUNTOS', 'INTERÉS', 'NUEVO SALDO']],
        body: filas,
        theme: 'striped',
        headStyles: { fillStyle: [79, 70, 229], halign: 'center', fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
            0: { cellWidth: 50 },
            2: { halign: 'right' },
            3: { halign: 'center' },
            4: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
            5: { halign: 'right' }
        }
    });

    // Pie de página
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Documento generado automáticamente por el sistema Natillera.`, 14, 285);
        doc.text(`Página ${i} de ${totalPages}`, 185, 285, { align: 'right' });
    }

    doc.save(`Reparto_Intereses_${añoActual}.pdf`);
}

// --- 3. FUNCIÓN PUENTE (ENVÍO AL SERVIDOR) ---
// Centralizamos el fetch aquí para evitar repetir código
async function registrarMovimientoInteres(idSocio, monto, detalle, tipo) {
    const response = await fetch('/registrar-abono-dinamico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idPersona: idSocio,
            monto: monto,
            tipo: tipo, // 'ahorro' para que se sume al capital
            idPrestamo: null // No es abono a deuda, es capitalización
        })
    });

    if (!response.ok) {
        throw new Error("Fallo en el servidor al registrar interés");
    }
    return await response.json();
}

async function registrarGastoGanancias(monto, detalle) {
    try {
        const response = await fetch('/api/registrar-gasto-ganancias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                monto: monto,
                detalle: detalle
            })
        });

        if (!response.ok) throw new Error("Error al descontar de ganancias");
        
        return await response.json();
    } catch (error) {
        console.error("Fallo en registrarGastoGanancias:", error);
        throw error;
    }
}

// Usamos window. para que el onclick del HTML lo encuentre sin errores
window.ejecutarCruceCuentas = async function() {
    // 1. Obtener los identificadores
    const numPantalla = document.getElementById('mov_id').value;
    
    // Validar que el campo no esté vacío
    if (!numPantalla) {
        return Swal.fire('Atención', 'Por favor ingresa un ID de socio (#1, #2...)', 'info');
    }

    const idReal = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : numPantalla;

    if (!idReal) {
        return Swal.fire('Error', 'ID de socio no válido', 'warning');
    }

    try {
        // Mostrar un cargando mientras consulta
        Swal.fire({
            title: 'Consultando datos...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // 2. Consultar estado y deudas en paralelo
        const [resEstado, resDeuda] = await Promise.all([
            fetch(`/estado-cuenta/${idReal}`),
            fetch(`/detalle-prestamo/${idReal}`)
        ]);

        if (!resEstado.ok || !resDeuda.ok) throw new Error('Error al obtener datos del servidor');

        const estado = await resEstado.json();
        const deudas = await resDeuda.json();

        // Cerrar el cargando
        Swal.close();

        // 3. Filtrar préstamos activos usando 'saldoHoy' (nombre que envía tu detalle-prestamo)
        const prestamosActivos = deudas.filter(p => Number(p.saldoHoy) > 0);

        // 4. Validaciones de negocio
        if (Number(estado.totalAhorrado || 0) <= 0) {
            return Swal.fire('Sin fondos', 'El socio no tiene ahorros disponibles para cruzar.', 'info');
        }
        
        if (prestamosActivos.length === 0) {
            return Swal.fire('Sin deuda', 'El socio no tiene préstamos pendientes con saldo positivo.', 'info');
        }

        // 5. Preparar el cruce (Tomamos el préstamo más antiguo/primero)
        const prestamo = prestamosActivos[0];
        const saldoDeuda = Number(prestamo.saldoHoy);
        const montoACruzar = Math.min(Number(estado.totalAhorrado), saldoDeuda);

        // 6. Confirmación visual
        const { isConfirmed } = await Swal.fire({
            title: '¿Confirmar Cruce de Cuentas?',
            html: `
                <div class="text-left bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div class="flex justify-between">
                        <span class="text-slate-500 text-xs font-bold uppercase">Ahorros actuales:</span>
                        <span class="text-emerald-600 font-black">$${Number(estado.totalAhorrado).toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500 text-xs font-bold uppercase">Deuda Total (con int):</span>
                        <span class="text-rose-600 font-black">$${saldoDeuda.toLocaleString()}</span>
                    </div>
                    <div class="pt-2 border-t border-dashed border-slate-300">
                        <div class="bg-white p-3 rounded-xl text-center shadow-sm">
                            <p class="text-[10px] uppercase font-black text-indigo-400 mb-1">Monto a cruzar hoy</p>
                            <p class="text-2xl font-black text-indigo-700">$${montoACruzar.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                <p class="text-[9px] text-slate-400 mt-3 italic">Se liquidará primero el interés y el resto irá a capital.</p>
            `,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aplicar cruce',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#f1f5f9',
            customClass: {
                cancelButton: 'text-slate-500'
            }
        });

        // 7. Ejecutar en el servidor
        if (isConfirmed) {
            const res = await fetch('/procesar-cruce', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idPersona: idReal,
                    idPrestamo: prestamo.ID_Prestamo,
                    monto: montoACruzar
                })
            });

            const r = await res.json();
            if (r.success) {
                await Swal.fire({
                    title: '¡Éxito!',
                    text: 'El cruce se aplicó y registró correctamente.',
                    icon: 'success',
                    timer: 2000
                });
                
                // Recargar para ver los nuevos saldos
                if (typeof cargarTodo === 'function') {
                    cargarTodo();
                } else {
                    location.reload();
                }
            } else {
                Swal.fire('Error', r.error || 'No se pudo procesar el cruce', 'error');
            }
        }
    } catch (err) {
        console.error("Error en cruce:", err);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
    }
};

// 1. DESCARGAR
async function descargarBackup() {
    const res = await fetch('/api/backup-database');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_natillera_${new Date().toLocaleDateString()}.json`;
    a.click();
}

// 2. DISPARAR EL SELECTOR DE ARCHIVOS
function confirmarRestauracion() {
    Swal.fire({
        title: '¿Estás ABSOLUTAMENTE seguro?',
        text: "Se borrarán todos los datos actuales y se reemplazarán por los del archivo.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, restaurar todo',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            document.getElementById('fileInput').click(); // Abre el selector de archivos
        }
    });
}

// 3. LEER EL ARCHIVO Y ENVIAR AL SERVIDOR
function procesarArchivoRestaurar(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const contenido = JSON.parse(e.target.result);
            
            const response = await fetch('/api/restore-database', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: contenido.data })
            });

            const res = await response.json();
            if (res.success) {
                Swal.fire('Restaurado', 'La base de datos ha vuelto al pasado con éxito.', 'success')
                .then(() => location.reload()); // Recargar para ver cambios
            } else {
                throw new Error(res.error);
            }
        } catch (error) {
            Swal.fire('Error', 'El archivo no es válido o hubo un fallo: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

// --- FUNCIONES PARA EDITAR MOVIMIENTOS ---

// 1. Función para abrir el modal de edición de ahorro
window.abrirEditarAhorro = async function(idAhorro, montoActual, fechaActual, detalleActual, idPersona) {
    // Convertir fecha dd/MM/yyyy a yyyy-MM-dd para el input date
    let fechaFormateada = '';
    if (fechaActual) {
        const parts = fechaActual.split('/');
        if (parts.length === 3) {
            fechaFormateada = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    const { value: formValues } = await Swal.fire({
        title: '✏️ Editar Ahorro',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Monto ($)</label>
                    <input id="edit-monto" type="number" class="swal2-input" value="${montoActual}" placeholder="Monto">
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Fecha</label>
                    <input id="edit-fecha" type="date" class="swal2-input" value="${fechaFormateada}">
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Periodo / Detalle</label>
                    <input id="edit-detalle" type="text" class="swal2-input" value="${detalleActual}" placeholder="Ej: Enero (Q1)">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        confirmButtonColor: '#4f46e5',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const monto = document.getElementById('edit-monto').value;
            const fecha = document.getElementById('edit-fecha').value;
            const detalle = document.getElementById('edit-detalle').value;
            
            if (!monto || monto <= 0) {
                Swal.showValidationMessage('El monto debe ser mayor a 0');
                return false;
            }
            return { monto, fecha, detalle };
        }
    });

    if (formValues) {
        try {
            console.log("Enviando datos al servidor:", {
                idAhorro: idAhorro,
                monto: formValues.monto,
                fecha: formValues.fecha,
                MesesCorrespondientes: formValues.detalle || 'Abono General',
                idPersona: idPersona
            });
            
            const response = await fetch('/api/editar-ahorro', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idAhorro: idAhorro,
                    monto: formValues.monto,
                    fecha: formValues.fecha,
                    MesesCorrespondientes: formValues.detalle || 'Abono General',
                    idPersona: idPersona
                })
            });

            console.log("Respuesta del servidor:", response.status, response.statusText);
            
            const result = await response.json();
            console.log("Datos de respuesta:", result);

            if (result.success) {
                Swal.fire('¡Éxito!', 'Ahorro actualizado correctamente', 'success');
                // Recargar el historial
                if (typeof cargarTodo === 'function') cargarTodo();
            } else {
                Swal.fire('Error', result.error || 'No se pudo actualizar', 'error');
            }
        } catch (error) {
            console.error("Error al editar ahorro:", error);
            Swal.fire('Error', 'Error de conexión: ' + error.message, 'error');
        }
    }
};

// 2. Función para abrir el modal de edición de pago de deuda
window.abrirEditarPago = async function(idPago, montoActual, fechaActual, detalleActual, idPrestamo, montoAnterior) {
    // Convertir fecha dd/MM/yyyy a yyyy-MM-dd para el input date
    let fechaFormateada = '';
    if (fechaActual) {
        const parts = fechaActual.split('/');
        if (parts.length === 3) {
            fechaFormateada = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    // Determinar si es capital o interés basado en el detalle actual
    const esCapital = String(detalleActual || '').toLowerCase().includes('capital');
    console.log("DEBUG abrirEditarPago - detalleActual:", detalleActual, "esCapital:", esCapital);

    const { value: formValues } = await Swal.fire({
        title: '✏️ Editar Pago de Deuda',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Monto ($)</label>
                    <input id="edit-pago-monto" type="number" class="swal2-input" value="${montoActual}" placeholder="Monto">
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Fecha</label>
                    <input id="edit-pago-fecha" type="date" class="swal2-input" value="${fechaFormateada}">
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Tipo de Abono</label>
                    <select id="edit-pago-tipo" class="swal2-input">
                        <option value="interes" ${!esCapital ? 'selected' : ''}>Abono a INTERÉS</option>
                        <option value="capital" ${esCapital ? 'selected' : ''}>Abono a CAPITAL</option>
                    </select>
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Detalle</label>
                    <input id="edit-pago-detalle" type="text" class="swal2-input" value="${detalleActual}" placeholder="Detalle del pago">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        confirmButtonColor: '#4f46e5',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const monto = document.getElementById('edit-pago-monto').value;
            const fecha = document.getElementById('edit-pago-fecha').value;
            const tipo = document.getElementById('edit-pago-tipo').value;
            const detalle = document.getElementById('edit-pago-detalle').value;
            
            if (!monto || monto <= 0) {
                Swal.showValidationMessage('El monto debe ser mayor a 0');
                return false;
            }
            return { monto, fecha, tipo, detalle };
        }
    });

    if (formValues) {
        try {
            // Construir el detalle final basado en el tipo seleccionado
            const detalleFinal = `Abono a ${formValues.tipo.toUpperCase()}`;
            
            console.log("DEBUG editar pago - Enviando:", {
                idPago: idPago,
                monto: formValues.monto,
                fecha: formValues.fecha,
                detalle: detalleFinal,
                tipoOriginal: detalleActual,
                tipoNuevo: formValues.tipo,
                idPrestamo: idPrestamo,
                montoOriginal: montoAnterior
            });
            
            const response = await fetch('/api/editar-pago-deuda', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idPago: idPago,
                    monto: formValues.monto,
                    fecha: formValues.fecha,
                    detalle: detalleFinal,
                    idPrestamo: idPrestamo,
                    montoAnterior: montoAnterior
                })
            });

            const result = await response.json();
            console.log("DEBUG editar pago - Respuesta:", result);

            if (result.success) {
                Swal.fire('¡Éxito!', 'Pago actualizado correctamente', 'success');
                // Recargar
                if (typeof cargarTodo === 'function') cargarTodo();
            } else {
                Swal.fire('Error', result.error || 'No se pudo actualizar', 'error');
            }
        } catch (error) {
            console.error("Error al editar pago:", error);
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }
};

// 3. Función para eliminar un pago de deuda
window.eliminarPago = async function(idPago, monto, detalle, idPrestamo) {
    const confirmacion = await Swal.fire({
        title: '¿Eliminar pago?',
        text: `Se eliminará el abono de $${Number(monto).toLocaleString()}. El saldo del préstamo se recalculará.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b'
    });

    if (confirmacion.isConfirmed) {
        try {
            const response = await fetch('/api/eliminar-pago-deuda', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idPago: idPago,
                    idPrestamo: idPrestamo,
                    monto: monto,
                    detalle: detalle
                })
            });

            const result = await response.json();

            if (result.success) {
                Swal.fire('¡Éxito!', 'Pago eliminado correctamente', 'success');
                // Recargar los datos
                if (typeof cargarTodo === 'function') cargarTodo();
            } else {
                Swal.fire('Error', result.error || 'No se pudo eliminar', 'error');
            }
        } catch (error) {
            console.error("Error al eliminar pago:", error);
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }
};

// 4. Función para abrir el modal de edición de PRÉSTAMO
window.abrirEditarPrestamo = async function(idPrestamo, montoActual, tasaActual, fechaActual) {
    // Convertir fecha dd/MM/yyyy a yyyy-MM-dd para el input date
    let fechaFormateada = '';
    if (fechaActual) {
        const parts = fechaActual.split('/');
        if (parts.length === 3) {
            fechaFormateada = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }

    const { value: formValues } = await Swal.fire({
        title: '✏️ Editar Préstamo',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Monto Capital ($)</label>
                    <input id="edit-prestamo-monto" type="number" class="swal2-input" value="${montoActual}" placeholder="Monto">
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Tasa de Interés Mensual (%)</label>
                    <input id="edit-prestamo-tasa" type="number" class="swal2-input" value="${tasaActual}" placeholder="Tasa %">
                </div>
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase">Fecha de Préstamo (Inicio)</label>
                    <input id="edit-prestamo-fecha" type="date" class="swal2-input" value="${fechaFormateada}">
                </div>
                <div>
                    <label class="text-[10px] font-black text-emerald-600 uppercase">📅 Fecha Límite para Intereses (Opcional)</label>
                    <input id="edit-prestamo-fecha-interes" type="date" class="swal2-input" placeholder="Dejar vacío para interés vigente">
                    <p class="text-[9px] text-slate-400 mt-1">* Si estableces una fecha, los intereses se calcularán solo hasta esa fecha. Deja vacío para que sigan sumando.</p>
                </div>
                <div class="bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <p class="text-[10px] text-amber-700 leading-tight">
                        <i class="fas fa-info-circle mr-1"></i> 
                        Al cambiar el monto o la tasa, el interés y saldo se recalcularán automáticamente.
                    </p>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        confirmButtonColor: '#4f46e5',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const monto = document.getElementById('edit-prestamo-monto').value;
            const tasa = document.getElementById('edit-prestamo-tasa').value;
            const fecha = document.getElementById('edit-prestamo-fecha').value;
            const fechaInteres = document.getElementById('edit-prestamo-fecha-interes').value;
            
            if (!monto || monto <= 0) {
                Swal.showValidationMessage('El monto debe ser mayor a 0');
                return false;
            }
            if (!tasa || tasa < 0) {
                Swal.showValidationMessage('La tasa debe ser mayor o igual a 0');
                return false;
            }
            return { monto, tasa, fecha, fechaInteres };
        }
    });

    if (formValues) {
        try {
            const response = await fetch('/api/editar-prestamo', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idPrestamo: idPrestamo,
                    monto: formValues.monto,
                    tasaInteres: formValues.tasa,
                    fecha: formValues.fecha,
                    fechaInteres: formValues.fechaInteres || null
                })
            });

            const result = await response.json();

            if (result.success) {
                Swal.fire('¡Éxito!', 'Préstamo actualizado correctamente', 'success');
                // Recargar
                if (typeof cargarTodo === 'function') cargarTodo();
            } else {
                Swal.fire('Error', result.error || 'No se pudo actualizar', 'error');
            }
        } catch (error) {
            console.error("Error al editar préstamo:", error);
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }
};