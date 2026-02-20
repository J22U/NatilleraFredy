// DECLARACIÓN GLOBAL
// DECLARACIÓN GLOBAL
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
window.mapeoIdentificadores = {};
let miembrosGlobal = []; 
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
        document.getElementById('dash-prestamos').innerText = `$ ${Number(data.CapitalPrestado || 0).toLocaleString()}`;
        document.getElementById('dash-ganancia').innerText = `$ ${Number(data.GananciasBrutas || 0).toLocaleString()}`;
        
        // ESTA ES LA LÍNEA QUE TE FALTA:
        document.getElementById('dash-caja').innerText = `$ ${Number(data.CajaDisponible || 0).toLocaleString()}`;
        
    } catch (err) { console.error(err); }
}
        async function listarMiembros() {
    try {
        const res = await fetch('/api/socios-esfuerzo');
        if (!res.ok) throw new Error("Error en servidor");
        
        miembrosGlobal = await res.json(); 
        
        const tbody = document.getElementById('tabla-recientes');
        tbody.innerHTML = '';
        window.mapeoIdentificadores = {}; 

        let cAhorro = 0, cExtra = 0;
        const totalMiembros = miembrosGlobal.length;

        [...miembrosGlobal].reverse().forEach((m, index) => {
            const numPantalla = totalMiembros - index;
            window.mapeoIdentificadores[numPantalla] = m.id; 

            // m.tipo ahora viene calculado desde el servidor como 'SOCIO' o 'EXTERNO'
            const esSocioReal = (m.tipo === 'SOCIO'); 
            esSocioReal ? cAhorro++ : cExtra++;

            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors item-socio">
                    <td class="px-8 py-5 font-black text-indigo-500 text-xl">#${m.id}</td>
                    <td class="px-8 py-5">
                        <div class="font-semibold text-slate-700 nombre-socio text-lg">${m.nombre}</div>
                        <div class="text-[10px] text-slate-400 uppercase tracking-tighter">
                            DOC: ${m.documento} | 
                            <span class="${esSocioReal ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'} px-2 py-0.5 rounded-full font-black text-[9px] ml-2">
                                ${m.tipo}
                            </span>
                        </div>
                    </td>
                    <td class="px-8 py-5 text-center">
                        <div class="flex justify-center gap-3 items-center">
                            <button onclick="verHistorialFechas(${m.id}, '${m.nombre}')" class="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">Resumen</button>
                            <button onclick="abrirModalRetiro(${m.id}, '${m.nombre}')" class="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 hover:text-white transition-all flex items-center gap-2">
                                <i class="fas fa-hand-holding-usd"></i> Retirar
                            </button>
                            <button onclick="editarSocio(${m.id}, '${m.nombre}', '${m.documento}', '${m.tipo}')" class="text-amber-500 p-2"><i class="fas fa-pen"></i></button>
                            <button onclick="cambiarEstadoSocio(${m.id}, '${m.nombre}', 'Activo')" class="text-slate-400 p-2 hover:text-orange-500 hover:scale-110 transition-all" title="Inhabilitar Socio">
                                <i class="fas fa-user-slash"></i>
                            </button>
                            <button onclick="eliminarSocio(${m.id})" class="text-rose-400 p-2 hover:scale-110 transition-transform"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>`;
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
        const fetchSeguro = async (url) => {
            const res = await fetch(url);
            if (!res.ok) return [];
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) return [];
            return await res.json();
        };

        const [a, p, ab, totales] = await Promise.all([
            fetchSeguro(`/historial-ahorros/${id}`),
            fetchSeguro(`/detalle-prestamo/${id}`),
            fetchSeguro(`/historial-abonos-deuda/${id}`),
            fetchSeguro(`/estado-cuenta/${id}`)
        ]);

        // --- CORRECCIÓN DE DEUDA DINÁMICA ---
        // Recalculamos la deuda total sumando (Capital + Interés - Pagado) de cada préstamo activo
        const deudaRealActualizada = p.reduce((acc, m) => {
            const cap = Number(m.MontoPrestado || 0);
            const int = Number(m.InteresGenerado || m.MontoInteres || 0);
            const pag = Number(m.MontoPagado || 0);
            const saldo = (cap + int) - pag;
            return acc + (saldo > 0 ? saldo : 0);
        }, 0);

        // Actualizamos el objeto totales para que el modal use el valor con intereses
        totales.deudaTotal = deudaRealActualizada;

        const renderSimple = (data, key, color) => {
            if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin movimientos</p>';
            return data.map(m => {
                const esRetiro = Number(m[key]) < 0;
                const colorFinal = esRetiro ? 'rose' : color;
                return `
                <div class="flex justify-between items-center p-3 border-b border-slate-100 text-[11px]">
                    <div class="flex flex-col">
                        <span class="text-slate-500 font-medium">${m.FechaFormateada || 'S/F'}</span>
                        <span class="text-[9px] font-black uppercase ${esRetiro ? 'text-rose-400' : 'text-indigo-400'} mt-0.5">${m.Detalle || 'Ahorro'}</span>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-${colorFinal}-600">${esRetiro ? '' : '+'}$${Math.abs(Number(m[key])).toLocaleString()}</span>
                    </div>
                </div>`;
            }).join('');
        };

        const renderPrestamos = (data) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin préstamos</p>';
    
    return data.map((m, index) => {
        const interesGenerado = Number(m.InteresGenerado || m.MontoInteres || 0);
        const capitalOriginal = Number(m.MontoPrestado || 0);
        const montoPagado = Number(m.MontoPagado || 0);
        const saldoCalculado = (capitalOriginal + interesGenerado) - montoPagado;
        const estaPago = m.Estado === 'Pagado' || saldoCalculado <= 0;
        
        // CORRECCIÓN: Usamos nullish coalescing o validamos que no sea undefined
        const dias = m.diasActivo !== undefined ? m.diasActivo : m.DiasTranscurridos;

        return `
        <div class="p-3 mb-3 rounded-2xl border ${estaPago ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-100'} shadow-sm">
            <div class="flex justify-between items-center mb-2">
                <span class="text-[10px] font-black text-indigo-600 bg-white px-2 py-0.5 rounded-full shadow-sm">PRÉSTAMO #${index + 1}</span>
                <span class="text-[10px] ${estaPago ? 'text-emerald-700' : 'text-slate-500'} font-bold">
                    ${estaPago ? '✅ PAGADO' : '📅 ' + (m.FechaInicioFormateada || m.FechaPrestamo || 'S/F')}
                </span>
            </div>

            <div class="flex flex-wrap gap-2 mb-3">
                <span class="bg-white/60 text-[9px] font-bold text-slate-600 px-2 py-1 rounded-lg border border-slate-200">
                    <i class="fas fa-percentage mr-1 text-indigo-400"></i>Int: ${m.TasaInteres}%
                </span>
                
                ${(dias !== undefined && dias !== null) ? `
                <span class="bg-indigo-100 text-[9px] font-black text-indigo-700 px-2 py-1 rounded-lg border border-indigo-200 ${dias > 0 ? 'animate-pulse' : ''}">
                    <i class="fas fa-clock mr-1"></i>${dias} DÍAS ACTIVOS
                </span>` : ''}
            </div>

            <div class="grid grid-cols-2 gap-2 border-t border-slate-200/50 pt-2">
                <div class="flex flex-col text-left">
                    <span class="text-[8px] uppercase font-black text-slate-400 leading-tight">Capital Inicial</span>
                    <span class="text-[13px] font-black text-slate-800">$${capitalOriginal.toLocaleString()}</span>
                    <span class="text-[7px] text-rose-400 font-bold">Int. Acumulado: $${interesGenerado.toLocaleString()}</span>
                </div>
                
                ${!estaPago ? `
                <div class="flex flex-col text-right">
                    <span class="text-[8px] uppercase font-black text-rose-500 leading-tight">Saldo Total Hoy</span>
                    <span class="text-[15px] font-black text-rose-600 tracking-tighter">$${Math.max(0, saldoCalculado).toLocaleString()}</span>
                </div>` : `
                <div class="text-right text-emerald-600 font-black text-[10px] pt-2">COMPLETADO</div>`}
            </div>
        </div>`;
    }).join('');
};

        const renderAbonosDetallados = (data, listaPrestamos) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin abonos realizados</p>';
    
    const prestamosSeguros = Array.isArray(listaPrestamos) ? listaPrestamos : [];
    const prestamosOrdenados = [...prestamosSeguros].sort((a, b) => new Date(a.FechaInicio) - new Date(b.FechaInicio));
    
    return data.map(m => {
        const indicePrestamo = prestamosOrdenados.findIndex(p => String(p.ID_Prestamo) === String(m.ID_Prestamo));
        const numeroAmigable = indicePrestamo !== -1 ? (indicePrestamo + 1) : 'Ref';
        
        // --- LÓGICA DE DESTINO ---
        // Asumimos que m.MesesCorrespondientes contiene "Abono a CAPITAL" o "Abono a INTERES"
        // o que tienes un campo directo m.Destino
        const esCapital = String(m.MesesCorrespondientes || m.Detalle || '').toLowerCase().includes('capital');
        const colorBadge = esCapital ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
        const textoDestino = esCapital ? 'CAPITAL' : 'INTERÉS';

        return `
            <div class="p-2 border-b border-slate-100 text-[11px]">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-slate-500 font-medium">${m.FechaFormateada || 'S/F'}</span>
                        <p class="text-[9px] text-indigo-500 font-bold uppercase mt-0.5">Aplicado a: Préstamo #${numeroAmigable}</p>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-rose-600 block">-$${Number(m.Monto_Abonado || m.Monto || 0).toLocaleString()}</span>
                        <span class="inline-block px-1.5 py-0.5 rounded text-[7px] font-black uppercase mt-1 ${colorBadge}">
                            ${textoDestino}
                        </span>
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
        console.error("Error crítico en historial:", e);
        Swal.fire('Error', 'Error al procesar los datos del servidor.', 'error');
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
    // Capturamos la fecha manual que agregamos al HTML
    const fechaManual = document.getElementById('mov_fecha_manual')?.value || new Date().toISOString().split('T')[0];

    const radioDestino = document.querySelector('input[name="destinoAbono"]:checked');
    const destinoAbono = radioDestino ? radioDestino.value : 'interes'; 

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
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="swal-input-label"># Socio en pantalla</label>
                        <input id="p-id" type="number" class="swal-custom-input" placeholder="Ej: 1, 2...">
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
            const idReal = window.mapeoIdentificadores[document.getElementById('p-id').value];
            const monto = parseFloat(document.getElementById('p-m').value);
            const tasa = parseFloat(document.getElementById('p-tasa').value);
            const fecha = document.getElementById('p-fecha').value;

            if (!idReal) return Swal.showValidationMessage(`Socio no encontrado`);
            if (!monto || monto <= 0) return Swal.showValidationMessage(`Monto inválido`);
            if (!tasa || tasa <= 0) return Swal.showValidationMessage(`Tasa inválida`);
            if (!fecha) return Swal.showValidationMessage(`Seleccione una fecha`);
            
            return { 
                idPersona: idReal, 
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
        // Ajusta la URL según tu backend
        apiCall('/registrar-prestamo-diario', formValues, "Préstamo dinámico registrado");
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

    // 4. SECCIÓN: PRÉSTAMOS
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235); // Blue 600
    doc.text("2. ESTADO DE CRÉDITOS ACTIVOS", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['REF', 'Fecha Inicio', 'Tasa', 'Capital Inicial', 'Int. Pend.', 'Saldo Hoy']],
        body: prestamos.map(p => {
            const intPendiente = Number(p.InteresGenerado || 0);
            const capitalRestante = Number(p.MontoPrestado) - Number(p.MontoPagado || 0);
            const saldoTotal = capitalRestante + intPendiente;
            
            return [
                `PR-${p.ID_Prestamo}`,
                p.FechaInicioFormateada || 'S/F',
                `${p.TasaInteres}%`,
                `$ ${Number(p.MontoPrestado).toLocaleString('es-CO')}`,
                `$ ${intPendiente.toLocaleString('es-CO')}`,
                `$ ${Math.max(0, saldoTotal).toLocaleString('es-CO')}`
            ];
        }),
        headStyles: { fillStyle: [59, 130, 246] },
        styles: { fontSize: 8 },
        columnStyles: { 
            3: { halign: 'right' }, 
            4: { halign: 'right' }, 
            5: { halign: 'right', fontStyle: 'bold', textColor: [185, 28, 28] } 
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
        const miembros = await res.json();
        
        // LOG DE DEPURACIÓN: Abre la consola (F12) para ver qué llega
        console.log("Datos recibidos del servidor:", miembros);

        // Filtramos asegurando que el saldo sea tratado como número
        const deudores = miembros
            .filter(m => {
                const saldo = Number(m.saldoPendiente);
                return !isNaN(saldo) && saldo > 0;
            })
            .sort((a, b) => Number(b.saldoPendiente) - Number(a.saldoPendiente));

        if (deudores.length === 0) {
            return Swal.fire({
                title: '¡Cuentas Limpias!',
                text: 'No hay saldos pendientes detectados en la base de datos.',
                icon: 'success',
                confirmButtonColor: '#10b981'
            });
        }

        const totalCartera = deudores.reduce((sum, m) => sum + Number(m.saldoPendiente), 0);

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
                <div class="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                    ${deudores.map((d, index) => `
                        <div class="bg-white border-2 border-slate-50 p-4 rounded-2xl shadow-sm">
                            <div class="flex justify-between items-center">
                                <div>
                                    <h4 class="font-bold text-slate-800">${d.nombre}</h4>
                                    <p class="text-[10px] text-slate-400">${d.documento || ''}</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-lg font-black text-indigo-600">$${Number(d.saldoPendiente).toLocaleString()}</p>
                                    <button onclick="verHistorialFechas(${d.id}, '${d.nombre}')" class="text-[10px] font-bold text-indigo-400 uppercase">Ver Detalles</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        Swal.fire({ html: htmlDeudores, width: '500px', showConfirmButton: false, showCloseButton: true });

    } catch (err) {
        console.error("Error cargando deudores:", err);
        Swal.fire('Error', 'Error de conexión', 'error');
    }
}

async function toggleDeudas() {
    const numPantalla = document.getElementById('mov_id').value;
    const tipo = document.getElementById('mov_tipo').value;
    const select = document.getElementById('mov_prestamo_id');
    const divSelector = document.getElementById('div_selector_deuda');

    // 1. Limpieza del ID: Aseguramos que idReal sea solo el número antes de los dos puntos
    let idValue = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : null;
    
    // Si el id viene como "2:1", tomamos solo el "2"
    const idReal = idValue && String(idValue).includes(':') ? idValue.split(':')[0] : idValue;

    if (tipo === 'deuda' && idReal) {
        try {
            const res = await fetch(`/api/prestamos-activos/${idReal}`);
            
            // 2. Verificación de respuesta: Si el servidor devuelve 404 o error, no intentar leer JSON
            if (!res.ok) {
                throw new Error(`Servidor respondió con estado ${res.status}`);
            }

            const deudas = await res.json();

            if (deudas && Array.isArray(deudas) && deudas.length > 0) {
                const deudasOrdenadas = deudas.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
                const totalDeudas = deudasOrdenadas.length;

                select.innerHTML = [...deudasOrdenadas].reverse().map((d, index) => {
                    const numeroConsecutivo = totalDeudas - index;
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
            // 3. Feedback visual: Si hay error 404, informar al usuario
            divSelector.classList.add('hidden');
            Swal.fire('Error', 'No se pudieron obtener las deudas. Verifique que el ID sea correcto.', 'error');
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

    if (!idReal || !monto || !tasa) {
        return Swal.fire('Error', 'Completa todos los campos', 'error');
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

        const { isConfirmed } = await Swal.fire({
            title: 'Reparto Proporcional de Utilidades',
            html: listaHTML,
            width: '550px',
            showCancelButton: true,
            confirmButtonText: 'Confirmar y Aplicar',
            cancelButtonText: 'Cerrar',
            confirmButtonColor: '#059669',
        });

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
function generarPDFVistaPreviaIntereses() {
    const data = window.datosRepartoTemporal;
    if (!data) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fecha = new Date().toLocaleDateString();

    doc.setFontSize(18);
    doc.text("REPORTE DE DISTRIBUCIÓN DE INTERESES", 14, 22);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Natillera - Ciclo Fiscal ${new Date().getFullYear()}`, 14, 30);
    doc.text(`Fecha de generación: ${fecha}`, 14, 35);

    const columnas = ["SOCIO", "AHORRO BASE", "INTERÉS (10%)", "NUEVO SALDO"];
    const filas = data.socios.map(s => [
        s.nombre,
        `$${s.saldoAnterior.toLocaleString()}`,
        `$${s.interes.toLocaleString()}`,
        `$${(s.saldoAnterior + s.interes).toLocaleString()}`
    ]);

    doc.autoTable({
        startY: 45,
        head: [columnas],
        body: filas,
        theme: 'striped',
        headStyles: { fillColor: [5, 150, 105] }, // Color verde emerald
        foot: [["TOTALES", "", `$${data.total.toLocaleString()}`, ""]],
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.save(`Reparto_Intereses_${new Date().getFullYear()}.pdf`);
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
