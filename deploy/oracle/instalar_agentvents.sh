#!/usr/bin/env bash
# Instala/actualiza AGentVents en el servidor de Oracle. Lo llama scripts/windows/mudar_agentvents_oracle.bat
# con ~/agentvents_oracle.tgz (codigo + .env del PC). Idempotente: se puede correr las veces que haga falta.
# - La base es la del CRM en el mismo servidor (Postgres en Docker, 127.0.0.1:5432), esquema "social".
# - Lion Platform se llama por dentro (http://127.0.0.1:8081/api/v1), sin salir a internet.
set -euo pipefail
NUEVO=~/agentvents.nuevo
DEST=~/agentvents
STACK_ENV=~/lion-stack/.env

echo "== 1. Descomprimiendo"
rm -rf "$NUEVO" && mkdir -p "$NUEVO"
tar -xzf ~/agentvents_oracle.tgz -C "$NUEVO"
[ -f "$NUEVO/.env" ] || { echo "FALTA .env en el paquete"; exit 1; }

echo "== 2. Ajustando .env para el servidor"
[ -f "$STACK_ENV" ] || { echo "FALTA $STACK_ENV (primero la mudanza del CRM)"; exit 1; }
PGPASS=$(grep -E '^POSTGRES_PASSWORD=' "$STACK_ENV" | cut -d= -f2-)
[ -n "$PGPASS" ] || { echo "No encontre POSTGRES_PASSWORD"; exit 1; }
poner() { # poner CLAVE VALOR: reemplaza o agrega la linea en el .env
  local k=$1 v=$2 f="$NUEVO/.env"
  grep -v -E "^$k=" "$f" > "$f.tmp" || true
  printf '%s=%s\n' "$k" "$v" >> "$f.tmp" && mv "$f.tmp" "$f"
}
poner DATABASE_URL "postgresql://postgres:${PGPASS}@127.0.0.1:5432/lionplatform"
poner DATABASE_SSL false
poner LION_PLATFORM_BASE_URL "http://127.0.0.1:8081/api/v1"
chmod 600 "$NUEVO/.env"

echo "== 3. Dependencias"
(cd "$NUEVO" && npm ci --omit=dev --no-audit --no-fund >/dev/null)

echo "== 4. Migraciones del esquema social"
(cd "$NUEVO" && node scripts/migrate.js)

echo "== 5. Cambio de version (la anterior queda en ~/agentvents.anterior)"
pm2 delete agentvents-seguimientos agentvents-ventas agentvents-marketing agentvents-redes-metricas agentvents-redes-mensajes >/dev/null 2>&1 || true
rm -rf ~/agentvents.anterior
[ -d "$DEST" ] && mv "$DEST" ~/agentvents.anterior
mv "$NUEVO" "$DEST"
rm -f ~/agentvents_oracle.tgz

echo "== 6. Tareas en PM2"
cd "$DEST"
# Solo se registran: cada una corre a su hora (cron_restart). Se paran ya para que no corran ahora mismo.
pm2 start deploy/oracle/ecosystem.oracle.config.js >/dev/null
pm2 stop agentvents-seguimientos agentvents-ventas agentvents-marketing agentvents-redes-metricas agentvents-redes-mensajes >/dev/null
pm2 save >/dev/null
pm2 ls | grep -E "agentvents|name"

echo "== 7. Prueba: login en el CRM y lectura de la base"
node -e "
require('dotenv').config();
const db = require('./services/social/db');
(async () => {
  const r = await fetch(process.env.LION_PLATFORM_BASE_URL + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.LION_EMAIL, password: process.env.LION_PASSWORD }) });
  console.log('CRM login:', r.status);
  const m = await db.query('SELECT count(*)::int AS n FROM social.schema_migrations');
  console.log('Migraciones social:', m[0].n);
  process.exit(r.status === 200 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
"
echo LISTO_AGENTVENTS
