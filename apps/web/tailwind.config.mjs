import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
const config = {
  // Ruta absoluta: Next puede ejecutar PostCSS con el cwd del monorepo.
  content: [join(appRoot, 'src/**/*.{ts,tsx}').replaceAll('\\', '/')],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        muted: 'var(--muted)',
        fg: 'var(--fg)',
        accent: 'var(--accent)',
      },
    },
  },
  plugins: [],
};

export default config;
