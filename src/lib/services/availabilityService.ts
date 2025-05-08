// src/lib/services/availabilityService.ts
import moment from 'moment-timezone';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { getGoogleCalendarClient } from '@/lib/googleClient'; // Assuming path is correct
import { timeToMinutes, formatTime } from '@/lib/utils/timeUtils'; // Assuming path is correct

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
    end: string;   // HH:MM
}

export interface BusyBlock {
    start: moment.Moment; // UTC Moment object
    end: moment.Moment;   // UTC Moment object
}

export interface AvailabilityResult {
    isAvailable: boolean;
    reasons: string[];
}

// --- HELPER FUNCTIONS (Refactored for direct query) ---

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
        // Directly use query on the passed client/pool object
        const staffRes = await dbClient.query(query, [staffId]); // <--- CORRECTED: Use dbClient.query directly

        if (staffRes.rowCount === 0) {
            console.log(`${logPrefix} Staff member not found.`);
            return null;
        }
        const details = staffRes.rows[0] as StaffDetails; // Assuming DB columns match StaffDetails
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
        // Directly use query on the passed client/pool object
        const result = await dbClient.query( // <--- CORRECTED: Use dbClient.query directly
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
        const interval = result.rows[0];
        // Validate that the properties exist and are strings before returning
        if (typeof interval.start_time !== 'string' || typeof interval.end_time !== 'string') {
             console.error(`${logPrefix} Invalid data format received for working hours.`);
             return null;
        }
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
        const dbConflictParams: (number | string | null)[] = [staffId, startTimeUTC, endTimeUTC];

        if (bookingIdToExclude !== null) {
            dbConflictQuery += ` AND booking_id != $4`;
            dbConflictParams.push(bookingIdToExclude);
        }

        // Directly use query on the passed client/pool object
        const result = await dbClient.query(dbConflictQuery, dbConflictParams); // <--- CORRECTED: Use dbClient.query directly
        const busyBlocks = result.rows.map(row => ({
             start: moment.utc(row.booking_start_time),
             end: moment.utc(row.booking_end_time)
         }));

        console.log(`${logPrefix} Found ${busyBlocks.length} conflicting DB blocks...`);
        return busyBlocks;
    } catch (error: any) {
        console.error(`${logPrefix} Error fetching DB busy blocks:`, error.message);
        return [];
    }
}

// getGcalBusyBlocks doesn't interact with dbClient directly, so it remains unchanged
export async function getGcalBusyBlocks(/* ... */): Promise<BusyBlock[] | null> {
    // ... implementation remains the same ...
     const logPrefix = `${logPrefixBase}[getGcalBusyBlocks Staff ${staffId}]:`;
    if (!staffDetails?.is_google_connected) { return []; }
    const googleClient = await getGoogleCalendarClient(staffId); // Assumes this uses pool internally
    if (!googleClient) { return null; }
    try {
        const calendarId = staffDetails.google_calendar_id || 'primary';
        const freeBusyResponse = await googleClient.calendar.freebusy.query({ /* ... */ });
        const busyTimes = freeBusyResponse.data.calendars?.[calendarId]?.busy || [];
        return busyTimes.map(busy => ({ start: moment.utc(busy.start), end: moment.utc(busy.end) }));
    } catch (gcalError: any) {
        console.error(`${logPrefix} Error querying GCal free/busy:`, gcalError.message);
        return null;
    }
}


// --- Primary Availability Check Function (Using helpers correctly) ---
export async function checkAvailability(options: {
    staffId: number;
    newBookingStartTimeUTC: string;
    newBookingEndTimeUTC: string;
    bookingTimezone: string; // Business timezone for context
    dbClient: PoolClient; // Expecting a transaction client
    staffDetails?: StaffDetails | null; // Optional pre-fetched details
    bookingIdToExclude?: number | null;
}): Promise<AvailabilityResult> {
    const {
        staffId, newBookingStartTimeUTC, newBookingEndTimeUTC, bookingTimezone,
        dbClient, // Use the passed PoolClient
        staffDetails: providedStaffDetails = null,
        bookingIdToExclude = null,
    } = options;

    const logPrefix = `${logPrefixBase}[CheckAvailability Staff ${staffId}]:`;
    const reasons: string[] = [];

    // Basic input validation, timezone validation, time calculation...
    const newStartTime = moment.utc(newBookingStartTimeUTC);
    const newEndTime = moment.utc(newBookingEndTimeUTC);
    const newStartTimeLocal = newStartTime.clone().tz(bookingTimezone);
    const localDayOfWeek = newStartTimeLocal.isoWeekday();
    const localDayStart = newStartTimeLocal.clone().startOf('day');
    // ...

     try {
        // Uses the passed PoolClient (dbClient) for internal checks via helpers
        const staffDetails = providedStaffDetails || await getStaffDetails(staffId, dbClient); // <--- Pass dbClient
        if (!staffDetails || !staffDetails.is_active) {
             return { isAvailable: false, reasons: ['Staff member not found or inactive.'] };
        }

         const workingInterval = await getWorkingInterval(staffId, localDayOfWeek, dbClient); // <--- Pass dbClient
         if (!workingInterval) {
             reasons.push("Staff member does not work on the selected day.");
         } else {
             // Check if booking falls within working hours...
             const workStartMins = timeToMinutes(workingInterval.start);
             const workEndMins = timeToMinutes(workingInterval.end);
             const bookingStartMins = newStartTimeLocal.diff(localDayStart, 'minutes');
             const bookingEndMins = newEndTimeLocal.diff(localDayStart, 'minutes');
             if (bookingStartMins < workStartMins || bookingEndMins > workEndMins) {
                 reasons.push(`Time slot falls outside staff working hours (${workingInterval.start} - ${workingInterval.end} ${bookingTimezone}).`);
             }
         }
         if (reasons.length > 0) return { isAvailable: false, reasons };

         const dbBusyBlocks = await getDbBusyBlocks(staffId, newBookingStartTimeUTC, newBookingEndTimeUTC, dbClient, bookingIdToExclude); // <--- Pass dbClient
         const dbConflict = dbBusyBlocks.some(block => block.start.isBefore(newEndTime) && block.end.isAfter(newStartTime));
         if (dbConflict) reasons.push("Conflicts with another booking in the schedule.");
         if (reasons.length > 0) return { isAvailable: false, reasons };

         // getGcalBusyBlocks only needs staffDetails, not dbClient directly
         const gcalBusyBlocks = await getGcalBusyBlocks(staffId, newBookingStartTimeUTC, newBookingEndTimeUTC, staffDetails);
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

// --- Slot Calculation Helpers (Keep existing calculateFreeIntervals & generateSlots) ---
export function calculateFreeIntervals(workingIntervals: {start: number, end: number}[], busyBlocks: {start: number, end: number}[]): {start: number, end: number}[] {
    // ... implementation unchanged ...
     let freeIntervals = [...workingIntervals];
     busyBlocks.sort((a, b) => a.start - b.start);
     for (const busy of busyBlocks) { /* ... logic ... */ }
     return freeIntervals;
}
export function generateSlots(freeIntervals: {start: number, end: number}[], serviceDurationMinutes: number, slotStepMinutes: number = 15): number[] {
    // ... implementation unchanged ...
    const slots: number[] = []; const step = Math.max(slotStepMinutes, 1);
    for (const interval of freeIntervals) { /* ... logic ... */ }
    return slots;
}

// Ensure StaffDetails type is exported if not defined elsewhere
// export type { StaffDetails };