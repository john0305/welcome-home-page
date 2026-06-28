import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Brain, RotateCcw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

type Provider = 'gateway' | 'anthropic'

interface ModelOption { value: string; label: string }

const GATEWAY_MODELS: ModelOption[] = [
  { value: 'google/gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'google/gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
  { value: 'openai/gpt-5-nano',            label: 'GPT-5 Nano' },
  { value: 'openai/gpt-5-mini',            label: 'GPT-5 Mini' },
  { value: 'openai/gpt-5',                 label: 'GPT-5' },
]

const ANTHROPIC_MODELS: ModelOption[] = [
  { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-7',   label: 'Claude Opus 4.7' },
]

interface TaskSlot {
  task_key: string
  label: string
  reason: string
  default_provider: Provider
  default_model: string
  supports_batch?: boolean
}

const TASKS: TaskSlot[] = [
  { task_key: 'listing_grading', label: 'Listing grading',          reason: 'High volume, cost sensitive, structured', default_provider: 'gateway',   default_model: 'google/gemini-2.5-flash' },
  { task_key: 'tag_generation',  label: 'Tag generation',           reason: 'Pattern task, speed matters',             default_provider: 'gateway',   default_model: 'google/gemini-2.5-flash' },
  { task_key: 'bulk_grading',    label: 'Bulk grading',             reason: 'Batches of 3-5, cost compounds',          default_provider: 'gateway',   default_model: 'google/gemini-2.5-flash' },
  { task_key: 'listing_rewrite', label: 'Title + description rewrites', reason: 'Brand voice, nuance, instruction following', default_provider: 'anthropic', default_model: 'claude-sonnet-4-6' },
  { task_key: 'echo_chat',       label: 'Echo chat',                reason: 'Reasoning, conversation quality',         default_provider: 'anthropic', default_model: 'claude-sonnet-4-6' },
  { task_key: 'nightly_queue',   label: 'Nightly optimization queue', reason: 'Light reasoning, cheaper, batchable',   default_provider: 'anthropic', default_model: 'claude-haiku-4-5', supports_batch: true },
  { task_key: 'admin_echo',      label: 'Admin Echo',               reason: 'Complex platform reasoning',              default_provider: 'anthropic', default_model: 'claude-sonnet-4-6' },
]

interface Row {
  task_key: string
  provider: Provider
  model: string
  batch_enabled: boolean
}

export function AiModelRouting({ anthropicConfigured }: { anthropicConfigured: boolean }) {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('ai_model_config' as never)
      .select('task_key, provider, model, batch_enabled')
    if (error) {
      toast({ title: 'Failed to load routing', description: error.message, variant: 'destructive' })
    } else if (data) {
      setRows(data as never)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function rowFor(taskKey: string): Row {
    const found = rows.find(r => r.task_key === taskKey)
    if (found) return found
    const t = TASKS.find(t => t.task_key === taskKey)!
    return { task_key: taskKey, provider: t.default_provider, model: t.default_model, batch_enabled: false }
  }

  async function save(taskKey: string, patch: Partial<Row>) {
    setSavingKey(taskKey)
    const current = rowFor(taskKey)
    const next = { ...current, ...patch }
    const { error } = await supabase
      .from('ai_model_config' as never)
      .update({ provider: next.provider, model: next.model, batch_enabled: next.batch_enabled } as never)
      .eq('task_key' as never, taskKey)
    setSavingKey(null)
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' })
      return
    }
    setRows(prev => {
      const i = prev.findIndex(r => r.task_key === taskKey)
      if (i === -1) return [...prev, next]
      const copy = prev.slice(); copy[i] = next; return copy
    })
    toast({ title: 'Routing updated', description: `${TASKS.find(t => t.task_key === taskKey)?.label} → ${next.model}` })
  }

  function handleModelChange(taskKey: string, value: string) {
    const provider: Provider = value.startsWith('claude') ? 'anthropic' : 'gateway'
    save(taskKey, { provider, model: value })
  }

  function handleReset(taskKey: string) {
    const t = TASKS.find(t => t.task_key === taskKey)!
    save(taskKey, { provider: t.default_provider, model: t.default_model, batch_enabled: false })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">AI Model Routing</CardTitle>
        </div>
        <CardDescription>
          Pick which model powers each task. Changes apply within ~60s and require no deploy.
          {!anthropicConfigured && (
            <span className="block mt-1 text-amber-400">
              ANTHROPIC_API_KEY is missing — Claude selections silently fall back to Gemini equivalents until the key is set.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : TASKS.map(t => {
          const row = rowFor(t.task_key)
          return (
            <div key={t.task_key} className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card/50 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{t.label}</p>
                  <Badge variant="outline" className="text-[10px] capitalize">{row.provider}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{t.reason}</p>
              </div>

              <div className="flex items-center gap-2">
                {t.supports_batch && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground pr-2">
                    Batch
                    <Switch
                      checked={row.batch_enabled}
                      onCheckedChange={(v) => save(t.task_key, { batch_enabled: !!v })}
                      disabled={savingKey === t.task_key}
                    />
                  </label>
                )}

                <Select
                  value={row.model}
                  onValueChange={(v) => handleModelChange(t.task_key, v)}
                  disabled={savingKey === t.task_key}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Lovable AI Gateway</SelectLabel>
                      {GATEWAY_MODELS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>
                        Anthropic Claude {anthropicConfigured ? '' : '(key missing — falls back)'}
                      </SelectLabel>
                      {ANTHROPIC_MODELS.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleReset(t.task_key)}
                  disabled={savingKey === t.task_key}
                  title="Reset to default"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
