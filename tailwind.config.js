module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#fce588',
          DEFAULT: '#f7c948',
          dark: '#f0b429'
        },
        secondary: {
          light: '#3b82f6',
          DEFAULT: '#1e3a8a',
          dark: '#1e40af'
        },
        neutral: {
          light: '#f3f4f6',
          DEFAULT: '#e5e7eb',
          dark: '#d1d5db'
        },
        accent: {
          light: '#f97316',
          DEFAULT: '#ea580c',
          dark: '#c2410c'
        },
        text: {
          light: '#4b5563',
          DEFAULT: '#374151',
          dark: '#1f2937'
        }
      }
    }
  },
  plugins: []
};
