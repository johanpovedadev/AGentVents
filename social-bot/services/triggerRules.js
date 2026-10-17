'use strict';

/**
 * Reglas de palabra clave -> respuesta, para comentarios de Instagram/
 * Facebook ("si comentan tal cosa, responde/envía tal otra"). Lógica pura,
 * sin llamadas de red, para poder probarla sin credenciales reales de Meta.
 */

const fs = require('fs');
const path = require('path');

const RULES_PATH = process.env.SOCIAL_RULES_PATH || path.join(__dirname, '..', 'config', 'rules.json');

function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function loadRules() {
    try {
        if (!fs.existsSync(RULES_PATH)) return [];
        const parsed = JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * Primera regla cuya palabra clave aparece en el texto (insensible a
 * mayúsculas/acentos). null si ninguna coincide — nunca se inventa una
 * respuesta para algo que no matcheó ninguna regla.
 */
function findMatchingRule(text, rules = loadRules()) {
    if (!text) return null;
    const normalized = stripAccents(text).toLowerCase();
    return rules.find(rule => rule.keyword && normalized.includes(stripAccents(rule.keyword).toLowerCase())) || null;
}

module.exports = { loadRules, findMatchingRule, stripAccents };
