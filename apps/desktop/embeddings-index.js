// Índice vectorial del asistente de notas (etapa 2b: retrieval semántico).
// Módulo sin Electron (cacheDir se recibe por parámetro) — verificable con
// node puro, igual que markdown.js y notes-index.js.
//
// Diseño para mantener el desktop liviano:
// - Nada de modelo embebido: los vectores se piden al proveedor que el usuario
//   YA configuró (local u OpenAI), vía /api/personal/embeddings.
// - Nada de base vectorial: los vectores se guardan en un JSON plano por
//   carpeta indexada, y la búsqueda es coseno por fuerza bruta en memoria — a
//   escala de bóveda personal (miles de chunks) es instantáneo.
// - Persistido en userData (NUNCA en la carpeta del usuario): sobrevive a
//   reinicios para no re-pagar el costo de indexar en cada arranque.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getChunks, refreshIndex, bm25Search } = require('./notes-index');

const RRF_K = 60;

function cacheFilePath(cacheDir, dir) {
  const hash = crypto.createHash('sha256').update(dir).digest('hex').slice(0, 24);
  return path.join(cacheDir, `${hash}.json`);
}

function loadCache(cacheDir, dir) {
  try {
    const raw = fs.readFileSync(cacheFilePath(cacheDir, dir), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.chunks) return parsed;
  } catch {
    /* sin cache todavía */
  }
  return { model: null, chunks: {} };
}

function writeCache(cacheDir, dir, cache) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFilePath(cacheDir, dir), JSON.stringify(cache), 'utf8');
  } catch {
    /* cache es solo una optimización: si falla, se reintenta indexar después */
  }
}

/** Chunks del proyecto que todavía no tienen vector para `model` (o cuyo
 *  archivo cambió desde que se vectorizaron). */
function pendingChunks(dir, model, cacheDir) {
  const chunks = getChunks(dir);
  const cache = loadCache(cacheDir, dir);
  const stale = cache.model !== model;
  const pending = chunks.filter((c) => stale || cache.chunks[c.id]?.mtime !== c.mtime);
  return {
    pending: pending.map((c) => ({ id: c.id, file: c.file, heading: c.heading, text: c.text })),
    total: chunks.length,
    indexed: chunks.length - pending.length,
  };
}

/** Igual que pendingChunks pero solo los números (para un indicador liviano). */
function status(dir, model, cacheDir) {
  const { total, indexed } = pendingChunks(dir, model, cacheDir);
  return { total, indexed, model };
}

/** Persiste vectores recién calculados. Si `model` cambió respecto al cache
 *  existente, el cache se reinicia (vectores de otro modelo no son comparables). */
function saveEmbeddings(dir, model, entries, cacheDir) {
  if (!Array.isArray(entries) || entries.length === 0) return { saved: 0 };
  let cache = loadCache(cacheDir, dir);
  if (cache.model !== model) cache = { model, chunks: {} };

  const byId = new Map(getChunks(dir).map((c) => [c.id, c]));
  let saved = 0;
  for (const e of entries) {
    if (!e || typeof e.id !== 'string' || !Array.isArray(e.vector)) continue;
    const chunk = byId.get(e.id);
    if (!chunk) continue; // el chunk ya no existe (archivo cambió/borrado): descartar
    cache.chunks[e.id] = { file: chunk.file, heading: chunk.heading, text: chunk.text, mtime: chunk.mtime, vector: e.vector };
    saved++;
  }
  writeCache(cacheDir, dir, cache);
  return { saved };
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Top-k por similitud coseno contra lo YA indexado (no dispara indexado). */
function vectorTopK(dir, queryVector, k, cacheDir) {
  if (!Array.isArray(queryVector) || queryVector.length === 0) return [];
  const cache = loadCache(cacheDir, dir);
  const ids = Object.keys(cache.chunks);
  if (ids.length === 0) return [];
  const scored = ids.map((id) => {
    const c = cache.chunks[id];
    return { id, file: c.file, heading: c.heading, text: c.text, score: cosine(queryVector, c.vector) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/**
 * Retrieval híbrido: fusiona el ranking léxico (BM25) y el semántico
 * (embeddings, si hay vectores indexados) por Reciprocal Rank Fusion. Sin
 * `queryVector` o sin nada indexado todavía, degrada a BM25 solo — nunca
 * bloquea la generación por falta de índice vectorial.
 */
function hybridSearch(dir, query, queryVector, k, cacheDir) {
  const bm25Hits = bm25Search(refreshIndex(dir), query, 20).map((h) => h.chunk);
  const vecHits = queryVector ? vectorTopK(dir, queryVector, 20, cacheDir) : [];

  const rrf = new Map(); // id -> { chunk, score }
  bm25Hits.forEach((c, rank) => {
    const cur = rrf.get(c.id) ?? { chunk: c, score: 0 };
    cur.score += 1 / (RRF_K + rank + 1);
    rrf.set(c.id, cur);
  });
  vecHits.forEach((c, rank) => {
    const cur = rrf.get(c.id) ?? { chunk: c, score: 0 };
    cur.score += 1 / (RRF_K + rank + 1);
    rrf.set(c.id, cur);
  });

  return [...rrf.values()].sort((a, b) => b.score - a.score).slice(0, k).map((r) => r.chunk);
}

module.exports = { pendingChunks, status, saveEmbeddings, vectorTopK, hybridSearch, cosine };
