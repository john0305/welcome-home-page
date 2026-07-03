/**
 * GuidedFixFlow
 *
 * Implements the spec's guided fix pattern:
 *   1. SURFACE INSIGHT — signal + impact badge + context + [Fix This →]
 *   2. SHOW WHAT WILL CHANGE — before/after diff + [Apply] [Edit] [Skip]
 *   3. CONFIRM AND EXECUTE — loading → "3 tags added" + [↺ Undo] (48h)
 *   4. TRACK — attribution window started
 *
 * Works for both tag gap fixes and title updates.
 * Title updates require calling market-title-suggest first (handled here).
 */
import { useState } from 'react'
import { Tag, Type, ChevronRight, Loader2, CheckCircle2, RotateCcw, X, AlertTriangle } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any
import { useToast } from '@/hooks/use-toast'
import { canUseTierOnly } from '@/lib/tier-access'
import { LockedFeature } from './LockedFeature'
import type { MarketScoreRow } from '@/hooks/useMarketScore'

type FixType = 'tags' | 'title'
type FlowStep = 'surface' | 'preview' | 'applying' | 'done' | 'error'

interface Props {
  type: FixType
  listingId: string
  listingEtsyId: string
  marketScore: MarketScoreRow
  currentTags: string[]
  currentTitle: string
  tier?: string | null
  onReverted?: () => void
  onApplied?: () => void
}

