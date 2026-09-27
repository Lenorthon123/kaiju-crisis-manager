/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Severity scale of the city map, 1 (calm) to 5 (catastrophic).
        severity: {
          1: '#22c55e',
          2: '#84cc16',
          3: '#eab308',
          4: '#f97316',
          5: '#ef4444',
        },
        ink: {
          900: '#0b1120',
          800: '#111827',
          700: '#1f2937',
          600: '#374151',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
