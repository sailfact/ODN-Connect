/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#07090f',
          secondary: '#0b1018',
          tertiary: '#0f1420',
          elevated: '#162035'
        },
        accent: {
          blue: '#00c8f0',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
          purple: '#a855f7'
        },
        text: {
          primary: '#e8eef6',
          secondary: '#8ba8c4',
          muted: '#4d6480'
        },
        border: {
          DEFAULT: '#1a2840',
          light: '#243551'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
}
