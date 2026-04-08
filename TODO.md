# TODO: Fix Loan Interest Deduction Bug

## Approved Plan Steps:
- [ ] 1. Fix SQL query in server.js /detalle-prestamo/:id to compute total InteresPagado from ALL HistorialPagos 'INTERES%' (not period-specific)
- [ ] 2. Update InteresPendiente = total InteresGenerado - total InteresPagado
- [ ] 3. Update public/js/main.js renderPrestamos() to display "Int. Pagado: -$540k\n= Int. Pendiente: $144k"
- [ ] 4. Test: Refresh dashboard, check loan details show correct pending ($144k)
- [ ] 5. attempt_completion

**Status:** Starting edits...

