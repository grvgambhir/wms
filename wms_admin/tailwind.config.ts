import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F5F8FB',
        surface: '#FFFFFF',
        'surface-muted': '#EEF3F8',
        primary: '#4887CA',
        'primary-dark': '#0C71C3',
        'primary-foreground': '#FFFFFF',
        text: '#1A1A1A',
        'text-muted': '#666666',
        border: '#E3EDF5',
        success: '#16A34A',
        warning: '#F59E0B',
        danger: '#DC2626',
        info: '#0C71C3',
        'gradient-primary-start': '#0C71C3',
        'gradient-primary-end': '#4887CA',
        'gradient-hero-start': '#0A4F8C',
        'gradient-hero-end': '#008FD5',
        admin: {
          sidebar: '#0A1826',
          elevated: '#0F2032',
          active: '#1E5BB8',
          copy: '#C4D2DF',
          muted: '#7F94A6',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(10, 24, 38, 0.04), 0 8px 30px rgba(10, 24, 38, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
