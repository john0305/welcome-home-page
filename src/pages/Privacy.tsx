import { useEffect } from 'react'
import { PageSeo } from '@/components/seo/PageSeo'
import { Link } from 'react-router-dom'

import { ArrowLeft } from 'lucide-react'
import { RadarIcon } from '@/components/layout/Logo'

const SECTIONS = [
  {
    title: 'Overview',
    content: (
      <>
        <p className="mb-4">
          Radar IQ ("we," "our," or "us") operates radariq.app, an AI-powered SEO optimization platform for Etsy sellers. This Privacy Policy explains how we collect, use, store, and protect your information when you use our service — including information obtained through Etsy's API.
        </p>
        <p>
          Radar IQ is not affiliated with, endorsed by, or sponsored by Etsy Inc. "Etsy" is a trademark of Etsy Inc.
        </p>
      </>
    ),
  },
  {
    title: 'Information We Collect',
    content: (
      <>
        <h3 className="text-white font-semibold mb-2 text-base">1. Account Information</h3>
        <p className="mb-4">
          When you create a Radar IQ account we collect your email address and encrypted password.
        </p>

        <h3 className="text-white font-semibold mb-2 text-base">2. Etsy Shop Data (via OAuth Authorization)</h3>
        <p className="mb-3">
          When you connect your Etsy store, you authorize Radar IQ through Etsy's official OAuth 3.0 system. With your authorization, we access and store:
        </p>
        <ul className="list-disc pl-5 space-y-1 mb-3 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>Active listing data: titles, descriptions, tags, photo count, prices, and listing URLs</li>
          <li>Shop information: shop name, shop ID, and public shop stats</li>
          <li>Listing performance data available through the Etsy API</li>
        </ul>
        <p className="mb-3">
          We request only the minimum permissions necessary:
        </p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li><strong className="text-white/70">listings_r:</strong> Read your active listings for analysis</li>
          <li><strong className="text-white/70">listings_w:</strong> Update listings you explicitly approve</li>
          <li><strong className="text-white/70">shops_r:</strong> Read your shop name and basic shop information</li>
        </ul>
        <p className="mb-4">
          We do not request access to your Etsy password, payment information, buyer data, private messages, or any permissions beyond those listed above.
        </p>

        <h3 className="text-white font-semibold mb-2 text-base">3. Usage Data</h3>
        <p className="mb-4">
          We collect how you interact with Radar IQ including pages visited, features used, optimization actions taken, and session duration. This data is used to improve the service.
        </p>

        <h3 className="text-white font-semibold mb-2 text-base">4. Payment Information</h3>
        <p>
          Payment processing is handled by Stripe. Radar IQ never sees or stores your full credit card number. We store only your Stripe customer ID and subscription status.
        </p>
      </>
    ),
  },
  {
    title: 'How We Use Your Information',
    content: (
      <>
        <p className="mb-3">We use your information to:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>Analyze your Etsy listings and generate SEO scores</li>
          <li>Generate AI-powered optimization suggestions using current best-in-class large language models</li>
          <li>Push approved listing changes to Etsy on your behalf</li>
          <li>Track your store health score and grade history</li>
          <li>Send transactional emails about your account</li>
          <li>Improve Radar IQ's grading and optimization algorithms</li>
        </ul>
        <p className="mb-3">We do not:</p>
        <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>Sell your data to any third party</li>
          <li>Share your Etsy shop data with other Radar IQ users</li>
          <li>Use your listing content to train AI models</li>
          <li>Access your Etsy shop without your active OAuth authorization</li>
          <li>Make any changes to your Etsy listings without your explicit per-listing review and approval</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Etsy OAuth Tokens and Security',
    content: (
      <>
        <p className="mb-3">Your Etsy OAuth access tokens are:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>Encrypted at rest using industry-standard encryption</li>
          <li>Stored securely in our database (Supabase) and never in plain text</li>
          <li>Never logged in application logs</li>
          <li>Never shared with any third party</li>
          <li>Used only to perform actions you explicitly request within Radar IQ</li>
        </ul>
        <p>
          Your OAuth tokens are refreshed automatically before expiration. Revoking access (see Your Rights below) immediately deletes all stored tokens.
        </p>
      </>
    ),
  },
  {
    title: 'Third-Party Services',
    content: (
      <>
        <p className="mb-4">We use the following third-party services to operate Radar IQ:</p>
        <div className="space-y-4">
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Etsy API</h4>
            <p className="text-sm">To read and update your listings with your authorization. Subject to Etsy's Privacy Policy at <a href="https://etsy.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>etsy.com/legal/privacy</a></p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Supabase</h4>
            <p className="text-sm">Database and authentication infrastructure. Your account data, listing data, and OAuth tokens are stored on Supabase's encrypted servers located in the United States.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">AI Language Model Providers</h4>
            <p className="text-sm">Radar IQ uses current best-in-class large language models — including providers such as Anthropic (Claude), Google (Gemini), and OpenAI (GPT) — to generate listing title, tag, and description suggestions. The specific model used for any given action is evaluated and updated regularly so each task runs on whichever model is best suited to your listings at that time, and different actions may use different models. Listing content (title, tags, description) is sent to the selected provider's API to generate rewrites and is subject to that provider's privacy policy. Your listing content is never used to train any provider's models.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Stripe</h4>
            <p className="text-sm">Payment processing for paid subscriptions. Subject to Stripe's Privacy Policy at <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>stripe.com/privacy</a>.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Data Retention',
    content: (
      <>
        <p className="mb-4">
          We retain your account data for as long as your account is active. Listing grades and optimization history are retained to show you improvement trends over time.
        </p>
        <p className="mb-3">If you delete your account:</p>
        <ul className="list-disc pl-5 space-y-1 mb-4 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <li>Your email and account data are deleted within 7 days</li>
          <li>All stored Etsy OAuth tokens are immediately revoked and deleted</li>
          <li>Listing data and grade history are deleted within 30 days</li>
          <li>Anonymized, non-identifiable usage statistics may be retained for service improvement</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Your Rights and Controls',
    content: (
      <>
        <p className="mb-3">You have the right to:</p>
        <div className="space-y-4">
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Access</h4>
            <p className="text-sm">Request a copy of all data Radar IQ holds about you and your shop.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Correct</h4>
            <p className="text-sm">Update or correct your account information at any time in account settings.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Delete</h4>
            <p className="text-sm">Delete your account and all associated data by going to Settings → Account → Delete Account, or by emailing <a href="mailto:support@radariq.app" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>support@radariq.app</a>.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Disconnect Etsy</h4>
            <p className="text-sm">Disconnect your Etsy store at any time from Settings → Integrations → Disconnect. This immediately revokes Radar IQ's OAuth access and deletes all stored tokens. You can also revoke access directly from your Etsy account under Apps → Authorized Applications.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">Data Portability</h4>
            <p className="text-sm">Request an export of your listing grades and optimization history by emailing <a href="mailto:support@radariq.app" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>support@radariq.app</a>.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">California Residents (CCPA)</h4>
            <p className="text-sm">You have the right to know what personal information we collect, request deletion, and opt out of any sale of personal information. We do not sell personal information.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold text-sm mb-1">EU/UK Residents (GDPR)</h4>
            <p className="text-sm">You have the rights of access, rectification, erasure, restriction, portability, and objection. Our legal basis for processing is contract performance and legitimate interest. Contact us to exercise any of these rights.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Cookies',
    content: (
      <p>
        Radar IQ uses essential cookies to maintain your login session. We do not use advertising or tracking cookies.
      </p>
    ),
  },
  {
    title: "Children's Privacy",
    content: (
      <p>
        Radar IQ is not directed to children under 13. We do not knowingly collect information from anyone under 13. If you believe a child has provided us information, contact us at <a href="mailto:support@radariq.app" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>support@radariq.app</a>.
      </p>
    ),
  },
  {
    title: 'Changes to This Policy',
    content: (
      <p>
        We will notify you of material changes to this Privacy Policy by email or by a prominent notice in the app at least 14 days before the change takes effect.
      </p>
    ),
  },
  {
    title: 'Contact',
    content: (
      <div className="space-y-2">
        <p>For privacy questions, data requests, or to exercise your rights:</p>
        <p className="text-sm">Email: <a href="mailto:support@radariq.app" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>support@radariq.app</a></p>
        <p className="text-sm">Website: <a href="https://radariq.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors" style={{ color: 'hsl(var(--primary))' }}>radariq.app</a></p>
        <p className="text-sm">Operator: Radar IQ LLC</p>
      </div>
    ),
  },
]

export default function Privacy() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return (
    <>
    <PageSeo title="Privacy Policy — RadarIQ" description="How RadarIQ collects, uses, and protects data from Etsy sellers using our AI-powered listing optimization platform." path="/privacy" />
    <div style={{ background: '#030D0D', fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap" rel="stylesheet" />

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <nav className="glass-nav fixed top-0 left-0 right-0 z-[100] border-b border-white/5">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <RadarIcon size={30} />
            <div>
              <p className="text-sm font-extrabold tracking-tight leading-none text-white" style={{ fontFamily: 'Bricolage Grotesque, system-ui, sans-serif' }}>
                RADAR<span style={{ color: 'hsl(var(--primary))' }}>IQ</span>
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
          Privacy Policy
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
