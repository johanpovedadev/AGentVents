const test = require('node:test');
const assert = require('node:assert/strict');

const MODULE_PATH = require.resolve('../services/metaPublisher');

/** Recarga el módulo para que cada test controle sus propias variables de entorno. */
function freshPublisher() {
  delete require.cache[MODULE_PATH];
  return require('../services/metaPublisher');
}

function withEnv(vars, fn) {
  const previous = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test('publishToFacebook publica texto y enlace en la Página configurada', () => withEnv(
  { FB_PAGE_ID: '111', FB_PAGE_ACCESS_TOKEN: 'token-fb' },
  async () => {
    const publisher = freshPublisher();
    let calledUrl;
    let calledBody;
    global.fetch = async (url, options) => {
      calledUrl = url;
      calledBody = options.body;
      return { ok: true, status: 200, json: async () => ({ id: '111_222' }) };
    };
    const result = await publisher.publishToFacebook({ texto: 'Automatiza tu WhatsApp', enlace: 'https://lioncore.co' });
    assert.equal(calledUrl, 'https://graph.facebook.com/v21.0/111/feed');
    assert.equal(calledBody.get('message'), 'Automatiza tu WhatsApp');
    assert.equal(calledBody.get('link'), 'https://lioncore.co');
    assert.equal(calledBody.get('access_token'), 'token-fb');
    assert.deepEqual(result, { success: true, data: { id: '111_222' } });
  }
));

test('publishToFacebook exige texto', () => withEnv(
  { FB_PAGE_ID: '111', FB_PAGE_ACCESS_TOKEN: 'token-fb' },
  async () => {
    const publisher = freshPublisher();
    const result = await publisher.publishToFacebook({});
    assert.equal(result.success, false);
    assert.match(result.error, /Se requiere texto/);
  }
));

test('publishToFacebook reporta un error de configuración cuando falta el token', () => withEnv(
  { FB_PAGE_ID: '111', FB_PAGE_ACCESS_TOKEN: '' },
  async () => {
    const publisher = freshPublisher();
    const result = await publisher.publishToFacebook({ texto: 'hola' });
    assert.equal(result.success, false);
    assert.match(result.error, /FB_PAGE_ACCESS_TOKEN/);
  }
));

test('publishToFacebook reporta un error de la Graph API', () => withEnv(
  { FB_PAGE_ID: '111', FB_PAGE_ACCESS_TOKEN: 'token-fb' },
  async () => {
    const publisher = freshPublisher();
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'token inválido' } }) });
    const result = await publisher.publishToFacebook({ texto: 'hola' });
    assert.equal(result.success, false);
    assert.match(result.error, /token inválido/);
  }
));

test('publishToInstagram crea el contenedor y luego lo publica', () => withEnv(
  { IG_BUSINESS_ACCOUNT_ID: '999', FB_PAGE_ACCESS_TOKEN: 'token-ig' },
  async () => {
    const publisher = freshPublisher();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: options.body });
      if (url.endsWith('/media')) return { ok: true, status: 200, json: async () => ({ id: 'container-1' }) };
      return { ok: true, status: 200, json: async () => ({ id: 'post-1' }) };
    };
    const result = await publisher.publishToInstagram({ imagenUrl: 'https://cdn.example.com/foto.jpg', texto: 'Demo del bot' });

    assert.equal(calls[0].url, 'https://graph.facebook.com/v21.0/999/media');
    assert.equal(calls[0].body.get('image_url'), 'https://cdn.example.com/foto.jpg');
    assert.equal(calls[1].url, 'https://graph.facebook.com/v21.0/999/media_publish');
    assert.equal(calls[1].body.get('creation_id'), 'container-1');
    assert.deepEqual(result, { success: true, data: { id: 'post-1' } });
  }
));

test('publishToInstagram exige imagenUrl', () => withEnv(
  { IG_BUSINESS_ACCOUNT_ID: '999', FB_PAGE_ACCESS_TOKEN: 'token-ig' },
  async () => {
    const publisher = freshPublisher();
    const result = await publisher.publishToInstagram({ texto: 'sin imagen' });
    assert.equal(result.success, false);
    assert.match(result.error, /imagenUrl/);
  }
));

test('publishToInstagram reporta un fallo al crear el contenedor sin llamar a media_publish', () => withEnv(
  { IG_BUSINESS_ACCOUNT_ID: '999', FB_PAGE_ACCESS_TOKEN: 'token-ig' },
  async () => {
    const publisher = freshPublisher();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: false, status: 400, json: async () => ({ error: { message: 'imagen no accesible' } }) };
    };
    const result = await publisher.publishToInstagram({ imagenUrl: 'https://cdn.example.com/foto.jpg' });
    assert.equal(result.success, false);
    assert.match(result.error, /imagen no accesible/);
    assert.equal(calls, 1);
  }
));

test('publishToInstagram reporta un fallo al publicar el contenedor ya creado', () => withEnv(
  { IG_BUSINESS_ACCOUNT_ID: '999', FB_PAGE_ACCESS_TOKEN: 'token-ig' },
  async () => {
    const publisher = freshPublisher();
    global.fetch = async (url) => {
      if (url.endsWith('/media')) return { ok: true, status: 200, json: async () => ({ id: 'container-1' }) };
      return { ok: false, status: 500, json: async () => ({ error: { message: 'medio no disponible' } }) };
    };
    const result = await publisher.publishToInstagram({ imagenUrl: 'https://cdn.example.com/a.jpg' });
    assert.equal(result.success, false);
    assert.match(result.error, /medio no disponible/);
  }
));

test('publishToFacebook y publishToInstagram reportan errores de red', () => withEnv(
  { FB_PAGE_ID: '111', FB_PAGE_ACCESS_TOKEN: 'token', IG_BUSINESS_ACCOUNT_ID: '999' },
  async () => {
    const publisher = freshPublisher();
    global.fetch = async () => { throw new Error('ECONNRESET'); };
    assert.match((await publisher.publishToFacebook({ texto: 'hola' })).error, /ECONNRESET/);
    assert.match((await publisher.publishToInstagram({ imagenUrl: 'https://cdn.example.com/a.jpg' })).error, /ECONNRESET/);
  }
));

test('publish enruta a Facebook o Instagram según el canal', () => withEnv(
  { FB_PAGE_ID: '111', FB_PAGE_ACCESS_TOKEN: 'token', IG_BUSINESS_ACCOUNT_ID: '999' },
  async () => {
    const publisher = freshPublisher();
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'ok' }) });
    assert.equal((await publisher.publish('facebook', { texto: 'hola' })).success, true);
    assert.equal((await publisher.publish('instagram', { imagenUrl: 'https://cdn.example.com/a.jpg' })).success, true);
  }
));

test('publish rechaza un canal no soportado', async () => {
  const publisher = freshPublisher();
  const result = await publisher.publish('tiktok', {});
  assert.equal(result.success, false);
  assert.match(result.error, /Canal no soportado/);
});
