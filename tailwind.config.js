/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,mjs,mts,vue}",
  ],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--color-base) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'text-main': 'rgb(var(--color-text) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}

