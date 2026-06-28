import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        sans:    ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border:        'hsl(var(--border))',
        'border-subtle': 'hsl(var(--border-subtle))',
        input:         'hsl(var(--input))',
        ring:          'hsl(var(--ring))',
        background:    'hsl(var(--background))',
        foreground:    'hsl(var(--foreground))',
        'surface-1':   'hsl(var(--surface-1))',
        'surface-2':   'hsl(var(--surface-2))',
        'surface-3':   'hsl(var(--surface-3))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        tertiary: {
          DEFAULT:    'hsl(var(--tertiary))',
          foreground: 'hsl(var(--tertiary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT:              'hsl(var(--sidebar-background))',
          foreground:           'hsl(var(--sidebar-foreground))',
          primary:              'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent:               'hsl(var(--sidebar-accent))',
          'accent-foreground':  'hsl(var(--sidebar-accent-foreground))',
          border:               'hsl(var(--sidebar-border))',
          ring:                 'hsl(var(--sidebar-ring))',
        },
        etsy: {
          DEFAULT: '#F1641E',
          light:   '#f9a069',
          dark:    '#b84d18',
        },
        grade: {
          aplus: 'hsl(var(--grade-aplus))',
          a:     'hsl(var(--grade-a))',
          b:     'hsl(var(--grade-b))',
          c:     'hsl(var(--grade-c))',
          d:     'hsl(var(--grade-d))',
          f:     'hsl(var(--grade-f))',
        },
        // Semantic warm palette aliases
        terracotta: {
          DEFAULT: 'hsl(22 65% 56%)',
          light:   'hsl(22 65% 70%)',
          dark:    'hsl(22 65% 44%)',
        },
        violet: {
          ai:   'hsl(260 42% 55%)',
          light:'hsl(260 42% 70%)',
          dark: 'hsl(260 42% 40%)',
        },
        warm: {
          white:  '#FFFFFF',
          offwhite:'#FAF9F6',
          gray:   '#F3F1EE',
          border: '#E2DDD6',
        },
      },
      borderRadius: {
        '2xl': '1.25rem',
        xl:    'var(--radius-xl)',
        lg:    'var(--radius-lg)',
        DEFAULT: 'var(--radius)',
        md:    'var(--radius)',
        sm:    'var(--radius-sm)',
      },
      boxShadow: {
        'warm-sm': '0 1px 4px hsl(0 0% 0% / 0.06), 0 2px 8px hsl(0 0% 0% / 0.04)',
        'warm':    '0 2px 10px hsl(0 0% 0% / 0.08), 0 4px 20px hsl(0 0% 0% / 0.05)',
        'warm-lg': '0 8px 30px hsl(0 0% 0% / 0.10), 0 2px 8px hsl(0 0% 0% / 0.06)',
        'warm-xl': '0 20px 60px hsl(0 0% 0% / 0.12), 0 4px 16px hsl(0 0% 0% / 0.08)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'kpi-pulse': {
          '0%':   { transform: 'scale(1)' },
          '30%':  { transform: 'scale(1.012)' },
          '100%': { transform: 'scale(1)' },
        },
        'radar-ping': {
          '0%':        { transform: 'scale(0.8)', opacity: '0.85' },
          '75%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'radar-ping-fast': {
          '0%':        { transform: 'scale(0.7)', opacity: '1' },
          '70%, 100%': { transform: 'scale(2.8)', opacity: '0' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'score-ring': {
          from: { 'stroke-dashoffset': '283' },
          to:   { 'stroke-dashoffset': 'var(--score-offset, 0)' },
        },
      },
      animation: {
        'accordion-down':  'accordion-down 0.2s ease-out',
        'accordion-up':    'accordion-up 0.2s ease-out',
        'fade-in':         'fade-in 0.3s ease-out',
        'slide-up':        'slide-up 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        'kpi-pulse':       'kpi-pulse 1.6s ease-out',
        'radar-ping':      'radar-ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
        'radar-ping-fast': 'radar-ping-fast 0.9s cubic-bezier(0,0,0.2,1) infinite',
        'score-ring':      'score-ring 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },
    },
  },
  plugins: [],
} satisfies Config
