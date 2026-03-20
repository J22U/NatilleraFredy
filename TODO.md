# Fix ModalPrestamoRapido ID Resolution Bug (ID 75 → Shows 76)

## Information Gathered
- **main.js → modalPrestamoRapido()**: preConfirm computes `idReal = window.mapeoIdentificadores[p-id.value]` correctly.
- **Bug**: Confirmation modal uses raw `formValues.idPersona` but **HTML shows raw input** (`#${formValues.idPersona}` mismatches if input was visual pos).
- **`miembrosGlobal`** array has correct `{id, nombre}` for lookup.
- Input `#p-id` accepts visual pos OR DB ID → needs resolution + name lookup.

## Plan
**Step 1: Edit public/js/main.js** (modalPrestamoRapido)
```
OLD preConfirm:
const idReal = window.mapeoIdentificadores[document.getElementById('p-id').value];
return { idPersona: idReal, ... }

NEW preConfirm:
const inputVal = document.getElementById('p-id').value;
const idReal = window.mapeoIdentificadores[inputVal] || parseInt(inputVal);
const nombreSocio = miembrosGlobal.find(m => m.id == idReal)?.nombre || `Socio #${idReal}`;
return { idPersona: idReal, nombreSocio, ... }
```

**OLD Confirmation HTML** (after formValues):
```
<span class="text-indigo-600 font-black">#${formValues.idPersona}</span>
```
**NEW**:
```
<span class="text-indigo-600 font-black">Socio: ${formValues.nombreSocio} <strong>#${formValues.idPersona}</strong></span>
```

**Step 2: Test**
- Enter 75 → Confirmation: "Socio: [RealName] #75"
- Visual pos → Resolves to real DB ID + name ✓

## Dependent Files: None

## Followup Steps
- `node server.js` → Test modal with ID 75.
- Refresh dashboard → Verify miembrosGlobal loaded.

✅ **Completed: Fixed modalPrestamoRapido ID resolution and confirmation display.**
