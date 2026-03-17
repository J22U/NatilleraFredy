# Task: Implementar InteresPendienteAcumulado en /procesar-movimiento (server.js)

## Plan Aprobado (User Confirmed)
- ✅ Target **server.js** only (active file)
- ✅ destinoAbono: 'capital'/'interes' (map 'INTERÉS'→'interes')
- ✅ Accumulate en `/detalle-prestamo` views + `/procesar-movimiento`
- Interest calc: `(SaldoActual * TasaInteres / 100 / 30) * diasTranscurridos` ✓ (existing)

## Pasos (3/7) ✅

### 1. [✅] Add `InteresPendienteAcumulado DECIMAL(18,2) DEFAULT 0` in `inicializarBaseDeDatos()` **DONE**
### 2. [✅] Update `/procesar-movimiento`: Calc + accumulate interesGenerado before payments **DONE**
### 3. [✅] `'capital'`: `SaldoActual -= @m`, `FechaUltimoAbonoCapital = GETDATE()` (reset) **EXISTING**
### 4. [✅] `'interes'`: `InteresesPagados += @m`, `InteresPendienteAcumulado = MAX(0, acum - @m)` **DONE**
### 5. [ ] `/detalle-prestamo/:id`: Persist accumulation before SELECT (like auto-consume anticipado)
### 6. [ ] Queries (`saldoHoy`, `listar-miembros`): `+ ISNULL(InteresPendienteAcumulado,0)`
### 7. [ ] Tests + attempt_completion

**Current:** Step 5 (persist in detalle-prestamo)
**Restart:** `node server.js`
**Verify:** Check DB `SELECT TOP 1 * FROM Prestamos` + test endpoint

