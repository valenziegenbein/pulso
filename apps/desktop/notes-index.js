// Retrieval sobre la carpeta de notas del proyecto (asistente de notas, etapa 2a).
// Búsqueda léxica BM25 en JS puro: sin modelos, sin binarios nativos, sin caches
// en disco ni procesos de fondo. El índice vive en memoria y se refresca
// incrementalmente por mtime en cada consulta; a escala de bóveda personal
// (miles de chunks) todo resuelve en milisegundos.
const fs = require('node:fs');
const path = require('node:path');
const { listMarkdownFiles, readNotesContext } = require('./markdown');

// Topes defensivos para bóvedas patológicas.
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 200_000;
const MAX_CHUNK_CHARS = 1200;

// --- Tokenizer (es/en): minúsculas, sin acentos, sin stopwords, plural naive ---
const STOPWORDS = new Set([
  'de','la','el','en','y','a','los','las','un','una','unos','unas','que','con','por','para','del','al','se','su','es',
  'lo','como','mas','o','pero','sus','le','ya','este','esta','esto','son','entre','sin','sobre','tambien','fue','hay',
  'muy','todo','toda','todos','todas','ser','si','no','me','mi','te','nos','hoy','ayer',
  'the','an','of','to','in','and','on','for','is','it','at','by','be','this','that','with','as','are','was','from','or','not',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith('es') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

// --- Chunking: por headings; secciones largas se parten por párrafos ---
function chunkMarkdown(text) {
  const sections = [];
  let heading = '';
  let buf = [];
  const flush = () => {
    const t = buf.join('\n').trim();
    if (t) sections.push({ heading, text: t });
    buf = [];
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+(.*)/);
    if (m) {
      flush();
      heading = m[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();

  const chunks = [];
  for (const s of sections) {
    if (s.text.length <= 900) {
      chunks.push(s);
      continue;
    }
    let acc = '';
    for (const p of s.text.split(/\n\s*\n/)) {
      if (acc && acc.length + p.length > 700) {
        chunks.push({ heading: s.heading, text: acc.trim() });
        acc = '';
      }
      acc += (acc ? '\n\n' : '') + p;
    }
    if (acc.trim()) chunks.push({ heading: s.heading, text: acc.trim() });
  }
  return chunks
    .filter((c) => c.text.length >= 25)
    .map((c) => ({ ...c, text: c.text.slice(0, MAX_CHUNK_CHARS) }));
}

// --- Índice en memoria por carpeta, refresh incremental por mtime ---
// dir -> { mtimes: Map<absPath, mtimeMs>, byFile: Map<absPath, chunk[]> }
// chunk: { file (rel), heading, text, tf: Map<token, n>, len }
const CACHE = new Map();

function indexFile(dir, absPath) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  if (raw.length > MAX_FILE_BYTES) raw = raw.slice(0, MAX_FILE_BYTES);
  const rel = path.relative(dir, absPath);
  return chunkMarkdown(raw).map((c, idx) => {
    // El heading y el nombre del archivo también cuentan como texto buscable.
    const tokens = tokenize(`${rel} ${c.heading} ${c.text}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    // Id estable mientras el archivo no cambie: si cambia (mtime), TODOS sus
    // chunks se re-derivan (y, en el índice de embeddings, se re-vectorizan).
    return { id: `${rel}#${idx}`, file: rel, heading: c.heading, text: c.text, tf, len: tokens.length };
  });
}

function refreshIndex(dir) {
  const files = listMarkdownFiles(dir).slice(0, MAX_FILES);
  const state = CACHE.get(dir) ?? { mtimes: new Map(), byFile: new Map() };
  const seen = new Set();
  for (const f of files) {
    seen.add(f.p);
    if (state.mtimes.get(f.p) !== f.mtime) {
      state.byFile.set(f.p, indexFile(dir, f.p));
      state.mtimes.set(f.p, f.mtime);
    }
  }
  for (const p of [...state.mtimes.keys()]) {
    if (!seen.has(p)) {
      state.mtimes.delete(p);
      state.byFile.delete(p);
    }
  }
  CACHE.set(dir, state);
  return [...state.byFile.values()].flat();
}

/** Chunks actuales de la carpeta (id, file, heading, text, mtime del archivo
 *  dueño), para que el índice de embeddings sepa qué vectorizar. Reusa el
 *  mismo caché/mtime que BM25 — misma identidad de chunk en ambos rankers. */
function getChunks(dir) {
  const files = listMarkdownFiles(dir).slice(0, MAX_FILES);
  const mtimeByRel = new Map(files.map((f) => [path.relative(dir, f.p), f.mtime]));
  return refreshIndex(dir).map((c) => ({
    id: c.id,
    file: c.file,
    heading: c.heading,
    text: c.text,
    mtime: mtimeByRel.get(c.file) ?? 0,
  }));
}

// --- BM25 ---
function bm25Search(chunks, query, topK) {
  const qTokens = [...new Set(tokenize(query))];
  if (qTokens.length === 0 || chunks.length === 0) return [];

  const N = chunks.length;
  const df = new Map();
  let totalLen = 0;
  for (const c of chunks) {
    totalLen += c.len;
    for (const t of qTokens) if (c.tf.has(t)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const avgdl = totalLen / N || 1;
  const K1 = 1.2;
  const B = 0.75;

  const scored = [];
  for (const c of chunks) {
    let score = 0;
    for (const t of qTokens) {
      const f = c.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.len) / avgdl)));
    }
    if (score > 0) scored.push({ chunk: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Contexto de notas para el borrador: si hay query (la micro-nota del usuario),
 * devuelve los chunks más RELEVANTES (BM25); sin query o sin resultados, cae a
 * las notas más recientes. SOLO lectura, solo esa carpeta, presupuesto acotado.
 */
function retrieveNotesContext(dir, query, maxChars) {
  if (typeof dir !== 'string' || dir.length === 0) return null;
  const budget = Math.min(Math.max(Number(maxChars) || 3000, 500), 8000);
  const q = typeof query === 'string' ? query.trim() : '';
  if (q.length === 0) return readNotesContext(dir, budget);

  let hits;
  try {
    hits = bm25Search(refreshIndex(dir), q, 12);
  } catch {
    return readNotesContext(dir, budget);
  }
  if (hits.length === 0) return readNotesContext(dir, budget);

  const parts = [];
  let total = 0;
  for (const { chunk } of hits) {
    if (total >= budget) break;
    const text = chunk.text.slice(0, budget - total);
    const where = chunk.heading ? `${chunk.file} › ${chunk.heading}` : chunk.file;
    parts.push(`— ${where} —\n${text}`);
    total += text.length;
  }
  return parts.length > 0 ? parts.join('\n\n') : readNotesContext(dir, budget);
}

module.exports = { retrieveNotesContext, tokenize, chunkMarkdown, bm25Search, refreshIndex, getChunks };
