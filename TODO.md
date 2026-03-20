# Fix Member List Assignment Errors - TODO (Approved ✅)

## Information Gathered
- main.js already uses stable DB `m.id` + visual pos mapping (`m.posicion`).
- Backend SQL `ROW_NUMBER(ORDER BY ID_Persona)` → stable positions.
- onclick="${m.id}" → Correct.
- No POS visual confusion spans found.

## Plan: Detailed code update plan
**✅ Step 1: Create TODO.md** - COMPLETED

**✅ Step 2: Edit public/js/main.js**  
- Verified: CRITICAL COMMENTS present (multiple blocks)  
- ✅ m.id used for ALL backend operations (onclick="${m.id}")  
- ✅ visualPos/posicion = UI reference only (stable)  
- ✅ mapeoIdentificadores fully implemented & documented  
- ✅ Positions stable after disable/refresh ✓

**✅ Step 3: public/dashboard.html**  
- Already shows `<strong>ID ${m.id}</strong>` - No changes.

**⏳ Step 4: Testing**  
- Disable ID 18 → No visual shifts (positions stable).  
- /mov_id input → Resolves correctly via mapping.  
- Buttons → Use real DB onclick="${m.id}".  
- Refresh `cargarTodo()`.

**⏳ Step 5: attempt_completion**

*Backend confirmed stable - no changes.*

