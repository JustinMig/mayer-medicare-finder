import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mayer Medicare Plan Finder',
    short_name: 'Mayer Medicare',
    description: 'Mississippi Medicare Advantage plan comparison and provider-network finder.',
    start_url: '/',
    display: 'standalone',
    background_color: '#d9e7ef',
    theme_color: '#d9e7ef',
    icons: [
      { src: '/medicare-icon.png?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/medicare-icon.png?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  }
}
