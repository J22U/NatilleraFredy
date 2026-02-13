// DECLARACIÓN GLOBAL
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
window.mapeoIdentificadores = {};
let miembrosGlobal = []; 

function cargarTodo() { cargarDashboard(); listarMiembros(); }
document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('current-date').innerText = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            cargarTodo();
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
    // 1. Mostrar carga inicial
    Swal.fire({
        title: 'Cargando datos...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        // 2. Peticiones al servidor
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

        // 3. Definir los Renders (deben estar DENTRO para usar las variables)
        const renderSimple = (data, key, color) => {
            if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin movimientos</p>';
            return data.map(m => `
                <div class="flex justify-between p-2 border-b border-white/50 text-[11px]">
                    <span class="text-slate-500 font-medium">${m.FechaFormateada || m.FechaPrestamo || 'S/F'}</span>
                    <span class="font-bold text-${color}-600">$${Number(m[key] || 0).toLocaleString()}</span>
                </div>
            `).join('');
        };

        const renderPrestamos = (data) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin préstamos</p>';
    
    return data.map((m, index) => {
        const saldo = Number(m.SaldoActual || 0);
        const interes = Number(m.MontoInteres || 0);
        const capital = Number(m.MontoPrestado || 0);
        const tasa = m.TasaInteres || 5; // Por defecto 5% si no existe
        const cuotas = m.Cuotas || 1;
        
        // El monto total es Capital + Interés
        const montoTotal = capital + interes;
        const estaPago = saldo <= 0 || m.Estado === 'Pagado';
        
        return `
        <div class="p-2 mb-2 rounded-xl border ${estaPago ? 'bg-emerald-100 border-emerald-200' : 'bg-blue-50 border-blue-100'}">
            <div class="flex justify-between items-center text-[11px]">
                <span class="font-black text-indigo-600">PRÉSTAMO #${index + 1}</span>
                <span class="${estaPago ? 'text-emerald-700' : 'text-slate-500'} font-bold">
                    ${estaPago ? '✅ PAGADO' : '📅 ' + (m.FechaPrestamo || 'S/F')}
                </span>
            </div>

            <div class="flex gap-2 my-1">
                <span class="bg-white/60 px-2 py-0.5 rounded text-[9px] font-bold text-slate-500 border border-slate-200">
                    <i class="fas fa-percentage mr-1"></i>Tasa: ${tasa}%
                </span>
                <span class="bg-white/60 px-2 py-0.5 rounded text-[9px] font-bold text-slate-500 border border-slate-200">
                    <i class="fas fa-calendar-alt mr-1"></i>Plazo: ${cuotas} cuota(s)
                </span>
            </div>

            <div class="flex justify-between items-end mt-2">
                 <div class="flex flex-col">
                    <span class="text-[8px] uppercase font-black text-slate-400">Total a devolver</span>
                    <span class="text-[12px] font-black text-slate-700">$${montoTotal.toLocaleString()}</span>
                    <span class="text-[8px] text-slate-400">(Cap: $${capital.toLocaleString()} + Int: $${interes.toLocaleString()})</span>
                 </div>
                ${!estaPago ? `
                    <div class="text-right">
                        <span class="text-[8px] text-rose-500 font-black uppercase">Saldo Pendiente</span>
                        <div class="text-[14px] text-rose-600 font-black leading-none">$${saldo.toLocaleString()}</div>
                    </div>` : ''}
            </div>
        </div>`;
    }).join('');
};

const renderAbonosDetallados = (data) => {
    if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin abonos</p>';
    return data.map(m => `
        <div class="p-2 border-b border-white/50 text-[11px]">
            <div class="flex justify-between">
                <span class="text-slate-500 font-medium">${m.FechaFormateada}</span>
                <span class="font-bold text-rose-600">+$${Number(m.Monto_Abonado).toLocaleString()}</span>
            </div>
            <div class="text-[9px] text-slate-400 italic">
                Aplicado a préstamo de: $${Number(m.PrestamoRef || 0).toLocaleString()}
            </div>
        </div>
    `).join('');
};

Swal.fire({
            title: `<span class="text-xl font-black">${nombre}</span>`,
            html: `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-emerald-50 p-2 rounded-xl text-center border border-emerald-100">
                        <p class="text-[8px] uppercase font-bold text-emerald-600">Total Ahorrado</p>
                        <p class="font-black text-emerald-700 text-sm">$${Number(totales.totalAhorrado || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-rose-50 p-2 rounded-xl text-center border border-rose-100">
                        <p class="text-[8px] uppercase font-bold text-rose-600">Deuda Total</p>
                        <p class="font-black text-rose-700 text-sm">$${Number(totales.deudaTotal || 0).toLocaleString()}</p>
                    </div>
                </div>
                <div class="text-left space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                    <div>
                        <h5 class="text-[9px] font-black uppercase text-emerald-500 mb-1 ml-1">💰 Historial de Ahorros</h5>
                        <div class="rounded-xl bg-emerald-50/50 p-1">${renderSimple(a, 'Monto', 'emerald')}</div>
                    </div>
                    <div>
                        <h5 class="text-[9px] font-black uppercase text-blue-500 mb-1 ml-1">🚀 Préstamos Detallados</h5>
                        <div class="rounded-xl bg-slate-50 p-1">${renderPrestamos(p)}</div>
                    </div>
                    <div>
                        <h5 class="text-[9px] font-black uppercase text-rose-500 mb-1 ml-1">📉 Abonos realizados</h5>
                        <div class="rounded-xl bg-rose-50/50 p-1">${renderAbonosDetallados(ab)}</div>
                    </div>
                </div>`,
            showDenyButton: true,
            confirmButtonText: 'Cerrar',
            denyButtonText: '📥 Descargar PDF',
            denyButtonColor: '#059669',
            confirmButtonColor: '#64748b'
        }).then((result) => {
            if (result.isDenied) {
                generarPDFMovimientos(nombre, a, p, ab, totales);
            }
        });

    } catch (e) {
        console.error("Error en el historial:", e);
        Swal.fire('Error', 'No se pudo cargar la información. Verifica la consola.', 'error');
    }
}

