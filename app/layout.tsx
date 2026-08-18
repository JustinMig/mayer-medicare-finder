import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mayer Medicare Plan Finder',
  description: 'Mississippi Medicare Advantage plan comparison and provider-network finder.',
  applicationName: 'Mayer Medicare Finder',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mayer Medicare'
  },
  icons: {
    icon: [
      { url: '/medicare-icon.png?size=192', sizes: '192x192', type: 'image/png' },
      { url: '/medicare-icon.png?size=512', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/medicare-icon.png?size=180', sizes: '180x180', type: 'image/png' }
    ],
    shortcut: [
      { url: '/medicare-icon.png?size=64', sizes: '64x64', type: 'image/png' }
    ]
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#d9e7ef'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
