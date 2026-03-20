# FIX INTERESES PRÉSTAMOS - Natillera 🚀

## 📋 Estado: [EN PROCESO] 

### ✅ PASOS COMPLETADOS
- [✅] 1. Crear TODO.md 
- [✅] 2. **FIX `/detalle-prestamo/:id` (server.js)** → **InteresGenerado** y **saldoHoy** calculados ✓
- [ ] 3. Migración DB préstamos legacy
- [ ] 4. Dashboard "Deuda Total + Intereses"
- [ ] 5. UI detalles préstamos mejorada
- [ ] 6. Test & Validación ($800k → ~$96k intereses)

### 🔧 PASOS PENDIENTES
```
⏳ PASO 2: Migración DB (server.js / db.js)
  → UPDATE InteresPendienteAcumulado retroactivo para TODOS préstamos Activos
  
✅ PASO 3: /reporte-general
  → InteresesPendientesTotales = SUM(InteresPendienteAcumulado)
  → DeudaTotalConIntereses = CapitalPrestado + InteresesPendientesTotales
  
⏳ PASO 4: Dashboard UI
  → #dash-prestamos → "Deuda Total (capital + intereses)"

🎯 OBJETIVO: Préstamo $800k (72 días 5%) → ~$96k intereses ✓
```


### 📊 Progreso
```
PROBLEMA ORIGINAL: Int. Generado: $0 (72 días!)
OBJETIVO: ~$96.000 intereses + $896k total deuda
```

