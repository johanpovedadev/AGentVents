/**
 * Cálculos de la analítica de redes. Funciones puras: reciben números, devuelven
 * números o etiquetas, sin red ni base de datos — por eso se prueban con datos fijos.
 *
 * Regla general: un dato que la red no entrega llega como null y se ignora; nunca
 * se trata como 0 (un competidor sin "alcance" no tiene alcance 0, simplemente
 * no lo conocemos).
 */

/** Por debajo de esta cantidad de publicaciones, cualquier "patrón" es ruido y así se avisa. */
const MIN_SAMPLE = 10;
const WINNER_SCORE = 2;
const LOSER_SCORE = 0.5;

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Mediana de los valores numéricos (ignora null/undefined). null si no hay datos. */
function median(values) {
  const nums = (values || []).filter(isNumber).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

/**
 * Score atípico: cuántas veces rinde una publicación frente a la mediana de su
 * propia cuenta. Permite comparar una cuenta de 4.000 seguidores con una de
 * 400.000 — lo que importa es cuánto se sale de lo normal para cada una.
 */
function outlierScore(value, accountMedian) {
  if (!isNumber(value) || !isNumber(accountMedian) || accountMedian <= 0) return null;
  return Number((value / accountMedian).toFixed(2));
}

/** Clasifica un score: ganador (≥2×), no repetir (≤0,5×), normal, o sin datos. */
function classify(score) {
  if (!isNumber(score)) return 'sin_datos';
  if (score >= WINNER_SCORE) return 'ganador';
  if (score <= LOSER_SCORE) return 'no_repetir';
  return 'normal';
}

/** Tasa de interacción sobre alcance. null si no hay alcance (siempre el caso en competidores). */
function engagementRate({ likes, comments, shares, saves, reach }) {
  if (!isNumber(reach) || reach <= 0) return null;
  const total = [likes, comments, shares, saves].filter(isNumber).reduce((sum, n) => sum + n, 0);
  return Number((total / reach).toFixed(4));
}

/**
 * Cuadrante de una publicación propia, cortando por las medianas de alcance e
 * interacción de la cuenta:
 *   - estrella: mucho alcance y mucha interacción → repetir.
 *   - joya_oculta: poco alcance pero mucha interacción → la gente que lo ve
 *     conecta; casi siempre falla el gancho de los primeros segundos.
 *   - alcance_sin_conexion: lo vieron muchos pero no conectó.
 *   - descartar: poco alcance y poca interacción.
 */
function quadrant(reach, rate, medianReach, medianRate) {
  if (![reach, rate, medianReach, medianRate].every(isNumber)) return 'sin_datos';
  const highReach = reach >= medianReach;
  const highRate = rate >= medianRate;
  if (highReach && highRate) return 'estrella';
  if (!highReach && highRate) return 'joya_oculta';
  if (highReach && !highRate) return 'alcance_sin_conexion';
  return 'descartar';
}

/**
 * Elige la métrica para comparar publicaciones de una cuenta: vistas si la red
 * las entrega, si no likes (p. ej. competidores de Instagram, donde solo hay
 * likes y comentarios públicos).
 */
function pickMetric(rows) {
  return (rows || []).some((r) => isNumber(r.views)) ? 'views' : 'likes';
}

/**
 * Añade score y clasificación a cada publicación de UNA cuenta, comparándola
 * con la mediana de esa misma cuenta. Devuelve también la métrica usada y si la
 * muestra es suficiente.
 */
function scoreAccountMedia(rows) {
  const metric = pickMetric(rows);
  const accountMedian = median((rows || []).map((r) => r[metric]));
  const scored = (rows || []).map((r) => {
    const score = outlierScore(r[metric], accountMedian);
    return { ...r, metric, score, label: classify(score) };
  });
  return { metric, accountMedian, sampleSize: scored.length, enoughSample: scored.length >= MIN_SAMPLE, media: scored };
}

/**
 * Valor de una métrica alrededor de las 48 h de publicado, usando las fotos
 * diarias: la última foto tomada hasta 2 días después de la fecha de
 * publicación. null si todavía no hay una foto en esa ventana.
 */
function valueAt48h(snapshots, publishedAt, metric = 'views') {
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;
  const limit = new Date(Date.UTC(published.getUTCFullYear(), published.getUTCMonth(), published.getUTCDate() + 2));
  const inWindow = (snapshots || [])
    .filter((s) => isNumber(s[metric]) && new Date(s.day).getTime() <= limit.getTime())
    .sort((a, b) => new Date(b.day) - new Date(a.day));
  return inWindow.length > 0 ? inWindow[0][metric] : null;
}

/** Crecimiento de seguidores entre dos fotos. null si falta alguno de los dos datos. */
function followerGrowth(current, previous) {
  if (!isNumber(current) || !isNumber(previous)) return null;
  return current - previous;
}

module.exports = {
  MIN_SAMPLE,
  median,
  outlierScore,
  classify,
  engagementRate,
  quadrant,
  pickMetric,
  scoreAccountMedia,
  valueAt48h,
  followerGrowth
};
