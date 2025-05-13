// src/lib/services/__tests__/availabilityService.test.ts

import {
    checkAvailability,
    getStaffDetails, // Exported and used within checkAvailability
    getWorkingInterval, // Exported and used within checkAvailability
    getDbBusyBlocks,    // Exported and used within checkAvailability
    getGcalBusyBlocks,  // Exported and used within checkAvailability
    calculateFreeIntervals, // Exported helper
    generateSlots,      // Exported helper
    DaySettings,        // Exported type
    StaffDetails,       // Exported type
} from '@/lib/services/availabilityService';
import { calendar_v3 } from 'googleapis'; // For typing Google API mocks
import { Pool, PoolClient } from 'pg';     // For typing and mocking pg

// --- Mock Dependencies ---

// Mock for the actual Google Calendar API call (e.g., freebusy.query or events.list)
// Based on your getGcalBusyBlocks, it's freebusy.query
const mockGCalFreeBusyQuery = jest.fn();

// Mock the googleClient module. Define the mock implementation directly within the factory.
// This is the pattern most resistant to hoisting/initialization issues within jest.mock.
jest.mock('@/lib/googleClient', () => ({
    __esModule: true,
    getGoogleCalendarClient: jest.fn().mockImplementation(async (staffId?: number) => {
        // This defines what the mocked getGoogleCalendarClient returns when called.
        // It must match the structure your service expects from the real client.
        // Your real getGoogleCalendarClient returns { authClient, calendar: ... }
        return {
            authClient: {
                 // Mock authClient methods if getGcalBusyBlocks or other parts use them (e.g., getAccessToken)
            },
            calendar: {
                freebusy: {
                    query: mockGCalFreeBusyQuery, // Point to the mock function declared above
                },
                // If your service also calls googleClient.calendar.events.list (e.g., for getBookedSlots if it changes logic)
                // events: {
                //   list: jest.fn(),
                // }
            },
        };
    }),
}));

// Mock the pg module for database interactions
jest.mock('pg', () => {
    // Mock PoolClient methods
    const mPoolClient = {
        query: jest.fn(),
        release: jest.fn(), // Important to mock release if your service calls it
        connect: jest.fn(), // PoolClient connect? Unlikely, but include if used
    };
    // Mock Pool methods
    const mPool = {
        connect: jest.fn().mockResolvedValue(mPoolClient), // Pool.connect returns a PoolClient
        query: jest.fn(),                               // Pool.query for direct queries on pool
        end: jest.fn(),                                 // Pool.end if used in cleanup
    };
    // The mock for the module exports { Pool } which is a constructor
    return { Pool: jest.fn(() => mPool) }; // Mock the Pool constructor to return our mock pool instance
});


// Get a reference to the mock function for assertions *after* jest.mock is done
let importedMockGetGoogleCalendarClient: jest.Mock;

// --- Test Setup ---

// Use a consistent test calendar ID
const TEST_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'test_calendar_id@group.calendar.google.com';

