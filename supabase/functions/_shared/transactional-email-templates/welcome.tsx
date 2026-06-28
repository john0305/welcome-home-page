/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Html, Img, Preview, Text, Section, Button, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface WelcomeEmailProps {
  firstName?: string
  email?: string
}

const WelcomeEmail = ({ firstName = 'there' }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're in, {firstName}. Welcome to the RadarIQ family.</Preview>
    <Body style={main}>
      <Container style={wrapper}>

        {/* Header */}
        <Section style={header}>
          <table cellPadding="0" cellSpacing="0" style={{ borderCollapse: 'collapse' as const }}>
            <tr>
              <td style={{ verticalAlign: 'middle', paddingRight: '10px' }}>
                <Img
                  src="https://radariq.app/icon-192.png"
                  width="40"
                  height="40"
                  alt="RadarIQ"
                  style={{ borderRadius: '8px', display: 'block' }}
                />
              </td>
              <td style={{ verticalAlign: 'middle' }}>
                <span style={wordmark}>RADAR<span style={wordmarkAccent}>IQ</span></span>
              </td>
            </tr>
          </table>
        </Section>

        {/* Hero card */}
        <Section style={card}>
          {/* Teal accent bar */}
          <div style={accentBar} />

          <Section style={cardInner}>
            <Text style={eyebrow}>✦ For Etsy Sellers</Text>
            <Text style={headline}>You're in, {firstName}.<br />Welcome to the family.</Text>
            <Text style={body}>
              You're not just another user — you're joining a growing community of Etsy
              sellers who are done guessing and ready to build smarter shops.
            </Text>
            <Text style={body}>
              RadarIQ is watching your listings, tracking your competitors, and finding
              the gaps your buyers see before you do. We built this for sellers who care
              about their craft and want data that actually helps.
            </Text>

            {/* Callout block */}
            <Section style={callout}>
              <Text style={calloutLabel}>Your first step</Text>
              <Text style={calloutText}>
                Connect your Etsy store and we'll scan your shop in seconds — health score,
                fix opportunities, and a competitive picture, all in one place.
              </Text>
            </Section>

            <Section style={{ textAlign: 'center' as const, margin: '28px 0 8px' }}>
              <Button href="https://radariq.app/app/connect-etsy" style={cta}>
                Connect My Store →
              </Button>
            </Section>

            <Text style={ctaNote}>Takes about 30 seconds. No credit card required.</Text>
          </Section>
        </Section>

        {/* Footer */}
        <Hr style={divider} />
        <Text style={footer}>
          Built by veterans, for sellers. Questions? Reply to this email or reach us at{' '}
          <a href="mailto:contact@radariq.app" style={{ color: '#00D4C8' }}>contact@radariq.app</a>
        </Text>
        <Text style={footerMuted}>
          RadarIQ · SDVOSB-built Etsy optimization platform
          <br />
          You're receiving this because you just created an account.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: (data: Record<string, unknown>) =>
    `Welcome to RadarIQ, ${data?.firstName ?? 'seller'} — you're in.`,
  displayName: 'Welcome email (new user)',
  previewData: {
    firstName: 'Christina',
    email: 'christina@example.com',
  },
} satisfies TemplateEntry

// ─── Styles ───────────────────────────────────────────────────────────────────

const main = {
  backgroundColor: '#030D0D',
  fontFamily: 'Inter, Arial, sans-serif',
}

const wrapper = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '28px 20px 40px',
}

const header = {
  marginBottom: '24px',
}

const wordmark = {
  fontSize: '20px',
  fontWeight: '800' as const,
  letterSpacing: '0.08em',
  color: '#e2e8f0',
  fontFamily: 'Inter, Arial, sans-serif',
}

const wordmarkAccent = {
  color: '#00D4C8',
}

const card = {
  backgroundColor: '#081515',
  borderRadius: '14px',
  border: '1px solid #0F2727',
  overflow: 'hidden' as const,
}

const accentBar = {
  height: '3px',
  background: 'linear-gradient(90deg, transparent 0%, #00D4C8 20%, #00D4C8 80%, transparent 100%)',
}

const cardInner = {
  padding: '28px 32px 32px',
}

const eyebrow = {
  fontSize: '11px',
  fontWeight: '700' as const,
  letterSpacing: '0.15em',
  color: '#00D4C8',
  margin: '0 0 16px',
  textTransform: 'uppercase' as const,
}

const headline = {
  fontSize: '26px',
  fontWeight: '800' as const,
  lineHeight: '1.25',
  color: '#f8fafc',
  margin: '0 0 20px',
  fontFamily: 'Inter, Arial, sans-serif',
}

const body = {
  fontSize: '15px',
  lineHeight: '1.65',
  color: '#94a3b8',
  margin: '0 0 16px',
}

const callout = {
  backgroundColor: 'rgba(0,212,200,0.07)',
  border: '1px solid rgba(0,212,200,0.2)',
  borderRadius: '10px',
  padding: '16px 20px',
  margin: '20px 0',
}

const calloutLabel = {
  fontSize: '11px',
  fontWeight: '700' as const,
  letterSpacing: '0.12em',
  color: '#00D4C8',
  textTransform: 'uppercase' as const,
  margin: '0 0 6px',
}

const calloutText = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#cbd5e1',
  margin: '0',
}

const cta = {
  display: 'inline-block' as const,
  backgroundColor: '#00D4C8',
  color: '#030D0D',
  fontSize: '15px',
  fontWeight: '700' as const,
  padding: '13px 28px',
  borderRadius: '10px',
  textDecoration: 'none',
  letterSpacing: '0.01em',
}

const ctaNote = {
  fontSize: '12px',
  color: '#334155',
  textAlign: 'center' as const,
  margin: '8px 0 0',
}

const divider = {
  borderColor: '#0F2727',
  margin: '28px 0 20px',
}

const footer = {
  fontSize: '13px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 8px',
}

const footerMuted = {
  fontSize: '11px',
  color: '#1e293b',
  lineHeight: '1.5',
  margin: '0',
}
