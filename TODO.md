# Plan de Corrección - Abono a Capital/Interés

## Problema
Cuando se realiza un abono al capital y existe interés, el sistema está abonando al interés en lugar del capital.

## Causa Raíz
1. **Server.js**: La lógica usa `else` que captura cualquier valor que no sea 'capital', incluyendo undefined/null
2. **Edición de pagos**: No permite cambiar el tipo de abono (capital/interés)

## Tareas a Realizar

### 1. Corregir lógica de procesar-movimiento en server.js ✅
- [x] Cambiar la condición `else` por validación explícita para 'interes'
- [x] Manejar caso cuando destinoAbono es undefined/null
- [x] Agregar logs de debug para verificar valores recibidos

### 2. Corregir lógica de editar-pago-deuda en server.js ✅
- [x] Revisar y corregir la lógica de actualización de interesespagados
- [x] Ahora consulta el registro original para comparar si cambió el tipo (capital <-> interes)

### 3. Verificar cliente (main.js) ✅
- [x] El valor de destinoAbono ya se envía correctamente al servidor

### 4. Mostrar Capital Hoy en detalle de préstamo ✅
- [x] El servidor calcula `capitalHoy = MontoPrestado - MontoPagado`
- [x] El frontend muestra el capital pendiente después de abonos

## Cambios Realizados

### server.js
- Agregado log de debug en `procesar-movimiento` para ver qué valores llegan
- Validación explícita para destinoAbono === 'capital' vs 'interes'
- El cálculo de capitalHoy: `MontoPrestado - ISNULL(MontoPagado, 0)`

### public/js/main.js
- La función renderPrestamos ya muestra:
  - Capital Inicial
  - Abonos a Capital (si hay)
  - Interés Acumulado
  - Capital Hoy
  - Saldo Total Hoy
