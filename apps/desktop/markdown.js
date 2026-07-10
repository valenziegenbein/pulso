// Carpeta Markdown del modo Personal: escribir el archivo diario de bitácora y
// leer extractos de notas como contexto (asistente de notas, etapa 1).
// Módulo sin dependencia de Electron: main.js lo consume vía IPC y se puede
// verificar con node puro.
const fs = require('node:fs');
const path = require('node:path');

// Sanea un nombre de archivo/carpeta: sin separadores ni traversal — siempre
// queda DENTRO del directorio elegido.
function safePathPart(name, fallback) {
  if (typeof name !== 'string') return fallback;
  const clean = name.replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+|\.+$/g, '').trim().slice(0, 120);
  return clean || fallback;
}

/**
 * Agrega `text` al archivo `<dir>[/<subdir>]/<fileName>.md`. Si el archivo no
 * existe y hay `header`, lo antepone (frontmatter del día). Pulso NUNCA edita
 * notas existentes: solo agrega a sus propios archivos.
 */
function exportMarkdown(dir, fileName, text, subdir, header, onError) {
  if (typeof dir !== 'string' || typeof fileName !== 'string' || typeof text !== 'string') return false;
  if (dir.length === 0 || text.length === 0) return false;
  const safeName = safePathPart(fileName, 'bitacora');
  try {
    let target = dir;
    if (typeof subdir === 'string' && subdir.trim().length > 0) {
      target = path.join(dir, safePathPart(subdir, 'Bitácora'));
      fs.mkdirSync(target, { recursive: true });
    }
    const file = path.join(target, `${safeName}.md`);
    // El header (frontmatter + título) solo va al CREAR el archivo del día.
    const isNew = !fs.existsSync(file);
    fs.appendFileSync(file, (isNew && typeof header === 'string' ? header : '') + text, 'utf8');
    return true;
  } catch (err) {
    if (onError) onError(err);
    return false;
  }
}

/**
 * Lista los .md de la carpeta (recursivo, poca profundidad), ordenados por
 * modificación descendente. Ignora carpetas de metadatos (.obsidian, .git…).
 */
function listMarkdownFiles(dir) {
  const SKIP = new Set(['node_modules', '.git', '.obsidian', '.trash', '.logseq']);
  const files = [];
  const walk = (d, depth) => {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name), depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        const p = path.join(d, e.name);
        try {
          files.push({ p, mtime: fs.statSync(p).mtimeMs });
        } catch {
          /* ilegible: saltar */
        }
      }
    }
  };
  walk(dir, 0);
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

/**
 * Extractos de las notas .md modificadas más recientemente en la carpeta del
 * proyecto (p. ej. su bóveda Obsidian). SOLO lectura, solo esa carpeta, con
 * presupuesto acotado. El renderer los usa como contexto al generar borradores.
 */
function readNotesContext(dir, maxChars) {
  if (typeof dir !== 'string' || dir.length === 0) return null;
  const MAX_FILES = 6;
  const PER_FILE = 1200;
  const budget = Math.min(Math.max(Number(maxChars) || 3000, 500), 8000);
  const files = listMarkdownFiles(dir);

  const parts = [];
  let total = 0;
  for (const f of files.slice(0, MAX_FILES)) {
    if (total >= budget) break;
    try {
      const raw = fs.readFileSync(f.p, 'utf8').trim();
      if (!raw) continue;
      const excerpt = raw.slice(0, Math.min(PER_FILE, budget - total));
      parts.push(`— ${path.relative(dir, f.p)} —\n${excerpt}`);
      total += excerpt.length;
    } catch {
      /* ilegible: saltar */
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}

// --- Importar desde carpeta Markdown / Obsidian --------------------------
// Red de seguridad y punto de entrada: si la carpeta tiene los archivos
// diarios que Pulso mismo escribió (Bitácora/YYYY-MM-DD.md, frontmatter
// `fuente: pulso`), se reconstruyen las entradas originales (tipo, título,
// hora, contenido). Cualquier otra nota .md de la carpeta (una bóveda
// existente, por ejemplo) se importa como una nota genérica de una sola
// entrada. SOLO lectura — nunca modifica nada de la carpeta.

const DAILY_HEADING_RE = /^##\s+(\d{2}:\d{2})\s+·\s+([^—]+)—\s*(.*)$/;
const DAILY_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})$/;

function parseDailyFile(text, dateStamp) {
  const entries = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const content = current.content
      .join('\n')
      .replace(/\*\(captura adjunta en Pulso\)\*/, '')
      .trim();
    entries.push({ time: current.time, typeLabel: current.typeLabel, title: current.title, content });
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(DAILY_HEADING_RE);
    if (m) {
      flush();
      current = { time: m[1], typeLabel: m[2].trim(), title: m[3].trim(), content: [] };
    } else if (current) {
      current.content.push(line);
    }
  }
  flush();

  return entries.map((e) => {
    const [hh, mm] = e.time.split(':').map(Number);
    const d = new Date(`${dateStamp}T00:00:00`);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) d.setHours(hh, mm, 0, 0);
    return { typeLabel: e.typeLabel, title: e.title || '(sin título)', content: e.content, createdAt: d.getTime() };
  });
}

/**
 * Importa una carpeta: separa los archivos diarios propios de Pulso
 * (reconstruye entradas con tipo/hora originales) de cualquier otra nota .md
 * (se importa como nota genérica de una sola entrada, título = primer
 * encabezado o nombre de archivo).
 */
function importFromFolder(dir) {
  if (typeof dir !== 'string' || dir.length === 0) return { dailyEntries: [], genericNotes: [] };
  const dailyEntries = [];
  const genericNotes = [];

  for (const f of listMarkdownFiles(dir)) {
    let raw;
    try {
      raw = fs.readFileSync(f.p, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(dir, f.p);
    const inBitacora = /(^|[\\/])Bitácora([\\/]|$)/.test(rel);
    const dateMatch = path.basename(f.p, '.md').match(DAILY_FILENAME_RE);
    const looksLikePulsoDaily = inBitacora && dateMatch && raw.startsWith('---') && raw.includes('fuente: pulso');

    if (looksLikePulsoDaily) {
      for (const entry of parseDailyFile(raw, dateMatch[1])) dailyEntries.push(entry);
      continue;
    }

    const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '').trim();
    if (withoutFrontmatter.length === 0) continue;
    const heading = withoutFrontmatter.match(/^#{1,2}\s+(.+)$/m);
    const title = (heading ? heading[1] : path.basename(f.p, '.md')).trim().slice(0, 200);
    genericNotes.push({ file: rel, title, content: withoutFrontmatter.slice(0, 5000), mtime: f.mtime });
  }

  return { dailyEntries, genericNotes };
}

module.exports = { exportMarkdown, listMarkdownFiles, readNotesContext, importFromFolder, safePathPart };
