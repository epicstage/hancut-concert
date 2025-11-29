'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Search } from 'lucide-react'
import { api } from '@/lib/api'

interface Participant {
  id: number
  user_name: string
  phone: string
  is_paid: boolean | number
  seat_no?: string | null
  seat_full?: string | null
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [filteredParticipants, setFilteredParticipants] = useState<Participant[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [editingSeat, setEditingSeat] = useState<{ id: number; seat: string } | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      loadParticipants()
    }
  }, [isAuthenticated])

  useEffect(() => {
    // 검색어가 변경되면 API로 다시 조회
    if (isAuthenticated) {
      loadParticipants()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123'
    if (password === adminPassword) {
      setIsAuthenticated(true)
    } else {
      alert('비밀번호가 올바르지 않습니다.')
    }
  }

  const loadParticipants = async () => {
    setIsLoading(true)
    try {
      const data = await api.getAllParticipants(searchTerm || undefined)
      
      // API 응답 형식에 맞게 변환
      const formatted = data.map((p: any) => ({
        id: p.id,
        user_name: p.user_name,
        phone: p.phone,
        is_paid: p.is_paid === 1 || p.is_paid === true,
        seat_no: p.seat_full || p.seat_no || null,
        created_at: p.created_at,
      }))
      
      setParticipants(formatted)
      setFilteredParticipants(formatted)
    } catch (err) {
      console.error('Error loading participants:', err)
      alert('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const togglePayment = async (id: number, currentStatus: boolean) => {
    try {
      await api.updatePaymentStatus(id, !currentStatus)
      loadParticipants()
    } catch (err) {
      console.error('Error updating payment status:', err)
      alert('입금 상태 변경 중 오류가 발생했습니다.')
    }
  }

  const updateSeat = async (id: number, seat: string) => {
    try {
      // 좌석 형식 파싱 (예: "가-2-5" 또는 "A-101")
      if (seat && seat.includes('-')) {
        const [group, row, number] = seat.split('-')
        await api.updateSeat(id, group, row, number)
      } else if (seat) {
        // 간단한 형식인 경우 기본값 사용
        await api.updateSeat(id, '가', '1', seat)
      }
      
      setEditingSeat(null)
      loadParticipants()
    } catch (err) {
      console.error('Error updating seat:', err)
      alert('좌석 번호 업데이트 중 오류가 발생했습니다.')
    }
  }

  const deleteParticipant = async (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      await api.deleteParticipant(id)
      loadParticipants()
    } catch (err) {
      console.error('Error deleting participant:', err)
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="card max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">관리자 로그인</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              로그인
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">관리자 페이지</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 검색 */}
        <div className="card mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="이름 또는 전화번호로 검색..."
              className="input-field pl-10"
            />
          </div>
        </div>

        {/* 테이블 */}
        <div className="card overflow-x-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">로딩 중...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">이름</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">전화번호</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">입금 상태</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">좌석 번호</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">신청 일시</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">{p.user_name}</td>
                    <td className="py-3 px-4">{p.phone}</td>
                    <td className="py-3 px-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.is_paid}
                          onChange={() => togglePayment(p.id, p.is_paid)}
                          className="w-5 h-5 text-red-600 rounded focus:ring-red-500"
                        />
                        <span className={p.is_paid ? 'text-red-600 font-medium' : 'text-gray-500'}>
                          {p.is_paid ? '입금 완료' : '입금 대기'}
                        </span>
                      </label>
                    </td>
                    <td className="py-3 px-4">
                      {editingSeat?.id === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingSeat.seat}
                            onChange={(e) =>
                              setEditingSeat({ id: p.id, seat: e.target.value })
                            }
                            className="px-2 py-1 border rounded w-24"
                            placeholder="A-101"
                          />
                          <button
                            onClick={() => updateSeat(p.id, editingSeat.seat)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingSeat(null)}
                            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{p.seat_no || '-'}</span>
                          {p.is_paid && (
                            <button
                              onClick={() => setEditingSeat({ id: p.id, seat: p.seat_no || '' })}
                              className="text-sm text-red-600 hover:text-red-700"
                            >
                              수정
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(p.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => deleteParticipant(p.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredParticipants.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? '검색 결과가 없습니다.' : '신청 내역이 없습니다.'}
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600">
          총 {filteredParticipants.length}명
        </div>
      </main>
    </div>
  )
}

