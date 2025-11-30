import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '한동훈과 한 컷 토크콘서트',
  description: '2025년 12월 14일 킨텍스에서 만나는 한동훈과 한 컷 토크콘서트',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

