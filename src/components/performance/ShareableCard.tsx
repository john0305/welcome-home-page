import { useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { toPng } from 'html-to-image'

export function ShareableCard({
  headline, listing, onClose,
}: {
  headline: string
  listing: { id: string; title: string; thumbnail_url: string | null } | null
  onClose: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  const download = async () => {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `radariq-win-${Date.now()}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('share download failed', e)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Share your win</DialogTitle></DialogHeader>

        <div ref={cardRef} className="rounded-xl p-6 text-foreground" style={{ background: 'linear-gradient(135deg, #030D0D 0%, #0A1F1F 100%)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-6 w-6 rounded-full bg-primary" />
            <span className="text-sm font-semibold tracking-wide">RADAR IQ</span>
          </div>
          {listing?.thumbnail_url && (
            <img src={listing.thumbnail_url} alt="" className="w-full h-40 object-cover rounded-lg mb-4" />
          )}
          <p className="text-xl font-semibold leading-snug mb-2">{headline}</p>
          {listing && <p className="text-sm text-foreground/60 truncate">{listing.title}</p>}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-foreground/40">Powered by Radar IQ</span>
            <span className="text-xs text-primary">radariq.app</span>
          </div>
        </div>

        <Button onClick={download} className="w-full">
          <Download className="h-4 w-4 mr-2" />Download image
        </Button>
      </DialogContent>
    </Dialog>
  )
}
