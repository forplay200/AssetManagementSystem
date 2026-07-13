/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        aether: {
          base: '#09090B',
          surface: '#18181B',
          overlay: '#27272A',
          primary: '#8B5CF6',
          secondary: '#3B82F6',
          success: '#10B981',
        },
      },
      fontFamily: {
        display: ['Geist Variable', 'Geist', 'Inter', 'sans-serif'],
        sans: ['Inter Variable', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        floating: '0 10px 30px rgba(0, 0, 0, 0.5)',
      },
    },
  },
  plugins: [],
};
