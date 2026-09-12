// CommonJS PostCSS config. Turbopack's PostCSS transform loads this reliably
// across environments (an ESM .mjs config caused a `require` failure in the
// Linux container build). Tailwind v3 + autoprefixer.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
