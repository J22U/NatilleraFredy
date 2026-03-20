# Corrección Abono → Número Préstamo Correcto

**Estado:** 🚀 Iniciado

## ✅ Plan Aprobado
**Archivo:** `public/js/main.js`  
**Función:** `renderAbonosDetallados()`  
**Problema:** Muestra ID DB crudo (#47) vs secuencial detalles (#1)  
**Fix:** `numeroAmigable = indicePrestamo + 1` (ya calculado)

## ✅ Pasos Completados
- ✅ **1. Editar main.js** → `numeroAmigable = indicePrestamo + 1`
- ✅ **2. Verificado** → Lógica correcta (mantiene botones edit/delete)

**Resultado:** ✅ "Aplicado a: Préstamo #1" ahora coincide con detalles préstamo.

**Estado:** 🔄 Nueva mejora solicitada

# 🆕 Tarea 2: Mostrar préstamos PAGADOS

**Estado:** 🚀 Pendiente

## 📋 Pasos:
- ✅ **1. Editar server.js** → Remover `AND p.Estado = 'Activo'` ✅ `/detalle-prestamo/:id` ahora devuelve TODOS
- ✅ **2. Verificado** → Frontend renderiza pagados con "✅ PAGADO" automáticamente
- ✅ **3. Completado** → Historial completo (activos + pagados)

**Estado:** 🏁 COMPLETADO

