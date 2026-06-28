import { useEffect } from 'react'
import { PageSeo } from '@/components/seo/PageSeo'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { RadarIcon } from '@/components/layout/Logo'


const SECTIONS = [
  {
    title: 'Agreement to Terms',
    content: (
      <p>
        By creating a Radar IQ account or using radariq.app, you agree to these Terms of Service. If you do not agree, do not use Radar IQ.
      </p>
    ),
  },
  {
    title: 'What Radar IQ Is',
    content: (
      <>
        <p className="mb-4">
          Radar IQ is an independent SEO analysis and optimization tool for Etsy sellers. Radar IQ uses Etsy's official API to help sellers improve their listing quality and search visibility.
        </p>
        <p>
          Radar IQ is not affiliated with, endorsed by, partnered with, or sponsored by Etsy Inc. in any way. "Etsy" is a trademark of Etsy Inc. Use of the Etsy API by Radar IQ is subject to Etsy's API Terms of Use.
        </p>
      </>
    ),
  },
  {
    title: 'Your Account',
    content: (
      <>
        <p className="mb-3">You must provide a valid email address to create an account. You are responsible for maintaining the security of your account credentials. You must be at least 18 years old to use Radar IQ. One account per person or business entity.</p>
      </>
    ),
  },
  {
    title: 'Connecting Your Etsy Store',
    content: (
      <>
        <p className="mb-3">
          To use Radar IQ's core features, you authorize Radar IQ to access your Etsy shop through Etsy's official OAuth 3.0 system. By connecting your store you confirm:
        </p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>You are the owner of, or are authorized to manage, the Etsy shop you are connecting</li>
          <li>You have read and agree to Etsy's Terms of Use (etsy.com/legal/terms-of-use)</li>
          <li>You authorize Radar IQ to read your active listings and shop data for analysis purposes</li>
          <li>You authorize Radar IQ to update specific listings only when you explicitly review and approve each individual change</li>
        </ul>
        <p>
          Radar IQ will never make bulk automatic changes to your listings without your explicit per-listing approval, except for users on the Pro tier or higher who have specifically enabled nightly automation in their account settings.
        </p>
      </>
    ),
  },
  {
    title: 'Subscriptions and Payment',
    content: (
      <>
        <p className="mb-4">
          <strong className="text-white/70">Free Tier:</strong> The free tier is available indefinitely with a limit of 10 AI optimizations per calendar month. Listing grading is unlimited on the free tier.
        </p>
        <p className="mb-4">
          <strong className="text-white/70">Paid Tiers:</strong> Starter ($14/mo), Pro ($39/mo), and Agency ($99/mo) are billed monthly. Billing is processed by Stripe. You can cancel at any time; cancellation takes effect at the end of the current billing period. No refunds are issued for partial billing periods.
        </p>
        <p>
          <strong className="text-white/70">Price Changes:</strong> We will provide at least 30 days notice before changing subscription prices.
        </p>
      </>
    ),
  },
  {
    title: 'AI-Generated Content',
    content: (
      <>
        <p className="mb-3">Radar IQ uses AI to generate suggested listing titles, tags, and descriptions. You acknowledge that:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>AI suggestions are recommendations only, not guaranteed to improve performance</li>
          <li>You are responsible for reviewing all AI-generated content before approving it for publication to Etsy</li>
          <li>You are solely responsible for the content of your Etsy listings, including any AI-suggested content you choose to approve and publish</li>
          <li>Radar IQ does not guarantee any specific outcome such as improved rankings, views, or sales</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Acceptable Use',
    content: (
      <>
        <p className="mb-3">You agree not to use Radar IQ to:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>Violate Etsy's Terms of Use or API Terms of Use</li>
          <li>Access any Etsy shop you are not authorized to manage</li>
          <li>Scrape, copy, or redistribute data from Etsy or from other Radar IQ users</li>
          <li>Attempt to reverse engineer, bypass, or interfere with Radar IQ's systems</li>
          <li>Use the service for any unlawful purpose</li>
        </ul>
        <p>Violation of these terms may result in immediate account termination.</p>
      </>
    ),
  },
  {
    title: 'Intellectual Property',
    content: (
      <>
        <p className="mb-4">
          Radar IQ's grading algorithms, software, design, and brand are owned by Radar IQ LLC and protected by applicable intellectual property laws.
        </p>
        <p>
          Your Etsy listing content remains your property. Radar IQ does not claim ownership over your listing data or any content you create.
        </p>
      </>
    ),
  },
  {
    title: 'Disclaimers',
    content: (
      <>
        <p className="mb-4">
          Radar IQ is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or that using Radar IQ will result in improved Etsy search rankings, sales, or revenue.
        </p>
        <p>
          Etsy's search algorithm is proprietary and changes frequently. SEO recommendations that are effective today may become less effective in the future due to changes in Etsy's platform.
        </p>
      </>
    ),
  },
  {
    title: 'Limitation of Liability',
    content: (
      <p>
        To the maximum extent permitted by law, Radar IQ and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service, including but not limited to lost profits, lost sales, or listing suspensions on Etsy. Our total liability to you shall not exceed the amount you paid to Radar IQ in the 3 months preceding the claim.
      </p>
    ),
  },
  {
    title: 'Termination',
    content: (
      <p>
        You may delete your account at any time. We may suspend or terminate your account if you violate these Terms, abuse the service, or engage in fraudulent activity. Upon termination, your right to use Radar IQ ceases immediately and we will delete your data per our Privacy Policy.
      </p>
    ),
  },
  {
    title: 'Changes to These Terms',
    content: (
      <p>
        We will notify you by email of material changes to these Terms at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.
      </p>
    ),
  },
  {
    title: 'Governing Law',
    content: (
      <p>
        These Terms are governed by the laws of the State of New York, United States, without regard to conflict of law provisions.
      </p>
    ),
  },
  {
    title: 'Contact',
    content: (
      <div className="space-y-2">
        <p className="text-sm">Email: <a href="mailto:support@radariq.app" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>support@radariq.app</a></p>
        <p className="text-sm">Website: <a href="https://radariq.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>radariq.app</a></p>
        <p className="text-sm">Operator: Radar IQ LLC</p>
      </div>
    ),
  },
]

export default function Terms() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return (
    <>
    <PageSeo title="Terms of Service — RadarIQ" description="Terms governing your use of RadarIQ, the AI-powered grading and optimization platform for Etsy sellers." path="/terms" />
    <div style={{ background: '#030D0D', fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap" rel="stylesheet" />

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <nav className="glass-nav fixed top-0 left-0 right-0 z-[100] border-b border-white/5">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <RadarIcon size={30} />
            <div>
              <p className="text-sm font-extrabold tracking-tight leading-none text-white" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                RADAR <span style={{ color: 'hsl(var(--primary))' }}>IQ</span>
              </p>
              <p className="text-[9px] uppercase tracking-[0.18em] mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>For Etsy Sellers</p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <button className="px-5 py-2 text-sm font-semibold rounded-lg border transition-all hover:bg-white/5" style={{ borderColor: 'rgba(0, 212, 200,0.5)', color: 'hsl(var(--primary))' }}>Sign in</button>
            </Link>
            <Link to="/register">
              <button className="px-5 py-2 text-sm font-semibold rounded-lg text-white transition-all active:scale-95" style={{ background: 'hsl(var(--primary))', boxShadow: '0 8px 24px rgba(0, 212, 200,0.3)' }}>Start free</button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Content ───────────────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 pt-32 pb-24">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-2 text-sm mb-8 transition-colors hover:text-white" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
          Terms of Service
        </h1>
        <p className="text-sm mb-12" style={{ color: 'hsl(var(--muted-foreground))' }}>Last updated: May 24, 2026</p>

        {/* Sections */}
        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1" style={{ background: '#0F2727' }} />
                <h2 className="text-lg font-bold whitespace-nowrap" style={{ color: 'hsl(var(--primary))' }}>{section.title}</h2>
                <div className="h-px flex-1" style={{ background: '#0F2727' }} />
              </div>
              <div className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {section.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <Footer />
    </div>
    </>
  )
}

function Footer() {
  return (
    <footer className="pt-20 pb-12 border-t" style={{ background: '#0a0f1e', borderColor: 'hsl(var(--surface-2))' }}>
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <div className="space-y-5">
          <div className="flex items-center gap-2.5">
            <RadarIcon size={28} />
            <span className="font-extrabold text-lg text-white tracking-tight" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
              RADAR <span style={{ color: 'hsl(var(--primary))' }}>IQ</span>
            </span>
          </div>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Built for Etsy sellers. Radar IQ helps you grade, optimize, and improve your own listings — authorized via your Etsy account.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 items-start">
          {[
            { title: 'Product', links: [
              { label: 'Grading Engine', href: '/' },
              { label: 'SEO Optimizer', href: '/' },
              { label: 'A/B Testing', href: '/' },
              { label: 'Bulk Actions', href: '/' },
              { label: 'Pricing', href: '/#pricing' },
            ]},
            { title: 'Company', links: [
              { label: 'About Us', href: '/' },
              { label: 'Affiliate Program', href: '/#affiliate' },
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms of Service', href: '/terms' },
            ]},
            { title: 'Connect', links: [
              { label: 'Support', href: 'mailto:support@radariq.app' },
              { label: 'Help Center', href: '/' },
              { label: 'API Docs', href: '/' },
              { label: 'Community', href: '/' },
            ]},
          ].map(col => (
            <div key={col.title}>
              <h5 className="text-white font-bold mb-5 text-sm">{col.title}</h5>
              <ul className="space-y-3">
                {col.links.map(link => (
                  <li key={link.label}>
                    {link.href.startsWith('mailto:') ? (
                      <a href={link.href} className="text-sm transition-colors hover:text-white" style={{ color: 'hsl(var(--muted-foreground))' }}>{link.label}</a>
                    ) : link.href.startsWith('/#') ? (
                      <a href={link.href} className="text-sm transition-colors hover:text-white" style={{ color: 'hsl(var(--muted-foreground))' }}>{link.label}</a>
                    ) : link.href === '/privacy' || link.href === '/terms' ? (
                      <Link to={link.href} className="text-sm transition-colors hover:text-white" style={{ color: 'hsl(var(--muted-foreground))' }}>{link.label}</Link>
                    ) : (
                      <a href={link.href} className="text-sm transition-colors hover:text-white" style={{ color: 'hsl(var(--muted-foreground))' }}>{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 pt-10 border-t flex flex-col items-center gap-3" style={{ borderColor: 'hsl(var(--surface-2))' }}>
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          © 2025 Radar IQ. All rights reserved.
        </p>
        <p className="text-xs text-center" style={{ color: 'hsl(var(--muted-foreground))' }}>
          The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.
        </p>
      </div>
    </footer>
  )
}
