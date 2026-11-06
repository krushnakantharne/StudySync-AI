/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Figtree', 'sans-serif'],
      },
      colors: {
        ink: '#1C2B4A',
        mist: '#F4F7FC',
        line: '#E1E8F2',
        teal: { DEFAULT: '#3556C5', soft: '#E6EDFF' },
        amber: { DEFAULT: '#E8A33D', soft: '#FBEFD9' },
        berry: { DEFAULT: '#C94F6D', soft: '#F8E1E7' },
        leaf: '#3E9B6C',
      },
    },
  },
  plugins: [],
};
