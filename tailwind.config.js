/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#0b0c0e', 900: '#121417', 800: '#1b1e22', 700: '#262a30', 500: '#6b7280' },
        sand: { 50: '#faf7f2', 100: '#f2ece2', 200: '#e8dccb', 400: '#cbb08a', 500: '#b8955f' },
      },
      boxShadow: {
        glass: '0 10px 40px -10px rgba(0,0,0,0.35), 0 2px 10px -2px rgba(0,0,0,0.15)',
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
