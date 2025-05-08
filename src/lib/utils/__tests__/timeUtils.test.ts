// src/lib/utils/__tests__/timeUtils.test.ts

import { timeToMinutes, formatTime } from '../timeUtils';

describe('timeToMinutes', () => {
  it('should convert "00:00" to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('should convert "01:30" to 90', () => {
    expect(timeToMinutes('01:30')).toBe(90);
  });

  it('should convert "23:59" to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('formatTime', () => {
  it('should format 0 as "00:00"', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('should format 90 as "01:30"', () => {
    expect(formatTime(90)).toBe('01:30');
  });

  it('should format 1439 as "23:59"', () => {
    expect(formatTime(1439)).toBe('23:59');
  });
});
