/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FFFFF5',
          100: '#FFFDD0',
          200: '#FFF8B3',
        },
        navy: {
          800: '#0f203c',
          900: '#0A192F',
        },
      },
    },
  },
  plugins: [],
};
