/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0b0f19',
          850: '#0f172a',
          800: '#131d33',
          700: '#1e293b',
          600: '#334155',
          500: '#475569'
        },
        accent: {
          primary: '#6366f1',
          hover: '#4f46e5',
          light: '#818cf8',
          dim: 'rgba(99, 102, 241, 0.15)'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    },
  },
  plugins: [],
};
