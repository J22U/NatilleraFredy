// DECLARACIÓN GLOBAL
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
window.mapeoIdentificadores = {};
let miembrosGlobal = []; 
let quincenasSeleccionadas = [];
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
                document.getElementById('dash-prestamos').innerText = `$ ${Number(data.CapitalPrestado || 0).toLocaleString()}`;
                document.getElementById('dash-ganancia').innerText = `$ ${Number(data.GananciasBrutas || 0).toLocaleString()}`;
            } catch (err) { console.error(err); }
        }

        async function listarMiembros() {
    try {
        const res = await fetch('/listar-miembros');
        // Quitamos el 'const' para usar la variable global
        miembrosGlobal = await res.json(); 
        
        const tbody = document.getElementById('tabla-recientes');
        tbody.innerHTML = '';
        window.mapeoIdentificadores = {}; 

        let cAhorro = 0, cExtra = 0;
        const totalMiembros = miembrosGlobal.length;

        // Clonamos y volteamos para no dañar el array original
        [...miembrosGlobal].reverse().forEach((m, index) => {
            const numPantalla = totalMiembros - index;
            
            // Guardamos el ID real vinculado al número que ve el usuario
            window.mapeoIdentificadores[numPantalla] = m.id; 

            const esSocioReal = (m.tipo === 'SOCIO'); 
            esSocioReal ? cAhorro++ : cExtra++;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors item-socio">
                    <td class="px-8 py-5 font-black text-indigo-500 text-xl">#${numPantalla}</td>
                    <td class="px-8 py-5">
                        <div class="font-semibold text-slate-700 nombre-socio text-lg">${m.nombre}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-tighter">
                            DOC: ${m.cedula} | 
                            <span class="${esSocioReal ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'} px-2 py-0.5 rounded-full font-black text-[9px] ml-2">
                                ${m.tipo}
                            </span>
                        </div>
                    </td>
                    <td class="px-8 py-5 text-center">
                        <div class="flex justify-center gap-3">
    <button onclick="verHistorialFechas(${m.id}, '${m.nombre}')" class="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">Resumen</button>
    
    <button onclick="abrirModalRetiro(${m.id}, '${m.nombre}')" class="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 hover:text-white transition-all flex items-center gap-2">
        <i class="fas fa-hand-holding-usd"></i> Retirar
    </button>

    <button onclick="editarSocio(${m.id}, '${m.nombre}', '${m.cedula}')" class="text-amber-500 p-2"><i class="fas fa-pen"></i></button>
    <button onclick="eliminarSocio(${m.id})" class="text-rose-400 p-2"><i class="fas fa-trash"></i></button>
</div>
                    </td>
                </tr>`;
        });
        document.getElementById('count-ahorradores').innerText = `${cAhorro} Ahorradores`;
        document.getElementById('count-prestamos').innerText = `${cExtra} Externos`;
    } catch (err) { console.error(err); }
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
    const numPantalla = document.getElementById('mov_id').value;
    const idReal = window.mapeoIdentificadores[numPantalla];
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
        
        // Filtramos solo los que tengan deuda según el SaldoActual de la DB
        const activos = prestamos.filter(p => Number(p.SaldoActual) > 0);
        
        if (activos.length > 0) {
            select.innerHTML = activos.map((p, index) => {
                // AQUÍ ESTÁ EL ARREGLO: 
                // No restamos nada a mano, usamos el saldo que manda SQL
                const saldoReal = Number(p.SaldoActual); 
                const numPrestamoSocio = index + 1; 

                return `<option value="${p.ID_Prestamo}" data-saldo="${saldoReal}">
                    Préstamo #${numPrestamoSocio} (Saldo: $${saldoReal.toLocaleString()})
                </option>`;
            }).join('');
            
            select.onchange = () => {
                const saldo = select.options[select.selectedIndex].getAttribute('data-saldo');
                inputMonto.placeholder = `Máximo: $${Number(saldo).toLocaleString()}`;
            };
            select.onchange();
            
        } else {
            select.innerHTML = '<option value="">Sin deudas activas</option>';
            inputMonto.placeholder = "Monto $";
        }
    } catch (e) { console.error("Error al actualizar deudas:", e); }
}

async function verHistorialFechas(id, nombre) {
    Swal.fire({
        title: 'Cargando datos...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const [resA, resP, resAb, resTotales] = await Promise.all([
            fetch(`/historial-ahorros/${id}`),
            fetch(`/detalle-prestamo/${id}`),
            fetch(`/historial-abonos-deuda/${id}`),
            fetch(`/estado-cuenta/${id}`)
        ]);

        const a = await resA.json();
        const p = await resP.json();
        const ab = await resAb.json();
        const totales = await resTotales.json();

        // 1. Render de Ahorros MODIFICADO para mostrar Quincena/Mes
        const renderSimple = (data, key, color) => {
            if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin movimientos</p>';
            return data.map(m => {
                const esRetiro = Number(m[key]) < 0;
                // Si es retiro, mostramos en rojo, si es ahorro en el color pasado (emerald)
                const colorFinal = esRetiro ? 'rose' : color;
                
                return `
                <div class="flex justify-between items-center p-3 border-b border-slate-100 text-[11px]">
                    <div class="flex flex-col">
                        <span class="text-slate-500 font-medium">${m.FechaFormateada || 'S/F'}</span>
                        <span class="text-[9px] font-black uppercase ${esRetiro ? 'text-rose-400' : 'text-indigo-400'} mt-0.5">
                            ${m.MesesCorrespondientes || 'Ahorro'}
                        </span>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-${colorFinal}-600">
                            ${esRetiro ? '' : '+'}$${Math.abs(Number(m[key])).toLocaleString()}
                        </span>
                    </div>
                </div>
            `}).join('');
        };

        // 2. Render de Préstamos (Corregido para separar Capital de Interés)
        const renderPrestamos = (data) => {
            if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin préstamos</p>';
            
            return data.map((m, index) => {
                const saldo = Number(m.SaldoActual || 0);
                const capitalOriginal = Number(m.MontoPrestado || 0);
                const montoInteres = Number(m.MontoInteres || 0);
                const cuotas = m.Cuotas || 1; // Si es 0 o null, mostrar 1
                const estaPago = m.Estado === 'Pagado' || saldo <= 0;

                return `
                <div class="p-3 mb-3 rounded-2xl border ${estaPago ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-100'} shadow-sm">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[10px] font-black text-indigo-600 bg-white px-2 py-0.5 rounded-full shadow-sm">PRÉSTAMO #${index + 1}</span>
                        <span class="text-[10px] ${estaPago ? 'text-emerald-700' : 'text-slate-500'} font-bold">
                            ${estaPago ? '✅ PAGADO' : '📅 ' + (m.FechaPrestamo || 'S/F')}
                        </span>
                    </div>

                    <div class="flex gap-2 mb-3">
                        <span class="bg-white/60 text-[9px] font-bold text-slate-600 px-2 py-1 rounded-lg border border-slate-200">
                            <i class="fas fa-percentage mr-1 text-indigo-400"></i>Int: ${m.TasaInteres}%
                        </span>
                        <span class="bg-white/60 text-[9px] font-bold text-slate-600 px-2 py-1 rounded-lg border border-slate-200">
                            <i class="fas fa-calendar-check mr-1 text-indigo-400"></i>${cuotas} Cuotas
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-2 border-t border-slate-200/50 pt-2">
                        <div class="flex flex-col text-left">
                            <span class="text-[8px] uppercase font-black text-slate-400 leading-tight">Capital Inicial</span>
                            <span class="text-[13px] font-black text-slate-800">$${capitalOriginal.toLocaleString()}</span>
                            <span class="text-[7px] text-slate-400">Interés: $${montoInteres.toLocaleString()}</span>
                        </div>
                        
                        ${!estaPago ? `
                        <div class="flex flex-col text-right">
                            <span class="text-[8px] uppercase font-black text-rose-500 leading-tight">Saldo Pendiente</span>
                            <span class="text-[15px] font-black text-rose-600 tracking-tighter">$${saldo.toLocaleString()}</span>
                        </div>` : `
                        <div class="text-right text-emerald-600 font-black text-[10px] pt-2">COMPLETADO</div>`}
                    </div>
                </div>`;
            }).join('');
        };

        // 3. Render de Abonos (Corregido para mostrar el monto real y ID de préstamo)
        const renderAbonosDetallados = (data, listaPrestamos) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin abonos realizados</p>';
    
    const prestamosSeguros = Array.isArray(listaPrestamos) ? listaPrestamos : [];

    // Ordenamos por fecha para que el índice coincida con la realidad cronológica
    const prestamosOrdenados = [...prestamosSeguros].sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));

    return data.map(m => {
        // Buscamos el índice comparando como String para evitar errores de tipo de dato
        const indicePrestamo = prestamosOrdenados.findIndex(p => String(p.ID_Prestamo) === String(m.ID_Prestamo));
        
        // Si no lo encuentra, intentamos buscarlo en la propiedad PrestamoRef (si existe)
        const numeroAmigable = indicePrestamo !== -1 ? (indicePrestamo + 1) : 'Ref';
        
        const prestamoInfo = prestamosSeguros.find(p => String(p.ID_Prestamo) === String(m.ID_Prestamo));
        const capitalRef = prestamoInfo ? Number(prestamoInfo.MontoPrestado).toLocaleString() : '---';

        return `
            <div class="p-2 border-b border-slate-100 text-[11px]">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-slate-500 font-medium">${m.FechaFormateada || 'S/F'}</span>
                        <p class="text-[9px] text-indigo-500 font-bold uppercase mt-0.5">
                            Aplicado a: Préstamo #${numeroAmigable}
                        </p>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-rose-600">-$${Number(m.Monto_Abonado || m.Monto || 0).toLocaleString()}</span>
                        <p class="text-[8px] text-slate-400 italic">Cap. Orig: $${capitalRef}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

        // --- VENTANA EMERGENTE (MODAL) ---
        Swal.fire({
            title: `<span class="text-xl font-black">${nombre}</span>`,
            html: `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-emerald-50 p-2 rounded-xl text-center border border-emerald-100 shadow-sm">
                        <p class="text-[8px] uppercase font-bold text-emerald-600">Total Ahorrado</p>
                        <p class="font-black text-emerald-700 text-sm">$${Number(totales.totalAhorrado || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-rose-50 p-2 rounded-xl text-center border border-rose-100 shadow-sm">
                        <p class="text-[8px] uppercase font-bold text-rose-600">Deuda (Solo Capital)</p>
                        <p class="font-black text-rose-700 text-sm">$${Number(totales.deudaTotal || 0).toLocaleString()}</p>
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
                            <div class="p-3 border-t border-slate-50 bg-slate-50/30">${renderPrestamos(p)}</div>
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
        console.error("Error cargando historial:", e);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
    }
}

function toggleAcordeon(id, btn) {
    const content = document.getElementById(id);
    const icon = btn.querySelector('.fa-chevron-down');
    
    // Si ya está abierto, lo cerramos
    if (content.style.maxHeight && content.style.maxHeight !== '0px') {
        content.style.maxHeight = '0px';
        icon.style.transform = 'rotate(0deg)';
    } else {
        // Cerramos otros por si acaso (opcional)
        document.querySelectorAll('[id^="acc-"]').forEach(el => el.style.maxHeight = '0px');
        document.querySelectorAll('.fa-chevron-down').forEach(i => i.style.transform = 'rotate(0deg)');

        // Abrimos el actual
        content.style.maxHeight = content.scrollHeight + "px";
        icon.style.transform = 'rotate(180deg)';
    }
}

        async function registrarMovimiento() {
    const numPantalla = document.getElementById('mov_id').value;
    const montoInput = document.getElementById('mov_monto');
    const monto = parseFloat(montoInput.value);
    const tipo = document.getElementById('mov_tipo').value;
    const selectDeuda = document.getElementById('mov_prestamo_id');
    const idReal = window.mapeoIdentificadores[numPantalla];

    if (!idReal || isNaN(monto)) return Toast.fire({ icon: 'warning', title: 'Faltan datos' });

    // --- 1. CAPTURAR MESES ---
    let mesesParaEnviar = "Abono General";
    if (tipo === 'ahorro') {
        // Buscamos botones que tengan la clase active O el fondo rojo
        const activos = Array.from(document.querySelectorAll('.btn-quincena'))
                             .filter(btn => btn.classList.contains('active') || btn.classList.contains('bg-red-500'));
        
        if (activos.length > 0) {
            mesesParaEnviar = activos.map(btn => btn.value).join(', ');
        }
    }

    // --- 2. CONFIRMACIÓN ---
    const confirmacion = await Swal.fire({
        title: '¿Confirmar movimiento?',
        text: `Registro de ${tipo} por $${monto.toLocaleString()} (${mesesParaEnviar})`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'Sí, registrar'
    });

    if (!confirmacion.isConfirmed) return;

    // --- 3. ENVÍO ---
    try {
        const respuesta = await fetch('/procesar-movimiento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idPersona: idReal,
                monto: monto,
                tipoMovimiento: tipo,
                idPrestamo: (tipo === 'deuda') ? selectDeuda.value : null,
                MesesCorrespondientes: mesesParaEnviar // NOMBRE EXACTO
            })
        });

        const resultado = await respuesta.json();

        if (resultado.success) {
            Swal.fire('¡Éxito!', 'Guardado correctamente', 'success');
            montoInput.value = '';
            // Limpiar botones
            document.querySelectorAll('.btn-quincena').forEach(btn => {
                btn.classList.remove('active', 'bg-red-500', 'text-white', 'border-red-500');
            });
            cargarTodo();
        } else {
            Swal.fire('Error', resultado.error || 'Error desconocido', 'error');
        }
    } catch (error) {
        console.error("Error:", error);
        Swal.fire('Error', 'Falla de conexión', 'error');
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
            let filas = document.getElementsByClassName("item-socio");
            Array.from(filas).forEach(fila => {
                let nombre = fila.querySelector(".nombre-socio").innerText.toLowerCase();
                fila.style.display = nombre.includes(input) ? "" : "none";
            });
        }

        async function modalPrestamoRapido() {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Préstamo',
        html: `
            <div class="text-left space-y-3">
                <div>
                    <label class="swal-input-label"># Socio en pantalla</label>
                    <input id="p-id" type="number" class="swal-custom-input" placeholder="Ej: 1, 2...">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="swal-input-label">Monto Capital ($)</label>
                        <input id="p-m" type="number" class="swal-custom-input" placeholder="0">
                    </div>
                    <div>
                        <label class="swal-input-label">Interés Mensual (%)</label>
                        <input id="p-tasa" type="number" class="swal-custom-input" value="5">
                    </div>
                </div>
                <div>
                    <label class="swal-input-label">Número de Cuotas</label>
                    <select id="p-cuotas" class="swal-custom-input cursor-pointer">
                        <option value="1">1 Mes (Pago único)</option>
                        <option value="2">2 Meses</option>
                        <option value="3">3 Meses</option>
                        <option value="6">6 Meses</option>
                        <option value="12">12 Meses</option>
                    </select>
                </div>
                <div class="bg-slate-900 p-4 rounded-2xl text-white shadow-inner">
                    <div class="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-2">
                        <span>Resumen del Crédito</span>
                        <i class="fas fa-calculator"></i>
                    </div>
                    <div class="space-y-1 border-b border-white/10 pb-2 mb-2">
                        <div class="flex justify-between text-xs"><span>Interés total:</span> <span id="calc-interes" class="text-rose-400 font-bold">$ 0</span></div>
                        <div class="flex justify-between text-xs"><span>Total a pagar:</span> <span id="calc-total" class="text-emerald-400 font-bold">$ 0</span></div>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-bold uppercase text-indigo-300">Valor de cada cuota:</span>
                        <span id="calc-cuota" class="text-lg font-black text-white">$ 0</span>
                    </div>
                </div>
            </div>`,
        didOpen: () => {
            const inputs = ['p-m', 'p-tasa', 'p-cuotas'];
            const calcular = () => {
                const capital = parseFloat(document.getElementById('p-m').value) || 0;
                const tasa = parseFloat(document.getElementById('p-tasa').value) || 0;
                const nCuotas = parseInt(document.getElementById('p-cuotas').value);

                // Lógica Natillera: El interés se aplica sobre el capital inicial por el tiempo pactado
                const interesTotal = capital * (tasa / 100) * nCuotas;
                const totalADevolver = capital + interesTotal;
                const valorCuota = totalADevolver / nCuotas;

                document.getElementById('calc-interes').innerText = `$ ${interesTotal.toLocaleString()}`;
                document.getElementById('calc-total').innerText = `$ ${totalADevolver.toLocaleString()}`;
                document.getElementById('calc-cuota').innerText = `$ ${valorCuota.toLocaleString()}`;
            };
            inputs.forEach(id => document.getElementById(id).addEventListener('input', calcular));
            inputs.forEach(id => document.getElementById(id).addEventListener('change', calcular));
        },
        preConfirm: () => {
            const idReal = window.mapeoIdentificadores[document.getElementById('p-id').value];
            const monto = parseFloat(document.getElementById('p-m').value);
            const tasa = parseFloat(document.getElementById('p-tasa').value);
            const cuotas = parseInt(document.getElementById('p-cuotas').value);

            if (!idReal) return Swal.showValidationMessage(`Socio no encontrado`);
            if (!monto || monto <= 0) return Swal.showValidationMessage(`Monto inválido`);
            
            return { idPersona: idReal, monto, tasaInteres: tasa, cuotas };
        }
    });

    if (formValues) apiCall('/registrar-prestamo', formValues, "Préstamo registrado");
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

async function editarSocio(id, n, c) {
    const { value: f } = await Swal.fire({
        title: 'Editar Miembro',
        html: `
            <label class="swal-input-label">Nombre</label>
            <input id="en" class="swal-custom-input" value="${n}">
            <label class="swal-input-label">Cédula</label>
            <input id="ec" class="swal-custom-input" value="${c}">
        `,
        preConfirm: () => ({ 
            nombre: document.getElementById('en').value, 
            cedula: document.getElementById('ec').value 
        })
    });

    // CORRECCIÓN: Se agrega /${id} a la URL para que coincida con el servidor
    if (f) apiCall(`/editar-socio/${id}`, f, "Actualizado");
}

function generarPDFMovimientos(nombre, ahorros, prestamos, abonos, totales) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fechaDoc = new Date().toLocaleDateString();

    // 1. ENCABEZADO
    doc.setFillColor(99, 102, 241); 
    doc.rect(0, 0, 210, 40, 'F');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("EXTRACTO DE CUENTA", 14, 20);
    doc.setFontSize(10);
    doc.text("SISTEMA DE GESTIÓN NATILLERA", 14, 28);

    doc.setFontSize(12);
    doc.text(`CLIENTE: ${nombre.toUpperCase()}`, 120, 20);
    doc.text(`FECHA: ${fechaDoc}`, 120, 28);

    // 2. RESUMEN DE TOTALES
    doc.autoTable({
        startY: 45,
        head: [['RESUMEN GENERAL', 'VALOR TOTAL']],
        body: [
            ['TOTAL AHORRADO A LA FECHA', `$ ${Number(totales.totalAhorrado || 0).toLocaleString()}`],
            ['DEUDA PENDIENTE (Capital + Intereses)', `$ ${Number(totales.deudaTotal || 0).toLocaleString()}`]
        ],
        theme: 'striped',
        headStyles: { fillStyle: [31, 41, 55], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 3 }
    });

    // --- LÓGICA DE ORDENAMIENTO POR ID ---
    const movimientosAhorro = [...ahorros].sort((a, b) => {
        const fechaA = new Date(a.FechaRaw || a.Fecha || a.FechaAporte);
        const fechaB = new Date(b.FechaRaw || b.Fecha || b.FechaAporte);
        if (fechaA - fechaB !== 0) return fechaA - fechaB;
        return (a.ID_Ahorro || a.id) - (b.ID_Ahorro || b.id);
    });

    // 3. TABLA DE MOVIMIENTOS
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text("1. DETALLE DE MOVIMIENTOS DE AHORRO", 14, doc.lastAutoTable.finalY + 12);
    
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['#', 'Fecha', 'Descripción', 'Monto']],
        body: movimientosAhorro.map((item, index) => {
            const monto = Number(item.Monto);
            const esRetiro = monto < 0;
            return [
                index + 1,
                item.FechaFormateada || new Date(item.FechaAporte || item.Fecha).toLocaleDateString(),
                esRetiro ? 'RETIRO DE AHORRO' : 'APORTE DE AHORRO',
                `$ ${monto.toLocaleString()}`
            ];
        }),
        headStyles: { fillStyle: [16, 185, 129] },
        styles: { fontSize: 9 },
        didParseCell: function(data) {
            if (data.section === 'body') {
                const rowData = data.row.raw;
                if (rowData[2] === 'RETIRO DE AHORRO') {
                    data.cell.styles.textColor = [220, 38, 38];
                }
            }
        }
    });

    // 4. TABLA DE PRÉSTAMOS
    doc.setFontSize(12);
    doc.setTextColor(59, 130, 246);
    doc.text("2. DETALLE DE PRÉSTAMOS", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['ID', 'Fecha', 'Tasa', 'Cuotas', 'Capital', 'Total con Int.', 'Saldo Act.', 'Estado']],
        body: prestamos.map((item, index) => [
            `#${index + 1}`, // Aquí se genera el #1 que se ve en pantalla
            item.FechaPrestamo || 'S/F',
            `${item.TasaInteres || 5}%`,
            item.Cuotas || 1,
            `$ ${Number(item.MontoPrestado || 0).toLocaleString()}`,
            `$ ${(Number(item.MontoPrestado || 0) + Number(item.MontoInteres || 0)).toLocaleString()}`,
            `$ ${Number(item.SaldoActual || 0).toLocaleString()}`,
            (item.Estado || 'Activo').toUpperCase()
        ]),
        headStyles: { fillStyle: [59, 130, 246] },
        styles: { fontSize: 7.5 }
    });

    // 5. TABLA DE ABONOS A DEUDA (CON REFERENCIA VISUAL COINCIDENTE)
    doc.setFontSize(12);
    doc.setTextColor(244, 63, 94);
    doc.text("3. HISTORIAL DE PAGOS A DEUDA", 14, doc.lastAutoTable.finalY + 12);

    const abonosOrdenados = [...abonos].sort((a, b) => new Date(a.FechaRaw || a.Fecha) - new Date(b.FechaRaw || b.Fecha));

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['Fecha', 'Valor Abono', 'Referencia']],
        body: abonosOrdenados.map(i => {
            // Buscamos la posición del préstamo en el arreglo original para que coincida con el #1, #2, etc.
            const indexPrestamo = prestamos.findIndex(p => p.ID_Prestamo === i.ID_Prestamo);
            const numeroVisual = indexPrestamo !== -1 ? indexPrestamo + 1 : 1;
            
            return [
                i.FechaFormateada || 'S/F', 
                `$ ${Number(i.Monto_Abonado || i.Monto_Pagado || 0).toLocaleString()}`,
                `Abono a Préstamo #${numeroVisual}` // Ahora dirá #1 si es el primer préstamo de la lista
            ];
        }),
        headStyles: { fillStyle: [244, 63, 94] }, 
        styles: { fontSize: 9 }
    });

    doc.save(`Extracto_${nombre.replace(/\s+/g, '_')}.pdf`);
}

