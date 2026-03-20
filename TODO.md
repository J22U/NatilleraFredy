# PLAN IDs ESTABLES SOCIOS ✅ APROBADO

## Estado: Pendiente Confirmación Usuario

**Problema identificado:**
- POS visual (`#1, #2, #3`) cambia al inhabilitar socios
- `listarMiembros()` usa `index + 1` después del filtro `Estado='Activo'`

**Objetivo:**
```
Inhabilitar ID3 → POS mantiene: ID1(#1), ID2(#2), ID4(#4), ID5(#5)
```

## PASOS DEL PLAN (4 pasos)

### ✅ Paso 1 COMPLETADO: server.js
```
 /api/socios-esfuerzo → ADD: ROW_NUMBER() OVER (ORDER BY ID_Persona) as posicion
 socios = [{id:1, posicion:1}, {id:2, posicion:2}, ...]
```

### ⏳ Paso 2 PENDIENTE: main.js - Render
```
listarMiembros():
- Usar m.posicion en lugar de index+1
- "POS: ${m.posicion}" (estable)
- Badge: ID ${m.id} | POS ${m.posicion}
```

### ⏳ Paso 3 PENDIENTE: main.js - Input/Validación
```
actualizarListaDeudas(), mapeoIdentificadores:
- window.mapeoIdentificadores[m.posicion] = m.id (POS → ID estable)
```

### ⏳ Paso 4 PENDIENTE: Test + Cleanup
```
- Probar habilitar/inhabilitar socio
- Verificar POS estable en UI
- Limpiar TODO.md
```

## Archivos a editar:
```
1. server.js ✅ (Query /api/socios-esfuerzo)
2. public/js/main.js (2 ubicaciones: render + mapeo)
```

**¿Procedemos con los cambios? (Responder "SI" o sugerir modificaciones)**

