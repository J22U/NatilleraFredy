# TODO - Auto-guardar nueva rifa

## Task
Hacer que cuando se cree una nueva rifa, se guarde automáticamente sin necesidad de presionar el botón "Guardar".

## Steps

- [x] 1. Analizar el código actual de rifas.js
- [ ] 2. Modificar crearNuevaRifa() para auto-guardar
- [ ] 3. Modificar cargarRifaSeleccionada() para manejar "-- Nueva Rifa --"
- [ ] 4. Probar la implementación

## Implementation

### Changes to public/js/rifas.js:

1. **crearNuevaRifa()**: After creating the rifa locally, call guardarTodo() automatically
2. **cargarRifaSeleccionada()**: Handle empty value to trigger crearNuevaRifa()
3. Add loading indicator during auto-save

