import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FlaskConical, AlertTriangle } from 'lucide-react'

interface OptRow { type: string; status: string }

export default function AdminABTesting() {
  const [rows, setRows] = useState<OptRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase.from('optimizations').select('type,status').limit(10000)
      setRows((data ?? []) as OptRow[])
      setLoading(false)
    })()
  }, [])

  // Group by type → status counts
  const byType = new Map<string, { accepted: number; rejected: number; pending: number; total: number }>()
  rows.forEach(r => {
    const t = r.type || 'unknown'
    if (!byType.has(t)) byType.set(t, { accepted: 0, rejected: 0, pending: 0, total: 0 })
    const b = byType.get(t)!
    b.total++
    if (r.status === 'accepted') b.accepted++
    else if (r.status === 'rejected') b.rejected++
    else b.pending++
  })
  const sorted = Array.from(byType.entries()).sort((a, b) => b[1].total - a[1].total)
  const grandTotal = rows.length
  const totalAccepted = rows.filter(r => r.status === 'accepted').length
  const totalRejected = rows.filter(r => r.status === 'rejected').length
  const overallAcceptance = grandTotal ? Math.round((totalAccepted / (totalAccepted + totalRejected || 1)) * 100) : 0

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#00D4C8]/15 flex items-center justify-center">
          <FlaskConical className="h-5 w-5 text-[#00D4C8]" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">A/B Testing</h1>
          <p className="text-sm text-muted-foreground">How users respond to AI optimizations across the platform</p>
        </div>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4 flex gap-3 items-start">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-200/90">
            <p className="font-medium mb-1">Limited view</p>
            <p>RADARIQ doesn't yet store dedicated A/B experiment records, so this page derives "A/B" signal from optimization accept/reject rates by type. To build true split-test analytics (variant A vs B per listing, conversion deltas, winner detection), the platform needs an `experiments` and `experiment_results` table — let me know when you want me to add them.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total optimizations" value={grandTotal.toLocaleString()} />
        <StatCard label="Accepted" value={totalAccepted.toLocaleString()} tone="emerald" />
        <StatCard label="Rejected" value={totalRejected.toLocaleString()} tone="red" />
        <StatCard label="Acceptance rate" value={grandTotal ? `${overallAcceptance}%` : '—'} tone="cyan" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">By optimization type</CardTitle>
          <CardDescription>Which AI rewrites users actually accept vs throw away</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p>
            : sorted.length === 0 ? <p className="p-6 text-sm text-muted-foreground text-center">No optimizations run yet.</p>
            : (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-[1.5fr,0.6fr,0.6fr,0.6fr,1.5fr] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted/20">
                  <span>Type</span>
                  <span>Accepted</span>
                  <span>Rejected</span>
                  <span>Pending</span>
                  <span>Accept rate</span>
                </div>
                {sorted.map(([type, b]) => {
                  const decided = b.accepted + b.rejected
                  const rate = decided ? Math.round((b.accepted / decided) * 100) : null
                  const tone = rate == null ? 'muted' : rate >= 70 ? 'emerald' : rate >= 40 ? 'amber' : 'red'
                  return (
                    <div key={type} className="grid grid-cols-[1.5fr,0.6fr,0.6fr,0.6fr,1.5fr] gap-3 px-4 py-3 items-center">
                      <div>
                        <p className="text-sm font-medium capitalize">{type}</p>
                        <p className="text-[11px] text-muted-foreground">{b.total} total</p>
                      </div>
                      <span className="text-sm">{b.accepted}</span>
                      <span className="text-sm">{b.rejected}</span>
                      <span className="text-sm text-muted-foreground">{b.pending}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          {rate != null && (
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${rate}%`,
                                background: tone === 'emerald' ? '#10b981' : tone === 'amber' ? '#f59e0b' : tone === 'red' ? '#ef4444' : '#6b7280',
                              }}
                            />
                          )}
                        </div>
                        <span className={`text-xs font-medium min-w-[40px] text-right ${
                          tone === 'emerald' ? 'text-emerald-400' :
                          tone === 'amber' ? 'text-amber-400' :
                          tone === 'red' ? 'text-red-400' : 'text-muted-foreground'
                        }`}>
                          {rate != null ? `${rate}%` : '—'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'red' | 'cyan' }) {
  const color = tone === 'emerald' ? 'text-emerald-400' : tone === 'red' ? 'text-red-400' : tone === 'cyan' ? 'text-[#00D4C8]' : 'text-foreground'
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
