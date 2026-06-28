/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'RADARIQ'

interface NewUserSignupAdminProps {
  email?: string
  fullName?: string
  username?: string
  provider?: string
  inviteCode?: string | null
  signedUpAt?: string
}

const NewUserSignupAdminEmail = ({
  email,
  fullName,
  username,
  provider,
  inviteCode,
  signedUpAt,
}: NewUserSignupAdminProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New {SITE_NAME} signup: {email ?? 'unknown'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New {SITE_NAME} signup</Heading>
        <Text style={text}>A new user just created an account.</Text>

        <Section style={card}>
          <Text style={row}><strong>Email:</strong> {email ?? '—'}</Text>
          {fullName ? <Text style={row}><strong>Name:</strong> {fullName}</Text> : null}
          {username ? <Text style={row}><strong>Username:</strong> {username}</Text> : null}
          {provider ? <Text style={row}><strong>Method:</strong> {provider}</Text> : null}
          {inviteCode ? <Text style={row}><strong>Invite code:</strong> {inviteCode}</Text> : null}
          {signedUpAt ? <Text style={row}><strong>Signed up:</strong> {signedUpAt}</Text> : null}
        </Section>

        <Text style={footer}>You're receiving this because you're the admin for {SITE_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewUserSignupAdminEmail,
  subject: (data: Record<string, any>) =>
    `New ${SITE_NAME} signup: ${data?.email ?? 'unknown'}`,
  displayName: 'New user signup (admin alert)',
  to: 'contact@radariq.app',
  previewData: {
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    username: 'jane_doe',
    provider: 'google',
    inviteCode: 'EARLY2027',
    signedUpAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 20px' }
const card = {
  background: '#f6fafa',
  border: '1px solid #e2eded',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '0 0 24px',
}
const row = { fontSize: '14px', color: '#0F2727', margin: '0 0 8px', lineHeight: '1.5' }
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0' }
