# social-bot

> Vive dentro de **AGentVents** (el agente de redes y ventas, decisión del 13 oct 2026): un solo repo para todo lo de redes. Antes era una carpeta suelta en el equipo de Johan, sin repo. Puerto **8300** (registrado en `saas-bot/config/ports.json`). Pruebas: `npm run test:social-bot` desde la raíz de AGentVents.

Bot para Instagram/Facebook: responde comentarios y mensajes directos automáticamente, y manda un DM cuando alguien comenta una palabra clave (ej: "comenta PRECIO y te escribimos por interno").

Separado de `empanadas/bot-wasap` a propósito — WhatsApp y Meta (Instagram/Facebook) usan APIs completamente distintas, no comparten transporte ni credenciales.

## Qué hace

1. **Comentario público con una palabra clave** (ver `config/rules.json`) → responde el comentario públicamente **y** manda una "respuesta privada" (DM) a quien comentó.
2. **Mensaje directo con una palabra clave** → responde por DM.
3. Si el texto no matchea ninguna regla, no hace nada — nunca inventa una respuesta.

## Lo que tienes que hacer tú (no lo puedo hacer yo)

Crear cuentas y apps es una acción a nivel de tu cuenta — igual que el login con Google de Lion Platform, esto lo tienes que hacer tú en developers.facebook.com:

1. Crea una app en [developers.facebook.com](https://developers.facebook.com/apps) (tipo "Business").
2. Conecta tu página de Facebook y tu cuenta de Instagram profesional a la app.
3. Agrega el producto **Webhooks** y suscríbete a los campos `comments` y `messages` de Instagram.
4. En la configuración del webhook, la URL será `https://<donde-lo-despliegues>/webhook`, y el "Verify Token" es cualquier texto secreto que tú inventes (ponlo también en `META_VERIFY_TOKEN` del `.env`).
5. Copia el **App Secret** (Configuración básica de la app) → `META_APP_SECRET`.
6. Genera un **Page Access Token** con permisos `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_messaging` → `META_PAGE_ACCESS_TOKEN`.
7. Con Graph API Explorer: `GET /me/accounts` para obtener el `instagram_business_account.id` → `IG_BUSINESS_ACCOUNT_ID`.

Mientras el bot corre en tu máquina (`localhost`), Meta no puede alcanzarlo — vas a necesitar un túnel público (igual que ya usas `cloudflared` para otros bots) para las pruebas, y un servidor real para producción.

## Instalar y correr

```bash
npm install
cp .env.example .env   # y llenar con los valores del paso anterior
npm start
```

## Editar las respuestas automáticas

Editar `config/rules.json` — no requiere tocar código:

```json
[
  { "keyword": "precio", "commentReply": "...", "dmMessage": "..." }
]
```

## Tests

```bash
npm test
```

Corre `test_trigger_rules.js` (lógica de palabras clave, sin red) y `test_webhook.js` (verificación de firma, parseo de eventos de Meta, y el servidor HTTP real — todo simulado, sin necesitar credenciales reales).

## Seguridad

- El webhook **falla cerrado**: sin `META_APP_SECRET` configurado, o sin la firma `X-Hub-Signature-256` de Meta validada, se rechaza con 401 antes de procesar nada.
- El bot no arranca sin `META_VERIFY_TOKEN`/`META_APP_SECRET` configurados.
