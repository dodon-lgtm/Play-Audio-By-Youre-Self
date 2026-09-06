/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'stream-bg': '#0b0f17',
        'stream-panel': '#111827',
        'stream-accent': '#1db954',
        'stream-muted': '#94a3b8',
        'stream-text': '#e5e7eb'
      }
    }
  },
  plugins: []
};