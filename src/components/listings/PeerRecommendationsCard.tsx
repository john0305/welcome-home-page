import { useState, useEffect } from 'react'
import { Sparkles, Loader2, TrendingUp, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'

interface Recommendation {
  category: 'tags' | 'title' | 'description' | 'materials' | 'photos' | 'pricing'
  impact: 'high' | 'medium' | 'low'
  change: string
  evidence: string
}

interface RecsResponse {
  recommendations: Recommendation[]
  peer_count: number
  top_peer_count?: number
  tag_gaps?: Array<{ tag: string; peers_using: number; of_top: number }>
  material_gaps?: Array<{ material: string; peers_using: number; of_top: number }>
  message?: string
}

const impactColor: Record<Recommendation['impact'], string> = {
  high: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
}

export function PeerRecommendationsCard({ listingId }: { listingId: string }) {
  const [data, setData] = useState<RecsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsBackfill, setNeedsBackfill] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const { toast } = useToast()

  // Auto-load recommendations when the card mounts
  useEffect(() => { void load() }, [listingId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    setNeedsBackfill(false)
    try {
      const { data: res, error } = await supabase.functions.invoke('recommend-improvements', {
        body: { listing_id: listingId },
      })
      if (error) throw error
      setData(res as RecsResponse)
      if ((res as RecsResponse).peer_count === 0) setNeedsBackfill(true)
    } catch (e) {
      toast({ title: 'Could not load recommendations', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function backfill() {
    setBackfilling(true)
    try {
      const { data: res, error } = await supabase.functions.invoke('embed-listing', {
        body: { backfill: true, limit: 300 },
      })
      if (error) throw error
      toast({
        title: 'Listings indexed',
        description: `Embedded ${(res as { embedded: number }).embedded} listings. Loading recommendations…`,
      })
      await load()
    } catch (e) {
      toast({ title: 'Indexing failed', description: String(e), variant: 'destructive' })
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Peer-Driven Recommendations
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : data ? 'Refresh' : 'Analyze peers'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data && !loading && (
          <p className="text-sm text-muted-foreground">
            Compares this listing to your semantically similar listings and ranks improvements by what's
            actually working for your top performers.
          </p>
        )}

        {needsBackfill && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600" />
              <div className="flex-1">
                <p className="font-medium">No indexed peers yet</p>
                <p className="text-muted-foreground text-xs mt-1">
                  We need to index your listings semantically first. This is a one-time setup.
                </p>
                <Button size="sm" className="mt-2" onClick={backfill} disabled={backfilling}>
                  {backfilling ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Indexing…</> : 'Index my listings'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {data && data.recommendations.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              Based on {data.top_peer_count} top-performing peers (of {data.peer_count} similar listings)
            </p>
            <ul className="space-y-2">
              {data.recommendations.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={impactColor[r.impact]}>
                      {r.impact} impact
                    </Badge>
                    <Badge variant="secondary" className="text-xs">{r.category}</Badge>
                  </div>
                  <p className="text-sm font-medium">{r.change}</p>
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <TrendingUp className="h-3 w-3 mt-0.5 shrink-0" />
                    {r.evidence}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {data && data.recommendations.length === 0 && !needsBackfill && (
          <p className="text-sm text-muted-foreground">
            No strong peer patterns found — this listing already matches or exceeds your top performers.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
