/**
 * Split button for selective listing optimization.
 * Left side: "Optimize All" (existing full optimize flow).
 * Right side (chevron): dropdown for per-field rewrites + photo analysis.
 */
import { Sparkles, ChevronDown, Loader2, Camera, Type, AlignLeft, Tags, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { RewriteFieldType } from '@/hooks/useListingActions'

interface Props {
  busy: boolean
  onOptimizeAll: () => void
  onRewriteField: (type: RewriteFieldType) => void
  onAnalyzePhotos: () => void
  size?: 'sm' | 'default'
  className?: string
}

export function OptimizeSplitButton({ busy, onOptimizeAll, onRewriteField, onAnalyzePhotos, size = 'sm', className }: Props) {
  return (
    <div className={`inline-flex items-stretch rounded-md shadow-sm ${className ?? ''}`}>
      <Button
        size={size}
        className="gap-1.5 rounded-r-none border-r border-primary-foreground/20"
        disabled={busy}
        onClick={onOptimizeAll}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? 'Optimizing…' : 'Optimize All'}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            className="rounded-l-none px-2"
            disabled={busy}
            aria-label="More optimization options"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onRewriteField('title')}>
            <Type className="h-3.5 w-3.5 mr-2 text-primary" />
            Title only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRewriteField('description')}>
            <AlignLeft className="h-3.5 w-3.5 mr-2 text-primary" />
            Description only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRewriteField('tags')}>
            <Tags className="h-3.5 w-3.5 mr-2 text-primary" />
            Tags only
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRewriteField('materials')}>
            <Layers className="h-3.5 w-3.5 mr-2 text-primary" />
            Materials only
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAnalyzePhotos}>
            <Camera className="h-3.5 w-3.5 mr-2 text-primary" />
            Analyze Photos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOptimizeAll}>
            <Sparkles className="h-3.5 w-3.5 mr-2 text-primary" />
            Optimize All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
