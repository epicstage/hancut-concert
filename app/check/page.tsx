'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Edit2, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Participant {
  id: number
  user_name: string
  phone: string
  is_paid: boolean
  seat_no: string | null
  created_at: string
}

export default function CheckPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (phone.length !== 11) {
      setError('전화번호를 정확히 입력해주세요. (11자리)')
      return
    }

    setIsLoading(true)

    try {
      const { data, error: fetchError } = await supabase
        .from('participants')
        .select('*')
        .eq('phone', phone)
        .single()

      if (fetchError || !data) {
        setError('신청 내역을 찾을 수 없습니다.')
        setIsLoading(false)
        return
      }

      setParticipant(data)
      setEditName(data.user_name)
      setIsLoading(false)
    } catch (err) {
      setError('조회 중 오류가 발생했습니다.')
      setIsLoading(false)
    }
  }

  const handleUpdateName = async () => {
    if (!participant || !editName.trim()) return

    try {
      const { error: updateError } = await supabase
        .from('participants')
        .update({ user_name: editName.trim() })
        .eq('id', participant.id)

      if (updateError) {
        setError('이름 수정 중 오류가 발생했습니다.')
        return
      }

      setParticipant({ ...participant, user_name: editName.trim() })
      setIsEditing(false)
    } catch (err) {
      setError('이름 수정 중 오류가 발생했습니다.')
    }
  }

  if (participant) {
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
              신청 내역
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  이름
                </label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="input-field flex-1"
                      />
                      <button
                        onClick={handleUpdateName}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        저장
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false)
                          setEditName(participant.user_name)
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-medium text-gray-900">
                        {participant.user_name}
                      </span>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="p-2 text-gray-500 hover:text-gray-700"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  전화번호
                </label>
                <p className="text-lg text-gray-900">
                  {formatPhone(participant.phone)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  신청 상태
                </label>
                {participant.is_paid ? (
                  <span className="badge-red">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    입금 완료 (좌석 배정 대기)
                  </span>
                ) : (
                  <span className="badge-gray">
                    입금 확인 중
                  </span>
                )}
              </div>

              {participant.seat_no && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    좌석 번호
                  </label>
                  <p className="text-4xl font-bold text-red-600">
                    {participant.seat_no}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  신청 일시
                </label>
                <p className="text-lg text-gray-700">
                  {new Date(participant.created_at).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={() => {
                  setParticipant(null)
                  setPhone('')
                  setError('')
                }}
                className="btn-secondary w-full"
              >
                다른 번호로 조회하기
              </button>
            </div>
          </div>
        </main>
      </div>
    )
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
            신청내역 확인
          </h2>

          <form onSubmit={handleLogin} className="space-y-6">
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
              {isLoading ? '조회 중...' : '조회하기'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

