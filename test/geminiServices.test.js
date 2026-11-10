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

const lionPlatform = require('../services/lionPlatformClient');
lionPlatform.listProspects = async () => ({ success: true, data: [{ businessName: 'Heladería', stage: 'DEMO_AGENDADA', phone: '300' }, { businessName: 'Sin etapa' }] });
delete require.cache[require.resolve('../services/salesReportService')];
delete require.cache[require.resolve('../services/intentParser')];
const { generateSalesReport, countByStage } = require('../services/salesReportService');
const { parseIntent } = require('../services/intentParser');

test('parseIntent devuelve una intención Gemini válida', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = '```json\n{"tipo":"crear_prospecto","datos":{"nombre":"Ana"}}\n```';
  const result = await parseIntent('crea Ana');
  assert.equal(result.data.tipo, 'crear_prospecto');
});

test('parseIntent acepta publicar_post como tipo válido', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = '{"tipo":"publicar_post","datos":{"canal":"instagram","texto":"Demo del bot","imagenUrl":"https://cdn.example.com/a.jpg"}}';
  const result = await parseIntent('publica en instagram la demo del bot');
  assert.equal(result.success, true);
  assert.equal(result.data.tipo, 'publicar_post');
});

test('parseIntent acepta informe_marketing como tipo válido', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = '{"tipo":"informe_marketing","datos":{}}';
  const result = await parseIntent('dame el resumen semanal de canales');
  assert.equal(result.success, true);
  assert.equal(result.data.tipo, 'informe_marketing');
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

test('parseIntent acepta informe_redes y rechaza los tipos viejos de HubSpot', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = '{"tipo":"informe_redes","datos":{"dias":7}}';
  assert.equal((await parseIntent('informe de redes')).data.tipo, 'informe_redes');
  nextText = '{"tipo":"crear_deal","datos":{}}';
  assert.match((await parseIntent('crea un deal')).error, /estructura/);
});

test('generateSalesReport usa los prospectos de Lion Platform y maneja errores', async () => {
  process.env.GEMINI_API_KEY = 'clave';
  nextText = 'Diagnóstico útil';
  const ok = await generateSalesReport();
  assert.equal(ok.data, 'Diagnóstico útil');
  assert.deepEqual(ok.porEtapa, { DEMO_AGENDADA: 1, SIN_ETAPA: 1 });
  shouldFail = true;
  assert.match((await generateSalesReport()).error, /Gemini no disponible/);
  shouldFail = false;
  delete process.env.GEMINI_API_KEY;
  assert.match((await generateSalesReport()).error, /GEMINI_API_KEY/);
  lionPlatform.listProspects = async () => ({ success: false, error: 'Lion caído' });
  assert.equal((await generateSalesReport()).error, 'Lion caído');
  lionPlatform.listProspects = async () => ({ success: true, data: null });
  process.env.GEMINI_API_KEY = 'clave';
  assert.deepEqual((await generateSalesReport()).porEtapa, {});
});

test('countByStage agrupa por etapa', () => {
  assert.deepEqual(countByStage([{ stage: 'A' }, { stage: 'A' }, {}]), { A: 2, SIN_ETAPA: 1 });
});