const renderAbonosDetallados = (data) => {
            if (!data || data.length === 0) return '<p class="text-center py-2 text-slate-300 text-[10px] italic">Sin abonos</p>';
            return data.map(m => `
                <div class="p-2 border-b border-white/50 text-[11px]">
                    <div class="flex justify-between">
                        <span class="text-slate-500 font-medium">${m.FechaFormateada}</span>
                        <span class="font-bold text-rose-600">+$${Number(m.Monto_Abonado).toLocaleString()}</span>
                    </div>
                    <div class="text-[9px] text-slate-400 italic">
                        Aplicado a préstamo de: $${Number(m.PrestamoOriginal || 0).toLocaleString()}
                    </div>
                </div>
            `).join('');
        };

        // 5. Mostrar el Modal
        Swal.fire({
            title: `<span class="text-xl font-black">${nombre}</span>`,
            html: `
                <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-emerald-50 p-2 rounded-xl text-center border border-emerald-100">
                        <p class="text-[8px] uppercase font-bold text-emerald-600 leading-tight">Total Ahorrado</p>
                        <p class="font-black text-emerald-700 text-sm">$${Number(totales.totalAhorrado).toLocaleString()}</p>
                    </div>
                    <div class="bg-rose-50 p-2 rounded-xl text-center border border-rose-100">
                        <p class="text-[8px] uppercase font-bold text-rose-600 leading-tight">Deuda Total</p>
                        <p class="font-black text-rose-700 text-sm">$${Number(totales.deudaTotal).toLocaleString()}</p>
                    </div>
                </div>
                <div class="text-left space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                    <div>
                        <h5 class="text-[9px] font-black uppercase text-emerald-500 mb-1 ml-1">💰 Historial de Ahorros</h5>
                        <div class="rounded-xl bg-emerald-50/50 p-1">${renderSimple(a, 'Monto', 'emerald')}</div>
                    </div>
                    <div>
                        <h5 class="text-[9px] font-black uppercase text-blue-500 mb-1 ml-1">🚀 Préstamos Detallados</h5>
                        <div class="rounded-xl bg-slate-50 p-1">${renderPrestamos(p)}</div>
                    </div>
                    <div>
                        <h5 class="text-[9px] font-black uppercase text-rose-500 mb-1 ml-1">📉 Abonos realizados</h5>
                        <div class="rounded-xl bg-rose-50/50 p-1">${renderAbonosDetallados(ab)}</div>
                    </div>
                </div>`,
            showDenyButton: true,
            confirmButtonText: 'Cerrar',
            denyButtonText: '📥 Descargar PDF',
            denyButtonColor: '#059669',
            confirmButtonColor: '#64748b'
        }).then((result) => {
            if (result.isDenied) {
                generarPDFMovimientos(nombre, a, p, ab, totales);
            }
        });

        async function registrarMovimiento() {
    const numPantalla = document.getElementById('mov_id').value;
    const montoInput = document.getElementById('mov_monto');
    const monto = parseFloat(montoInput.value);
    const tipo = document.getElementById('mov_tipo').value;
    const selectDeuda = document.getElementById('mov_prestamo_id');
    const idReal = window.mapeoIdentificadores[numPantalla];

    if (!idReal || isNaN(monto)) return Toast.fire({ icon: 'warning', title: 'Faltan datos' });

    if (tipo === 'deuda') {
        if (!selectDeuda.value) return Toast.fire({ icon: 'error', title: 'Selecciona una deuda' });
        
        // VALIDACIÓN: No permitir más del saldo actual
        const saldoMaximo = parseFloat(selectDeuda.options[selectDeuda.selectedIndex].getAttribute('data-saldo'));
        if (monto > saldoMaximo) {
            return Swal.fire({
                icon: 'error',
                title: 'Monto excedido',
                text: `No puedes abonar $${monto.toLocaleString()} porque la deuda actual es de $${saldoMaximo.toLocaleString()}.`
            });
        }
    }

        apiCall('/procesar-movimiento', { 
        idPersona: idReal, 
        monto: monto, 
        tipoMovimiento: tipo,
        idPrestamo: tipo === 'deuda' ? selectDeuda.value : null
    }, "Movimiento procesado correctamente");

    // Limpiar campos
    document.getElementById('mov_id').value = ''; 
    montoInput.value = '';
    montoInput.placeholder = "Monto $";
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

    // 1. ENCABEZADO ELEGANTE
    doc.setFillColor(99, 102, 241); // Color Indigo
    doc.rect(0, 0, 210, 40, 'F');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("EXTRACTO DE CUENTA", 14, 20);
    doc.setFontSize(10);
    doc.text("SISTEMA DE GESTIÓN NATILLERA PRO", 14, 28);

    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(`CLIENTE: ${nombre.toUpperCase()}`, 120, 20);
    doc.text(`FECHA: ${fechaDoc}`, 120, 28);

    // 2. RESUMEN DE TOTALES (Caja de impacto)
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

    // 3. TABLA DE AHORROS (Verde)
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text("1. DETALLE DE AHORROS", 14, doc.lastAutoTable.finalY + 12);
    
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['#', 'Fecha de Aporte', 'Monto Ahorrado']],
        body: ahorros.map((item, index) => [
            index + 1,
            item.FechaFormateada || 'S/F',
            `$ ${Number(item.Monto).toLocaleString()}`
        ]),
        headStyles: { fillStyle: [16, 185, 129] },
        styles: { fontSize: 9 }
    });

    // 4. TABLA DE PRÉSTAMOS (Azul) - Incluye Tasa y Cuotas
    doc.setFontSize(12);
    doc.setTextColor(59, 130, 246);
    doc.text("2. DETALLE DE PRÉSTAMOS", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['ID', 'Fecha', 'Tasa', 'Cuotas', 'Monto Total', 'Saldo Pendiente', 'Estado']],
        body: prestamos.map((item, index) => {
            const capital = Number(item.MontoPrestado || 0);
            const interes = Number(item.MontoInteres || 0);
            const totalConInteres = capital + interes;
            const saldo = Number(item.SaldoActual || 0);

            return [
                `#${index + 1}`,
                item.FechaPrestamo || 'S/F',
                `${item.TasaInteres || 5}%`,
                item.Cuotas || 1,
                `$ ${totalConInteres.toLocaleString()}`,
                `$ ${saldo.toLocaleString()}`,
                item.Estado.toUpperCase()
            ];
        }),
        headStyles: { fillStyle: [59, 130, 246] },
        styles: { fontSize: 8 }
    });

    // 5. TABLA DE ABONOS (Rojo/Rosa) - Con referencia corregida
    doc.setFontSize(12);
    doc.setTextColor(244, 63, 94);
    doc.text("3. HISTORIAL DE PAGOS A DEUDA", 14, doc.lastAutoTable.finalY + 12);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['Fecha de Pago', 'Valor del Abono', 'Referencia del Préstamo']],
        body: abonos.map(i => {
            // Usamos PrestamoRef o PrestamoOriginal dependiendo de lo que envíe tu servidor
            const ref = i.PrestamoRef || i.PrestamoOriginal || 0;
            return [
                i.FechaFormateada, 
                `$ ${Number(i.Monto_Abonado).toLocaleString()}`,
                `Aplicado a préstamo de $${Number(ref).toLocaleString()}`
            ];
        }),
        headStyles: { fillStyle: [244, 63, 94] }, 
        styles: { fontSize: 9 }
    });

    // PIE DE PÁGINA
    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Este documento es un extracto informativo generado por Natillera Pro.", 14, finalY);
    doc.text("Verifique sus movimientos periódicamente.", 14, finalY + 4);

    // Guardar el archivo
    doc.save(`Extracto_${nombre.replace(/\s+/g, '_')}_${fechaDoc.replace(/\//g, '-')}.pdf`);
}

