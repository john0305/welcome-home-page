import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

interface Props {
  storeId: string
  /** Passed in so the cache key is unique per store */
  pendingFixCount?: number
}

function cacheKey(storeId: string): string {
  const today = new Date().toISOString().split('T')[0]
  return `radariq_briefing_${storeId}_${today}`
}

function readCache(storeId: string): string | null {
  try {
    return localStorage.getItem(cacheKey(storeId))
  } catch {
    return null
  }
}

function writeCache(storeId: string, briefing: string): void {
  try {
    localStorage.setItem(cacheKey(storeId), briefing)
  } catch { /* storage full — skip silently */ }
}

export function DailyBriefingCard({ storeId }: Props) {
  const [briefing, setBriefing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchBriefing(bust = false) {
    if (!bust) {
      const cached = readCache(storeId)
      if (cached) {
        setBriefing(cached)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('dashboard-briefing', {
        body: { storeId },
      })
      if (error || !data?.briefing) {
        setHidden(true)
        return
      }
      writeCache(storeId, data.briefing)
      setBriefing(data.briefing)
    } catch {
      setHidden(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchBriefing()
  }, [storeId])

  if (hidden) return null

  return (
    <div className="rounded-xl border border-primary/20 overflow-hidden animate-fade-in bg-surface-1">
      <div className="h-[1.5px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="px-4 py-3.5 flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-1 text-primary">
            Today's briefing
          </p>

          {loading ? (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-3.5 rounded-full w-3/4 bg-border" />
              <div className="h-3.5 rounded-full w-full bg-border" />
              <div className="h-3.5 rounded-full w-1/2 bg-border" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/80">
              {briefing}
            </p>
          )}
        </div>

        {!loading && (
          <button
            onClick={() => {
              setRefreshing(true)
              try { localStorage.removeItem(cacheKey(storeId)) } catch { /* noop */ }
              void fetchBriefing(true)
            }}
            disabled={refreshing}
            className="mt-0.5 shrink-0 rounded-md p-1.5 transition-opacity hover:opacity-70 disabled:opacity-40 text-muted-foreground"
            title="Regenerate briefing"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  )
}
