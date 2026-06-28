import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Gift, DollarSign, Users, Link2, Copy, TrendingUp } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'

export default function Affiliate() {
  const { user } = useAuth()
  const { toast } = useToast()
  const referralCode = (user?.invite_code ?? 'YOURCODE').toUpperCase()
  const referralLink = `https://radariq.app/?ref=${referralCode}`

  const copy = (val: string) => {
    navigator.clipboard.writeText(val)
    toast({ title: 'Copied to clipboard' })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Affiliate Program</h1>
            <Badge variant="outline" className="border-amber-500/40 text-amber-400">Coming Soon</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Earn 30% recurring commission for every seller you refer to Radar IQ.
          </p>
        </div>
      </div>

      {/* Preview KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending earnings', value: '$0.00', icon: DollarSign, hint: 'Paid monthly via Stripe' },
          { label: 'Lifetime earnings', value: '$0.00', icon: TrendingUp, hint: 'All-time payouts' },
          { label: 'Active referrals', value: '0', icon: Users, hint: 'Sellers on a paid plan' },
          { label: 'Click-throughs', value: '0', icon: Link2, hint: 'From your referral link' },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-semibold mt-2">{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-primary" />
            Your referral link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono truncate">
              {referralLink}
            </div>
            <Button variant="outline" onClick={() => copy(referralLink)}>
              <Copy className="h-4 w-4 mr-2" /> Copy link
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm font-mono">
              Code: {referralCode}
            </div>
            <Button variant="outline" onClick={() => copy(referralCode)}>
              <Copy className="h-4 w-4 mr-2" /> Copy code
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent referrals preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border divide-y">
            {[
              { name: 'sample@seller.com', plan: 'Pro', status: 'Active', earned: '$8.97' },
              { name: 'maker@example.com', plan: 'Starter', status: 'Trial', earned: '$0.00' },
              { name: 'shop@example.com', plan: '—', status: 'Signed up', earned: '$0.00' },
            ].map((r) => (
              <div key={r.name} className="flex items-center justify-between px-4 py-3 text-sm opacity-60">
                <span className="font-medium">{r.name}</span>
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">{r.plan}</span>
                  <Badge variant="outline">{r.status}</Badge>
                  <span className="font-mono">{r.earned}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Sample data — real referrals will appear here once the program launches.
          </p>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {[
            { step: '1', title: 'Share your link', body: 'Send your unique referral link to other Etsy sellers.' },
            { step: '2', title: 'They subscribe', body: 'When someone signs up for a paid plan, they are tied to you forever.' },
            { step: '3', title: 'You get paid', body: 'Earn 30% recurring commission, paid out monthly via Stripe.' },
          ].map((s) => (
            <div key={s.step} className="rounded-md border p-4">
              <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold mb-2">
                {s.step}
              </div>
              <p className="font-medium">{s.title}</p>
              <p className="text-muted-foreground mt-1">{s.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
