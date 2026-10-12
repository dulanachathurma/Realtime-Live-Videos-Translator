/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: '#0a0f1e',
        surface: 'rgba(255,255,255,0.04)',
        ink: '#f1f5f9',
        mist: '#0d1117',
        line: 'rgba(255,255,255,0.08)',
        maroon: '#7c3aed',  // now violet/purple
        brass: '#10b981',   // emerald for translated voice
        console: '#050a15',
        // Keep original names for backward compat
        violet: '#7c3aed',
        emerald: '#10b981',
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans Sinhala"', '"Noto Sans Tamil"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
