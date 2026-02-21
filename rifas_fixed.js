// Función para actualizar un premio
function actualizarPremio(numeroTabla, campo, valor) {
    console.log('🔄 actualizarPremio llamado:', numeroTabla, campo, valor);
    
    const key = `tabla${numeroTabla}`;
    console.log('🔑 Key:', key);
    
    if (campo === 'numero') {
        // Validar que sea un número de 2 dígitos
        valor = valor.replace(/[^0-9]/g, '').substring(0, 2);
        const inputEl = document.getElementById(`premio-numero-${numeroTabla}`);
        if (inputEl) inputEl.value = valor;
    }
    
    // Mapear nombres de campos para compatibilidad
    if (campo === 'numero') {
        datosPremios[key].numeroGanador = valor;
    } else if (campo === 'nombre') {
        datosPremios[key].nombreGanador = valor;
    } else {
        datosPremios[key][campo] = valor;
    }
    
    console.log('💾 datosPremios actualizado:', datosPremios);
    
    // Actualizar estilos visuales
    renderizarPanelPremios();
    
    // Guardar en el servidor
    console.log('📤 Llamando a guardarPremiosEnRifa...');
    guardarPremiosEnRifa();
}
