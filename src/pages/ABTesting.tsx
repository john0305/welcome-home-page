/**
 * A/B Testing — Pro feature
 * Two optimized versions of a listing run sequentially (2 weeks each).
 * RADARIQ tracks views/sales and recommends the winner.
 */

import { useState } from 'react'
import { FlaskConical, ArrowRight, CheckCircle2, Clock, TrendingUp, Sparkles } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { PaidFeatureGate } from '@/components/auth/PaidFeatureGate'
import { GradeBadge } from '@/components/listings/GradeBadge'
import { useApp } from '@/contexts/AppContext'

// Mock A/B test data
const mockTests = [
  {
    id: 'ab-001',
    listing_id: 'l-002',
    listing_title: 'Boho Turquoise Ring Sterling Silver',
    status: 'completed' as const,
    started_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    version_a: {
      title: 'Boho Turquoise Ring Sterling Silver Adjustable',
      grade: 78,
      views: 312,
      favorites: 24,
      sales: 4,
      duration_days: 14,
    },
    version_b: {
      title: 'Handmade Turquoise Ring 925 Sterling Silver Bohemian Adjustable Band Gift for Her',
      grade: 88,
      views: 489,
      favorites: 41,
      sales: 7,
      duration_days: 14,
    },
    winner: 'b' as const,
  },
  {
    id: 'ab-002',
    listing_id: 'l-001',
    listing_title: 'Sterling Silver Moon Pendant Necklace',
    status: 'running_b' as const,
    started_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    version_a: {
      title: 'Sterling Silver Moon Pendant Necklace Handmade',
      grade: 65,
      views: 201,
      favorites: 18,
      sales: 2,
      duration_days: 14,
    },
    version_b: {
      title: 'Celestial Moon Necklace Sterling Silver Handmade Crescent Pendant Dainty Layering Jewelry',
      grade: 84,
      views: 156, // still running
      favorites: 15,
      sales: 1,
      duration_days: 14,
    },
    winner: null,
  },
]

function TestCard({ test }: { test: typeof mockTests[0] }) {
  const daysRemaining = test.status === 'running_b'
    ? 14 - Math.floor((Date.now() - new Date(test.started_at).getTime()) / 86400000) + 14
    : 0

  const progressPct = test.status === 'completed' ? 100
    : 50 + Math.floor((Date.now() - new Date(test.started_at).getTime()) / 86400000) / 14 * 50

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{test.listing_title}</CardTitle>
            <CardDescription className="text-xs mt-0.5">2-week A/B test</CardDescription>
          </div>
          <Badge variant={test.status === 'completed' ? 'success' : 'warning'} className="shrink-0">
            {test.status === 'completed' ? 'Completed' : 'Running Version B'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Test progress</span>
            <span>{test.status === 'completed' ? 'Done' : `${daysRemaining}d remaining`}</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Wk 1–2: Version A</span>
            <span>Wk 3–4: Version B</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(['a', 'b'] as const).map(v => {
            const ver = test[`version_${v}`]
            const isWinner = test.winner === v
            const isRunning = test.status === `running_${v}`
            return (
              <div key={v} className={`rounded-lg border p-3 space-y-2 ${isWinner ? 'border-emerald-300 bg-emerald-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <Badge variant={v === 'a' ? 'secondary' : 'info'} className="text-[10px] py-0 h-4">Version {v.toUpperCase()}</Badge>
                  {isWinner && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {isRunning && <span className="text-[10px] text-amber-600 font-medium">Live now</span>}
                </div>
                <p className="text-xs font-medium line-clamp-2">{ver.title}</p>
                <GradeBadge score={ver.grade} size="sm" />
                <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                  <div><p className="font-semibold">{ver.views}</p><p className="text-muted-foreground">Views</p></div>
                  <div><p className="font-semibold">{ver.favorites}</p><p className="text-muted-foreground">Favs</p></div>
                  <div><p className="font-semibold">{ver.sales}</p><p className="text-muted-foreground">Sales</p></div>
                </div>
              </div>
            )
          })}
        </div>

        {test.winner && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-emerald-900">
                Version {test.winner.toUpperCase()} wins — {Math.round((test.version_b.views / Math.max(1, test.version_a.views) - 1) * 100)}% more views, {test.version_b.sales - test.version_a.sales} more sales
              </p>
            </div>
            <Button size="sm" className="h-7 text-xs shrink-0 gap-1">
              Apply winner
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function ABTesting() {
  const { listings } = useApp()
  const [selectedListing, setSelectedListing] = useState('')

  return (
    <div className="flex flex-col">
      <Header title="A/B Testing" description="Test two listing versions head-to-head to find what actually converts" />

      <div className="flex-1 p-6 space-y-6">
        <PaidFeatureGate
          requiredTier="pro"
          featureName="A/B Split Testing"
          description="Generate two AI-optimized versions of any listing. Run each for 2 weeks, compare views and sales, apply the winner automatically. Pro and Agency plans."
        >
          <div className="space-y-4">
            {/* How it works */}
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { icon: Sparkles, label: 'AI generates 2 versions' },
                    { icon: ArrowRight, label: '' },
                    { icon: Clock, label: 'Version A live for 2 weeks' },
                    { icon: ArrowRight, label: '' },
                    { icon: Clock, label: 'Version B live for 2 weeks' },
                    { icon: ArrowRight, label: '' },
                    { icon: TrendingUp, label: 'Winner applied automatically' },
                  ].map((s, i) => (
                    s.label === '' ? <ArrowRight key={i} className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                    : (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <s.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        {s.label}
                      </div>
                    )
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* New test */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Start a new A/B test</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <select
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedListing}
                  onChange={e => setSelectedListing(e.target.value)}
                >
                  <option value="">Select a listing to test...</option>
                  {listings.map(l => (
                    <option key={l.id} value={l.id}>{l.title.slice(0, 60)}</option>
                  ))}
                </select>
                <Button disabled={!selectedListing} className="gap-1.5 shrink-0">
                  <FlaskConical className="h-4 w-4" />
                  Generate 2 versions
                </Button>
              </CardContent>
            </Card>

            {/* Existing tests */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Active & recent tests</p>
              {mockTests.map(t => <TestCard key={t.id} test={t} />)}
            </div>
          </div>
        </PaidFeatureGate>
      </div>
    </div>
  )
}