export function GuidedFixFlow({
  type,
  listingId,
  listingEtsyId: _listingEtsyId,
  marketScore,
  currentTags,
  currentTitle,
  tier,
  onReverted,
  onApplied,
}: Props) {
  const { toast } = useToast()
  const [step, setStep] = useState<FlowStep>('surface')
  const [proposedTags, setProposedTags] = useState<string[] | null>(null)
  const [proposedTitle, setProposedTitle] = useState<string | null>(null)
  const [titleRationale, setTitleRationale] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [appliedFixId, setAppliedFixId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [reverting, setReverting] = useState(false)

  const missingTags = (marketScore.missing_tags ?? []).slice(0, 8)
  const tagsAvailable = 13 - currentTags.length
  const tagsToAdd = missingTags.slice(0, Math.min(missingTags.length, tagsAvailable))

  const canFixTags  = canUseTierOnly(tier, 'guided_fix_tags')
  const canFixTitle = canUseTierOnly(tier, 'guided_fix_title')
  const canFix = type === 'tags' ? canFixTags : canFixTitle

  const handleOpenPreview = async () => {
    if (type === 'tags') {
      setProposedTags([...currentTags, ...tagsToAdd])
      setStep('preview')
      return
    }

    setStep('applying')
    const { data, error } = await supabase.functions.invoke('market-title-suggest', {
      body: { listing_id: listingId },
    })
    if (error || !data?.suggested_title) {
      setErrorMsg(error?.message ?? 'Could not generate a title suggestion. Try again.')
      setStep('error')
      return
    }
    setProposedTitle(data.suggested_title)
    setTitleRationale(data.rationale ?? '')
    setEditValue(data.suggested_title)
    setStep('preview')
  }

  const handleApply = async (overrideValue?: unknown) => {
    setStep('applying')

    const factorKey = type === 'tags' ? 'market_tag_gap' : 'market_title_length'
    const { data: actionRow } = await supabase
      .from('fix_actions')
      .select('id')
      .eq('listing_id', listingId)
      .eq('factor_key', factorKey)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!actionRow) {
      const value = type === 'tags'
        ? (overrideValue ?? proposedTags)
        : (overrideValue ?? (editMode ? editValue : proposedTitle))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErrorMsg('Not authenticated.'); setStep('error'); return }

      const { data: newAction } = await supabase
        .from('fix_actions')
        .insert({
          user_id: user.id,
          listing_id: listingId,
          factor_key: factorKey,
          dimension: type === 'tags' ? 'tags' : 'content',
          mode: 'guided',
          status: 'pending',
          severity: 'high' as never,
          current_value: (type === 'tags' ? currentTags : currentTitle) as unknown as never,
          proposed_value: value as unknown as never,
          source: 'manual' as never,
        })
        .select('id')
        .single()

      if (!newAction) {
        setErrorMsg('Failed to create fix action.')
        setStep('error')
        return
      }

      return applyById(newAction.id, type === 'title' && editMode ? editValue : undefined)
    }

    const editedValue = type === 'title'
      ? (editMode ? editValue : proposedTitle ?? undefined)
      : undefined
    return applyById(actionRow.id, editedValue)
  }

  const applyById = async (fixActionId: string, editedValue?: unknown) => {
    const { data, error } = await supabase.functions.invoke('apply-fix-action', {
      body: { fix_action_id: fixActionId, ...(editedValue !== undefined ? { edited_value: editedValue } : {}) },
    })

    if (error || !data?.ok) {
      const reason = data?.reason ?? error?.message ?? 'Unknown error'
      if (data?.kind === 'demoted_to_guided') {
        toast({
          title: "Couldn't auto-apply",
          description: 'Switched to copy-and-paste mode — check your Action Queue.',
        })
        setStep('surface')
        return
      }
      setErrorMsg(reason)
      setStep('error')
      return
    }

    setAppliedFixId(fixActionId)
    setStep('done')
    onApplied?.()
  }

  const handleRevert = async () => {
    if (!appliedFixId) return
    setReverting(true)
    try {
      const { data: version } = await supabase
        .from('listing_versions')
        .select('id')
        .eq('listing_id', listingId)
        .is('restored_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!version) {
        toast({ title: 'Nothing to revert', description: 'No snapshot found.', variant: 'destructive' })
        return
      }

      const { error } = await supabase.functions.invoke('revert-listing', {
        body: { version_id: version.id },
      })
      if (error) throw error
      toast({ title: 'Reverted', description: 'Your listing is back to its previous state.' })
      setStep('surface')
      onReverted?.()
    } catch (e) {
      toast({ title: 'Revert failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setReverting(false)
    }
  }

  if (!canFix) {
    return (
      <LockedFeature
        feature={type === 'tags' ? 'guided_fix_tags' : 'guided_fix_title'}
        tier={tier}
      />
    )
  }

  if (type === 'tags' && tagsToAdd.length === 0) return null
  if (type === 'title' && (marketScore.title_score ?? 100) >= 80) return null

  if (step === 'surface') {
    const Icon = type === 'tags' ? Tag : Type
    const title = type === 'tags'
      ? `You're leaving ${tagsToAdd.length} high-traffic tag${tagsToAdd.length !== 1 ? 's' : ''} on the table`
      : `This title has room to reach more shoppers`
    const context = type === 'tags'
      ? `Shops like yours are ranking with tags you haven't used yet: ${tagsToAdd.slice(0, 3).map(t => `[${t}]`).join(' ')}${tagsToAdd.length > 3 ? ` + ${tagsToAdd.length - 3} more` : ''}. You have ${tagsAvailable} tag slot${tagsAvailable !== 1 ? 's' : ''} free — easy win.`
      : `At ${currentTitle.length} characters, this title's shorter than what's winning your searches (${marketScore.market_rank_estimate ? '90+' : 'noticeably longer'}, with more of the words buyers type). Want help expanding it?`

    return (
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-sm font-medium text-foreground leading-snug">{title}</p>
          </div>
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400">
            HIGH IMPACT
          </span>
        </div>
        <p className="text-xs mb-4 text-muted-foreground">{context}</p>
        <button
          onClick={handleOpenPreview}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold bg-primary text-background transition-all hover:opacity-90"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          {type === 'tags' ? `Fix this — add ${tagsToAdd.length} tag${tagsToAdd.length !== 1 ? 's' : ''}` : 'Fix this — see suggested title'}
        </button>
      </div>
    )
  }

  if (step === 'applying') {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-6 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm text-foreground">
          {type === 'tags' ? 'Generating title suggestion…' : 'Updating your listing…'}
        </p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="rounded-xl border border-red-500/25 bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <p className="text-sm font-medium text-foreground">Something went wrong</p>
        </div>
        <p className="text-xs mb-3 text-muted-foreground">{errorMsg}</p>
        <button onClick={() => setStep('surface')} className="text-xs font-medium text-primary">
          ← Try again
        </button>
      </div>
    )
  }

  if (step === 'done') {
    const what = type === 'tags' ? `${tagsToAdd.length} tags added to your listing` : 'Title updated on Etsy'
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-surface-1 p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <p className="text-sm font-semibold text-foreground">{what}</p>
        </div>
        <p className="text-xs mb-3 text-muted-foreground">
          We'll track your score for the next 7 days. Check back to see if it helped.
        </p>
        <button
          onClick={handleRevert}
          disabled={reverting}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {reverting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          Undo this change
        </button>
      </div>
    )
  }

  // step === 'preview'
  const isTags = type === 'tags'

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          {isTags ? "Here's what will change" : 'AI-suggested title'}
        </p>
        <button onClick={() => setStep('surface')} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isTags ? (
        <>
          <div className="space-y-2 text-xs">
            <div>
              <p className="mb-1 text-muted-foreground">Current tags ({currentTags.length}/13)</p>
              <div className="flex flex-wrap gap-1">
                {currentTags.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded bg-surface-2 text-foreground">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-emerald-400">Adding ({tagsToAdd.length})</p>
              <div className="flex flex-wrap gap-1">
                {tagsToAdd.map(t => (
                  <span key={t} className="px-2 py-0.5 rounded font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    + {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2 text-xs">
            <div>
              <p className="mb-1 text-muted-foreground">Before ({currentTitle.length} chars)</p>
              <p className="p-2 rounded bg-surface-2 text-muted-foreground">{currentTitle}</p>
            </div>
            <div>
              <p className="mb-1 text-emerald-400">After ({(editMode ? editValue : proposedTitle ?? '').length} chars)</p>
              {editMode ? (
                <textarea
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  maxLength={140}
                  rows={3}
                  className="w-full p-2 rounded text-foreground resize-none outline-none bg-surface-2 border border-primary/30 focus:border-primary/60"
                />
              ) : (
                <p className="p-2 rounded bg-emerald-500/8 text-emerald-400">
                  {proposedTitle}
                </p>
              )}
            </div>
            {titleRationale && !editMode && (
              <p className="text-[10px] text-muted-foreground/60">{titleRationale}</p>
            )}
          </div>
          {!editMode && (
            <button onClick={() => setEditMode(true)} className="text-xs font-medium text-primary">Edit before applying</button>
          )}
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => handleApply()}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold bg-primary text-background transition-all hover:opacity-90"
        >
          Apply {isTags ? `${tagsToAdd.length} tags` : 'this title'}
        </button>
        <button
          onClick={() => { setStep('surface'); setEditMode(false) }}
          className="px-3 py-2 rounded-md text-xs font-medium text-muted-foreground border border-border transition-colors hover:bg-surface-2"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
