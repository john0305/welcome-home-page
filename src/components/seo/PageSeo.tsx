import { Helmet } from 'react-helmet-async'

interface PageSeoProps {
  title: string
  description: string
  path: string
  type?: 'website' | 'article'
}

export function PageSeo({ title, description, path, type = 'website' }: PageSeoProps) {
  const url = `https://radariq.app${path}`
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
    </Helmet>
  )
}
