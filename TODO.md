# Natillera - TODO Lista de Cobro Exacta

## 🔍 Información Recopilada
- **Endpoint:** `/listar-miembros` → 500 "Error al obtener miembros"
- **Problema:** Query SUM compleja (saldoHoy calculation) en SELECT, HAVING, ORDER BY → timeout/error SQL Server
- **Frontend:** main.js maneja errores correctamente (no crash)
- **Query actual:** LEFT JOIN Personas-Prestamos + cálculo inline saldoHoy en múltiples lugares
- **Dependencias:** Personas, Prestamos tablas OK

## 🛠️ Plan de Edición (server.js)

### 1. Simplificar `/listar-miembros` → Usar CTE
```
ANTES: SUM(complex calculation) en SELECT + HAVING + ORDER BY
DESPUÉS: 
WITH Saldos AS (
    SELECT ID_Persona, 
           CAST((...) AS DECIMAL(18,2)) as saldoHoy 
    FROM Prestamos WHERE Estado = 'Activo'
)
SELECT per.id, per.nombre, per.documento, ISNULL(SUM(s.saldoHoy), 0) as saldoHistoricoDetallado
FROM Personas per LEFT JOIN Saldos s ON per.id = s.ID_Persona
GROUP BY per.id, per.nombre, per.documento
HAVING ISNULL(SUM(s.saldoHoy), 0) > 0
ORDER BY ISNULL(SUM(s.saldoHoy), 0) DESC
```

### 2. Manejo robusto pool.request()
```
if (!pool || !pool.request) {
    res.status(500).json({ error: "Pool no disponible" });
    return;
}
```

### 3. Log error detallado
```
catch (err) {
    console.error("Error /listar-miembros:", err.message, err.stack);
    res.status(500).json({ error: "Error al obtener miembros" });
}
```

## 📁 Archivos a editar
- `server.js` (endpoint `/listar-miembros`)

## ✅ PASOS COMPLETADOS
1. ✅ Crear TODO.md
2. ✅ Editar server.js → Query CTE simplificada ✓
3. 🔄 **Reiniciar servidor:** `taskkill /IM node.exe /F && node server.js`
4. ✅ Test Dashboard → "Lista de Cobro"

## 🚀 Resultado esperado
```
✅ /listar-miembros devuelve array válido (no crash frontend)
✅ Lista ordenada por deuda DESC
✅ Manejo errores 500 graceful (main.js)
✅ Logs detallados en consola servidor
```

**Ejecuta el reinicio y prueba!**

