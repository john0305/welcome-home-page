/**
 * Animated radar sweep used while syncing Etsy listings.
 * Pure SVG/CSS — no dependencies. Tinted with the brand teal.
 */
export function RadarSweep({ size = 96, active = true }: { size?: number; active?: boolean }) {
  const teal = 'hsl(var(--primary))'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="block">
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={teal} stopOpacity="0.18" />
            <stop offset="70%" stopColor={teal} stopOpacity="0.04" />
            <stop offset="100%" stopColor={teal} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="radar-sweep" x1="50%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor={teal} stopOpacity="0.55" />
            <stop offset="100%" stopColor={teal} stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#radar-bg)" />
        {[16, 30, 44].map(r => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={teal} strokeOpacity="0.18" strokeWidth="0.6" />
        ))}
        <line x1="2" y1="50" x2="98" y2="50" stroke={teal} strokeOpacity="0.12" strokeWidth="0.4" />
        <line x1="50" y1="2" x2="50" y2="98" stroke={teal} strokeOpacity="0.12" strokeWidth="0.4" />
        {active && (
          <g style={{ transformOrigin: '50px 50px', animation: 'radar-spin 2.4s linear infinite' }}>
            <path d="M50,50 L98,50 A48,48 0 0,0 74,8 Z" fill="url(#radar-sweep)" />
          </g>
        )}
        <circle cx="50" cy="50" r="2.4" fill={teal} />
        {active && (
          <>
            <circle cx="50" cy="50" r="6" fill="none" stroke={teal} strokeOpacity="0.6" strokeWidth="0.8" style={{ transformOrigin: '50px 50px', animation: 'radar-ping 2.4s ease-out infinite' }} />
            <circle cx="50" cy="50" r="6" fill="none" stroke={teal} strokeOpacity="0.6" strokeWidth="0.8" style={{ transformOrigin: '50px 50px', animation: 'radar-ping 2.4s ease-out infinite', animationDelay: '1.2s' }} />
          </>
        )}
      </svg>
      <style>{`
        @keyframes radar-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes radar-ping {
          0%   { transform: scale(0.4); opacity: 0.8; }
          80%  { transform: scale(4.2); opacity: 0; }
          100% { transform: scale(4.2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
