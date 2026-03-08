# TODO - Implementación de Fechas Independientes y Dashboard de Ganancias

## Análisis del Problema
- Las rifas actualmente se guardan por fecha en la base de datos (Rifas_Detalle y Rifas_Info)
- No existía sistema de seguimiento de ganancias por rifa
- No había dashboard para visualizar ganancias acumuladas

## Plan de Implementación

### 1. Base de Datos ✅ COMPLETADO
- [x] Crear tabla `Rifas_Ganancias` para almacenar ganancias por rifa
- [x] Agregar columna `FechaSorteo` como clave para identificar cada rifa

### 2. Servidor (server.js) ✅ COMPLETADO
- [x] Agregar endpoint GET `/api/ganancias-rifas` - Obtener historial de ganancias
- [x] Agregar endpoint POST `/api/ganancias-rifas` - Guardar ganancias de una rifa
- [x] Agregar endpoint GET `/api/ganancias-rifas-total` - Obtener total acumulado
- [x] La tabla se crea automáticamente al iniciar el servidor

### 3. Frontend - rifas.js ✅ COMPLETADO
- [x] Actualizar función para calcular ganancias al guardar rifa
- [x] Llamar al API para guardar ganancias automáticamente cuando se guarda una rifa

### 4. Dashboard (dashboard.html) PENDIENTE
- [ ] Crear sección de ganancias de rifas en el dashboard
- [ ] Mostrar lista de rifas con fechas y ganancias individuales
- [ ] Mostrar total acumulado de ganancias

## Resumen de Cambios Realizados

### Server.js:
- Agregados 3 nuevos endpoints de API para ganancias de rifas
- Creación automática de tabla Rifas_Ganancias al iniciar

### rifas.js:
- Corregido llamado al endpoint correcto `/api/ganancias-rifas-total`
- Nueva función `guardarGananciasRifaActual()` que calcula:
  - Total recolectado (puestos pagados × valor)
  - Costo real de premios (solo los entregados)
  - Ganancia neta = Recaudado - Costos
- Guardado automático de ganancias al guardar una rifa
- Las ganancias se acumulan por fecha de rifa

## Próximos Pasos
Para completar el dashboard de ganancias, sería necesario agregar la sección en el HTML del dashboard para mostrar el historial de rifas con sus respectivas ganancias.

