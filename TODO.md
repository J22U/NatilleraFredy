# TODO - Sistema de Backup y Restauración de Rifas

## Tareas completadas:
- [x] Analizar código existente
- [x] Crear plan de implementación
- [x] Obtener aprobación del usuario
- [x] Eliminar botón "Exportar PDF" de rifas.html
- [x] Agregar botones "Backup" y "Restaurar" en rifas.html
- [x] Agregar funciones de backup/restore en rifas.js

## Tareas pendientes:
- [ ] Probar la funcionalidad

---

## Notas de implementación:
- El backup se guarda en localStorage con marca de tiempo
- Incluir: info de rifa, participantes de las 4 tablas, premios
- El backup permite restaurar datos en caso de pérdida
- Se guardan hasta 20 backups como máximo

