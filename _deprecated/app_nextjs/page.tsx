'use client'

import Link from 'next/link'
import { Calendar, MapPin, Mic2, Clock } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* 헤더 */}
      <header className="glass-header">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="logo-rounded animate-float">
              <Mic2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-600 tracking-wide">
                따뜻한 한 컷, 진짜 이야기
              </p>
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
                한동훈과 한 컷 토크콘서트
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-14 space-y-8 md:space-y-10">
          {/* 히어로 섹션 */}
          <section className="glass-card flex flex-col md:flex-row items-center gap-8 md:gap-10">
            <div className="flex-1 space-y-6">
              <span className="tag-sky">한동훈과 한 컷 토크콘서트</span>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-tight">
                한 해의 끝,<br />
                <span className="text-red-600">한 컷으로 남길 이야기</span>
              </h2>
              <p className="text-lg md:text-xl text-gray-700 leading-relaxed">
                정치 이야기, 삶의 이야기, 그리고 우리의 내일에 대한 솔직한 대화.
                <br />
                편안한 토크쇼 자리에서, 웃음과 생각이 함께하는 시간을 준비했습니다.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-base md:text-lg">
                <div className="flex items-start gap-3">
                  <Calendar className="w-6 h-6 text-red-600 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">일시</p>
                    <p className="text-gray-700">2025년 12월 14일 (일)</p>
                    <p className="text-gray-500 text-sm mt-0.5">오후 2시 입장, 오후 3시 시작</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="w-6 h-6 text-red-600 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">장소</p>
                    <p className="text-gray-700">킨텍스 (KINTEX)</p>
                    <p className="text-gray-500 text-sm mt-0.5">경기도 고양시 일산서구 킨텍스로 217-60</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-6 h-6 text-red-600 mt-1" />
                  <div>
                    <p className="font-semibold text-gray-900">입장 안내</p>
                    <p className="text-gray-700">온라인 신청 후 현장 확인</p>
                    <p className="text-gray-500 text-sm mt-0.5">좌석은 추첨/배정 후 안내됩니다</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex justify-center">
              <div className="rounded-image-container w-56 h-56 md:w-64 md:h-64 flex items-center justify-center relative">
                <div className="absolute inset-6 rounded-full bg-gradient-to-br from-red-600 via-red-500 to-rose-400 opacity-90" />
                <div className="relative text-center text-white px-6">
                  <p className="text-lg md:text-xl font-semibold mb-2">토크쇼 라이브</p>
                  <p className="text-3xl md:text-4xl font-extrabold mb-3">한동훈과 한 컷</p>
                  <p className="text-sm md:text-base text-red-50/90">
                    웃음 한 컷, 생각 한 컷, 그리고
                    <br />
                    당신의 한 해를 담는 시간
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 안내 카드 섹션 */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass-card space-y-3">
              <p className="text-sm font-semibold text-red-600">이런 분께 추천합니다</p>
              <ul className="space-y-2 text-base md:text-lg text-gray-800">
                <li>• 정치 이야기를 편하게 듣고 싶은 분</li>
                <li>• 가족과 함께 토크콘서트를 즐기고 싶은 분</li>
                <li>• 2025년을 정리하는 자리가 필요하신 분</li>
              </ul>
            </div>

            <div className="glass-card space-y-3">
              <p className="text-sm font-semibold text-red-600">진행 방식</p>
              <ul className="space-y-2 text-base md:text-lg text-gray-800">
                <li>• 토크 + Q&A + 현장 소통</li>
                <li>• 사전 신청자 우선 입장</li>
                <li>• 좌석 배정 후 문자 안내</li>
              </ul>
            </div>

            <div className="glass-card space-y-3">
              <p className="text-sm font-semibold text-red-600">참가 안내</p>
              <ul className="space-y-2 text-base md:text-lg text-gray-800">
                <li>• 참가비 무료</li>
                <li>• 신청은 전화번호 1개당 1회</li>
                <li>• 현장 혼잡 시 입장이 제한될 수 있습니다</li>
              </ul>
            </div>
          </section>

          {/* 액션 섹션 */}
          <section className="space-y-5">
            <div className="text-center space-y-2">
              <p className="text-lg md:text-xl font-semibold text-gray-900">
                지금 바로 신청하고, 토크콘서트 현장에서 함께하세요.
              </p>
              <p className="text-sm md:text-base text-gray-600">
                신청 내역과 좌석 정보는 행사 전 언제든지 이 페이지에서 다시 확인할 수 있습니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr,1fr] gap-4 md:gap-5">
              <Link href="/apply" className="w-full">
                <button className="btn-primary-glass w-full">
                  참가 신청하기
                </button>
              </Link>

              <Link href="/check" className="w-full">
                <button className="btn-secondary-glass w-full">
                  신청내역 확인
                </button>
              </Link>

              <Link href="/seat" className="w-full">
                <button className="btn-secondary-glass w-full">
                  좌석 확인
                </button>
              </Link>
            </div>
          </section>

          {/* 하단 작은 안내 */}
          <section className="text-center text-xs md:text-sm text-gray-500 pt-4 pb-2">
            <p>행사 운영 및 좌석 배정 상황에 따라 일부 내용은 변경될 수 있습니다.</p>
            <p className="mt-1">문의 사항은 행사 안내 채널을 통해 별도 공지드립니다.</p>
          </section>
        </div>
      </main>
    </div>
  )
}

