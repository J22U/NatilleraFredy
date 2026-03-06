# TODO - Implementar Abonos Anticipados a Intereses

## Objetivo
Permitir realizar abonos a los intereses de los préstamos por adelantado, mostrando el saldo de adelanto en el detalle del préstamo y descontando automáticamente a medida que se generan intereses.

## Pasos Completados ✅

### 1. Backend (server.js) ✅
- [x] La lógica de cálculo de interés ya considera automáticamente el interés anticipado (ya estaba implementado)
- [x] La columna InteresAnticipado existe en la base de datos

### 2. Frontend - Interfaz (dashboard.html) ✅
- [x] Agregada nueva opción de radiobutton: "Anticipado" en la sección de abonos a deuda
- [x] Cambiado el layout de 2 columnas a 3 columnas para los botones de destino
- [x] Agregado estilo CSS para el color del botón seleccionado (ámbar)

### 3. Frontend - Lógica (main.js) ✅
- [x] Actualizada la función `actualizarInfoInteres()` para manejar el nuevo tipo de destino
- [x] Cuando se selecciona "Anticipado", el placeholder del monto cambia a "Monto a adelantar"
- [x] No se muestra la validación de monto máximo para intereses anticipados (permite flexibilidad)
- [x] El detalle del préstamo ya muestra el "Interés Anticipado" cuando existe un saldo

---

## Cómo Funciona:

1. **Registro de Abono Anticipado:**
   - En la sección "Abono a Deuda", selecciona "Anticipado" como destino
   - El sistema permite cualquier cantidad (sin límite de interés pendiente)
   - Se registra en el historial como "Abono a INTERESANTICIPADO"

2. **Cálculo Automático:**
   - El sistema diariamente descuenta del anticipado a medida que genera intereses
   - El saldo del anticipado se muestra en el detalle del préstamo
   - El interés pendiente se calcula: Interés Generado - Intereses Pagados - Interés Anticipado

3. **Visualización:**
   - En "Préstamos Detallados" se muestra el valor de "Interés Anticipado" cuando existe
   - El saldo total se actualiza automáticamente considerando el anticipado

