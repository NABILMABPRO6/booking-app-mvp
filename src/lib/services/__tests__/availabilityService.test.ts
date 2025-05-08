// src/lib/services/__tests__/availabilityService.test.ts

// 1. Define mock functions for dependencies FIRST
const mockListEvents = jest.fn();
const mockGetGoogleCalendarClient = jest.fn(() => ({
    events: {
        list: mockListEvents,
    },
}));

const MOCK_CALENDAR_ID = 'test-calendar-id@group.calendar.google.com';

// 2. Mock environment variables (if used by the service)
// Store original process.env
const originalEnv = process.env;

beforeAll(() => {
    // It's crucial to reset modules if modules import process.env at the top level
    jest.resetModules();
    process.env = {
        ...originalEnv,
        GOOGLE_CALENDAR_ID: MOCK_CALENDAR_ID,
    };
});

afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
    jest.resetModules(); // Clean up module cache after tests
});


// 3. Mock external dependencies (like the Google Client)
// This MUST come before importing the module under test if that module uses this dependency.
jest.mock('@/lib/googleClient', () => ({
    __esModule: true, // Important for ES Modules compatibility
    getGoogleCalendarClient: mockGetGoogleCalendarClient, // Use the pre-defined mock function
}));

// 4. IF YOU ARE MOCKING THE SERVICE ITSELF (as hinted by your original error trace):
// This block should also come BEFORE the actual import of the service.
// This is generally for more complex scenarios, like spying on internal functions
// or selectively mocking parts of the service. For many unit tests, this isn't needed.
/*
jest.mock('@/lib/services/availabilityService', () => {
    const originalModule = jest.requireActual('@/lib/services/availabilityService');
    return {
        __esModule: true,
        ...originalModule,
        // Example: if you want to mock a specific function from availabilityService itself
        // getSomeOtherHelperFunction: jest.fn(),
    };
});
*/
// The ReferenceError you had was specifically about mockGetGoogleCalendarClient being
// undefined when the jest.mock('@/lib/googleClient', ...) was hoisted and executed.
// The order above fixes that. If the self-mock for availabilityService was also
// contributing to issues, ensure its factory function is correct.

// 5. Import the module under test (AFTER all mocks are set up)
import { getAvailableSlots, checkUserAvailability } from '@/lib/services/availabilityService';
// If you did mock availabilityService itself and want to test the mocked exports:
// import * as AvailabilityService from '@/lib/services/availabilityService';
// const { getAvailableSlots, checkUserAvailability } = AvailabilityService;


