import { PageContainer } from '@/components/layout/PageContainer'
import { DailyQuotaBar } from '@/components/personal/DailyQuotaBar'
import { GradeListingCard } from '@/components/personal/GradeListingCard'
import { OptimizeTextCard } from '@/components/personal/OptimizeTextCard'
import { TryOnCard } from '@/components/personal/TryOnCard'

export default function PersonalWorkspace() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Personal workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use RadarIQ tools on anything — completely separate from your shop quota.
          </p>
        </header>

        <DailyQuotaBar />

        <div className="flex flex-col gap-6">
          <GradeListingCard />
          <OptimizeTextCard />
          <TryOnCard />
        </div>
      </div>
    </PageContainer>
  )
}
