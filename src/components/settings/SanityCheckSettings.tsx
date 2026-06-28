import { useEffect, useState } from 'react'
import { ShieldCheck, RotateCcw, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  useSanityFlags, runSanityCheck, FLAG_TYPE_LABEL, type SanityFlagType,
} from '@/hooks/useSanityFlags'

const TYPES: SanityFlagType[] = ['placeholder', 'profanity', 'internal_note', 'price_outlier', 'text_mismatch']

export function SanityCheckSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { flags: dismissed, reload: reloadDismissed, updateStatus } = useSanityFlags('dismissed')
  const { flags: ignored, reload: reloadIgnored, restoreAll } = useSanityFlags('ignored_permanently')
  const [disabled, setDisabled] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [savingType, setSavingType] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('user_profiles').select('sanity_check_disabled_types').eq('id', user.id).maybeSingle()
      .then(({ data }) => setDisabled((data?.sanity_check_disabled_types as string[] | null) ?? []))
  }, [user?.id])

  const toggleType = async (type: SanityFlagType, enabled: boolean) => {
    if (!user?.id) return
    setSavingType(type)
    const next = enabled ? disabled.filter((t) => t !== type) : [...new Set([...disabled, type])]
    const { error } = await supabase.from('user_profiles')
      .update({ sanity_check_disabled_types: next }).eq('id', user.id)
    setSavingType(null)
    if (error) { toast({ title: 'Failed to save', description: error.message, variant: 'destructive' }); return }
    setDisabled(next)
  }

  const handleRun = async () => {
    setRunning(true)
    setScanMessage('Starting sanity check…')
    try {
      const r = await runSanityCheck('all', setScanMessage)
      const message = `${r.scanned} listings scanned · ${r.inserted} new flags · ${r.resolved} resolved`
      setScanMessage(message)
      toast({ title: 'Sanity check complete', description: message })
    } catch (e) {
      const message = (e as Error).message || 'The sanity check could not be started.'
      setScanMessage(`Scan failed: ${message}`)
      toast({ title: 'Scan failed', description: message, variant: 'destructive' })
    } finally { setRunning(false) }
  }

  const handleClearAll = async () => {
    await restoreAll()
    await reloadDismissed()
    await reloadIgnored()
    toast({ title: 'All flags restored', description: 'Dismissed and ignored flags are active again.' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Sanity Check</CardTitle>
        <CardDescription>Scan listings for obvious mistakes — placeholders, internal notes, price typos, mismatched copy.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="button" onClick={handleRun} disabled={running} aria-busy={running}>
            <RefreshCw className={running ? 'animate-spin' : ''} />
            {running ? 'Scanning…' : 'Run sanity check now'}
          </Button>
          <span className="text-xs text-muted-foreground">{dismissed.length} dismissed · {ignored.length} permanently ignored</span>
        </div>
        {scanMessage && <p className="text-xs text-muted-foreground" role="status">{scanMessage}</p>}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Check types</h4>
          <p className="text-xs text-muted-foreground">Turn off check types you don't want flagged. Hidden flags aren't deleted — re-enable to see them again.</p>
          <div className="space-y-1.5 pt-1">
            {TYPES.map((t) => {
              const enabled = !disabled.includes(t)
              return (
                <div key={t} className="flex items-center justify-between py-1">
                  <Label className="text-sm font-normal">{FLAG_TYPE_LABEL[t]}</Label>
                  <Switch checked={enabled} disabled={savingType === t} onCheckedChange={(v) => toggleType(t, v)} />
                </div>
              )
            })}
          </div>
        </div>

        {ignored.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Permanently ignored</h4>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs"><Trash2 className="h-3 w-3 mr-1" /> Clear all ignored</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Restore all dismissed and ignored flags?</DialogTitle>
                    <DialogDescription>
                      This will re-surface {dismissed.length + ignored.length} flag(s) in your Sanity Check panel. You can dismiss them individually again afterwards.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button onClick={handleClearAll}>Restore all</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-1 max-h-64 overflow-auto">
              {ignored.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.listing?.title ?? 'Listing'}</p>
                    <p className="text-muted-foreground">{FLAG_TYPE_LABEL[f.flag_type]} · “{f.flagged_text}”</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    onClick={async () => { await updateStatus(f.id, 'active'); await reloadIgnored() }}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Restore
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
