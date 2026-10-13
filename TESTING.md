# Pruebas

## Pruebas automáticas

```bash
pnpm test
```

Corre todas las pruebas con el runner nativo de Node (`node --test`) y exige 80 % de cobertura en líneas, funciones y ramas. Es lo mismo que corre `ci.yml` en cada PR.

- No llaman a ninguna red real: `fetch`, Gemini, Postgres y Lion Platform se reemplazan por dobles.
- `test/social/fakeDb.js` es una base falsa que registra cada consulta, para verificar qué SQL se ejecuta.
- `test/integration/` encadena los módulos reales (intención → agente → servicio → aviso) y solo simula la frontera externa.

Casos que cubren el multi-tenant y las licencias:
- `test/licenseService.test.js`: tenant activo con producto, sin producto, SUSPENDED, desconocido, y Lion Platform caído (falla cerrado).
- `test/social/collector.test.js`: el recolector no toca la red para tenants sin `SOCIAL` ni suspendidos.
- `test/social/accountService.test.js`: no se registran cuentas sin licencia.
- `test/social/socialReportService.test.js`: sin licencia no se consulta la base.

## Prueba contra Postgres real (antes de subir cambios de SQL)

```bash
# Postgres local en el puerto 55432, sin SSL
export DATABASE_URL='postgresql://postgres@localhost:55432/postgres'
export DATABASE_SSL=false
pnpm migrate      # aplica migraciones
pnpm migrate      # segunda vez: no debe hacer nada
```

Luego se puede correr el recolector con conectores simulados para comprobar:
- que dos corridas el mismo día no dupliquen fotos;
- que un tenant suspendido no se recolecte.

## Prueba manual del agente

```bash
node scripts/runAgent.js "dame el informe de redes de esta semana"
node scripts/runAgent.js "dame las acciones de mejora del embudo de esta semana"
```

Sin `--auto`, crear un prospecto o publicar queda pendiente de aprobación y llega el aviso a Telegram.
