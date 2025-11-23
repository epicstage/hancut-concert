'use client'

import Link from 'next/link'
import { Calendar, MapPin, Ticket } from 'lucide-react'
import { useState } from 'react'

export default function Home() {

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">한컷</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">한동훈과 한 컷</h1>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 메인 카드 */}
        <div className="card mb-6">
          <div className="mb-4">
            <span className="tag-sky">한동훈과 한컷</span>
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            한동훈과 한 컷 토크콘서트
          </h2>
          
          <div className="space-y-4 text-lg text-gray-700">
            <div className="flex items-center gap-3">
              <Calendar className="w-6 h-6 text-red-600" />
              <span>2025년 12월 14일 (일)</span>
            </div>
            
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-red-600" />
              <span>킨텍스 (KINTEX)</span>
            </div>
            
            <div className="flex items-center gap-3">
              <Ticket className="w-6 h-6 text-red-600" />
              <span>참가 신청 접수 중</span>
            </div>
          </div>
        </div>

        {/* 액션 버튼들 */}
        <div className="space-y-4">
          <Link href="/apply" className="block">
            <button className="btn-primary w-full">
              참가 신청하기
            </button>
          </Link>
          
          <Link href="/check" className="block">
            <button className="btn-secondary w-full">
              신청내역 확인
            </button>
          </Link>
          
          <Link href="/seat">
            <button className="btn-secondary w-full">
              좌석 확인
            </button>
          </Link>
        </div>
      </main>
    </div>
  )
}

