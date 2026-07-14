import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const markdown = require('../../../../desktop/markdown.js') as {
  exportMarkdown: (dir: string, fileName: string, text: string, subdir?: string, header?: string) => boolean;
  importFromFolder: (dir: string) => {
    dailyEntries: Array<{ typeLabel: string; title: string; content: string; createdAt: number }>;
    genericNotes: Array<{ file: string; title: string; content: string }>;
  };
};
const embeddings = require('../../../../desktop/embeddings-index.js') as {
  pendingChunks: (dir: string, model: string, cacheDir: string) => { pending: Array<{ id: string }>; total: number; indexed: number };
  saveEmbeddings: (dir: string, model: string, entries: Array<{ id: string; vector: number[] }>, cacheDir: string) => { saved: number };
  hybridSearch: (dir: string, query: string, vector: number[], count: number, cacheDir: string) => Array<{ text: string }>;
};

const dirs: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pulso-desktop-test-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('Desktop Markdown recovery', () => {
  it('reconstruye el formato diario de Pulso y deja notas externas separadas', () => {
    const dir = temp();
    expect(markdown.exportMarkdown(
      dir,
      '2026-07-13',
      '\n## 09:30 · Avance — Selector corregido\n\nEl selector ya cambia el proyecto.\n',
      'Bitácora',
      '---\nfuente: pulso\nfecha: 2026-07-13\n---\n\n# Bitácora — 2026-07-13\n',
    )).toBe(true);
    writeFileSync(join(dir, 'arquitectura.md'), '# Arquitectura\n\nDecisiones históricas del sistema.', 'utf8');

    const result = markdown.importFromFolder(dir);
    expect(result.dailyEntries).toHaveLength(1);
    expect(result.dailyEntries[0]).toMatchObject({ typeLabel: 'Avance', title: 'Selector corregido' });
    expect(result.dailyEntries[0]?.content).toContain('cambia el proyecto');
    expect(result.genericNotes).toEqual([expect.objectContaining({ file: 'arquitectura.md', title: 'Arquitectura' })]);
    expect(readFileSync(join(dir, 'arquitectura.md'), 'utf8')).toContain('Decisiones históricas');
  });
});

describe('Desktop semantic index', () => {
  it('detecta cambios y combina BM25 con similitud vectorial sin mocks de filesystem', () => {
    const dir = temp();
    const cache = temp();
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'alpha.md'), '# Alpha\n\nAislamiento entre organizaciones y permisos.', 'utf8');
    writeFileSync(join(dir, 'docs', 'beta.md'), '# Beta\n\nGuía de colores y tipografía.', 'utf8');

    const pending = embeddings.pendingChunks(dir, 'test-model', cache);
    expect(pending.total).toBe(2);
    expect(pending.indexed).toBe(0);
    const entries = pending.pending.map((chunk, index) => ({ id: chunk.id, vector: index === 0 ? [1, 0] : [0, 1] }));
    expect(embeddings.saveEmbeddings(dir, 'test-model', entries, cache).saved).toBe(2);
    expect(embeddings.pendingChunks(dir, 'test-model', cache).indexed).toBe(2);
    expect(embeddings.hybridSearch(dir, 'aislamiento', [1, 0], 1, cache)[0]?.text).toContain('Aislamiento');
  });
});
