'use strict';

/**
 * Normaliza el payload (variado y anidado) que manda Meta en cada webhook a
 * una lista plana de eventos {type: 'comment'|'message', id, text, fromId}.
 * Lógica pura — así se puede probar contra payloads de ejemplo reales sin
 * levantar el servidor ni tener credenciales.
 */

function extractEvents(body) {
    const events = [];
    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
        // Comentarios (Instagram/Facebook): entry.changes[].field === 'comments'
        for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
            if (change.field === 'comments' && change.value?.id && change.value?.text) {
                events.push({
                    type: 'comment',
                    id: change.value.id,
                    text: change.value.text,
                    fromId: change.value.from?.id || null
                });
            }
        }

        // Mensajes directos: entry.messaging[].message.text
        for (const messaging of Array.isArray(entry.messaging) ? entry.messaging : []) {
            if (messaging.message?.text && messaging.sender?.id) {
                events.push({
                    type: 'message',
                    id: messaging.message.mid || null,
                    text: messaging.message.text,
                    fromId: messaging.sender.id
                });
            }
        }
    }

    return events;
}

module.exports = { extractEvents };