async function cargarPrestamosEnSelector(idPersona) {
    const selector = document.getElementById('tu_id_del_selector_de_prestamos'); // Ajusta el ID
    selector.innerHTML = '<option value="">Cargando préstamos...</option>';

    try {
        const res = await fetch(`/prestamos-activos/${idPersona}`);
        const prestamos = await res.json();

        selector.innerHTML = '<option value="">Seleccione un préstamo</option>';
        
        if (prestamos.length === 0) {
            selector.innerHTML = '<option value="">Sin préstamos activos</option>';
            return;
        }

        prestamos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.ID_Prestamo;
            // Esto hará que se vea como en tu foto: "Préstamo #21 (Saldo: $200.000)"
            option.textContent = `Préstamo #${p.ID_Prestamo} (Saldo: $${p.SaldoActual.toLocaleString()})`;
            selector.appendChild(option);
        });
    } catch (error) {
        console.error("Error al cargar préstamos:", error);
    }
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
    const numPantalla = document.getElementById('mov_id').value; // El # de la fila
    const tipo = document.getElementById('mov_tipo').value;
    const select = document.getElementById('mov_prestamo_id');
    const divSelector = document.getElementById('div_selector_deuda');

    // 1. Usamos el mapeo que creaste en listarMiembros
    const idReal = window.mapeoIdentificadores ? window.mapeoIdentificadores[numPantalla] : null;

    if (tipo === 'deuda' && idReal) {
        try {
            console.log("Buscando deudas para Socio ID Real:", idReal);
            const res = await fetch(`/prestamos-activos/${idReal}`);
            const deudas = await res.json();

            if (deudas.length > 0) {
                // Llenamos el select con el saldo que viene del servidor
                select.innerHTML = deudas.map(d => `
                    <option value="${d.ID_Prestamo}">
                        Préstamo #${d.ID_Prestamo} - Saldo: $${d.SaldoActual.toLocaleString()}
                    </option>
                `).join('');
                divSelector.classList.remove('hidden');
            } else {
                select.innerHTML = '<option value="">Este socio no tiene deudas activas</option>';
                divSelector.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Error al cargar deudas:", error);
        }
    } else {
        // Si no es tipo deuda o no hay ID, ocultamos el selector
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