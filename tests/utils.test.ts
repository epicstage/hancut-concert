import { describe, it, expect } from 'vitest';
import {
  validatePhone,
  validateSsnFirst,
  shuffleArray,
  getKSTDateTime,
  generateAvailableSeats,
} from '../functions/api/utils';

describe('validatePhone', () => {
  it('should accept valid 11-digit phone number', () => {
    const result = validatePhone('01012345678');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject phone number with less than 11 digits', () => {
    const result = validatePhone('0101234567');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('전화번호는 11자리 숫자여야 합니다.');
  });

  it('should reject phone number with more than 11 digits', () => {
    const result = validatePhone('010123456789');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('전화번호는 11자리 숫자여야 합니다.');
  });

  it('should reject phone number with non-digit characters', () => {
    const result = validatePhone('010-1234-567');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('전화번호는 11자리 숫자여야 합니다.');
  });

  it('should reject phone number with letters', () => {
    const result = validatePhone('0101234abcd');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('전화번호는 11자리 숫자여야 합니다.');
  });
});

describe('validateSsnFirst', () => {
  it('should accept valid SSN first part (YYMMDD)', () => {
    const result = validateSsnFirst('990115');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept 2000s birth date', () => {
    const result = validateSsnFirst('050320');
    expect(result.valid).toBe(true);
  });

  it('should reject SSN with invalid month (00)', () => {
    const result = validateSsnFirst('990015');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('월');
  });

  it('should reject SSN with invalid month (13)', () => {
    const result = validateSsnFirst('991315');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('월');
  });

  it('should reject SSN with invalid day (00)', () => {
    const result = validateSsnFirst('990100');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('일');
  });

  it('should reject SSN with invalid day for month (Feb 30)', () => {
    const result = validateSsnFirst('990230');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('일');
  });

  it('should accept Feb 29 for leap year (2000)', () => {
    const result = validateSsnFirst('000229');
    expect(result.valid).toBe(true);
  });

  it('should reject Feb 29 for non-leap year (1999)', () => {
    const result = validateSsnFirst('990229');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('일');
  });

  it('should accept Feb 29 for leap year (2024)', () => {
    const result = validateSsnFirst('240229');
    expect(result.valid).toBe(true);
  });

  it('should reject SSN with less than 6 digits', () => {
    const result = validateSsnFirst('99011');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('주민번호 앞자리는 6자리 숫자여야 합니다.');
  });

  it('should reject SSN with non-digit characters', () => {
    const result = validateSsnFirst('99011a');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('주민번호 앞자리는 6자리 숫자여야 합니다.');
  });
});

describe('shuffleArray', () => {
  it('should return array with same length', () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(original);
    expect(shuffled.length).toBe(original.length);
  });

  it('should contain all original elements', () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(original);
    expect(shuffled.sort()).toEqual(original.sort());
  });

  it('should not modify the original array', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    shuffleArray(original);
    expect(original).toEqual(copy);
  });

  it('should handle empty array', () => {
    const result = shuffleArray([]);
    expect(result).toEqual([]);
  });

  it('should handle single element array', () => {
    const result = shuffleArray([1]);
    expect(result).toEqual([1]);
  });
});

describe('getKSTDateTime', () => {
  it('should return string in YYYY-MM-DD HH:mm:ss format', () => {
    const result = getKSTDateTime();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('should return a valid date string', () => {
    const result = getKSTDateTime();
    const datePart = result.split(' ')[0];
    const timePart = result.split(' ')[1];

    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    expect(year).toBeGreaterThanOrEqual(2024);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
    expect(minute).toBeGreaterThanOrEqual(0);
    expect(minute).toBeLessThanOrEqual(59);
    expect(second).toBeGreaterThanOrEqual(0);
    expect(second).toBeLessThanOrEqual(59);
  });
});

describe('generateAvailableSeats', () => {
  it('should generate correct number of seats', () => {
    const seats = generateAvailableSeats(['가', '나'], 2, 3);
    // 2 groups * 2 rows * 3 seats = 12 seats
    expect(seats.length).toBe(12);
  });

  it('should generate seats with correct structure', () => {
    const seats = generateAvailableSeats(['가'], 1, 1);
    expect(seats[0]).toEqual({
      group: '가',
      row: '1',
      number: '1',
    });
  });

  it('should handle single group', () => {
    const seats = generateAvailableSeats(['가'], 2, 2);
    expect(seats.length).toBe(4);
    expect(seats.map(s => s.group)).toEqual(['가', '가', '가', '가']);
  });

  it('should generate seats in order', () => {
    const seats = generateAvailableSeats(['가', '나'], 2, 2);

    // First group '가'
    expect(seats[0]).toEqual({ group: '가', row: '1', number: '1' });
    expect(seats[1]).toEqual({ group: '가', row: '1', number: '2' });
    expect(seats[2]).toEqual({ group: '가', row: '2', number: '1' });
    expect(seats[3]).toEqual({ group: '가', row: '2', number: '2' });

    // Second group '나'
    expect(seats[4]).toEqual({ group: '나', row: '1', number: '1' });
    expect(seats[5]).toEqual({ group: '나', row: '1', number: '2' });
  });

  it('should handle empty groups array', () => {
    const seats = generateAvailableSeats([], 10, 10);
    expect(seats.length).toBe(0);
  });
});
