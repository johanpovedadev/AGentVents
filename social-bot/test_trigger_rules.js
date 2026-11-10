'use strict';
/**
 * Prueba services/triggerRules.js (lógica pura, sin red).
 * Uso: node test_trigger_rules.js
 */
const assert = require('assert');
const { findMatchingRule } = require('./services/triggerRules');

let failures = 0;
function check(cond, msg) {
    if (cond) console.log('✅', msg);
    else { failures++; console.log('❌', msg); }
}

const rules = [
    { keyword: 'precio', commentReply: 'reply-precio', dmMessage: 'dm-precio' },
    { keyword: 'info', commentReply: 'reply-info', dmMessage: 'dm-info' }
];

(() => {
    check(findMatchingRule('¿Cuál es el precio?', rules)?.commentReply === 'reply-precio', 'encuentra la regla por palabra clave exacta');
    check(findMatchingRule('PRECIOS porfa', rules)?.commentReply === 'reply-precio', 'no distingue mayúsculas/minúsculas');
    check(findMatchingRule('cuánto cuesta, necesito más ínfo', rules)?.commentReply === 'reply-info', 'ignora acentos (ínfo -> info)');
    check(findMatchingRule('me encanta esta foto', rules) === null, 'sin ninguna palabra clave, no matchea nada (nunca inventa una respuesta)');
    check(findMatchingRule('', rules) === null, 'texto vacío no matchea nada');
    check(findMatchingRule(null, rules) === null, 'texto null no revienta, devuelve null');

    // primera regla que matchea gana, orden de la lista importa
    const withOverlap = [
        { keyword: 'precio', commentReply: 'primera' },
        { keyword: 'precio del combo', commentReply: 'segunda' }
    ];
    check(findMatchingRule('precio del combo', withOverlap)?.commentReply === 'primera', 'la primera regla que matchea gana (orden de config/rules.json importa)');

    console.log(failures === 0 ? '\nTodos los tests pasaron.' : `\n${failures} FALLOS`);
    process.exitCode = failures === 0 ? 0 : 1;
})();
