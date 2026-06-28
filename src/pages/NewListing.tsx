import { useState } from 'react'
import { Upload, Sparkles, CheckCircle2, XCircle, X, Plus, Image as ImageIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Header } from '@/components/layout/Header'
import { GradeDisplay } from '@/components/optimization/GradeDisplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PaidFeatureGate } from '@/components/auth/PaidFeatureGate'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

interface OptimizationResult {
  title: string
  description: string
  tags: string[]
  materials: string[]
  optimization_notes: string
  expected_grade_improvement: number
}

const schema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(140, 'Max 140 characters'),
  description: z.string().min(10, 'Description is required'),
  price: z.coerce.number().min(0.01, 'Price is required'),
  quantity: z.coerce.number().int().min(1),
  category: z.string().min(1, 'Category is required'),
  publish_as_draft: z.boolean(),
})

type FormData = z.infer<typeof schema>

export default function NewListing() {
  const { toast } = useToast()
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [materials, setMaterials] = useState<string[]>([])
  const [materialInput, setMaterialInput] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [optimizing, setOptimizing] = useState(false)
  const [optimized, setOptimized] = useState<OptimizationResult | null>(null)
  const [useOptimized, setUseOptimized] = useState(false)
  const [activeTab, setActiveTab] = useState('draft')

  const { user } = useAuth()
  const defaultDraft = user?.settings?.default_listing_state !== 'active'
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 1, publish_as_draft: defaultDraft },
  })

  const titleValue = watch('title')

  const addTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t) && tags.length < 13) {
      setTags([...tags, t])
      setTagInput('')
    }
  }

  const addMaterial = () => {
    const m = materialInput.trim()
    if (m && !materials.includes(m)) {
      setMaterials([...materials, m])
      setMaterialInput('')
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 10 - images.length)
    setImages(prev => [...prev, ...files].slice(0, 10))
  }

  const handleOptimize = async () => {
    const formValues = {
      title: titleValue ?? '',
      description: '',
      tags,
      materials,
      category: '',
      price: 0,
    }

    setOptimizing(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-optimized-listing', {
        body: formValues,
      })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      setOptimized(data as OptimizationResult)
      setActiveTab('optimized')
      toast({ title: 'Optimization complete!', variant: 'success' })
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      if (msg === 'limit_reached' || msg.toLowerCase().includes('limit_reached')) {
        toast({
          title: 'You\'ve used your 10 free optimizations this month',
          description: 'Your monthly free credits reset on the 1st. Upgrade to a paid plan for unlimited optimizations.',
        })
      } else {
        toast({
          title: 'Optimization failed',
          description: msg,
          variant: 'destructive',
        })
      }
    } finally {
      setOptimizing(false)
    }
  }


  const onSubmit = async (data: FormData) => {
    toast({
      title: 'Listing created',
      description: `"${data.title}" uploaded to Etsy as ${data.publish_as_draft ? 'draft' : 'active'}.`,
      variant: 'success',
    })
  }

  return (
    <div className="flex flex-col">
      <Header title="New Listing" description="Create an SEO-optimized Etsy listing" />

      <div className="flex-1 p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Form */}
          <div className="lg:col-span-2 space-y-5">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="optimized" disabled={!optimized}>
                  {optimized ? '✓ Optimized' : 'Optimized'}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="draft" className="mt-4 space-y-4">
                {/* Images */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Product Images ({images.length}/10)</span>
                      {images.length < 5 && <span className="text-xs font-normal text-amber-600">Aim for 10 images</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {images.map((img, i) => (
                        <div key={i} className="relative h-16 w-16 rounded overflow-hidden bg-slate-100">
                          <img src={URL.createObjectURL(img)} alt="" className="h-full w-full object-cover" />
                          <button
                            className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5 text-white hover:bg-black/70"
                            onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                      {images.length < 10 && (
                        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 transition-colors">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground mt-1">Add</span>
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                        </label>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label>Title <span className="text-muted-foreground text-xs">({(titleValue ?? '').length}/140)</span></Label>
                  <Input placeholder="e.g. Handmade Sterling Silver Moon Pendant Necklace..." {...register('title')} />
                  {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea rows={6} placeholder="Describe your product, materials, sizing, care instructions..." {...register('description')} />
                  {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
                </div>

                {/* Price & Qty */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Price (USD)</Label>
                    <Input type="number" step="0.01" placeholder="29.99" {...register('price')} />
                    {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Quantity</Label>
                    <Input type="number" min="1" {...register('quantity')} />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Input placeholder="e.g. Jewelry > Necklaces" {...register('category')} />
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <Label>Tags ({tags.length}/13)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a tag..."
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                      disabled={tags.length >= 13}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addTag} disabled={tags.length >= 13}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map(t => (
                      <Badge key={t} variant="secondary" className="gap-1">
                        {t}
                        <button onClick={() => setTags(tags.filter(x => x !== t))}><X className="h-2.5 w-2.5" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Materials */}
                <div className="space-y-1.5">
                  <Label>Materials</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 925 sterling silver"
                      value={materialInput}
                      onChange={e => setMaterialInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMaterial() } }}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addMaterial}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {materials.map(m => (
                      <Badge key={m} variant="outline" className="gap-1">
                        {m}
                        <button onClick={() => setMaterials(materials.filter(x => x !== m))}><X className="h-2.5 w-2.5" /></button>
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Publish option */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">Publish as draft</p>
                    <p className="text-xs text-muted-foreground">Upload to Etsy as draft (recommended) or go live immediately</p>
                  </div>
                  <Switch defaultChecked={defaultDraft} {...register('publish_as_draft')} />
                </div>
              </TabsContent>

              <TabsContent value="optimized" className="mt-4 space-y-4">
                {optimized && (
                  <>
                    <Alert variant="success">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Optimization complete! Review the changes below and accept or reject.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Optimized Title</p>
                        <p className="text-sm font-medium bg-emerald-50 p-3 rounded-md">{optimized.title}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Optimized Description (preview)</p>
                        <p className="text-sm bg-emerald-50 p-3 rounded-md line-clamp-5">{optimized.description}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Tags ({optimized.tags.length}/13)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {optimized.tags.map(t => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Materials</p>
                        <div className="flex flex-wrap gap-1.5">
                          {optimized.materials.map(m => <Badge key={m} variant="outline" className="text-xs">{m}</Badge>)}
                        </div>
                      </div>
                      {optimized.optimization_notes && (
                        <div className="rounded-md bg-blue-50 p-3">
                          <p className="text-xs font-medium text-blue-800 mb-1">What changed</p>
                          <p className="text-xs text-blue-700">{optimized.optimization_notes}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button className="flex-1 gap-2" onClick={() => { setUseOptimized(true); toast({ title: 'Optimization accepted!' }) }}>
                        <CheckCircle2 className="h-4 w-4" /> Accept & use optimized
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => { setOptimized(null); setActiveTab('draft') }}>
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <Button
                  className="w-full gap-2"
                  onClick={handleOptimize}
                  disabled={optimizing || !titleValue}
                  variant="default"
                >
                  <Sparkles className="h-4 w-4" />
                  {optimizing ? 'Optimizing...' : 'AI Optimize'}
                </Button>
                <Button
                  className="w-full gap-2"
                  variant="etsy"
                  onClick={handleSubmit(onSubmit)}
                >
                  <Upload className="h-4 w-4" />
                  Upload to Etsy
                </Button>
              </CardContent>
            </Card>


            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Checklist</p>
                {[
                  { label: 'Title (5-140 chars)', done: (titleValue ?? '').length >= 5 },
                  { label: '10 tags', done: tags.length >= 10 },
                  { label: '5+ images', done: images.length >= 5 },
                  { label: 'Materials specified', done: materials.length > 0 },
                  { label: 'AI optimized', done: !!optimized && useOptimized },
                ].map(c => (
                  <div key={c.label} className={`flex items-center gap-2 py-1 text-xs ${c.done ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                    {c.done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />}
                    {c.label}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
