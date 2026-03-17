# TODO.md - Plan de Implementación: Fix /procesar-movimiento para Préstamos

## Plan Aprobado (Confirmado por Usuario)

**PLAN APROBADO. Procede con la implementación en server.js y la creación del TODO.md.**

## Información Recopilada (de server.js y db.js)
- Endpoint: `app.post('/procesar-movimiento')` maneja abonos a deuda con `destinoAbono`
- DB: Tabla `Prestamos` tiene `InteresPendienteAcumulado DECIMAL(18,2) DEFAULT 0`
- Cálculo: `DATEDIFF(DAY, ISNULL(FechaUltimoAbonoCapital, FechaInicio), @fAporte)`
- Capital payments: UPDATE incluye `FechaUltimoAbonoCapital = @fAporte`
- Default case: Deduce de `InteresPendienteAcumulado` con CASE WHEN (@acum - @m) < 0
- ISNULL(InteresPendienteAcumulado, 0) ya implementado para socios legacy (ej. Jorge)

## Pasos de Implementación (Estado Actual)

### ✅ Paso 1: Crear TODO.md con plan detallado [COMPLETADO]
### ✅ Paso 2: Aplicar edits precisos a server.js con edit_file (multiple diffs) [COMPLETADO]
  - ✅ Fix variable refs (`interesGeneradoHoy → interesGenerado`)
  - ✅ Enhance default case UPDATE con @acum
  - ✅ Confirm capital UPDATE tiene `FechaUltimoAbonoCapital = @fAporte`
  - ✅ Asegurar ISNULL en todas las queries

### ✅ Paso 3: Verificar frontend `/detalle-prestamo/:id` usa ISNULL(InteresPendienteAcumulado, 0) [COMPLETADO]

### ⬜ Paso 4: Test endpoint con curl + fecha manual (ayer)
```
curl -X POST http://localhost:3000/procesar-movimiento -H "Content-Type: application/json" -d '{"idPersona":1,"monto":1000,"tipoMovimiento":"deuda","idPrestamo":1,"destinoAbono":"capital","fechaManual":"2024-12-10"}'
```

### ⬜ Paso 5: Verificar DB: `SELECT * FROM Prestamos WHERE ID_Prestamo=1`
- InteresPendienteAcumulado > 0 después de capital payment
- FechaUltimoAbonoCapital = fecha del pago

### ⬜ Paso 6: Update TODO.md con [x] y attempt_completion

## Dependencias Editadas
- **server.js** (principal): /procesar-movimiento endpoint

## Follow-up (Post-edits)
1. **npm install** (si nuevas deps)
2. **node server.js** (restart)
3. **Test UI**: Dashboard → Abono deuda → Capital con fecha manual → Ver detalle préstamo
4. **DB Query**: `SELECT InteresPendienteAcumulado, FechaUltimoAbonoCapital FROM Prestamos WHERE ID_Prestamo=1`

**Estado: Listo para edits precisos → Proceed with edit_file**

