import tailwindConfig from './tailwind.config.mjs';

/** @type {import('postcss-load-config').Config} */
export default {
  // Next 15 exige la forma declarativa. Pasamos la configuración completa para
  // no depender del cwd usado al invocar PostCSS.
  plugins: {
    tailwindcss: tailwindConfig,
    autoprefixer: {},
  },
};
