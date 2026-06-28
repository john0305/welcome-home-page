/**
 * StoreHealthScan
 * Shown immediately after connecting Etsy — the "aha moment".
 * Shows a score + 3 quick wins so new users see value before doing anything.
 */

import { useState, useEffect } from 'react'
import { TrendingUp, Image, Tag, FileText, Star, ChevronRight, Sparkles, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { getGradeLabel, getGradeColor } from '@/types'
import { cn } from '@/lib/utils'
import type { QuickWin } from '@/types/onboarding'
import type { EtsyListing } from '@/types'

interface HealthScore {
  overall: number
  avg_grade: number
  avg_images: number
  avg_tags: number
  avg_description_length: number
  listings_never_optimized: number
  listings_total: number
}

function computeHealthScore(listings: EtsyListing[]): HealthScore {
  if (!listings.length) return { overall: 0, avg_grade: 0, avg_images: 0, avg_tags: 0, avg_description_length: 0, listings_never_optimized: 0, listings_total: 0 }

  const avgGrade = listings.reduce((s, l) => s + (l.current_grade ?? 50), 0) / listings.length
  const avgImages = listings.reduce((s, l) => s + l.image_urls.length, 0) / listings.length
  const avgTags = listings.reduce((s, l) => s + l.tags.length, 0) / listings.length
  const avgDesc = listings.reduce((s, l) => s + l.description.length, 0) / listings.length

  const gradeScore = (avgGrade / 100) * 40
  const imageScore = Math.min(1, avgImages / 10) * 20
  const tagScore = Math.min(1, avgTags / 13) * 20
  const descScore = Math.min(1, avgDesc / 500) * 20

  return {
    overall: Math.round(gradeScore + imageScore + tagScore + descScore),
    avg_grade: Math.round(avgGrade),
    avg_images: Math.round(avgImages * 10) / 10,
    avg_tags: Math.round(avgTags * 10) / 10,
    avg_description_length: Math.round(avgDesc),
    listings_never_optimized: listings.filter(l => l.optimization_count === 0).length,
    listings_total: listings.length,
  }
}

function computeQuickWins(listings: EtsyListing[], score: HealthScore): QuickWin[] {
  const wins: QuickWin[] = []

  // Quick win 1: lowest-hanging grade improvement
  const lowestGrade = [...listings].sort((a, b) => (a.current_grade ?? 0) - (b.current_grade ?? 0))[0]
  if (lowestGrade) {
    wins.push({
      id: 'qw-1',
      title: `Optimize your lowest-graded listing (${lowestGrade.current_grade ?? '?'}/100)`,
      impact: 'high',
      effort: 'quick',
      description: `"${lowestGrade.title.slice(0, 50)}..." has the most room to improve. One click to schedule.`,
      action_label: 'Optimize now',
      action_route: `/app/listings/${lowestGrade.id}`,
      estimated_grade_gain: 30,
    })
  }

  // Quick win 2: image count
  const lowImages = listings.filter(l => l.image_urls.length < 5)
  if (lowImages.length > 0) {
    wins.push({
      id: 'qw-2',
      title: `${lowImages.length} listings need more photos`,
      impact: 'high',
      effort: 'medium',
      description: `Listings with 8+ images get 2.3× more favorites. You average ${score.avg_images} images.`,
      action_label: 'See listings',
      action_route: '/app/listings',
      estimated_grade_gain: 15,
    })
  }

  // Quick win 3: missing tags
  const missingTags = listings.filter(l => l.tags.length < 10)
  if (missingTags.length > 0) {
    wins.push({
      id: 'qw-3',
      title: `${missingTags.length} listings are missing tags`,
      impact: 'medium',
      effort: 'quick',
      description: `Etsy allows 13 tags. Using all 13 puts you in 40% more search results.`,
      action_label: 'Optimize tags',
      action_route: '/app/queue',
      estimated_grade_gain: 10,
    })
  }

  return wins.slice(0, 3)
}

interface StoreHealthScanProps {
  listings: EtsyListing[]
  onComplete: (quickWins: QuickWin[]) => void
}

export function StoreHealthScan({ listings, onComplete }: StoreHealthScanProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'scanning' | 'results'>('scanning')
  const [progress, setProgress] = useState(0)
  const [score, setScore] = useState<HealthScore | null>(null)

  useEffect(() => {
    // Simulate scanning
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval)
          const computed = computeHealthScore(listings)
          setScore(computed)
          setTimeout(() => setPhase('results'), 300)
          return 100
        }
        return p + 4
      })
    }, 80)
    return () => clearInterval(interval)
  }, [listings])

  const quickWins = score ? computeQuickWins(listings, score) : []

  if (phase === 'scanning') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
        <div className="relative">
          <div className="h-20 w-20 rounded-full border-4 border-primary flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <div className="absolute inset-0 h-20 w-20 rounded-full border-4 border-t-[hsl(var(--primary))] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        </div>
        <div className="space-y-2">
          <p className="text-xl font-bold">Scanning your store...</p>
          <p className="text-sm text-muted-foreground">Analyzing {listings.length} listings for SEO opportunities</p>
        </div>
        <div className="w-64 space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {progress < 30 ? 'Loading listings...' : progress < 60 ? 'Grading titles and descriptions...' : progress < 85 ? 'Checking tags and images...' : 'Computing your score...'}
          </p>
        </div>
      </div>
    )
  }

  if (!score) return null

  const gradeLabel = getGradeLabel(score.overall)
  const gradeClass = getGradeColor(score.overall)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Score */}
      <div className="text-center space-y-3">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your Store Health Score</p>
        <div className="flex items-center justify-center gap-4">
          <div className={cn('flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 text-3xl font-extrabold', gradeClass)}>
            {score.overall}
            <span className="text-xs font-normal mt-0.5">/ 100</span>
          </div>
          <div className="text-left">
            <p className="text-2xl font-bold">Grade {gradeLabel}</p>
            <p className="text-sm text-muted-foreground">{score.listings_total} listings scanned</p>
            <Badge variant={score.listings_never_optimized > 0 ? 'warning' : 'success'} className="mt-1">
              {score.listings_never_optimized} never optimized
            </Badge>
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Avg Grade', value: `${score.avg_grade}/100`, icon: Star, good: score.avg_grade >= 65 },
          { label: 'Avg Images', value: `${score.avg_images}/10`, icon: Image, good: score.avg_images >= 6 },
          { label: 'Avg Tags', value: `${score.avg_tags}/13`, icon: Tag, good: score.avg_tags >= 10 },
          { label: 'Avg Description', value: `${score.avg_description_length} chars`, icon: FileText, good: score.avg_description_length >= 300 },
        ].map(m => (
          <div key={m.label} className={cn('rounded-lg border p-3 text-center', m.good ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
            <m.icon className={cn('h-4 w-4 mx-auto mb-1', m.good ? 'text-emerald-600' : 'text-amber-600')} />
            <p className="text-sm font-bold">{m.value}</p>
            <p className="text-[10px] text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Quick wins */}
      <div className="space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Your 3 Quick Wins
        </p>
        {quickWins.map((win, i) => (
          <div key={win.id} className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group" onClick={() => navigate(win.action_route)}>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{win.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{win.description}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={win.impact === 'high' ? 'destructive' : 'warning'} className="text-[10px] py-0 h-4">
                  {win.impact} impact
                </Badge>
                {win.estimated_grade_gain && (
                  <span className="text-[10px] text-emerald-600 font-medium">+{win.estimated_grade_gain} pts estimated</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
          </div>
        ))}
      </div>

      <Button className="w-full gap-2" size="lg" onClick={() => onComplete(quickWins)}>
        <TrendingUp className="h-4 w-4" />
        Got it — show me my dashboard
      </Button>
    </div>
  )
}
