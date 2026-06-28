interface EtsyDisclaimerProps {
  variant?: 'footer' | 'inline'
  className?: string
}

/**
 * Required Etsy API trademark disclaimer.
 * Must appear in the footer on every page and on any page that references
 * Etsy connectivity, OAuth, or API data.
 */
export function EtsyDisclaimer({ variant = 'footer', className = '' }: EtsyDisclaimerProps) {
  const base =
    "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc."

  if (variant === 'inline') {
    return (
      <p
        className={`text-xs leading-relaxed rounded-md px-3 py-2 border ${className}`}
        style={{
          color: 'hsl(var(--foreground))',
          background: 'rgba(148,163,184,0.08)',
          borderColor: 'rgba(148,163,184,0.18)',
        }}
      >
        {base}
      </p>
    )
  }

  return (
    <p className={`text-xs text-center leading-relaxed ${className}`} style={{ color: 'hsl(var(--muted-foreground))' }}>
      {base}
    </p>
  )
}
