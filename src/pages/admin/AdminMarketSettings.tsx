import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { Settings, Save, Loader2, Flag, SlidersHorizontal, Mail } from 'lucide-react'
import { useAllFeatureFlags } from '@/hooks/useFeatureFlag'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface SettingRow {
  key: string
  value: string
  label: string | null
  last_changed_by: string | null
  last_changed_at: string
}

export default function AdminMarketSettings() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [savingFlag, setSavingFlag] = useState<string | null>(null)

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ['admin_platform_settings'],
    queryFn: async () => {
      const { data, error } = await db.from('platform_settings').select('*').order('key')
      if (error) throw error
      return (data ?? []) as SettingRow[]
    },
  })

  const { data: flags, isLoading: loadingFlags } = useAllFeatureFlags()

  const saveSetting = async (key: string) => {
    const val = editValues[key]
    if (val === undefined) return
    setSavingKey(key)
    try {
      const { error } = await db.from('platform_settings').update({
        value: val,
        last_changed_by: 'admin',
        last_changed_at: new Date().toISOString(),
      }).eq('key', key)
      if (error) throw error
      toast({ title: 'Setting saved', description: key })
      qc.invalidateQueries({ queryKey: ['admin_platform_settings'] })
      setEditValues(ev => { const n = { ...ev }; delete n[key]; return n })
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' })
    } finally { setSavingKey(null) }
  }

  const toggleFlag = async (flagKey: string, currentEnabled: boolean) => {
    setSavingFlag(flagKey)
    try {
      const { error } = await db.from('feature_flags').update({
        enabled: !currentEnabled,
        last_changed_by: 'admin',
        last_changed_at: new Date().toISOString(),
      }).eq('flag_key', flagKey)
      if (error) throw error
      toast({ title: `${flagKey} ${!currentEnabled ? 'enabled' : 'disabled'}` })
      qc.invalidateQueries({ queryKey: ['feature_flags_all'] })
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' })
    } finally { setSavingFlag(null) }
  }

  const SETTING_GROUPS: Record<string, string[]> = {
    'API Quota': ['daily_quota_ceiling', 'hourly_burst_limit', 'batch_stagger_seconds', 'competitor_pull_limit'],
    'Tier Limits': ['free_listing_limit', 'starter_listing_limit', 'score_history_free_days', 'score_history_starter_days'],
    'Scoring': ['attribution_window_days', 'score_refresh_rate'],
    'Anomaly Detection': ['anomaly_threshold_market_score', 'anomaly_threshold_favorites', 'inactive_user_days'],
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>Platform Settings</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>All adjustable without a deploy. Changes take effect immediately.</p>
      </div>

      {/* Feature Flags */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Flag className="h-4 w-4" style={{ color: '#00C4AF' }} />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingFlags ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#0F2727' }}>
              {(flags ?? []).map(flag => (
                <div key={flag.flag_key} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{flag.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] font-mono" style={{ color: '#475569' }}>{flag.flag_key}</p>
                      {flag.tier_restriction && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase"
                          style={{ background: 'rgba(0,196,175,0.1)', color: '#00C4AF' }}>
                          {flag.tier_restriction}
                        </span>
                      )}
                      {flag.paused && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase"
                          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                          PAUSED
                        </span>
                      )}
                    </div>
                    {flag.paused && flag.pause_reason && (
                      <p className="text-[10px] mt-0.5" style={{ color: '#f59e0b' }}>{flag.pause_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {savingFlag === flag.flag_key
                      ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#00C4AF' }} />
                      : (
                        <Switch
                          checked={flag.enabled && !flag.paused}
                          disabled={flag.paused || savingFlag !== null}
                          onCheckedChange={() => toggleFlag(flag.flag_key, flag.enabled)}
                        />
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings groups */}
      {Object.entries(SETTING_GROUPS).map(([groupLabel, keys]) => (
        <Card key={groupLabel} style={{ background: '#081515', borderColor: '#0F2727' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" style={{ color: '#00C4AF' }} />
              {groupLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingSettings ? (
              Array.from({ length: keys.length }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
            ) : (
              keys.map(key => {
                const row = settings?.find(s => s.key === key)
                if (!row) return null
                const currentVal = String(row.value).replace(/^"(.*)"$/, '$1')
                const editVal = editValues[key]
                const isDirty = editVal !== undefined && editVal !== currentVal

                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-foreground block mb-1">
                        {row.label ?? key}
                      </label>
                      <Input
                        value={editVal ?? currentVal}
                        onChange={e => setEditValues(ev => ({ ...ev, [key]: e.target.value }))}
                        className="h-8 text-sm"
                        style={{ background: '#0A1A1A', borderColor: isDirty ? '#00C4AF' : '#1a2e2e', color: 'white' }}
                      />
                    </div>
                    {isDirty && (
                      <Button
                        size="sm"
                        onClick={() => saveSetting(key)}
                        disabled={savingKey === key}
                        className="mt-5 h-8 text-xs gap-1"
                        style={{ background: '#00C4AF', color: '#000' }}
                      >
                        {savingKey === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      ))}

      {/* Notification settings stub */}
      <Card style={{ background: '#081515', borderColor: '#0F2727' }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <Mail className="h-4 w-4" style={{ color: '#00C4AF' }} />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs" style={{ color: '#475569' }}>
            Admin alert email: admin@radariq.app — Pipeline failure + quota alerts are sent automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
