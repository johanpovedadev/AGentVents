'use strict';

/**
 * Verificación de firma de los webhooks de Meta (X-Hub-Signature-256) — sin
 * esto, cualquiera que adivine la URL del webhook podría mandar eventos
 * falsos (comentarios/mensajes inventados) y hacer que el bot responda cosas
 * no autorizadas. Falla cerrado: sin APP_SECRET configurado, o sin firma
 * válida, se rechaza (ver index.js).
 */

const crypto = require('crypto');

function isValidSignature(rawBody, signatureHeader, appSecret) {
    if (!appSecret || !signatureHeader || !rawBody) return false;
    const match = /^sha256=([0-9a-f]+)$/i.exec(String(signatureHeader).trim());
    if (!match) return false;

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const provided = match[1].toLowerCase();

    // Comparación en tiempo constante — evita filtrar la firma correcta por
    // cuánto tarda en fallar la comparación (timing attack).
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { isValidSignature };