describe('AvailabilityService', () => {
    let mockDbClient: jest.Mocked<PoolClient>;
    let mockPool: jest.Mocked<Pool>;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    // This runs once before all tests in this describe block
    beforeAll(async () => {
        // Import the mocked getGoogleCalendarClient after the module is mocked
        // This ensures we get the mock function reference Jest created.
        const googleClientModule = await import('@/lib/googleClient');
        importedMockGetGoogleCalendarClient = googleClientModule.getGoogleCalendarClient as jest.Mock;

        // Spy on console errors and warnings for tests that check logging
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    // This runs before each individual test (it block)
    beforeEach(() => {
        // Reset all mock call history and implementations for a clean slate per test
        importedMockGetGoogleCalendarClient.mockClear();
        mockGCalFreeBusyQuery.mockClear();

        // Reset default implementation for the main getGoogleCalendarClient mock
        // (Needed if a test overrides it with mockImplementationOnce)
        importedMockGetGoogleCalendarClient.mockImplementation(async (staffId?: number) => {
             return {
                authClient: {}, // Minimal mock
                calendar: {
                    freebusy: {
                        query: mockGCalFreeBusyQuery,
                    },
                },
            } as unknown as calendar_v3.Calendar;
        });


        // Get mocked pg instances
        const pgModule = require('pg');
        // Ensure Pool constructor mock is cleared and returns a fresh mockPool instance
        (pgModule.Pool as jest.Mock).mockClear();
        mockPool = new pgModule.Pool() as jest.Mocked<Pool>; // Instantiate a new mock pool for each test

        // Get the mock client instance that Pool.connect will return
        mockDbClient = {
            query: jest.fn(),
            release: jest.fn(),
        } as unknown as jest.Mocked<PoolClient>; // Cast to mocked type

        // Configure mockPool.connect to return our fresh mockDbClient
        (mockPool.connect as jest.Mock).mockResolvedValue(mockDbClient);

        // Set default mock behavior for DB queries (e.g., return no rows)
        mockDbClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
        (mockPool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });

        // Set default mock behavior for GCal free/busy query (e.g., return no busy times)
        mockGCalFreeBusyQuery.mockResolvedValue({
            data: {
                kind: "calendar#freeBusy",
                timeMin: "mock_time_min",
                timeMax: "mock_time_max",
                calendars: {
                    [TEST_CALENDAR_ID]: { busy: [] },
                    'primary': { busy: [] }
                }
            }
        });
    });

    // This runs after all tests in this describe block
    afterAll(() => {
        // Restore console spies
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });


    // --- Test Suite for checkAvailability ---
    describe('checkAvailability', () => {
        // Define common test options
        const defaultOptions = {
            staffId: 1,
            newBookingStartTimeUTC: '2024-08-01T14:00:00Z', // 10 AM America/New_York EDT
            newBookingEndTimeUTC: '2024-08-01T15:00:00Z',   // 11 AM America/New_York EDT
            bookingTimezone: 'America/New_York',
            dbClient: {} as PoolClient, // This will be replaced by mockDbClient in each test
            bookingIdToExclude: null,
        };

        it('should return available if staff is active, working, and no conflicts', async () => {
            // Configure mock DB responses in the correct order of calls within checkAvailability
            (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // 1st query: getStaffDetails
                    rows: [{ name: 'Test Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true }],
                    rowCount: 1,
                })
                .mockResolvedValueOnce({ // 2nd query: getWorkingInterval
                    rows: [{ start_time: '09:00', end_time: '17:00' }], // 9 AM - 5 PM local time
                    rowCount: 1,
                })
                .mockResolvedValueOnce({ // 3rd query: getDbBusyBlocks
                    rows: [], // No DB conflicts
                    rowCount: 0,
                });

            // Mock GCal to return no busy times (default setup handles this, but explicit is also okay)
             mockGCalFreeBusyQuery.mockResolvedValueOnce({
                 data: {
                     calendars: {
                         [TEST_CALENDAR_ID]: { busy: [] },
                         'primary': { busy: [] }
                     }
                 }
             });


            // Call the function under test, providing the mock dbClient
            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            // Assertions
            expect(result.isAvailable).toBe(true);
            expect(result.reasons).toEqual([]);

            // Verify dependencies were called
            expect(mockDbClient.query).toHaveBeenCalledTimes(3); // getStaffDetails, getWorkingInterval, getDbBusyBlocks
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledWith(defaultOptions.staffId);
            expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(1); // Called within getGcalBusyBlocks
        });

        it('should return unavailable if staff member is not active', async () => {
             (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // 1st query: getStaffDetails
                    rows: [{ name: 'Inactive Staff', google_calendar_id: null, is_google_connected: false, is_active: false }],
                    rowCount: 1,
                });

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Staff member not found or inactive.']); // Check exact reason message
            expect(mockDbClient.query).toHaveBeenCalledTimes(1); // Only getStaffDetails should be called
            expect(importedMockGetGoogleCalendarClient).not.toHaveBeenCalled(); // Should not attempt GCal check
            expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled();
        });

        it('should return unavailable if staff has no working hours for the day', async () => {
             (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // 1st query: getStaffDetails
                    rows: [{ name: 'Test Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // 2nd query: getWorkingInterval
                    rows: [], // No working hours
                    rowCount: 0,
                });

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Staff member does not work on the selected day.']);
            expect(mockDbClient.query).toHaveBeenCalledTimes(2); // getStaffDetails, getWorkingInterval
            expect(importedMockGetGoogleCalendarClient).not.toHaveBeenCalled(); // Should not attempt GCal check
            expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled();
        });

        it('should return unavailable if booking is outside working hours', async () => {
             (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // getStaffDetails
                    rows: [{ name: 'Test Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getWorkingInterval (e.g., 15:00-23:00 local time, which is 11 AM - 7 PM EDT)
                    rows: [{ start_time: '15:00', end_time: '23:00' }], // Later working hours
                    rowCount: 1,
                });

            // defaultOptions booking is 10 AM - 11 AM EDT (UTC 14:00-15:00)
            // Working hours 11 AM - 7 PM EDT (UTC 15:00-23:00)
            // Booking is before working hours

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Time slot falls outside staff working hours (15:00 - 23:00 America/New_York).']);
            expect(mockDbClient.query).toHaveBeenCalledTimes(2); // getStaffDetails, getWorkingInterval
            expect(importedMockGetGoogleCalendarClient).not.toHaveBeenCalled(); // Should not proceed to conflicts
            expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled();
        });

        it('should return unavailable if there is a DB conflict', async () => {
            (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // getStaffDetails
                    rows: [{ name: 'Test Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getWorkingInterval
                    rows: [{ start_time: '09:00', end_time: '17:00' }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getDbBusyBlocks
                    rows: [{ booking_start_time: '2024-08-01T14:30:00Z', booking_end_time: '2024-08-01T15:30:00Z' }], // Conflict overlaps defaultOptions booking (14:00-15:00Z)
                    rowCount: 1,
                });

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Conflicts with another booking in the schedule.']);
            expect(mockDbClient.query).toHaveBeenCalledTimes(3); // getStaffDetails, getWorkingInterval, getDbBusyBlocks
            expect(importedMockGetGoogleCalendarClient).not.toHaveBeenCalled(); // Should not proceed to GCal check
            expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled();
        });

         it('should return unavailable if there is a GCal conflict', async () => {
            (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // getStaffDetails
                    rows: [{ name: 'Test Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getWorkingInterval
                    rows: [{ start_time: '09:00', end_time: '17:00' }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getDbBusyBlocks
                    rows: [], rowCount: 0, // No DB conflicts
                });

             // Mock GCal to return a conflicting busy time
             mockGCalFreeBusyQuery.mockResolvedValueOnce({
                 data: {
                     calendars: {
                         [TEST_CALENDAR_ID]: { busy: [{ start: '2024-08-01T14:15:00Z', end: '2024-08-01T15:15:00Z' }] }, // Conflict overlaps defaultOptions booking (14:00-15:00Z)
                         'primary': { busy: [] }
                     }
                 }
             });

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Conflicts with an event in the staff\'s Google Calendar.']);
            expect(mockDbClient.query).toHaveBeenCalledTimes(3); // getStaffDetails, getWorkingInterval, getDbBusyBlocks
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1); // Should call GCal client
            expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(1); // Should call GCal free/busy
        });

         it('should return unavailable and log warning if GCal is not connected', async () => {
            (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // getStaffDetails - not connected
                    rows: [{ name: 'Test Staff', google_calendar_id: null, is_google_connected: false, is_active: true }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getWorkingInterval
                    rows: [{ start_time: '09:00', end_time: '17:00' }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getDbBusyBlocks
                    rows: [], rowCount: 0, // No DB conflicts
                });

             // No GCal mocks needed as client should not be called

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Could not verify Google Calendar availability.']); // Your service returns this if gcalBusyBlocks is null (e.g., if client is null)
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('No Google refresh token found.')); // Check the specific warning from getGoogleCalendarClient mock if staffDetails.is_google_connected is false

            expect(mockDbClient.query).toHaveBeenCalledTimes(3); // Still fetches DB info
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1); // getGcalBusyBlocks *calls* getGoogleCalendarClient
            // expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledWith(defaultOptions.staffId); // Check staffId if needed
            expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled(); // But the free/busy query method is *not* called if client is null
        });

        it('should return unavailable and log error if GCal query fails', async () => {
            (mockDbClient.query as jest.Mock)
                .mockResolvedValueOnce({ // getStaffDetails
                    rows: [{ name: 'Test Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getWorkingInterval
                    rows: [{ start_time: '09:00', end_time: '17:00' }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getDbBusyBlocks
                    rows: [], rowCount: 0, // No DB conflicts
                });

            const gcalError = new Error('GCal API failed');
            mockGCalFreeBusyQuery.mockRejectedValueOnce(gcalError); // Mock GCal API call to fail

            const result = await checkAvailability({ ...defaultOptions, dbClient: mockDbClient });

            expect(result.isAvailable).toBe(false);
            expect(result.reasons).toEqual(['Could not verify Google Calendar availability.']); // Your service returns this if gcalBusyBlocks is null (e.g., on API error)
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error querying GCal free/busy:'), gcalError.message); // Check the specific error log in getGcalBusyBlocks

            expect(mockDbClient.query).toHaveBeenCalledTimes(3);
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
            expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(1);
        });


         it('should handle cases where optional staffDetails and bookingIdToExclude are provided', async () => {
             const providedStaffDetails: StaffDetails = {
                 name: 'Provided Staff', google_calendar_id: 'provided_cal_id', is_google_connected: true, is_active: true
             };
             const bookingIdToExclude = 123;

              (mockDbClient.query as jest.Mock)
                // getStaffDetails should NOT be called since providedStaffDetails is passed
                .mockResolvedValueOnce({ // getWorkingInterval
                    rows: [{ start_time: '09:00', end_time: '17:00' }], rowCount: 1,
                })
                .mockResolvedValueOnce({ // getDbBusyBlocks - check for bookingIdToExclude in query params
                    rows: [], rowCount: 0,
                });

             mockGCalFreeBusyQuery.mockResolvedValueOnce({ data: { calendars: { [providedStaffDetails.google_calendar_id!]: { busy: [] } } } });


            const result = await checkAvailability({
                 ...defaultOptions,
                 dbClient: mockDbClient,
                 staffDetails: providedStaffDetails,
                 bookingIdToExclude: bookingIdToExclude
            });

            expect(result.isAvailable).toBe(true);
            expect(result.reasons).toEqual([]);

            // getStaffDetails should NOT have been called
            expect(mockDbClient.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM staff WHERE staff_id = $1'), expect.any(Array));
            // getWorkingInterval and getDbBusyBlocks should be called
            expect(mockDbClient.query).toHaveBeenCalledTimes(2);

            // Check getDbBusyBlocks query parameters, including the exclusion
            expect(mockDbClient.query).toHaveBeenCalledWith(
                expect.stringContaining('AND booking_id != $4'), // Check exclusion clause
                expect.arrayContaining([defaultOptions.staffId, defaultOptions.newBookingStartTimeUTC, defaultOptions.newBookingEndTimeUTC, bookingIdToExclude])
            );

            // GCal calls should use the provided staff details and proceed
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
             // Check that getGcalBusyBlocks was called with the *provided* staffDetails
            expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledWith(defaultOptions.staffId);
             expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(1);
             // Check GCal query used the provided calendar ID
             expect(mockGCalFreeBusyQuery).toHaveBeenCalledWith(expect.objectContaining({
                 requestBody: expect.objectContaining({
                     items: [{ id: providedStaffDetails.google_calendar_id }]
                 })
             }));
        });
    });

    // --- Test Suites for Helper Functions ---

    describe('getStaffDetails', () => {
        it('should fetch staff details from DB', async () => {
            const staffId = 1;
            const expectedDetails: StaffDetails = { name: 'Test Staff', google_calendar_id: 'cal_id', is_google_connected: true, is_active: true };
            (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: [expectedDetails], rowCount: 1 });

            const details = await getStaffDetails(staffId, mockDbClient);

            expect(details).toEqual(expectedDetails);
            expect(mockDbClient.query).toHaveBeenCalledTimes(1);
            expect(mockDbClient.query).toHaveBeenCalledWith(expect.stringContaining('SELECT name, google_calendar_id, google_refresh_token IS NOT NULL AS is_google_connected, is_active FROM staff WHERE staff_id = $1'), [staffId]);
        });

         it('should return null if staff not found', async () => {
             const staffId = 99;
             (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
             const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); // Spy on console.log

             const details = await getStaffDetails(staffId, mockDbClient);

             expect(details).toBeNull();
             expect(mockDbClient.query).toHaveBeenCalledTimes(1);
             expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[getStaffDetails Staff ${staffId}]: Staff member not found.`));

             consoleLogSpy.mockRestore(); // Restore the spy
         });

         it('should log error and return null if DB query fails', async () => {
             const staffId = 1;
             const dbError = new Error('DB connection failed');
             (mockDbClient.query as jest.Mock).mockRejectedValueOnce(dbError);
             // consoleErrorSpy is already active

             const details = await getStaffDetails(staffId, mockDbClient);

             expect(details).toBeNull();
             expect(mockDbClient.query).toHaveBeenCalledTimes(1);
             expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[getStaffDetails Staff ${staffId}]: Error fetching staff details:`), dbError.message);
         });
    });

     describe('getWorkingInterval', () => {
         it('should fetch working interval from DB', async () => {
             const staffId = 1;
             const dayOfWeek = 1; // Monday
             const expectedInterval = { start: '09:00', end: '17:00' };
             (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: [{ start_time: '09:00', end_time: '17:00' }], rowCount: 1 });

             const interval = await getWorkingInterval(staffId, dayOfWeek, mockDbClient);

             expect(interval).toEqual(expectedInterval);
             expect(mockDbClient.query).toHaveBeenCalledTimes(1);
             expect(mockDbClient.query).toHaveBeenCalledWith(
                 expect.stringContaining('FROM staff_working_hours WHERE staff_id = $1 AND day_of_week = $2'),
                 [staffId, dayOfWeek]
             );
         });

          it('should return null if no working hours found', async () => {
             const staffId = 1;
             const dayOfWeek = 7; // Sunday
             (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
             const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

             const interval = await getWorkingInterval(staffId, dayOfWeek, mockDbClient);

             expect(interval).toBeNull();
             expect(mockDbClient.query).toHaveBeenCalledTimes(1);
             expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[getWorkingInterval Staff ${staffId} Day ${dayOfWeek}]: No working hours found.`));

             consoleLogSpy.mockRestore();
         });

         it('should log error and return null if DB query fails', async () => {
             const staffId = 1;
             const dayOfWeek = 1;
             const dbError = new Error('DB error');
             (mockDbClient.query as jest.Mock).mockRejectedValueOnce(dbError);
             // consoleErrorSpy active

             const interval = await getWorkingInterval(staffId, dayOfWeek, mockDbClient);

             expect(interval).toBeNull();
             expect(mockDbClient.query).toHaveBeenCalledTimes(1);
             expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[getWorkingInterval Staff ${staffId} Day ${dayOfWeek}]: Error fetching working hours:`), dbError.message);
         });
     });

     describe('getDbBusyBlocks', () => {
          it('should fetch and format DB busy blocks', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const mockDbRows = [
                 { booking_start_time: '2024-08-01T11:00:00Z', booking_end_time: '2024-08-01T12:00:00Z' },
                 { booking_start_time: '2024-08-01T15:30:00Z', booking_end_time: '2024-08-01T16:00:00Z' },
             ];
              (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: mockDbRows, rowCount: mockDbRows.length });

              const busyBlocks = await getDbBusyBlocks(staffId, startTimeUTC, endTimeUTC, mockDbClient);

              expect(busyBlocks).toHaveLength(2);
              expect(busyBlocks[0].start.toISOString()).toBe('2024-08-01T11:00:00.000Z');
              expect(busyBlocks[0].end.toISOString()).toBe('2024-08-01T12:00:00.000Z');
              expect(busyBlocks[1].start.toISOString()).toBe('2024-08-01T15:30:00.000Z');
              expect(busyBlocks[1].end.toISOString()).toBe('2024-08-01T16:00:00.000Z');
              expect(mockDbClient.query).toHaveBeenCalledTimes(1);
               expect(mockDbClient.query).toHaveBeenCalledWith(
                 expect.stringContaining('SELECT booking_start_time, booking_end_time FROM bookings'),
                 [staffId, startTimeUTC, endTimeUTC]
             );
          });

           it('should include bookingIdToExclude if provided', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const bookingIdToExclude = 123;
              (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

              await getDbBusyBlocks(staffId, startTimeUTC, endTimeUTC, mockDbClient, bookingIdToExclude);

              expect(mockDbClient.query).toHaveBeenCalledTimes(1);
              expect(mockDbClient.query).toHaveBeenCalledWith(
                 expect.stringContaining('AND booking_id != $4'), // Check exclusion clause is added
                 [staffId, startTimeUTC, endTimeUTC, bookingIdToExclude]
             );
          });

          it('should return empty array if no busy blocks found', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
              (mockDbClient.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

              const busyBlocks = await getDbBusyBlocks(staffId, startTimeUTC, endTimeUTC, mockDbClient);

              expect(busyBlocks).toEqual([]);
              expect(mockDbClient.query).toHaveBeenCalledTimes(1);
          });

          it('should log error and return empty array if DB query fails', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const dbError = new Error('DB query error');
              (mockDbClient.query as jest.Mock).mockRejectedValueOnce(dbError);
             // consoleErrorSpy active

             const busyBlocks = await getDbBusyBlocks(staffId, startTimeUTC, endTimeUTC, mockDbClient);

             expect(busyBlocks).toEqual([]);
             expect(mockDbClient.query).toHaveBeenCalledTimes(1);
             expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`[getDbBusyBlocks Staff ${staffId}]: Error fetching DB busy blocks:`), dbError.message);
          });
     });

     describe('getGcalBusyBlocks', () => {
         it('should fetch and format GCal busy blocks if connected', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const staffDetails: StaffDetails = {
                 name: 'GCal Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true
             };
             const mockGCalResponse = {
                  data: {
                     calendars: {
                         [TEST_CALENDAR_ID]: {
                             busy: [
                                 { start: '2024-08-01T11:00:00Z', end: '2024-08-01T12:00:00Z' },
                                 { start: '2024-08-01T15:30:00Z', end: '2024-08-01T16:00:00Z' },
                             ]
                         }
                     }
                 }
             };
             mockGCalFreeBusyQuery.mockResolvedValueOnce(mockGCalResponse);

             const busyBlocks = await getGcalBusyBlocks(staffId, startTimeUTC, endTimeUTC, staffDetails);

             expect(busyBlocks).toHaveLength(2);
             expect(busyBlocks![0].start.toISOString()).toBe('2024-08-01T11:00:00.000Z');
             expect(busyBlocks![0].end.toISOString()).toBe('2024-08-01T12:00:00.000Z');
             expect(busyBlocks![1].start.toISOString()).toBe('2024-08-01T15:30:00.000Z');
             expect(busyBlocks![1].end.toISOString()).toBe('2024-08-01T16:00:00.000Z');

             expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
             expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledWith(staffId);
             expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(1);
             expect(mockGCalFreeBusyQuery).toHaveBeenCalledWith(expect.objectContaining({
                  requestBody: expect.objectContaining({
                      timeMin: startTimeUTC,
                      timeMax: endTimeUTC,
                      items: [{ id: TEST_CALENDAR_ID }]
                  })
             }));
         });

         it('should return empty array if not Google connected', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const staffDetails: StaffDetails = {
                 name: 'Not Connected', google_calendar_id: null, is_google_connected: false, is_active: true
             };

             const busyBlocks = await getGcalBusyBlocks(staffId, startTimeUTC, endTimeUTC, staffDetails);

             expect(busyBlocks).toEqual([]);
             expect(importedMockGetGoogleCalendarClient).not.toHaveBeenCalled(); // GCal client should not be obtained
             expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled(); // GCal query should not be called
         });

         it('should return null and log warning if getGoogleCalendarClient returns null', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const staffDetails: StaffDetails = {
                 name: 'GCal Issue', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true
             };
             importedMockGetGoogleCalendarClient.mockResolvedValueOnce(null); // Mock getGoogleCalendarClient to fail

             const busyBlocks = await getGcalBusyBlocks(staffId, startTimeUTC, endTimeUTC, staffDetails);

             expect(busyBlocks).toBeNull(); // Service returns null if client is null
             expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[getGoogleCalendarClient Staff 1]'), expect.any(String)); // Expect getGoogleCalendarClient mock to log its failure (if it does, or rely on service log if service logs it)
             // Note: The service logs "Error fetching booked slots" if getGcalBusyBlocks returns null
             expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error querying GCal free/busy:'), expect.any(String)); // Service log on getGcalBusyBlocks failure

             expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
             expect(mockGCalFreeBusyQuery).not.toHaveBeenCalled(); // GCal query should not be called if client is null
         });

         it('should return null and log error if GCal query fails', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const staffDetails: StaffDetails = {
                 name: 'GCal Error Staff', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true
             };
             const gcalError = new Error('GCal API error');
             mockGCalFreeBusyQuery.mockRejectedValueOnce(gcalError); // Mock the query to fail

             const busyBlocks = await getGcalBusyBlocks(staffId, startTimeUTC, endTimeUTC, staffDetails);

             expect(busyBlocks).toBeNull(); // Service returns null if GCal query fails
             expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[getGcalBusyBlocks Staff 1]: Error querying GCal free/busy:'), gcalError.message); // Check the specific error log

             expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(1); // getGoogleCalendarClient should still be called
             expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(1); // The query attempt should happen
         });

          it('should return empty array if GCal response has no calendars or busy times', async () => {
             const staffId = 1;
             const startTimeUTC = '2024-08-01T10:00:00Z';
             const endTimeUTC = '2024-08-01T18:00:00Z';
             const staffDetails: StaffDetails = {
                 name: 'Empty GCal', google_calendar_id: TEST_CALENDAR_ID, is_google_connected: true, is_active: true
             };

             // Mock responses with no calendars or no busy arrays
             mockGCalFreeBusyQuery.mockResolvedValueOnce({ data: { calendars: {} } }); // No calendars
             const busyBlocks1 = await getGcalBusyBlocks(staffId, startTimeUTC, endTimeUTC, staffDetails);
             expect(busyBlocks1).toEqual([]);

             mockGCalFreeBusyQuery.mockResolvedValueOnce({ data: { calendars: { [TEST_CALENDAR_ID]: {} } } }); // Calendar exists, but no busy array
             const busyBlocks2 = await getGcalBusyBlocks(staffId, startTimeUTC, endTimeUTC, staffDetails);
             expect(busyBlocks2).toEqual([]);

             expect(importedMockGetGoogleCalendarClient).toHaveBeenCalledTimes(2); // Called for each test above
             expect(mockGCalFreeBusyQuery).toHaveBeenCalledTimes(2); // Called for each test above
         });
     });

     // Add tests for calculateFreeIntervals and generateSlots if you deem them necessary
     // based on complexity, though they seem straightforward.
     // describe('calculateFreeIntervals', () => { /* ... */ });
     // describe('generateSlots', () => { /* ... */ });

});