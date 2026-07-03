import { useState, useEffect, useMemo } from 'react'
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Lightbulb, RefreshCw, Lock, Store as StoreIcon, X,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { getPersonalityQuestions, buildSystemPrompt } from '@/types/store-profile'
import type { StorePersonality, AiFollowup } from '@/types/store-profile'
import { loadPersonalization, savePersonalization, requestFollowups } from '@/lib/personalization'
import { useApp } from '@/contexts/AppContext'
import { detectShopCategory, CATEGORY_LABELS, type ShopCategory } from '@/lib/detectShopCategory'
import { completeOnboardingStep } from '@/types/onboarding'
import { ShopTypeCard } from '@/components/personal/ShopTypeCard'

const DEFAULT_PROFILE: Partial<StorePersonality> = {
  tone: 'casual',
  price_positioning: 'mid-range',
  emoji_usage: 'minimal',
  description_style: 'mixed',
  style_keywords: [],
  avoid_keywords: [],
}

export default function StoreProfile() {
  const { toast } = useToast()
  const { connectedStore, storeStatus, listings, dashboardRows } = useApp()
  const shopId = connectedStore?.shop_id ?? null

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Partial<StorePersonality>>(DEFAULT_PROFILE)
  const [followups, setFollowups] = useState<AiFollowup[]>([])
  const [hasOverride, setHasOverride] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingFollowups, setLoadingFollowups] = useState(false)
  const [previewPrompt, setPreviewPrompt] = useState(false)
  const [category, setCategory] = useState<ShopCategory | null>(null)
  const [categoryOverridden, setCategoryOverridden] = useState(false)
  const [personalizationShopId, setPersonalizationShopId] = useState<string | null>(shopId)
  const [hasLoadedPersonalization, setHasLoadedPersonalization] = useState(false)
  // After 2.5s, stop showing the "checking…" spinner even if the connection
  // probe hasn't resolved — fall back to the connect-shop prompt so the page
  // never gets stuck in a permanent loading state.
  const [checkTimedOut, setCheckTimedOut] = useState(false)
  useEffect(() => {
    if (shopId || storeStatus !== 'unknown') return
    const t = setTimeout(() => setCheckTimedOut(true), 2500)
    return () => clearTimeout(t)
  }, [shopId, storeStatus])

  // Auto-detect the shop's category from listings whenever they change. The
  // user can still manually override via the dropdown.
  const detectedCategory = useMemo<ShopCategory>(() => {
    const sample = listings.length > 0
      ? listings.slice(0, 60).map(l => ({ title: l.title, tags: l.tags, materials: (l as { materials?: string[] }).materials }))
      : dashboardRows.slice(0, 60).map(r => ({ title: r.title, tags: r.tags, materials: [] }))
    return detectShopCategory(sample)
  }, [listings, dashboardRows])

  const effectiveCategory = categoryOverridden ? category : (category ?? detectedCategory)
  const activePersonalizationShopId = shopId ?? personalizationShopId

  const questions = useMemo(() => getPersonalityQuestions(effectiveCategory), [effectiveCategory])
  const current = questions[step]
  const totalSteps = questions.length
  const answered = questions.filter(q => answers[q.id]).length
  const completionPct = Math.round((answered / totalSteps) * 100)
  const isComplete = answered >= questions.filter(q => q.required).length

  // Load from DB on mount, scoped to the currently connected shop. When the
  // user reconnects a different Etsy shop, this re-runs and loads that
  // shop's own answers (or starts blank) — no more leftover answers from a
  // previous shop bleeding through.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setHasLoadedPersonalization(false)
    void (async () => {
      const state = await loadPersonalization(shopId)
      if (cancelled) return
      if (state) {
        setPersonalizationShopId(state.shop_id)
        setAnswers({ ...DEFAULT_PROFILE, ...state.answers })
        setFollowups(state.ai_followups)
        setHasOverride(state.has_custom_override)
        setCategory((state.category as ShopCategory | null) ?? null)
        setCategoryOverridden(!!state.category)
        setLastSavedAt(state.updated_at ? new Date(state.updated_at) : null)
      } else {
        setPersonalizationShopId(shopId)
        setAnswers({ ...DEFAULT_PROFILE })
        setFollowups([])
        setHasOverride(false)
        setCategory(null)
        setCategoryOverridden(false)
      }
      setStep(0)
      setHasLoadedPersonalization(true)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [shopId])

  // Debounced save to DB whenever answers change (after initial load).
  useEffect(() => {
    if (loading || !hasLoadedPersonalization || !activePersonalizationShopId) return
    const t = setTimeout(() => { void savePersonalization(activePersonalizationShopId, answers, effectiveCategory) }, 600)
    return () => clearTimeout(t)
  }, [answers, loading, hasLoadedPersonalization, activePersonalizationShopId, effectiveCategory])

  const setValue = (key: keyof StorePersonality, value: string | string[]) => {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  const handleCommaSeparated = (key: keyof StorePersonality, value: string) => {
    const arr = value.split(',').map(s => s.trim()).filter(Boolean)
    setAnswers(prev => ({ ...prev, [key]: arr, [`${key}_raw`]: value }))
  }

  const handleGetFollowups = async () => {
    setLoadingFollowups(true)
    try {
      const result = await requestFollowups(activePersonalizationShopId)
      setFollowups(result)
      toast({ title: 'Got fresh suggestions', description: `${result.length} new question${result.length === 1 ? '' : 's'} tailored to your shop.`, variant: 'success' })
    } catch (err) {
      toast({ title: 'Could not generate suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
    } finally {
      setLoadingFollowups(false)
    }
  }

  // Explicit save — bypasses debounce, shows toast feedback. Used by the
  // "Save profile" button and the per-category save button so changes never
  // get lost if the user navigates away inside the 600ms debounce window.
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const handleSaveNow = async (opts?: { silent?: boolean }) => {
    setSaving(true)
    try {
      await savePersonalization(activePersonalizationShopId, answers, effectiveCategory)
      setLastSavedAt(new Date())
      if (!opts?.silent) {
        toast({ title: 'Saved ✓', description: 'Your answers are saved. You can edit them anytime.', variant: 'success' })
      }
      return true
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' })
      return false
    } finally {
      setSaving(false)
    }
  }


  const systemPrompt = buildSystemPrompt(answers)

  const currentValue = answers[current?.id as keyof StorePersonality]
  const rawValue = (answers as Record<string, string>)[`${current?.id}_raw`]
    ?? (Array.isArray(currentValue) ? currentValue.join(', ') : currentValue ?? '')

  // No shop gate — the personalization questions are about the seller's
  // brand voice, not their Etsy connection. Render the questions regardless.
  // Saves are skipped silently when there's no shopId; they'll persist once
  // a shop is connected (answers stay in local state in the meantime).

  return (
    <div className="flex flex-col" style={{ background: "hsl(var(--background))", minHeight: '100%' }}>
      <Header title="Personalize Your AI" description="Help Radar IQ write listings that sound exactly like your brand" />

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-4">
        {/* Detected shop type — confirm/correct (Section 9 self-learning loop) */}
        <ShopTypeCard />

        {/* Top bar: store info + save */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2 text-xs">
            <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Personalizing for</span>
            <Badge variant="outline" className="font-medium">{connectedStore?.shop_name || 'this shop'}</Badge>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Category:</span>
            <Select
              value={effectiveCategory ?? 'other'}
              onValueChange={v => { setCategory(v as ShopCategory); setCategoryOverridden(true) }}
            >
              <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k} className="text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!categoryOverridden && (
              <span className="text-[10px] text-muted-foreground italic">auto-detected</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {lastSavedAt && (
                <span className="text-[10px] text-emerald-400">
                  Saved {lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                disabled={saving || loading || !activePersonalizationShopId}
                onClick={() => void handleSaveNow()}
                title={!activePersonalizationShopId ? 'Connect a shop first' : 'Save all your answers'}
              >
                <Check className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save all'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{answered} of {totalSteps} questions answered</span>
            <span className="font-medium text-foreground">{completionPct}%</span>
          </div>
          <Progress value={completionPct} className="h-1.5" />
          {isComplete && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              Core questions done — your AI is now personalized!
            </div>
          )}
        </div>

        {hasOverride && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Your AI is using a custom prompt tailored to your shop.</strong> Updating answers below sharpens that prompt rather than replacing it.
            </AlertDescription>
          </Alert>
        )}

        {/* Two-column layout: question list left, active question right */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">

          {/* LEFT — scrollable question list */}
          <Card className="md:sticky md:top-4">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Questions</CardTitle>
            </CardHeader>
            <CardContent className="p-1 pb-2 space-y-0.5 max-h-[70vh] overflow-y-auto">
              {questions.map((q, i) => {
                const val = answers[q.id as keyof StorePersonality]
                const isDone = !!val && (Array.isArray(val) ? val.length > 0 : true)
                return (
                  <button
                    key={q.id}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted transition-colors ${i === step ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}
                    onClick={() => setStep(i)}
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isDone ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      {isDone ? <Check className="h-3 w-3" /> : i + 1}
                    </div>
                    <span className="truncate flex-1 text-xs leading-snug">{q.question.length > 55 ? q.question.slice(0, 55) + '…' : q.question}</span>
                    {q.required && !isDone && <span className="shrink-0 text-[9px] text-amber-500 font-semibold uppercase">Req</span>}
                  </button>
                )
              })}
            </CardContent>
          </Card>

          {/* RIGHT — active question card */}
          <div className="space-y-4">
            {loading && shopId && (
              <Card>
                <CardContent className="p-6 text-xs text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Loading your previous answers…
                </CardContent>
              </Card>
            )}
            {!loading && current && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span>Question {step + 1} of {totalSteps}</span>
                    {current.required && <Badge variant="outline" className="text-[10px] py-0 h-4">Required</Badge>}
                  </div>
                  <CardTitle className="text-base font-semibold leading-snug">{current.question}</CardTitle>
                  {current.helpText && (
                    <CardDescription className="text-xs">{current.helpText}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {current.type === 'textarea' && (
                    <Textarea
                      rows={4}
                      placeholder={current.placeholder}
                      value={rawValue as string}
                      onChange={e => setValue(current.id as keyof StorePersonality, e.target.value)}
                    />
                  )}
                  {current.type === 'text' && (
                    Array.isArray(answers[current.id as keyof StorePersonality]) ? (
                      <Input
                        placeholder={current.placeholder}
                        value={rawValue as string}
                        onChange={e => handleCommaSeparated(current.id as keyof StorePersonality, e.target.value)}
                      />
                    ) : (
                      <Input
                        placeholder={current.placeholder}
                        value={rawValue as string}
                        onChange={e => setValue(current.id as keyof StorePersonality, e.target.value)}
                      />
                    )
                  )}
                  {current.type === 'select' && current.options && (
                    <Select
                      value={rawValue as string}
                      onValueChange={v => setValue(current.id as keyof StorePersonality, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {current.options.map(o => (
                          <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep(s => Math.max(0, s - 1))}
                      disabled={step === 0}
                      className="gap-1.5"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back
                    </Button>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const v = answers[current.id as keyof StorePersonality]
                        const hasValue = Array.isArray(v) ? v.length > 0 : !!v
                        if (!hasValue) return null
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAnswers(prev => {
                                const next = { ...prev }
                                delete (next as Record<string, unknown>)[current.id]
                                delete (next as Record<string, unknown>)[`${current.id}_raw`]
                                return next
                              })
                            }}
                            className="gap-1.5 text-muted-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                            Clear
                          </Button>
                        )
                      })()}
                      {!current.required && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStep(s => Math.min(totalSteps - 1, s + 1))}
                        >
                          Skip
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (step < totalSteps - 1) {
                            await handleSaveNow({ silent: true })
                            setStep(s => s + 1)
                          } else {
                            const ok = await handleSaveNow({ silent: true })
                            if (ok) {
                              toast({ title: 'Profile saved!', description: 'Your AI will now write listings in your brand voice.', variant: 'success' })
                              completeOnboardingStep('personalize_ai')
                              window.dispatchEvent(new Event('radariq:onboarding-updated'))
                            }
                          }
                        }}
                        disabled={saving || (current.required && !answers[current.id as keyof StorePersonality])}
                        className="gap-1.5"
                      >
                        {step < totalSteps - 1 ? (
                          <>Next <ChevronRight className="h-3.5 w-3.5" /></>
                        ) : (
                          <>{saving ? 'Saving…' : 'Save profile'} <Check className="h-3.5 w-3.5" /></>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Alert variant="info">
              <Lightbulb className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This information is <strong>never visible to buyers</strong> — it's used only to make your AI-generated listings sound authentically like your shop.
              </AlertDescription>
            </Alert>

            {/* AI-suggested follow-ups */}
            {isComplete && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Suggested follow-ups
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Questions our AI thinks would sharpen your prompt.
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={handleGetFollowups} disabled={loadingFollowups} className="gap-1.5 shrink-0">
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingFollowups ? 'animate-spin' : ''}`} />
                      {followups.length ? 'Refresh' : 'Get suggestions'}
                    </Button>
                  </div>
                </CardHeader>
                {followups.length > 0 && (
                  <CardContent className="space-y-2">
                    {followups.map(f => (
                      <div key={f.id} className="rounded-md border border-border/50 p-3 space-y-1">
                        <p className="text-sm font-medium">{f.question}</p>
                        {f.why && <p className="text-xs text-muted-foreground italic">Why: {f.why}</p>}
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Answering these in your store description / unique-selling-points fields above will weave them into your AI prompt.
                    </p>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Preview system prompt */}
            {isComplete && (
              <Card>
                <CardContent className="p-4">
                  <button
                    className="flex w-full items-center justify-between text-sm font-medium"
                    onClick={() => setPreviewPrompt(p => !p)}
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Preview AI context (what Gemini sees)
                    </span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${previewPrompt ? 'rotate-90' : ''}`} />
                  </button>
                  {previewPrompt && (
                    <pre className="mt-3 rounded-md bg-surface-1 p-4 text-xs text-foreground/80 whitespace-pre-wrap font-mono overflow-auto max-h-60">
                      {systemPrompt || '(Fill in required questions to generate preview)'}
                    </pre>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
