import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
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
        sans: ['var(--font-dm-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-dm-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
