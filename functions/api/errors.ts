// 에러 코드 및 메시지 상수

export const ErrorCode = {
    // 검증 오류 (400)
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    INVALID_PHONE_FORMAT: 'INVALID_PHONE_FORMAT',
    INVALID_SSN_FORMAT: 'INVALID_SSN_FORMAT',
    INVALID_TICKET_COUNT: 'INVALID_TICKET_COUNT',
    DUPLICATE_PHONE: 'DUPLICATE_PHONE',
    SAME_PHONE_AS_MAIN: 'SAME_PHONE_AS_MAIN',
    ALREADY_DELETED: 'ALREADY_DELETED',
    NOT_DELETED: 'NOT_DELETED',

    // 인증 오류 (401)
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_TOKEN: 'INVALID_TOKEN',

    // 권한 오류 (403)
    FORBIDDEN: 'FORBIDDEN',
    INVALID_CONFIRM_TOKEN: 'INVALID_CONFIRM_TOKEN',

    // 찾을 수 없음 (404)
    NOT_FOUND: 'NOT_FOUND',
    PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',

    // 충돌 (409)
    CONFLICT: 'CONFLICT',

    // 서버 오류 (500)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export const ErrorMessages = {
    // 참가자 신청
    MISSING_NAME_PHONE: '이름과 전화번호는 필수입니다.',
    INVALID_PHONE: '전화번호 형식이 올바르지 않습니다. (예: 01012345678)',
    INVALID_SSN: '생년월일 형식이 올바르지 않습니다. (예: 990101)',
    INVALID_TICKET_COUNT: '티켓 수는 1 또는 2만 가능합니다.',
    DUPLICATE_PHONE: '이미 신청하신 전화번호입니다. 신청 내역을 확인해주세요.',
    REGISTRATION_ERROR: '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',

    // 2번째 참가자
    MISSING_GUEST2_INFO: '2번째 참가자의 이름, 전화번호, 생년월일은 모두 필수입니다.',
    SAME_PHONE_AS_MAIN: '본인과 동반자의 전화번호가 같을 수 없습니다.',
    GUEST2_UPDATE_ERROR: '2번째 참가자 정보 등록 중 오류가 발생했습니다.',

    // 조회
    PARTICIPANT_NOT_FOUND: '신청 내역을 찾을 수 없습니다.',
    FETCH_ERROR: '조회 중 오류가 발생했습니다.',

    // 관리자
    INVALID_PARTICIPANT_ID: '유효하지 않은 참가자 ID입니다.',
    UPDATE_ERROR: '업데이트 중 오류가 발생했습니다.',
    DELETE_ERROR: '삭제 중 오류가 발생했습니다.',
    RESTORE_ERROR: '복구 중 오류가 발생했습니다.',
    ALREADY_DELETED: '이미 삭제된 참가자입니다.',
    NOT_DELETED: '삭제되지 않은 참가자입니다.',

    // 좌석
    INVALID_SEAT_GROUP: '유효하지 않은 그룹입니다. (가~하)',
    INVALID_SEAT_ROW: '열 번호는 숫자만 입력 가능합니다.',
    INVALID_SEAT_NUMBER: '좌석 번호는 숫자만 입력 가능합니다.',
    SEAT_ASSIGNMENT_ERROR: '좌석 배정 중 오류가 발생했습니다.',
    SEAT_RESET_ERROR: '좌석 초기화 중 오류가 발생했습니다.',
    INVALID_RESET_TOKEN: '좌석 초기화를 위해서는 확인 토큰이 필요합니다.',
    NO_PAID_PARTICIPANTS: '좌석을 배정할 입금 완료 참가자가 없습니다.',
    INSUFFICIENT_SEATS: '사용 가능한 좌석이 필요한 좌석 수보다 적습니다.',

    // 체크인
    CHECKIN_LIST_NOT_FOUND: '체크인 리스트를 찾을 수 없습니다.',
    CHECKIN_LIST_INACTIVE: '비활성화된 체크인 리스트입니다.',
    ALREADY_CHECKED_IN: '이미 체크인된 참가자입니다.',
    SEAT_GROUP_NOT_ALLOWED: '이 입구는 해당 좌석 구역의 입장이 허용되지 않습니다.',
    CHECKIN_ERROR: '체크인 처리 중 오류가 발생했습니다.',

    // Rate Limiting
    RATE_LIMIT_EXCEEDED: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',

    // 일반
    INTERNAL_ERROR: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
} as const;

/**
 * 표준화된 에러 응답 생성
 */
export function createErrorResponse(
    code: ErrorCodeType,
    message: string,
    details?: Record<string, unknown>
) {
    return {
        success: false,
        error: {
            code,
            message,
            ...details,
        },
    };
}
