const test = require('node:test');
const assert = require('node:assert/strict');

let nextText = '{"tipo":"generar_informe","datos":{}}';
let shouldFail = false;
const geminiPath = require.resolve('@google/generative-ai');
require.cache[geminiPath] = {
  id: geminiPath,
  filename: geminiPath,
  loaded: true,
  exports: {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return { generateContent: async () => {
          if (shouldFail) throw new Error('Gemini no disponible');
          return { response: { text: () => nextText } };
        } };
      }
    }
  }
};

const hubspotPath = require.resolve('../services/hubspotClient');
const hubspot = require(hubspotPath);
hubspot.getDeals = async () => ({ success: true, data: { results: [{ id: '1' }] } });
delete require.cache[require.resolve('../services/reportService')];
delete require.cache[require.resolve('../services/intentParser')];
const { generateSalesReport } = require('../services/reportService');
const { parseIntent } = require('../services/intentParser');

test('parseIntent devuelve una intención Gemini válida', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = '```json\n{"tipo":"crear_contacto","datos":{"firstname":"Ana"}}\n```';
  const result = await parseIntent('crea Ana');
  assert.equal(result.data.tipo, 'crear_contacto');
});

test('parseIntent valida texto, clave, JSON y estructura', async () => {
  assert.equal((await parseIntent('')).success, false);
  delete process.env.GEMINI_API_KEY;
  assert.equal((await parseIntent('hola')).success, false);
  process.env.GEMINI_API_KEY = 'clave';
  nextText = 'no es json';
  assert.match((await parseIntent('hola')).error, /interpretar/);
  nextText = '{"tipo":"otro","datos":{}}';
  assert.match((await parseIntent('hola')).error, /estructura/);
});

test('generateSalesReport usa deals y maneja errores de Gemini', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = 'Diagnóstico útil';
  assert.equal((await generateSalesReport()).data, 'Diagnóstico útil');
  shouldFail = true;
  assert.match((await generateSalesReport()).error, /Gemini no disponible/);
  shouldFail = false;
});
