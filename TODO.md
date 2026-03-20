# NATILLERRA - FIX INTERESES PRÉSTAMOS ✅ PROGRESS

## 📋 STEPS BREAKDOWN (Approved Plan)

### ✅ COMPLETED
- [✅] Duplicate var fixed in main.js (numeroAmigable)
- [✅] /detalle-prestamo/:id dynamic calcs ✓ (saldoHoy, InteresGenerado)
- [✅] /reporte-general returns InteresesPendientesTotales + DeudaTotalConIntereses ✓

### 🔄 IN PROGRESS - MIGRATION
1. [✅] **ADD /api/migrar-intereses-legacy** (server.js)
   ```
   curl -X POST http://localhost:3000/api/migrar-intereses-legacy
   ```
   → Populate InteresPendienteAcumulado retroactively (SAFE: skip if >0)

2. [✅] **ADD /api/test-interes-800k** (server.js)
   → Create $800k@5% 72d loan → verify ~$96k interests

3. [✅] **UPDATE dashboard.html**
   → Show \"Deuda Total (Capital + Intereses): $X\" prominently (#dash-prestamos label added)

### 🧪 TESTING
```
$800k préstamo (5%, 72 días):
- Capital Pendiente: $800,000
- Intereses Generados: ~$96,000  
- Total Deuda: ~$896,000 ✓
```

### 📊 EXECUTE ORDER
```
1. npm start (ensure columns exist via init)
2. curl POST /api/migrar-intereses-legacy  
3. Check dashboard totals
4. Test /api/test-interes-800k
5. ✅ Mark complete
```

**Next: Edit server.js → Migration endpoint**

