// src/lib/services/availabilityService.ts
import moment from 'moment-timezone';
import { Pool } from 'pg'; // Import Pool type
import type { PoolClient } from 'pg'; // Import PoolClient type for transactions
import { getGoogleCalendarClient } from '@/lib/googleClient';
import { timeToMinutes, formatTime } from '@/lib/utils/timeUtils'; // Ensure path is correct

const logPrefixBase = '[AvailabilityService]';

// --- TYPES ---
export interface StaffDetails {
    name: string;
    google_calendar_id: string | null;
    is_google_connected: boolean;
    is_active: boolean;
}

export interface WorkingInterval {
    start: string; // HH:MM
    end: string; // HH:MM
}

export interface BusyBlock {
    start: moment.Moment; // UTC Moment object
    end: moment.Moment; // UTC Moment object
}

export interface AvailabilityResult {
    isAvailable: boolean;
    reasons: string[];
}

// --- HELPER FUNCTIONS (Adapted for TypeScript & Pool/Client flexibility) ---

/** Fetches essential staff details including GCal connection status. */
export async function getStaffDetails(staffId: number, dbClient: Pool | PoolClient, lock: boolean = false): Promise<StaffDetails | null> {
    const logPrefix = `${logPrefixBase}[getStaffDetails Staff ${staffId}]:`;
    try {
        const query = `
            SELECT name, google_calendar_id,
                   google_refresh_token IS NOT NULL AS is_google_connected,
                   is_active
            FROM staff WHERE staff_id = $1
            ${lock ? 'FOR UPDATE' : ''}
        `;
        const staffRes = await dbClient.query(query, [staffId]);

        if (staffRes.rowCount === 0) {
            console.log(`${logPrefix} Staff member not found.`);
            return null;
        }
        // Type assertion might be needed depending on pg types, or define row type
        const details = staffRes.rows[0] as StaffDetails;
        console.log(`${logPrefix} Found staff: ${details.name}, Active: ${details.is_active}, GCal Connected: ${details.is_google_connected}`);
        return details;
    } catch (error: any) {
        console.error(`${logPrefix} Error fetching staff details:`, error.message);
        return null;
    }
}

/** Fetches the working interval (start/end times) for a staff member on a specific day. */
 export async function getWorkingInterval(staffId: number, dayOfWeek: number, dbClient: Pool | PoolClient): Promise<WorkingInterval | null> {
    const logPrefix = `${logPrefixBase}[getWorkingInterval Staff ${staffId} Day ${dayOfWeek}]:`;
    try {
        const result = await dbClient.query(
            `SELECT to_char(start_time, 'HH24:MI') as start_time,
                    to_char(end_time, 'HH24:MI') as end_time
             FROM staff_working_hours
             WHERE staff_id = $1 AND day_of_week = $2`,
            [staffId, dayOfWeek]
        );

        if (result.rowCount === 0) {
            console.log(`${logPrefix} No working hours found.`);
            return null;
        }
         // Type assertion or define row type
         const interval = result.rows[0] as WorkingInterval;
         // Basic validation
        if (!interval.start_time || !interval.end_time) return null;
         const intervalResult = { start: interval.start_time, end: interval.end_time };
         console.log(`${logPrefix} Found working interval: ${intervalResult.start}-${intervalResult.end}`);
         return intervalResult;
    } catch (error: any) {
        console.error(`${logPrefix} Error fetching working hours:`, error.message);
        return null;
    }
}


/** Fetches confirmed database booking intervals that overlap with the given UTC time range. */
export async function getDbBusyBlocks(staffId: number, startTimeUTC: string, endTimeUTC: string, dbClient: Pool | PoolClient, bookingIdToExclude: number | null = null): Promise<BusyBlock[]> {
     const logPrefix = `${logPrefixBase}[getDbBusyBlocks Staff ${staffId}]:`;
     try {
        let dbConflictQuery = `
            SELECT booking_start_time, booking_end_time
            FROM bookings
            WHERE staff_id = $1
              AND status = 'confirmed'
              AND tstzrange($2::timestamptz, $3::timestamptz, '[)') && tstzrange(booking_start_time, booking_end_time, '[)')
        `;
        const dbConflictParams: (number | string | null)[] = [staffId, startTimeUTC, endTimeUTC]; // Define param type explicitly

        if (bookingIdToExclude !== null) {
            dbConflictQuery += ` AND booking_id != $4`;
            dbConflictParams.push(bookingIdToExclude);
        }

        const result = await dbClient.query(dbConflictQuery, dbConflictParams);
        const busyBlocks = result.rows.map(row => ({
             // Ensure row properties exist before accessing
             start: moment.utc(row.booking_start_time),
             end: moment.utc(row.booking_end_time)
         }));

        console.log(`${logPrefix} Found ${busyBlocks.length} conflicting DB blocks within range ${startTimeUTC} - ${endTimeUTC}` + (bookingIdToExclude ? ` (excluding booking ${bookingIdToExclude})` : ''));
        return busyBlocks;
    } catch (error: any) {
        console.error(`${logPrefix} Error fetching DB busy blocks:`, error.message);
        return [];
    }
}


