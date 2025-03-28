import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SupabaseProvider } from '@/components/providers/SupabaseProvider'
import { ToastProvider } from '@/components/ui/use-toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Rail Log',
  description: 'Webbasierte App für Logistikmanagement im Bahnbau',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className={inter.className}>
        <SupabaseProvider>
          <ToastProvider>
            <main className="min-h-screen bg-gray-50">
              {children}
            </main>
          </ToastProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
} 