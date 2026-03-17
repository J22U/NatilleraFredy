# PLAN Lista de Cobro - Deuda Exacta del Historial

## 🔍 Información Recopilada
**Endpoint actual:** `/listar-miembros` → `verListaRapidaDeudores()`
**Cálculo actual:** `saldoPendiente` (aproximado)
**Objetivo:** Usar **exactamente** el `saldoHoy` del historial (`/detalle-prestamo/:id`)

**Flujo actual:**
```
Frontend → GET /listar-miembros → saldoPendiente → Lista cobro
Frontend → GET /detalle-prestamo/:id → saldoHoy → Historial individual ✓
```

## 🛠️ Plan Detallado

### 1. Modificar endpoint `/listar-miembros` (server.js)
```
ANTES: saldoPendiente = fórmula simplificada
DESPUÉS: saldoHistorico = JOIN con cálculo EXACTO de detalle-prestamo
```

### 2. Frontend sin cambios
```
verListaRapidaDeudores() sigue usando saldoPendiente 
→ Renombrar a saldoHistoricoDetallado (mismo valor que historial)
```

### 3. Query Nueva (copiar lógica de detalle-prestamo)
```
SELECT per.id, per.nombre, SUM(saldoHoy) as saldoHistoricoDetallado
FROM Personas per 
JOIN (
  SELECT ID_Persona, saldoHoy FROM detalle-prestamo-logic
) d ON per.id = d.ID_Persona
WHERE saldoHistoricoDetallado > 0
```

## 📁 Archivos a editar
- `server.js` (endpoint `/listar-miembros`)
- `public/js/main.js` (renombrar saldoPendiente → saldoHistorico)

## ⏭️ Próximos pasos
1. ✅ Leer server.js (query actual)
2. ✏️ Editar `/listar-miembros` con cálculo exacto
3. 🔄 Reiniciar servidor
4. ✅ Test lista cobro = historial

**¿Procedo con la edición?**

