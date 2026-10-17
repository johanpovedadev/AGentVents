const test = require('node:test');
const assert = require('node:assert/strict');
const instagram = require('../../services/social/connectors/instagram');
const youtube = require('../../services/social/connectors/youtube');
const { getJson, toNumber } = require('../../services/social/http');

function ok(body) {
  return { ok: true, status: 200, json: async () => body };
}
function fail(status, body) {
  return { ok: false, status, json: async () => body };
}

test.beforeEach(() => {
  process.env.META_GRAPH_BASE_URL = 'https://graph.test/v21.0';
  process.env.FB_PAGE_ACCESS_TOKEN = 'tok';
  delete process.env.IG_ACCESS_TOKEN;
  process.env.IG_BUSINESS_ACCOUNT_ID = '999';
  process.env.YOUTUBE_API_KEY = 'yt-key';
});

test('http: getJson devuelve el cuerpo o lanza el mensaje de la API', async () => {
  global.fetch = async () => ok({ a: 1 });
  assert.deepEqual(await getJson('u'), { a: 1 });
  global.fetch = async () => fail(400, { error: { message: 'token vencido' } });
  await assert.rejects(getJson('u'), /token vencido/);
  global.fetch = async () => ({ ok: false, status: 503, json: async () => { throw new Error('no json'); } });
  await assert.rejects(getJson('u'), /HTTP 503/);
  assert.equal(toNumber('12'), 12);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('abc'), null);
  assert.equal(toNumber(undefined), null);
});

