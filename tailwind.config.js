/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        deep: { slate: '#111827' },
        warm: { mist: '#F6F8FA' },
        line: { soft: '#E5E7EB' },
        brand: {
          indigo: '#4F46E5',
          'indigo-hover': '#4338CA',
        },
      },
      borderRadius: {
        card: '12px',
      },
      fontFamily: {
        sans: [
          'Heebo',
          'Assistant',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      boxShadow: {
        drawer: '-12px 0 40px rgba(17, 24, 39, 0.12)',
        modal: '0 24px 48px rgba(17, 24, 39, 0.16)',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-t': 'env(safe-area-inset-top)',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
}