describe('AvailabilityService', () => {
    beforeEach(() => {
        // Reset mocks before each test to ensure test isolation
        mockGetGoogleCalendarClient.mockClear();
        mockListEvents.mockClear();

        // If you self-mocked functions from availabilityService and need to reset them:
        // e.g., if ((AvailabilityService.getSomeOtherHelperFunction as jest.Mock).mockClear)
    });

    describe('getAvailableSlots', () => {
        it('should call Google Calendar API with correct parameters and process events to find slots', async () => {
            const mockEventsResponse = {
                data: {
                    items: [
                        { summary: 'Busy Slot 1', start: { dateTime: '2024-07-15T10:00:00Z' }, end: { dateTime: '2024-07-15T11:00:00Z' } },
                        { summary: 'Busy Slot 2', start: { dateTime: '2024-07-15T14:00:00Z' }, end: { dateTime: '2024-07-15T15:00:00Z' } },
                    ],
                },
            };
            mockListEvents.mockResolvedValue(mockEventsResponse);

            const date = '2024-07-15'; // Use a specific date for predictability
            const serviceId = 'haircut-service'; // Example serviceId

            // Assuming your getAvailableSlots function returns an array of slot objects
            const availableSlots = await getAvailableSlots(date, serviceId);

            expect(mockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
            // Verify the parameters passed to the Google Calendar API
            // Note: timeMin and timeMax will depend on how your service calculates them from 'date'
            expect(mockListEvents).toHaveBeenCalledWith(expect.objectContaining({
                calendarId: MOCK_CALENDAR_ID,
                timeMin: `${date}T00:00:00.000Z`, // Example: start of the day in UTC
                timeMax: `${date}T23:59:59.999Z`, // Example: end of the day in UTC
                singleEvents: true,
                orderBy: 'startTime',
            }));

            // **IMPORTANT**: Your assertions for 'availableSlots' will depend heavily on your
            // getAvailableSlots implementation logic (how it defines slots, service duration, opening hours etc.)
            // This is a placeholder:
            expect(availableSlots).toEqual(expect.any(Array));
            // Example of a more specific assertion if you know the expected output:
            // expect(availableSlots).toEqual([
            //   { startTime: '2024-07-15T09:00:00Z', endTime: '2024-07-15T10:00:00Z', available: true },
            //   { startTime: '2024-07-15T11:00:00Z', endTime: '2024-07-15T12:00:00Z', available: true },
            //   // ... other slots
            // ]);
        });

        it('should return an empty array or handle cases with no events found', async () => {
            mockListEvents.mockResolvedValue({ data: { items: [] } }); // No busy events

            const date = '2024-07-16';
            const serviceId = 'massage-service';

            const availableSlots = await getAvailableSlots(date, serviceId);

            expect(mockListEvents).toHaveBeenCalledTimes(1);
            // Depending on your logic, this might mean the whole day is available.
            // Adapt the expectation based on your slot generation for an empty calendar.
            expect(availableSlots).toEqual(expect.any(Array)); // Be more specific
        });

        it('should handle errors from Google Calendar API gracefully', async () => {
            const errorMessage = 'Google Calendar API Error';
            mockListEvents.mockRejectedValue(new Error(errorMessage));

            const date = '2024-07-17';
            const serviceId = 'consultation-service';

            // Check how your function handles errors. Does it throw, or return empty/error state?
            // Example if it throws:
            await expect(getAvailableSlots(date, serviceId)).rejects.toThrow(errorMessage);

            // Example if it returns an empty array on error:
            // const availableSlots = await getAvailableSlots(date, serviceId);
            // expect(availableSlots).toEqual([]);
            // console.error should ideally be spied on if your app logs the error
        });
    });

    describe('checkUserAvailability', () => {
        it('should return true if no events conflict with the given time slot', async () => {
            mockListEvents.mockResolvedValue({ data: { items: [] } }); // No events in the slot

            const startTime = '2024-07-15T09:00:00Z';
            const endTime = '2024-07-15T10:00:00Z';

            const isAvailable = await checkUserAvailability(startTime, endTime);

            expect(mockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
            expect(mockListEvents).toHaveBeenCalledWith({
                calendarId: MOCK_CALENDAR_ID,
                timeMin: startTime,
                timeMax: endTime,
                singleEvents: true,
                maxResults: 1, // Typically, you check if at least one event exists
            });
            expect(isAvailable).toBe(true);
        });

        it('should return false if an event conflicts with the given time slot', async () => {
            const mockConflictingEventResponse = {
                data: {
                    items: [{ summary: 'Existing Meeting', start: { dateTime: '2024-07-15T09:30:00Z' }, end: { dateTime: '2024-07-15T10:30:00Z' } }],
                },
            };
            mockListEvents.mockResolvedValue(mockConflictingEventResponse);

            const startTime = '2024-07-15T09:00:00Z'; // Slot we are checking
            const endTime = '2024-07-15T10:00:00Z';   // Slot we are checking

            const isAvailable = await checkUserAvailability(startTime, endTime);

            expect(mockGetGoogleCalendarClient).toHaveBeenCalledTimes(1);
            expect(mockListEvents).toHaveBeenCalledWith({
                calendarId: MOCK_CALENDAR_ID,
                timeMin: startTime,
                timeMax: endTime,
                singleEvents: true,
                maxResults: 1,
            });
            expect(isAvailable).toBe(false);
        });

        it('should handle errors from Google Calendar API gracefully for checkUserAvailability', async () => {
            const errorMessage = 'API Error during availability check';
            mockListEvents.mockRejectedValue(new Error(errorMessage));

            const startTime = '2024-07-15T11:00:00Z';
            const endTime = '2024-07-15T12:00:00Z';

            // Adapt based on your error handling strategy (e.g., throws, or returns a default availability)
            // Example if it throws:
            await expect(checkUserAvailability(startTime, endTime)).rejects.toThrow(errorMessage);

            // Example if it returns false (or a safe default) on error:
            // const isAvailable = await checkUserAvailability(startTime, endTime);
            // expect(isAvailable).toBe(false); // Or true, depending on desired "safe" behavior
        });
    });
});