test('instagram: competidor por Business Discovery, solo datos públicos', async () => {
  let calledUrl;
  global.fetch = async (url) => {
    calledUrl = decodeURIComponent(url);
    return ok({
      business_discovery: {
        id: '777', followers_count: 52000, media_count: 300,
        media: { data: [{ id: 'm1', caption: 'Hook', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-10T12:00:00+0000', permalink: 'https://ig/p/1', like_count: 900, comments_count: 40 }] }
      }
    });
  };
  const data = await instagram.fetchAccount({ handle: '@ViajeroX', is_competitor: true });
  assert.match(calledUrl, /business_discovery\.username\(viajerox\)/);
  assert.deepEqual(data.account, { externalId: '777', followers: 52000, mediaCount: 300 });
  const m = data.media[0];
  assert.equal(m.mediaType, 'REELS');
  assert.equal(m.metrics.likes, 900);
  assert.equal(m.metrics.reach, null, 'alcance de un competidor no se conoce: null, no 0');
});

test('instagram: competidor que no es Business/Creator da un error claro', async () => {
  global.fetch = async () => ok({});
  await assert.rejects(instagram.fetchAccount({ handle: 'personal', is_competitor: true }), /Business o Creator/);
  global.fetch = async () => ok({ business_discovery: { id: '1' } });
  const empty = await instagram.fetchAccount({ handle: 'nueva', is_competitor: true });
  assert.deepEqual(empty.media, []);
});

test('instagram: cuenta propia con métricas privadas y respaldo cuando una métrica falla', async () => {
  global.fetch = async (url) => {
    if (url.includes('fields=username')) return ok({ username: 'RutaDeViajeLion', followers_count: 4012, media_count: 210 });
    if (url.includes('/999/media')) {
      return ok({ data: [
        { id: 'r1', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: '2026-10-10T00:00:00Z', like_count: 50, comments_count: 4 },
        { id: 'f1', media_type: 'IMAGE', media_product_type: 'FEED', like_count: 20, comments_count: 1 },
        { id: 'x1', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', like_count: 5 }
      ] });
    }
    if (url.includes('/r1/insights')) {
      return ok({ data: [{ name: 'reach', values: [{ value: 3000 }] }, { name: 'views', total_value: { value: 4500 } }, { name: 'ig_reels_avg_watch_time', values: [{ value: 6400 }] }, { name: 'saved', values: [] }] });
    }
    if (url.includes('/f1/insights') && url.includes('views')) return fail(400, { error: { message: 'métrica no soportada' } });
    if (url.includes('/f1/insights')) return ok({ data: [{ name: 'reach', values: [{ value: 800 }] }] });
    return fail(400, { error: { message: 'sin insights' } });
  };
  const data = await instagram.fetchAccount({ handle: 'rutadeviajelion', is_competitor: false });
  assert.deepEqual(data.account, { externalId: '999', followers: 4012, mediaCount: 210 });
  const [reel, feed, album] = data.media;
  assert.equal(reel.metrics.views, 4500);
  assert.equal(reel.metrics.reach, 3000);
  assert.equal(reel.metrics.avgWatchS, 6.4);
  assert.equal(reel.metrics.saves, null);
  assert.equal(feed.metrics.reach, 800, 'reintenta con el set mínimo');
  assert.equal(feed.mediaType, 'IMAGE');
  assert.equal(album.metrics.reach, null, 'si todo falla queda sin dato');
});

test('instagram: una cuenta propia que no es la conectada pide OAuth (fase 6)', async () => {
  global.fetch = async () => ok({ username: 'otra', followers_count: 1, media_count: 1 });
  await assert.rejects(instagram.fetchAccount({ handle: 'clinica', is_competitor: false }), /OAuth del cliente/);
  await assert.rejects(instagram.fetchAccount({ handle: 'clinica', external_id: '123', is_competitor: false }), /OAuth del cliente/);
});

test('instagram: sin credenciales falla antes de llamar la red', async () => {
  delete process.env.FB_PAGE_ACCESS_TOKEN;
  await assert.rejects(instagram.fetchAccount({ handle: 'x', is_competitor: true }), /IG_ACCESS_TOKEN/);
  assert.equal(instagram.cleanHandle(' @Hola '), 'hola');
  assert.equal(instagram.cleanHandle(undefined), '');
  assert.deepEqual(instagram.parseInsights(undefined), {});
});

test('youtube: canal por @handle con sus videos recientes', async () => {
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('/channels')) {
      return ok({ items: [{ id: 'UC1', statistics: { subscriberCount: '12000', videoCount: '80' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
    }
    if (url.includes('/playlistItems')) return ok({ items: [{ contentDetails: { videoId: 'v1' } }, { contentDetails: {} }] });
    return ok({ items: [{ id: 'v1', snippet: { title: 'Islas del Rosario', publishedAt: '2026-10-09T10:00:00Z' }, statistics: { viewCount: '5400', likeCount: '300' }, contentDetails: { duration: 'PT1M5S' } }] });
  };
  const data = await youtube.fetchAccount({ handle: 'RutaDeViajeLion' });
  assert.match(urls[0], /forHandle=%40RutaDeViajeLion/);
  assert.deepEqual(data.account, { externalId: 'UC1', followers: 12000, mediaCount: 80 });
  assert.equal(data.media[0].durationS, 65);
  assert.equal(data.media[0].metrics.views, 5400);
  assert.equal(data.media[0].metrics.comments, null, 'comentarios ocultos: null');
  assert.equal(data.media[0].permalink, 'https://www.youtube.com/watch?v=v1');
});

test('youtube: suscriptores ocultos, canal por id, sin videos y canal inexistente', async () => {
  global.fetch = async (url) => {
    if (url.includes('/channels') && url.includes('id=UCx')) return ok({ items: [{ id: 'UCx', statistics: { hiddenSubscriberCount: true, videoCount: '0' }, contentDetails: { relatedPlaylists: { uploads: 'UUx' } } }] });
    if (url.includes('/playlistItems')) return ok({});
    if (url.includes('/channels')) return ok({ items: [] });
    return ok({});
  };
  const hidden = await youtube.fetchAccount({ handle: 'x', external_id: 'UCx' });
  assert.equal(hidden.account.followers, null);
  assert.deepEqual(hidden.media, []);
  await assert.rejects(youtube.fetchAccount({ handle: '@noexiste' }), /No existe el canal/);

  global.fetch = async () => ok({ items: [{ id: 'UCy', statistics: {} }] });
  const noUploads = await youtube.fetchAccount({ handle: 'y' });
  assert.deepEqual(noUploads.media, []);
});

test('youtube: duración ISO 8601, video sin datos y falta de API key', async () => {
  assert.equal(youtube.parseDuration('PT1H2M3S'), 3723);
  assert.equal(youtube.parseDuration('P1DT1S'), 86401);
  assert.equal(youtube.parseDuration('PT'), null);
  assert.equal(youtube.parseDuration('raro'), null);
  const bare = youtube.normalizeVideo({ id: 'v9' });
  assert.equal(bare.caption, null);
  assert.equal(bare.durationS, null);
  delete process.env.YOUTUBE_API_KEY;
  await assert.rejects(youtube.fetchAccount({ handle: 'x' }), /YOUTUBE_API_KEY/);
});
