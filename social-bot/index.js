'use strict';

require('dotenv').config();

const express = require('express');
const { isValidSignature } = require('./services/webhookSecurity');
const { extractEvents } = require('./services/eventParser');
const { findMatchingRule } = require('./services/triggerRules');
const metaApi = require('./services/metaApi');

const PORT = Number(process.env.PORT || 8300);
const VERIFY_TOKEN = String(process.env.META_VERIFY_TOKEN || '').trim();
const APP_SECRET = String(process.env.META_APP_SECRET || '').trim();

const app = express();

// Se necesita el body CRUDO (antes de parsear JSON) para poder validar la
// firma X-Hub-Signature-256 — por eso el verify callback guarda una copia.
app.use(express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; }
}));

function log(...args) {
    console.log(`[${new Date().toISOString()}]`, ...args);
}

/**
 * Paso 1 de Meta: al configurar el webhook en el panel de la app, Meta hace
 * un GET con hub.verify_token — si coincide con META_VERIFY_TOKEN, se
 * devuelve hub.challenge tal cual para confirmar que el endpoint es tuyo.
 */
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
        log('Webhook verificado por Meta.');
        res.status(200).send(challenge);
        return;
    }
    log('Verificación de webhook rechazada — token no coincide.');
    res.sendStatus(403);
});

/**
 * Paso 2: eventos reales (comentarios, mensajes). Fail-closed: sin
 * APP_SECRET configurado, o con una firma que no valida, se rechaza sin
 * procesar nada — nunca se confía en un webhook sin verificar quién lo mandó.
 */
app.post('/webhook', async (req, res) => {
    if (!isValidSignature(req.rawBody, req.headers['x-hub-signature-256'], APP_SECRET)) {
        log('Webhook rechazado — firma inválida o APP_SECRET no configurado.');
        res.sendStatus(401);
        return;
    }

    // Responder rápido — Meta reintenta si no hay 200 pronto. El
    // procesamiento real sigue después, sin bloquear la respuesta.
    res.sendStatus(200);

    const events = extractEvents(req.body);
    for (const event of events) {
        try {
            await handleEvent(event);
        } catch (e) {
            log('Error procesando evento:', event.type, e.message);
        }
    }
});

async function handleEvent(event) {
    const rule = findMatchingRule(event.text);
    if (!rule) {
        log(`Sin regla para ${event.type} "${event.text}" — no se responde nada.`);
        return;
    }

    if (event.type === 'comment') {
        if (rule.commentReply) {
            const result = await metaApi.replyToComment(event.id, rule.commentReply);
            log('Respuesta al comentario', event.id, result.ok ? 'OK' : `FALLÓ: ${result.error}`);
        }
        if (rule.dmMessage) {
            const result = await metaApi.sendPrivateReplyToComment(event.id, rule.dmMessage);
            log('DM privado por comentario', event.id, result.ok ? 'OK' : `FALLÓ: ${result.error}`);
        }
        return;
    }

    if (event.type === 'message' && rule.dmMessage) {
        const result = await metaApi.sendDirectMessage(event.fromId, rule.dmMessage);
        log('Respuesta a mensaje directo', event.fromId, result.ok ? 'OK' : `FALLÓ: ${result.error}`);
    }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

if (require.main === module) {
    if (!VERIFY_TOKEN || !APP_SECRET) {
        console.error('Falta META_VERIFY_TOKEN o META_APP_SECRET en .env — el bot no arranca sin eso (fail-closed). Ver README.md.');
        process.exit(1);
    }
    // Regla del ecosistema (17 oct 2026): puerto registrado en saas-bot/config/ports.json (8300). Si está ocupado,
    // mensaje claro y salida 78 (PM2 no reintenta) en vez de caerse en bucle.
    const server = app.listen(PORT, () => log(`social-bot escuchando en http://localhost:${PORT}`));
    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.error(`❌ El puerto ${PORT} ya está en uso: social-bot NO arrancó. Revisa: node scripts/check-ports.js (repo saas-bot)`);
            process.exit(78);
        }
        throw err;
    });
}

module.exports = { app, handleEvent };