async function verListaRapidaDeudores() {
    try {
        const res = await fetch('/listar-miembros');
        const miembros = await res.json();

        // Filtramos y ordenamos: el que más debe va arriba
        const deudores = miembros
            .filter(m => parseFloat(m.deudaTotal || 0) > 0)
            .sort((a, b) => b.deudaTotal - a.deudaTotal);

        if (deudores.length === 0) {
            return Swal.fire({
                title: '¡Cuentas Limpias!',
                text: 'No hay saldos pendientes. ¡Buen trabajo!',
                icon: 'success',
                confirmButtonColor: '#10b981'
            });
        }

        const totalCartera = deudores.reduce((sum, m) => sum + parseFloat(m.deudaTotal), 0);

        let htmlDeudores = `
            <div class="recaudo-container text-left font-sans">
                <div class="grid grid-cols-2 gap-3 mb-6">
                    <div class="bg-indigo-600 p-4 rounded-2xl text-white shadow-md">
                        <p class="text-[10px] uppercase opacity-80 font-bold">Por Recoger</p>
                        <p class="text-xl font-black">$${totalCartera.toLocaleString()}</p>
                    </div>
                    <div class="bg-white border-2 border-slate-100 p-4 rounded-2xl shadow-sm">
                        <p class="text-[10px] text-slate-400 uppercase font-bold">Personas</p>
                        <p class="text-xl font-black text-slate-700">${deudores.length}</p>
                    </div>
                </div>

                <p class="text-xs font-black text-slate-400 uppercase mb-3 tracking-widest px-1">Ranking de Deuda</p>
                
                <div class="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scroll">
                    ${deudores.map((d, index) => {
                        // Color según el monto (más de 1M es crítico)
                        const esCritico = d.deudaTotal > 1000000;
                        return `
                        <div class="group bg-white border-2 border-slate-50 hover:border-indigo-100 p-4 rounded-2xl transition-all shadow-sm">
                            <div class="flex justify-between items-start">
                                <div class="flex gap-3">
                                    <div class="flex flex-col items-center justify-center bg-slate-100 rounded-xl h-12 w-10 font-black text-slate-400">
                                        <span class="text-[10px]">#</span>${index + 1}
                                    </div>
                                    <div>
                                        <h4 class="font-bold text-slate-800 leading-tight">${d.nombre}</h4>
                                        <span class="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-lg font-bold ${d.tipo === 'SOCIO' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}">
                                            ${d.tipo}
                                        </span>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <p class="text-lg font-black ${esCritico ? 'text-rose-600' : 'text-indigo-600'}">
                                        $${Number(d.deudaTotal).toLocaleString()}
                                    </p>
                                    <button onclick="verHistorialFechas(${d.id}, '${d.nombre}')" class="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 uppercase tracking-tighter">
                                        Ver Detalles <i class="fas fa-chevron-right ml-1"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>

                <button onclick="window.print()" class="w-full mt-6 py-4 bg-slate-800 text-white rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg">
                    <i class="fas fa-print mr-2"></i> IMPRIMIR LISTA DE CORTE
                </button>
            </div>
        `;

        Swal.fire({
            html: htmlDeudores,
            width: '500px',
            showConfirmButton: false,
            showCloseButton: true,
            background: '#ffffff',
            customClass: {
                popup: 'rounded-[2.5rem] shadow-2xl p-4',
            }
        });

    } catch (err) {
        Swal.fire('Error', 'No se pudo conectar con los deudores', 'error');
    }
}

async function toggleDeudas() {
    const numPantalla = document.getElementById('mov_id').value;
    const tipo = document.getElementById('mov_tipo').value;
    const select = document.getElementById('mov_prestamo_id');
    const divSelector = document.getElementById('div_selector_deuda');

    const idReal = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : null;

    if (tipo === 'deuda' && idReal) {
        try {
            const res = await fetch(`/api/prestamos-activos/${idReal}`);
            const deudas = await res.json();

            if (deudas && deudas.length > 0) {
                // IMPORTANTE: Ordenamos de más antiguo a más nuevo para que el índice sea correcto
                // Si tu servidor ya los trae ordenados, no hace falta, pero esto asegura el éxito:
                const deudasOrdenadas = deudas.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
                
                const totalDeudas = deudasOrdenadas.length;

                // Generamos las opciones
                // Usamos reverse() para que el préstamo más reciente (el mayor) salga primero en la lista
                select.innerHTML = [...deudasOrdenadas].reverse().map((d, index) => {
                    const numeroConsecutivo = totalDeudas - index;
                    
                    // Aquí está el truco: 
                    // value = ID real para el servidor
                    // texto = Número amigable para ti
                    return `
                        <option value="${d.ID_Prestamo}">
                            Préstamo #${numeroConsecutivo} - Saldo: $${Number(d.SaldoActual).toLocaleString()}
                        </option>
                    `;
                }).join('');
                
                divSelector.classList.remove('hidden');
            } else {
                Swal.fire('Atención', 'Este socio no tiene deudas activas.', 'info');
                document.getElementById('mov_tipo').value = 'ahorro';
                divSelector.classList.add('hidden');
            }
        } catch (error) {
            console.error("Error cargando deudas:", error);
        }
    } else {
        divSelector.classList.add('hidden');
    }
}

async function ejecutarCruceCuentas() {
    const numPantalla = document.getElementById('mov_id').value;
    const idReal = window.mapeoIdentificadores[numPantalla];

    if (!idReal) return Swal.fire('Error', 'Ingresa un ID de pantalla válido (#1, #2...)', 'warning');

    try {
        // Consultar estado y deudas en paralelo
        const [resEstado, resDeuda] = await Promise.all([
            fetch(`/estado-cuenta/${idReal}`),
            fetch(`/detalle-prestamo/${idReal}`) // Usamos detalle-prestamo que es más completo
        ]);

        const estado = await resEstado.json();
        const deudas = await resDeuda.json();

        // Filtrar solo préstamos que tengan saldo pendiente real
        const prestamosActivos = deudas.filter(p => Number(p.SaldoActual) > 0);

        if (estado.totalAhorrado <= 0) return Swal.fire('Sin fondos', 'El socio no tiene ahorros', 'info');
        if (prestamosActivos.length === 0) return Swal.fire('Sin deuda', 'El socio no tiene deudas pendientes', 'info');

        // Tomamos el primer préstamo con deuda
        const prestamo = prestamosActivos[0];
        const saldoDeuda = Number(prestamo.SaldoActual);
        const montoACruzar = Math.min(estado.totalAhorrado, saldoDeuda);

        const { isConfirmed } = await Swal.fire({
            title: '¿Confirmar Cruce de Cuentas?',
            html: `
                <div class="text-center space-y-2">
                    <p>Ahorros: <b class="text-emerald-600">$${Number(estado.totalAhorrado).toLocaleString()}</b></p>
                    <p>Deuda actual: <b class="text-rose-600">$${saldoDeuda.toLocaleString()}</b></p>
                    <div class="bg-slate-100 p-3 rounded-xl mt-4">
                        <span class="text-xs uppercase font-bold text-slate-500">Se aplicará un pago de:</span><br>
                        <span class="text-2xl font-black text-indigo-600">$${montoACruzar.toLocaleString()}</span>
                    </div>
                </div>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aplicar cruce',
            confirmButtonColor: '#059669'
        });

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
                Swal.fire('Éxito', 'Cruce procesado correctamente', 'success');
                cargarTodo(); // Recarga dashboard y tabla
            }
        }
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
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