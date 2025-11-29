'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'

export default function SeatPage() {
  const [phone, setPhone] = useState('')
  const [seatNo, setSeatNo] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // 전화번호 숫자만 입력 처리
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    if (value.length <= 11) {
      setPhone(value)
    }
  }

  // 전화번호 포맷팅
  const formatPhone = (value: string) => {
    if (value.length <= 3) return value
    if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`
    return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`
  }

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSeatNo(null)

    if (phone.length !== 11) {
      setError('전화번호를 정확히 입력해주세요. (11자리)')
      return
    }

    setIsLoading(true)

    try {
      const seatData = await api.getSeatByPhone(phone)
      
      setSeatNo(seatData.seat_full || seatData.seat_group + '-' + seatData.seat_row + '-' + seatData.seat_number)
      setIsLoading(false)
    } catch (err: any) {
      setError(err?.message || '조회 중 오류가 발생했습니다.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
            <span>돌아가기</span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            좌석 확인
          </h2>

          {!seatNo ? (
            <form onSubmit={handleCheck} className="space-y-6">
              <div>
                <label htmlFor="phone" className="block text-lg font-medium text-gray-700 mb-2">
                  전화번호
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={formatPhone(phone)}
                  onChange={handlePhoneChange}
                  className="input-field"
                  placeholder="010-1234-5678"
                  maxLength={13}
                  required
                />
                <p className="mt-2 text-sm text-gray-500">
                  신청 시 입력한 전화번호를 입력하세요
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '조회 중...' : '좌석 확인하기'}
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <p className="text-lg text-gray-700 mb-4">당신의 좌석 번호는</p>
              <p className="text-6xl font-bold text-red-600 mb-8">
                {seatNo}
              </p>
              <button
                onClick={() => {
                  setSeatNo(null)
                  setPhone('')
                  setError('')
                }}
                className="btn-secondary"
              >
                다시 조회하기
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

