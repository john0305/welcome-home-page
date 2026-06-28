/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as newUserSignupAdmin } from './new-user-signup-admin.tsx'
import { template as welcome } from './welcome.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'new-user-signup-admin': newUserSignupAdmin,
  'welcome': welcome,
}