/** Fetches busy intervals from Google Calendar. */
export async function getGcalBusyBlocks(staffId: number, startTimeUTC: string, endTimeUTC: string, staffDetails: StaffDetails | null): Promise<BusyBlock[] | null> {
     const logPrefix = `${logPrefixBase}[getGcalBusyBlocks Staff ${staffId}]:`;

     if (!staffDetails || !staffDetails.is_google_connected) {
         console.log(`${logPrefix} Staff not connected to Google Calendar. Skipping GCal check.`);
         return []; // Not an error, just not connected
     }

     console.log(`${logPrefix} Attempting GCal free/busy query...`);
     // Pass staffId to getGoogleCalendarClient. Assumes it uses pool internally.
     const googleClient = await getGoogleCalendarClient(staffId);

     if (!googleClient) {
         console.warn(`${logPrefix} Could not get Google Client. Assuming busy as a fail-safe.`);
         return null; // Null indicates failure to check
     }

     try {
         const calendarId = staffDetails.google_calendar_id || 'primary';
         console.log(`${logPrefix} Querying GCal free/busy for calendar ID: ${calendarId}`);
         const freeBusyResponse = await googleClient.calendar.freebusy.query({
             requestBody: {
                 timeMin: startTimeUTC,
                 timeMax: endTimeUTC,
                 items: [{ id: calendarId }],
                 timeZone: 'UTC'
             }
         });

         const busyTimes = freeBusyResponse.data.calendars?.[calendarId]?.busy || [];
         const busyBlocks = busyTimes.map(busy => ({
             start: moment.utc(busy.start),
             end: moment.utc(busy.end)
         }));

         console.log(`${logPrefix} Found ${busyBlocks.length} busy blocks in Google Calendar.`);
         return busyBlocks;
     } catch (gcalError: any) {
         console.error(`${logPrefix} Error querying GCal free/busy:`, gcalError.response?.data || gcalError.message);
         return null; // Return null on GCal API error
     }
}


