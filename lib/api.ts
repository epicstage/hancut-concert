// Cloudflare Pages Functions API 클라이언트
// Next.js 앱에서 D1 데이터베이스에 접근하기 위한 API 클라이언트

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  participant?: T
  participants?: T[]
  count?: number
  [key: string]: any
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'API 요청 실패')
      }

      return data
    } catch (error) {
      console.error('API request error:', error)
      throw error
    }
  }

  // 관리자 로그인
  async adminLogin(password: string): Promise<string> {
    const response = await this.request<{ token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });

    if (!response.success || !response.token) {
      throw new Error(response.error || '로그인 중 오류가 발생했습니다.');
    }

    // 토큰은 클라이언트 로컬 스토리지에 저장
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('adminToken', response.token);
    }

    return response.token;
  }

  // 참가자 신청
  async createParticipant(params: {
    user_name: string
    phone: string
    ssn_first?: string
    ticket_count?: number
  }): Promise<{ id: number; ticket_count: number }> {
    const response = await this.request('/participants', {
      method: 'POST',
      body: JSON.stringify(params),
    })

    if (!response.success) {
      throw new Error(response.error || '신청 중 오류가 발생했습니다.')
    }

    return {
      id: response.id,
      ticket_count: response.ticket_count || 1,
    }
  }

  // 참가자 조회 (전화번호로)
  async getParticipantByPhone(phone: string): Promise<any> {
    const response = await this.request(`/participants/phone/${phone}`)

    if (!response.success) {
      throw new Error(response.error || '조회 중 오류가 발생했습니다.')
    }

    return response.participant
  }

  // 참가자 이름 수정
  async updateParticipantName(id: number, user_name: string): Promise<void> {
    const response = await this.request(`/participants/${id}/name`, {
      method: 'PUT',
      body: JSON.stringify({ user_name }),
    })

    if (!response.success) {
      throw new Error(response.error || '수정 중 오류가 발생했습니다.')
    }
  }

  // 참가자 수 조회
  async getParticipantCount(): Promise<number> {
    const response = await this.request('/participants/count')

    if (!response.success) {
      throw new Error(response.error || '조회 중 오류가 발생했습니다.')
    }

    return response.count || 0
  }

  // 관리자: 모든 참가자 조회
  async getAllParticipants(search?: string): Promise<any[]> {
    const url = search
      ? `/admin/participants?search=${encodeURIComponent(search)}`
      : '/admin/participants'

    const adminHeaders =
      typeof window !== 'undefined'
        ? { 'x-admin-token': window.localStorage.getItem('adminToken') || '' }
        : {}

    const response = await this.request(url, {
      headers: adminHeaders,
    })

    if (!response.success) {
      throw new Error(response.error || '조회 중 오류가 발생했습니다.')
    }

    return response.participants || []
  }

  // 관리자: 입금 상태 변경
  async updatePaymentStatus(
    id: number,
    is_paid: boolean
  ): Promise<void> {
    const adminHeaders =
      typeof window !== 'undefined'
        ? { 'x-admin-token': window.localStorage.getItem('adminToken') || '' }
        : {}

    const response = await this.request(`/admin/participants/${id}/payment`, {
      method: 'PUT',
      body: JSON.stringify({ is_paid }),
      headers: adminHeaders,
    })

    if (!response.success) {
      throw new Error(response.error || '업데이트 중 오류가 발생했습니다.')
    }
  }

  // 관리자: 좌석 배정
  async updateSeat(
    id: number,
    seat_group: string,
    seat_row: string,
    seat_number: string,
    is_guest?: boolean
  ): Promise<void> {
    const adminHeaders =
      typeof window !== 'undefined'
        ? { 'x-admin-token': window.localStorage.getItem('adminToken') || '' }
        : {}

    const response = await this.request(`/admin/participants/${id}/seat`, {
      method: 'PUT',
      body: JSON.stringify({
        seat_group,
        seat_row,
        seat_number,
        is_guest,
      }),
      headers: adminHeaders,
    })

    if (!response.success) {
      throw new Error(response.error || '좌석 배정 중 오류가 발생했습니다.')
    }
  }

  // 관리자: 참가자 삭제
  async deleteParticipant(id: number): Promise<void> {
    const adminHeaders =
      typeof window !== 'undefined'
        ? { 'x-admin-token': window.localStorage.getItem('adminToken') || '' }
        : {}

    const response = await this.request(`/admin/participants/${id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })

    if (!response.success) {
      throw new Error(response.error || '삭제 중 오류가 발생했습니다.')
    }
  }

  // 좌석 확인
  async getSeatByPhone(phone: string): Promise<{
    seat_full: string
    seat_group: string
    seat_row: string
    seat_number: string
  }> {
    const response = await this.request(`/seat/${phone}`)

    if (!response.success) {
      throw new Error(response.error || '조회 중 오류가 발생했습니다.')
    }

    return {
      seat_full: response.seat_full || response.seat,
      seat_group: response.seat_group || '',
      seat_row: response.seat_row || '',
      seat_number: response.seat_number || '',
    }
  }
}

export const api = new ApiClient()
export type { ApiResponse }

