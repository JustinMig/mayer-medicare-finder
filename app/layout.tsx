import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mayer Medicare Plan Finder',
  description: 'Mississippi Medicare Advantage plan comparison and provider-network finder.',
  applicationName: 'Mayer Medicare Finder',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mayer Medicare'
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: [{ url: '/mayer-favicon-64.png', sizes: '64x64', type: 'image/png' }]
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