// --- Availability Check Function (Used by Booking POST route) ---
// (Keep the existing checkAvailability function here, adapted for TS and PoolClient if needed)
export async function checkAvailability(options: {
    staffId: number;
    newBookingStartTimeUTC: string;
    newBookingEndTimeUTC: string;
    bookingTimezone: string; // Business timezone for context
    dbClient: PoolClient; // Expecting a transaction client
    staffDetails?: StaffDetails | null; // Allow passing details
    bookingIdToExclude?: number | null;
}): Promise<AvailabilityResult> {
    // ... paste the full implementation of checkAvailability from Step 12's API route,
    // ensuring it uses the helper functions defined above (getStaffDetails, etc.)
    // and accepts PoolClient for dbClient.
    // Remember to import `StaffDetails` type if needed inside.
    const {
        staffId,
        newBookingStartTimeUTC,
        newBookingEndTimeUTC,
        bookingTimezone,
        dbClient,
        staffDetails: providedStaffDetails = null,
        bookingIdToExclude = null,
    } = options;

    const logPrefix = `${logPrefixBase}[CheckAvailability Staff ${staffId}]:`;
    const reasons: string[] = [];

    // Basic checks...
    const businessTimezone = process.env.BUSINESS_TIMEZONE; // Check BUSINESS_TIMEZONE exists
     if (!businessTimezone || !moment.tz.zone(businessTimezone)) {
        console.error(`${logPrefix} CRITICAL ERROR: BUSINESS_TIMEZONE is not set or invalid.`);
        return { isAvailable: false, reasons: ['Server configuration error [Timezone].'] };
    }
    // ... other basic validations ...
    const newStartTime = moment.utc(newBookingStartTimeUTC);
    const newEndTime = moment.utc(newBookingEndTimeUTC);
    // ...

     try {
        // Use transaction client (dbClient) passed in options
        const staffDetails = providedStaffDetails || await getStaffDetails(staffId, dbClient);
        if (!staffDetails || !staffDetails.is_active) { /* ... return unavailable ... */
             return { isAvailable: false, reasons: ['Staff member not found or inactive.'] };
        }

        const newStartTimeLocal = newStartTime.clone().tz(bookingTimezone);
        const localDayOfWeek = newStartTimeLocal.isoWeekday();
        const localDayStart = newStartTimeLocal.clone().startOf('day');

         const workingInterval = await getWorkingInterval(staffId, localDayOfWeek, dbClient);
         if (!workingInterval) { /* ... return unavailable ... */
             return { isAvailable: false, reasons: ['Staff member does not work on the selected day.'] };
         } else {
             // Compare times in minutes
            const workStartMins = timeToMinutes(workingInterval.start);
            const workEndMins = timeToMinutes(workingInterval.end);
            const bookingStartMins = newStartTimeLocal.diff(localDayStart, 'minutes');
            const bookingEndMins = newEndTimeLocal.diff(localDayStart, 'minutes');

            if (bookingStartMins < workStartMins || bookingEndMins > workEndMins) {
                 reasons.push(`Time slot falls outside staff working hours (${workingInterval.start} - ${workingInterval.end} ${bookingTimezone}).`);
            }
         }
         if (reasons.length > 0) return { isAvailable: false, reasons };

         const dbBusyBlocks = await getDbBusyBlocks(staffId, newBookingStartTimeUTC, newBookingEndTimeUTC, dbClient, bookingIdToExclude);
         const dbConflict = dbBusyBlocks.some(block => block.start.isBefore(newEndTime) && block.end.isAfter(newStartTime));
        if (dbConflict) reasons.push("Conflicts with another booking in the schedule.");
        if (reasons.length > 0) return { isAvailable: false, reasons };


         const gcalBusyBlocks = await getGcalBusyBlocks(staffId, newBookingStartTimeUTC, newBookingEndTimeUTC, staffDetails); // Pass fetched details
         if (gcalBusyBlocks === null) {
            reasons.push("Could not verify Google Calendar availability.");
         } else {
             const gcalConflict = gcalBusyBlocks.some(block => block.start.isBefore(newEndTime) && block.end.isAfter(newStartTime));
             if (gcalConflict) reasons.push("Conflicts with an event in the staff's Google Calendar.");
         }

         const isAvailable = reasons.length === 0;
         console.log(`${logPrefix} Final Availability Result: ${isAvailable}. Reasons: ${reasons.join(', ') || 'None'}`);
         return { isAvailable, reasons };

     } catch (error: any) {
         console.error(`${logPrefix} Unexpected error during availability check:`, error.stack);
         return { isAvailable: false, reasons: ['An internal error occurred while checking availability.'] };
     }
}


// --- Slot Calculation Helpers (Also moved here) ---

/** Calculates free intervals based on working hours and busy blocks (in minutes). */
export function calculateFreeIntervals(workingIntervals: {start: number, end: number}[], busyBlocks: {start: number, end: number}[]): {start: number, end: number}[] {
     let freeIntervals = [...workingIntervals];
     busyBlocks.sort((a, b) => a.start - b.start);

     for (const busy of busyBlocks) {
         if (busy.end <= busy.start) continue;
         const nextFreeIntervals = [];
         for (const free of freeIntervals) {
             if (free.end <= free.start) continue;
             const overlapStart = Math.max(free.start, busy.start);
             const overlapEnd = Math.min(free.end, busy.end);

             if (overlapStart < overlapEnd) {
                 if (free.start < busy.start) { nextFreeIntervals.push({ start: free.start, end: busy.start }); }
                 if (free.end > busy.end) { nextFreeIntervals.push({ start: busy.end, end: free.end }); }
             } else {
                 nextFreeIntervals.push(free);
             }
         }
         freeIntervals = nextFreeIntervals;
     }
     return freeIntervals;
}

/** Generates slot start times (in minutes) from free intervals. */
export function generateSlots(freeIntervals: {start: number, end: number}[], serviceDurationMinutes: number, slotStepMinutes: number = 15): number[] {
     const slots: number[] = [];
     const step = Math.max(slotStepMinutes, 1); // Ensure positive step

     for (const interval of freeIntervals) {
         if (interval.end <= interval.start || (interval.end - interval.start) < serviceDurationMinutes) continue;
         let currentSlotStart = interval.start;
         while (currentSlotStart + serviceDurationMinutes <= interval.end) {
             slots.push(currentSlotStart);
             currentSlotStart += step;
         }
     }
     return slots;
}