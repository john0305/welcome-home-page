import { useEffect, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { supabase as typedSupabase } from '@/integrations/supabase/client'

// shop_type columns/tables land in the generated types when Lovable applies
// migration 20260702000004; until then use the repo's untyped-client pattern.
// deno-lint-ignore no-explicit-any
const supabase = typedSupabase as any
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { SHOP_TYPE_LABELS, type ShopType } from '@/lib/shopType'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface ProfileRow {
  shop_type: string | null
  shop_type_confidence: number | null
  shop_type_override: string | null
  shop_type_confirmed_at: string | null
  shop_type_breakdown: Record<string, number> | null
}

/**
 * "How your shop works" — shows the detected seller model (digital,
 * made-to-order, vintage, …) and lets the seller confirm or correct it.
 * Every confirm/correct writes to shop_type_corrections as training signal;
 * a correction sets shop_type_override, which takes precedence everywhere.
 */
export function ShopTypeCard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [row, setRow] = useState<ProfileRow | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('user_niche_profiles')
      .select('shop_type, shop_type_confidence, shop_type_override, shop_type_confirmed_at, shop_type_breakdown')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: ProfileRow | null }) => setRow(data))
  }, [user?.id])

  if (!row?.shop_type) return null

  const effectiveType = (row.shop_type_override ?? row.shop_type) as ShopType
  const label = SHOP_TYPE_LABELS[effectiveType] ?? effectiveType
  const confirmed = !!row.shop_type_confirmed_at

  const save = async (chosen: ShopType) => {
    if (!user?.id || saving) return
    setSaving(true)
    const isCorrection = chosen !== row.shop_type
    try {
      await supabase.from('shop_type_corrections').insert({
        user_id: user.id,
        detected_type: row.shop_type,
        detected_confidence: row.shop_type_confidence,
        corrected_type: chosen,
        detection_breakdown: row.shop_type_breakdown,
      })
      const { error } = await supabase
        .from('user_niche_profiles')
        .update({
          shop_type_override: isCorrection ? chosen : null,
          shop_type_confirmed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
      if (error) throw error
      setRow({
        ...row,
        shop_type_override: isCorrection ? chosen : null,
        shop_type_confirmed_at: new Date().toISOString(),
      })
      setEditing(false)
      toast({
        title: isCorrection ? 'Thanks — noted!' : 'Great, locked in',
        description: isCorrection
          ? `We'll tailor advice for ${SHOP_TYPE_LABELS[chosen].toLowerCase()} from now on.`
          : 'Your recommendations stay tuned to how your shop actually works.',
        variant: 'success',
      })
    } catch {
      toast({ title: "Couldn't save that just now", description: 'Give it another try in a moment.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">How your shop works</CardTitle>
        <CardDescription className="text-xs">
          This shapes which advice you see — photo tips for a digital shop are about
          preview images, not lighting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {row.shop_type_override
                  ? 'Set by you'
                  : confirmed
                  ? 'Confirmed by you'
                  : 'Detected from your listings — does this look right?'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!confirmed && (
                <button
                  type="button"
                  onClick={() => void save(effectiveType)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> Yes, that's right
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> {confirmed ? 'Change' : 'Not quite'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.entries(SHOP_TYPE_LABELS) as [ShopType, string][]).map(([key, text]) => (
              <button
                key={key}
                type="button"
                disabled={saving}
                onClick={() => void save(key)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                  key === effectiveType
                    ? 'border-primary bg-primary/8 font-semibold text-foreground'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
