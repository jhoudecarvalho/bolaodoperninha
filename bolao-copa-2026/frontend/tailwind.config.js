/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { 900: '#090916', 800: '#111128', 700: '#14142c' },
        line: { DEFAULT: '#1a1a30', light: '#1e1e3a' },
        gold: { DEFAULT: '#c8aa6e', dark: '#a8884e' },
        ink: { DEFAULT: '#e8e8f0', mut: '#888', dim: '#666' },
        ok: { DEFAULT: '#5cb85c', dark: '#2d6a2d' },
        danger: { DEFAULT: '#d9534f', bright: '#e74c3c' },
        api: '#3498db',
        warn: '#f0ad4e',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease',
        slideUp: 'slideUp 0.4s ease',
        pulseLive: 'pulseLive 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseLive: {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.5, transform: 'scale(1.25)' },
        },
      },
    },
  },
  plugins: [],
};
