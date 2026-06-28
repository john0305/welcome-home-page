// Google Analytics 4 Data API integration
// Requires a GA4 property connected to your Etsy store/website

const GA_API_BASE = 'https://analyticsdata.googleapis.com/v1beta'

export const isAnalyticsConfigured = !!(
  import.meta.env.VITE_GA_PROPERTY_ID && import.meta.env.VITE_GA_MEASUREMENT_ID
)

export interface AnalyticsReport {
  pageViews: number
  sessions: number
  users: number
  bounceRate: number
  avgSessionDuration: number
  topPages: Array<{ page: string; views: number }>
  viewsByDate: Array<{ date: string; views: number }>
}

export async function runGAReport(
  propertyId: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<AnalyticsReport> {
  const url = `${GA_API_BASE}/properties/${propertyId}:runReport`
  const body = {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    dimensions: [{ name: 'date' }, { name: 'pagePath' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 100,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) throw new Error(`GA API error: ${response.statusText}`)
  const data = await response.json()

  // Parse response into a clean format
  const rows = data.rows ?? []
  const viewsByDate: Record<string, number> = {}
  const topPages: Record<string, number> = {}
  let totalViews = 0, totalSessions = 0, totalUsers = 0, bounceRate = 0, avgDuration = 0

  for (const row of rows) {
    const date = row.dimensionValues?.[0]?.value ?? ''
    const page = row.dimensionValues?.[1]?.value ?? ''
    const views = parseInt(row.metricValues?.[0]?.value ?? '0')
    const sessions = parseInt(row.metricValues?.[1]?.value ?? '0')

    if (date) viewsByDate[date] = (viewsByDate[date] ?? 0) + views
    if (page) topPages[page] = (topPages[page] ?? 0) + views
    totalViews += views
    totalSessions += sessions
    totalUsers += parseInt(row.metricValues?.[2]?.value ?? '0')
    bounceRate = parseFloat(row.metricValues?.[3]?.value ?? '0')
    avgDuration = parseFloat(row.metricValues?.[4]?.value ?? '0')
  }

  return {
    pageViews: totalViews,
    sessions: totalSessions,
    users: totalUsers,
    bounceRate,
    avgSessionDuration: avgDuration,
    topPages: Object.entries(topPages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([page, views]) => ({ page, views })),
    viewsByDate: Object.entries(viewsByDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, views]) => ({ date, views })),
  }
}
