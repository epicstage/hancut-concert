'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ApplyPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState('')

  // 전화번호 숫자만 입력 처리
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    if (value.length <= 11) {
      setPhone(value)
    }
  }

  // 전화번호 포맷팅 (010-1234-5678)
  const formatPhone = (value: string) => {
    if (value.length <= 3) return value
    if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`
    return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 유효성 검사
    if (!name.trim()) {
      setError('이름을 입력해주세요.')
      return
    }

    if (phone.length !== 11) {
      setError('전화번호를 정확히 입력해주세요. (11자리)')
      return
    }

    setIsSubmitting(true)

    try {
      const { data, error: insertError } = await supabase
        .from('participants')
        .insert([
          {
            user_name: name.trim(),
            phone: phone,
          }
        ])
        .select()
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          setError('이미 신청된 전화번호입니다.')
        } else {
          setError('신청 중 오류가 발생했습니다. 다시 시도해주세요.')
        }
        setIsSubmitting(false)
        return
      }

      setShowSuccess(true)
      setTimeout(() => {
        router.push('/check')
      }, 2000)
    } catch (err) {
      setError('신청 중 오류가 발생했습니다. 다시 시도해주세요.')
      setIsSubmitting(false)
    }
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="card text-center max-w-md w-full">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center animate-bounce">
              <Check className="w-12 h-12 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            신청이 완료되었습니다!
          </h2>
          <p className="text-lg text-gray-700">
            신청내역 확인 페이지로 이동합니다...
          </p>
        </div>
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
            참가 신청
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-lg font-medium text-gray-700 mb-2">
                이름
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="이름을 입력하세요"
                required
              />
            </div>

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
                숫자만 입력하세요 (11자리)
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '신청 중...' : '신청하기'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

