const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../../services/social/analytics');

test('median ignora nulos y maneja pares, impares y vacíos', () => {
  assert.equal(a.median([3, 1, 2]), 2);
  assert.equal(a.median([4, 1, 3, 2]), 2.5);
  assert.equal(a.median([null, 5, undefined]), 5);
  assert.equal(a.median([]), null);
  assert.equal(a.median(undefined), null);
});

test('outlierScore y classify', () => {
  assert.equal(a.outlierScore(3000, 1000), 3);
  assert.equal(a.outlierScore(null, 1000), null);
  assert.equal(a.outlierScore(10, 0), null);
  assert.equal(a.classify(3), 'ganador');
  assert.equal(a.classify(2), 'ganador');
  assert.equal(a.classify(0.5), 'no_repetir');
  assert.equal(a.classify(1.2), 'normal');
  assert.equal(a.classify(null), 'sin_datos');
});

test('engagementRate suma lo disponible y exige alcance', () => {
  assert.equal(a.engagementRate({ likes: 80, comments: 10, shares: 5, saves: 5, reach: 1000 }), 0.1);
  assert.equal(a.engagementRate({ likes: 80, comments: null, reach: 800 }), 0.1);
  assert.equal(a.engagementRate({ likes: 80, reach: null }), null, 'competidor: sin alcance no hay tasa');
  assert.equal(a.engagementRate({ likes: 80, reach: 0 }), null);
});

test('quadrant ubica cada caso del audio', () => {
  assert.equal(a.quadrant(2000, 0.1, 1000, 0.05), 'estrella');
  assert.equal(a.quadrant(300, 0.2, 1000, 0.05), 'joya_oculta');
  assert.equal(a.quadrant(2000, 0.01, 1000, 0.05), 'alcance_sin_conexion');
  assert.equal(a.quadrant(300, 0.01, 1000, 0.05), 'descartar');
  assert.equal(a.quadrant(null, 0.1, 1000, 0.05), 'sin_datos');
});

test('pickMetric usa vistas si existen y likes si no', () => {
  assert.equal(a.pickMetric([{ views: null, likes: 3 }, { views: 10 }]), 'views');
  assert.equal(a.pickMetric([{ views: null, likes: 3 }]), 'likes');
  assert.equal(a.pickMetric(undefined), 'likes');
});

test('scoreAccountMedia compara contra la mediana de la misma cuenta y avisa poca muestra', () => {
  const rows = [100, 100, 100, 400, 20].map((views, i) => ({ id: i, views }));
  const result = a.scoreAccountMedia(rows);
  assert.equal(result.metric, 'views');
  assert.equal(result.accountMedian, 100);
  assert.equal(result.enoughSample, false);
  assert.equal(result.media[3].label, 'ganador');
  assert.equal(result.media[3].score, 4);
  assert.equal(result.media[4].label, 'no_repetir');
  const many = a.scoreAccountMedia(Array.from({ length: 10 }, () => ({ likes: 5 })));
  assert.equal(many.enoughSample, true);
  assert.equal(many.metric, 'likes');
  assert.equal(a.scoreAccountMedia(undefined).sampleSize, 0);
});

test('valueAt48h toma la última foto dentro de las 48 h', () => {
  const snaps = [
    { day: '2026-10-01', views: 100 },
    { day: '2026-10-02', views: 500 },
    { day: '2026-10-03', views: 900 },
    { day: '2026-10-04', views: 1200 },
    { day: '2026-10-05', views: null }
  ];
  assert.equal(a.valueAt48h(snaps, '2026-10-01T15:00:00Z'), 900);
  assert.equal(a.valueAt48h(snaps, '2026-09-01T15:00:00Z'), null);
  assert.equal(a.valueAt48h(snaps, 'no-es-fecha'), null);
  assert.equal(a.valueAt48h(undefined, '2026-10-01T15:00:00Z'), null);
  assert.equal(a.valueAt48h([{ day: '2026-10-01', likes: 7 }], '2026-10-01T00:00:00Z', 'likes'), 7);
});

test('followerGrowth', () => {
  assert.equal(a.followerGrowth(4100, 4000), 100);
  assert.equal(a.followerGrowth(3990, 4000), -10);
  assert.equal(a.followerGrowth(4100, null), null);
});
