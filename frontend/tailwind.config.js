/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        navy: {
          950: '#050c1a',
          900: '#0a1628',
          800: '#0f1f3d',
          750: '#132348',
          700: '#1a2d5a',
          600: '#1e3670',
          500: '#254080',
          400: '#3a5fa0',
          300: '#6688c4',
          200: '#98b0d8',
          100: '#c8d4ec',
          50:  '#e8eef8',
        },
        solar: {
          300: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        // Paletas legadas mantidas para compatibilidade
        bone: {
          50: '#fdfcf7',
          100: '#f8f7f2',
          200: '#efeee5',
          300: '#e1ddd0',
          400: '#cac4b0',
        },
        forest: {
          50: '#eef3ef',
          100: '#d4e0d6',
          300: '#7a9482',
          500: '#3a5840',
          600: '#2d4633',
          700: '#1f3622',
          800: '#172819',
          900: '#0d1a10',
        },
        gold: {
          400: '#c4a44a',
          500: '#a88932',
          600: '#8a6f24',
          700: '#6b551c',
        },
        crimson: {
          500: '#a52525',
          600: '#8b1f1f',
          700: '#6e1818',
        },
        amber: {
          dark: '#b8860b',
        },
      },
      boxShadow: {
        'institutional': '0 1px 3px rgba(10, 22, 40, 0.4), 0 4px 12px rgba(5, 12, 26, 0.3)',
        'card': '0 1px 0 rgba(5, 12, 26, 0.3), 0 2px 8px rgba(5, 12, 26, 0.25)',
        'glow': '0 0 20px rgba(251, 191, 36, 0.15)',
      },
    },
  },
  plugins: [],
};
