# Plan de Fix - Duplicación de Rifas al Crear Nueva

## Problema identificado
Cuando se crea una rifa nueva, aparece una con el nombre y entre paréntesis "nueva" y otra con el mismo nombre. Al refrescar, aparece solo una con el nombre y la fecha.

## Causa raíz
En la función `crearNuevaRifa()`, cuando se crea una nueva rifa:
1. Se limpia el `idRifaActual` (se pone en null)
2. Se llama a `crearRifaVacia()` que crea tablas vacías
3. Se llama a `guardarTodo()` para auto-guardar
4. El servidor retorna un nuevo ID
5. **BUG**: El código intenta agregar una nueva opción al selector, pero no verifica si ya existe una opción con valor "nuevo" o si hay opciones duplicadas

## Solución
1. Modificar la función `guardarTodo` modificada para verificar si ya existe una opción "nueva" en el selector y actualizarla en lugar de agregar una nueva.
2. Agregar verificación para evitar rifas duplicadas en el selector.

## Pasos de implementación
- [x] 1. Revisar la función guardarTodo para encontrar dónde se agrega la opción al selector
- [x] 2. Modificar para actualizar la opción existente en lugar de crear una nueva
- [x] 3. Verificar que no haya duplicados al cargar la lista de rifas

## Fix completado
Se modificó la función `guardarTodo` para que cuando se crea una nueva rifa:
1. Busque si ya existe una opción con valor "nuevo" o "nueva" en el selector
2. Si existe, actualice esa opción con el nuevo ID del servidor en lugar de crear una nueva opción
3. Esto evita que aparezcan dos rifas (una con "(Nueva)" y otra sin él)

