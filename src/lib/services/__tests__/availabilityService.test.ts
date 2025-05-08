// src/lib/services/__tests__/availabilityService.test.ts
import moment from 'moment-timezone';
import { PoolClient } from 'pg';

// 1) MOCK EXTERNAL DEPENDENCIES
const mockQuery = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: jest.fn(),
  release: jest.fn(),
});
jest.mock('@/lib/db', () => ({
  __esModule: true,
  dbPool: { query: mockQuery, connect: mockConnect },
}));

const mockGcalQuery = jest.fn();
const mockGetGoogleCalendarClient = jest.fn().mockResolvedValue({
  calendar: { freebusy: { query: mockGcalQuery } },
});
jest.mock('@/lib/googleClient', () => ({
  __esModule: true,
  getGoogleCalendarClient: mockGetGoogleCalendarClient,
}));

// 2) IMPORT THE REAL MODULE UNDER TEST
import * as availabilityService from '../availabilityService';
const {
  getStaffDetails,
  getWorkingInterval,
  getDbBusyBlocks,
  getGcalBusyBlocks,
  calculateFreeIntervals,
  generateSlots,
  checkAvailability,
} = availabilityService;

// 3) TYPE‐HELPER
import type { StaffDetails } from '../availabilityService';

describe('Availability Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockConnect.mockReset();
    mockGcalQuery.mockReset().mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });
    mockGetGoogleCalendarClient.mockClear().mockResolvedValue({
      calendar: { freebusy: { query: mockGcalQuery } },
    });
  });

  // ——— Pure functions ———
  describe('calculateFreeIntervals', () => {
    it('returns full working time when no busy blocks', () => {
      const working = [{ start: 540, end: 1020 }];
      const free = availabilityService.calculateFreeIntervals(working, []);
      expect(free).toEqual([{ start: 540, end: 1020 }]);
    });
    // …other pure‐function tests…
  });

  describe('generateSlots', () => {
    it('creates slots at step intervals', () => {
      const free = [{ start: 540, end: 720 }];
      const slots = availabilityService.generateSlots(free, 60, 30);
      expect(slots).toEqual([540, 570, 600, 630, 660]);
    });
  });

  // ——— checkAvailability orchestrator ———
  describe('checkAvailability', () => {
    const staffId = 1;
    const bookingStart = '2024-10-28T14:00:00Z';
    const bookingEnd = '2024-10-28T15:00:00Z';
    const tz = 'Africa/Casablanca';
    const mockDbClient = { query: jest.fn(), release: jest.fn() } as unknown as PoolClient;

    const activeStaff: StaffDetails = {
      name: 'Alice',
      google_calendar_id: 'primary',
      is_google_connected: true,
      is_active: true,
    };
    const inactiveStaff = { ...activeStaff, is_active: false };
    const working = { start: '09:00', end: '18:00' };
    const earlyWorking = { start: '09:00', end: '14:00' };

    it('returns available when no conflicts', async () => {
      jest.spyOn(availabilityService, 'getStaffDetails').mockResolvedValue(activeStaff);
      jest.spyOn(availabilityService, 'getWorkingInterval').mockResolvedValue(working);
      jest.spyOn(availabilityService, 'getDbBusyBlocks').mockResolvedValue([]);
      jest.spyOn(availabilityService, 'getGcalBusyBlocks').mockResolvedValue([]);

      const result = await availabilityService.checkAvailability({
        staffId,
        newBookingStartTimeUTC: bookingStart,
        newBookingEndTimeUTC: bookingEnd,
        bookingTimezone: tz,
        dbClient: mockDbClient,
      });

      expect(result.isAvailable).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('short‑circuits when staff inactive', async () => {
      jest.spyOn(availabilityService, 'getStaffDetails').mockResolvedValue(inactiveStaff);

      const result = await availabilityService.checkAvailability({
        staffId,
        newBookingStartTimeUTC: bookingStart,
        newBookingEndTimeUTC: bookingEnd,
        bookingTimezone: tz,
        dbClient: mockDbClient,
      });
      expect(result.isAvailable).toBe(false);
      expect(result.reasons).toContain('Staff member not found or inactive.');
    });

    it('short‑circuits when outside working hours', async () => {
      jest.spyOn(availabilityService, 'getStaffDetails').mockResolvedValue(activeStaff);
      jest.spyOn(availabilityService, 'getWorkingInterval').mockResolvedValue(earlyWorking);

      const result = await availabilityService.checkAvailability({
        staffId,
        newBookingStartTimeUTC: bookingStart,
        newBookingEndTimeUTC: bookingEnd,
        bookingTimezone: tz,
        dbClient: mockDbClient,
      });
      expect(result.isAvailable).toBe(false);
      expect(result.reasons[0]).toMatch(/outside staff working hours/i);
    });

    it('detects DB conflicts', async () => {
      jest.spyOn(availabilityService, 'getStaffDetails').mockResolvedValue(activeStaff);
      jest.spyOn(availabilityService, 'getWorkingInterval').mockResolvedValue(working);
      jest.spyOn(availabilityService, 'getDbBusyBlocks').mockResolvedValue([
        { start: moment.utc('2024-10-28T14:30:00Z'), end: moment.utc('2024-10-28T15:30:00Z') },
      ]);

      const result = await availabilityService.checkAvailability({
        staffId,
        newBookingStartTimeUTC: bookingStart,
        newBookingEndTimeUTC: bookingEnd,
        bookingTimezone: tz,
        dbClient: mockDbClient,
      });
      expect(result.isAvailable).toBe(false);
      expect(result.reasons).toContain('Conflicts with another booking');
    });

    it('detects GCal conflicts', async () => {
      jest.spyOn(availabilityService, 'getStaffDetails').mockResolvedValue(activeStaff);
      jest.spyOn(availabilityService, 'getWorkingInterval').mockResolvedValue(working);
      jest.spyOn(availabilityService, 'getDbBusyBlocks').mockResolvedValue([]);
      jest.spyOn(availabilityService, 'getGcalBusyBlocks').mockResolvedValue([
        { start: moment.utc('2024-10-28T14:15:00Z'), end: moment.utc('2024-10-28T14:45:00Z') },
      ]);

      const result = await availabilityService.checkAvailability({
        staffId,
        newBookingStartTimeUTC: bookingStart,
        newBookingEndTimeUTC: bookingEnd,
        bookingTimezone: tz,
        dbClient: mockDbClient,
      });
      expect(result.isAvailable).toBe(false);
      expect(result.reasons[0]).toMatch(/Google Calendar/i);
    });

    it('excludes bookingId when checking DB', async () => {
      jest.spyOn(availabilityService, 'getStaffDetails').mockResolvedValue(activeStaff);
      jest.spyOn(availabilityService, 'getWorkingInterval').mockResolvedValue(working);
      const spyDb = jest.spyOn(availabilityService, 'getDbBusyBlocks').mockResolvedValue([]);
      jest.spyOn(availabilityService, 'getGcalBusyBlocks').mockResolvedValue([]);

      await availabilityService.checkAvailability({
        staffId,
        newBookingStartTimeUTC: bookingStart,
        newBookingEndTimeUTC: bookingEnd,
        bookingTimezone: tz,
        dbClient: mockDbClient,
        bookingIdToExclude: 555,
      });
      expect(spyDb).toHaveBeenCalledWith(staffId, bookingStart, bookingEnd, mockDbClient, 555);
    });
  });
});
