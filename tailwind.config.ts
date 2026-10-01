import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['app/**/*.tsx', 'components/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        primary: '#086b76',
        ink: '#0f172a',
        line: '#e2e8f0',
        accent: '#f59e0b',
        danger: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['DM Display', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
