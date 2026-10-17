'use strict';

/**
 * Llamadas reales a la Graph API de Meta (Instagram/Facebook) — responder un
 * comentario público, mandar la "respuesta privada" a quien comentó (el
 * mecanismo real de "comenta X y te escribo por interno"), y mandar un DM
 * directo dentro de una conversación ya abierta. Nunca lanza — degrada a
 * {ok:false} para que el webhook nunca se caiga por un fallo de Meta.
 */

const axios = require('axios');

const GRAPH_API_BASE = process.env.META_GRAPH_API_BASE || 'https://graph.facebook.com/v21.0';

function getAccessToken() {
    return String(process.env.META_PAGE_ACCESS_TOKEN || '').trim();
}

async function replyToComment(commentId, message) {
    const token = getAccessToken();
    if (!token) return { ok: false, error: 'missing_access_token' };
    try {
        await axios.post(`${GRAPH_API_BASE}/${commentId}/replies`, null, {
            params: { message, access_token: token },
            timeout: 8000
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.response?.data?.error?.message || e.message };
    }
}

/**
 * "Respuesta privada" a un comentario — la forma soportada por Meta de
 * mandar un DM disparado por un comentario público (ventana de tiempo
 * limitada tras el comentario, por regla de Meta, no de este código).
 */
async function sendPrivateReplyToComment(commentId, message) {
    const token = getAccessToken();
    if (!token) return { ok: false, error: 'missing_access_token' };
    try {
        await axios.post(`${GRAPH_API_BASE}/${commentId}/private_replies`, { message }, {
            params: { access_token: token },
            timeout: 8000
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.response?.data?.error?.message || e.message };
    }
}

/** DM dentro de una conversación ya abierta (el cliente ya le escribió al negocio). */
async function sendDirectMessage(recipientId, message) {
    const token = getAccessToken();
    const igUserId = String(process.env.IG_BUSINESS_ACCOUNT_ID || '').trim();
    if (!token || !igUserId) return { ok: false, error: 'missing_credentials' };
    try {
        await axios.post(`${GRAPH_API_BASE}/${igUserId}/messages`, {
            recipient: { id: recipientId },
            message: { text: message }
        }, {
            params: { access_token: token },
            timeout: 8000
        });
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.response?.data?.error?.message || e.message };
    }
}

module.exports = { replyToComment, sendPrivateReplyToComment, sendDirectMessage };
