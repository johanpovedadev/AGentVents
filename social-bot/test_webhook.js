'use strict';
/**
 * Prueba de extremo a extremo: verificación de firma, parseo de eventos, y
 * el servidor HTTP real (verify handshake + rechazo de webhooks sin firma
 * válida + el flujo completo de un comentario disparando la respuesta
 * correcta, con metaApi reemplazado por un doble de prueba — así no se
 * necesitan credenciales reales de Meta para correr esto).
 * Uso: node test_webhook.js
 */
const assert = require('assert');
const http = require('http');
const crypto = require('crypto');

process.env.META_VERIFY_TOKEN = '__test_verify_token__';
process.env.META_APP_SECRET = '__test_app_secret__';
process.env.PORT = '8299';

const { isValidSignature } = require('./services/webhookSecurity');
const { extractEvents } = require('./services/eventParser');
const metaApi = require('./services/metaApi');
const { app, handleEvent } = require('./index');

let failures = 0;
function check(cond, msg) {
    if (cond) console.log('✅', msg);
    else { failures++; console.log('❌', msg); }
}

function sign(body, secret) {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function request(method, urlPath, { headers, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({ hostname: 'localhost', port: 8299, path: urlPath, method, headers }, (res) => {
            let raw = '';
            res.on('data', (c) => raw += c);
            res.on('end', () => resolve({ status: res.statusCode, body: raw }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

(async () => {
    let server;
    try {
        // --- webhookSecurity (lógica pura) ---
        const secret = 'shh';
        const rawBody = Buffer.from('{"hello":"world"}');
        const validSig = sign(rawBody, secret);
        check(isValidSignature(rawBody, validSig, secret) === true, 'una firma correcta valida');
        check(isValidSignature(rawBody, 'sha256=deadbeef', secret) === false, 'una firma incorrecta se rechaza');
        check(isValidSignature(rawBody, validSig, '') === false, 'sin APP_SECRET configurado, se rechaza (fail-closed)');
        check(isValidSignature(rawBody, null, secret) === false, 'sin header de firma, se rechaza');

        // --- eventParser (lógica pura) ---
        const commentPayload = { entry: [{ changes: [{ field: 'comments', value: { id: 'c1', text: 'qué precio tiene', from: { id: 'u1' } } }] }] };
        const events1 = extractEvents(commentPayload);
        check(events1.length === 1 && events1[0].type === 'comment' && events1[0].id === 'c1', 'extractEvents reconoce un comentario');

        const messagePayload = { entry: [{ messaging: [{ sender: { id: 'u2' }, message: { text: 'hola', mid: 'm1' } }] }] };
        const events2 = extractEvents(messagePayload);
        check(events2.length === 1 && events2[0].type === 'message' && events2[0].fromId === 'u2', 'extractEvents reconoce un mensaje directo');

        check(extractEvents({}).length === 0, 'un payload vacío no revienta, devuelve []');
        check(extractEvents({ entry: [{ changes: [{ field: 'likes' }] }] }).length === 0, 'ignora campos que no son comentarios ni mensajes');

        // --- handleEvent con metaApi reemplazado (doble de prueba) ---
        const calls = [];
        metaApi.replyToComment = async (id, msg) => { calls.push(['replyToComment', id, msg]); return { ok: true }; };
        metaApi.sendPrivateReplyToComment = async (id, msg) => { calls.push(['sendPrivateReplyToComment', id, msg]); return { ok: true }; };
        metaApi.sendDirectMessage = async (id, msg) => { calls.push(['sendDirectMessage', id, msg]); return { ok: true }; };

        await handleEvent({ type: 'comment', id: 'c1', text: '¿cuál es el precio?', fromId: 'u1' });
        check(calls.some(c => c[0] === 'replyToComment' && c[1] === 'c1'), 'un comentario con palabra clave dispara la respuesta pública');
        check(calls.some(c => c[0] === 'sendPrivateReplyToComment' && c[1] === 'c1'), 'y también el DM privado disparado por el comentario');

        calls.length = 0;
        await handleEvent({ type: 'comment', id: 'c2', text: 'qué linda foto', fromId: 'u3' });
        check(calls.length === 0, 'un comentario sin ninguna palabra clave no dispara nada');

        // --- servidor HTTP real ---
        server = app.listen(8299);
        await new Promise((r) => setTimeout(r, 150));

        let res = await request('GET', '/webhook?hub.mode=subscribe&hub.verify_token=__test_verify_token__&hub.challenge=1234');
        check(res.status === 200 && res.body === '1234', 'el handshake de verificación de Meta responde el challenge cuando el token coincide');

        res = await request('GET', '/webhook?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=1234');
        check(res.status === 403, 'un token de verificación incorrecto se rechaza con 403');

        const payload = JSON.stringify({ entry: [] });
        res = await request('POST', '/webhook', { headers: { 'Content-Type': 'application/json' }, body: payload });
        check(res.status === 401, 'un POST /webhook sin firma válida se rechaza con 401, nunca se procesa');

        const validPayload = JSON.stringify(commentPayload);
        res = await request('POST', '/webhook', {
            headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(validPayload, process.env.META_APP_SECRET) },
            body: validPayload
        });
        check(res.status === 200, 'un POST /webhook con firma válida se acepta');

        console.log(failures === 0 ? '\nTodos los tests pasaron.' : `\n${failures} FALLOS`);
        process.exitCode = failures === 0 ? 0 : 1;
    } catch (e) {
        console.error('Test failed:', e.stack || e.message);
        process.exitCode = 1;
    } finally {
        try { server && server.close(); } catch (_) {}
        setTimeout(() => process.exit(process.exitCode || 0), 100);
    }
})();
