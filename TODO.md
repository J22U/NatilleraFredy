# FIXED STABLE POS IDs - TODO.md PROGRESS TRACKER

## Current Status
✅ Paso 1: Backend `/api/socios-esfuerzo` returns stable `posicion` (ROW_NUMBER by ID_Persona)

⏳ Paso 2: main.js - Verify/Enhance render with data-socio-id="${m.id}"

⏳ Paso 3: main.js - Ensure mapeoIdentificadores rebuilt on filter/search + all ops use DB ID

✅ Paso 4a: Backend `/listar-miembros` uses per.ID_Persona as id

## Pending Steps
### 1. Add data-socio-id to cards/table rows in listarMiembros()
### 2. Update filtrarSocios() to rebuild mapeo post-filter
### 3. Test: Inhabilitate ID75 → verify POS stable, input '75' → correct préstamo
### 4. Clear this TODO.md

**Next: Edit main.js → test → complete**
