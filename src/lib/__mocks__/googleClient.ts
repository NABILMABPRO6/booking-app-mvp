// src/lib/__mocks__/googleClient.ts

// Mock the entire module. We export a mock function for getGoogleCalendarClient.
export const getGoogleCalendarClient = jest.fn().mockResolvedValue({
    // Mock the structure returned by the real getGoogleCalendarClient
    authClient: {
        // Add mock methods/properties for authClient if your code uses them directly
        getAccessToken: jest.fn().mockResolvedValue({ token: 'mock-access-token' }),
    },
    calendar: {
        // Mock the calendar API methods used by availabilityService
        freebusy: {
            query: jest.fn().mockResolvedValue({ // Default success response
                data: {
                    kind: "calendar#freeBusy",
                    timeMin: new Date().toISOString(),
                    timeMax: new Date().toISOString(),
                    calendars: {
                        'primary': { // Default calendar ID
                            busy: [], // Default to no busy blocks
                        },
                    },
                },
            }),
        },
        // Add mocks for events.insert, events.patch, events.delete if testing booking creation/mgmt later
        events: {
             insert: jest.fn().mockResolvedValue({ data: { id: 'mock-gcal-event-id' } }),
             patch: jest.fn().mockResolvedValue({ data: { id: 'mock-gcal-event-id' } }),
             delete: jest.fn().mockResolvedValue({}), // Delete often returns empty response
         }
    },
});

// You can export other mocks from this file if needed