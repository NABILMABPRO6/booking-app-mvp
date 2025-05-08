// src/app/api/admin/bookings/[id]/reschedule/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import moment from 'moment-timezone';
import { getGoogleCalendarClient } from '@/lib/googleClient';
import { checkAvailability, getStaffDetails } from '@/lib/services/availabilityService'; // Import availability service

interface RouteContext { params: { id: string } }

// PUT (Reschedule) a booking (Admin/Manager)
export async function PUT(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[PUT /api/admin/bookings/${params.id}/reschedule]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const bookingId = parseInt(params.id, 10);
    if (isNaN(bookingId)) return NextResponse.json({ error: 'Invalid booking ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    let client; // DB transaction client
    let originalBookingDetails: any = null; // Store original details

    try {
        const { newDate, newTime, notes: rescheduleNotes } = await request.json();

        // Validation
        if (!newDate || !newTime || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
            return NextResponse.json({ error: 'Missing or invalid newDate (YYYY-MM-DD) or newTime (HH:MM).' }, { status: 400 });
        }
        const businessTimezone = process.env.BUSINESS_TIMEZONE;
        if (!businessTimezone || !moment.tz.zone(businessTimezone)) {
            throw new Error("Server configuration error [Timezone].");
        }

        // --- Transaction ---
        client = await dbPool.connect();
        await client.query('BEGIN');
        console.log(`${logPrefix} Transaction started.`);

        // Fetch Original Booking & Lock
        const bookingResult = await client.query(
            `SELECT b.*, s.name AS service_name, s.duration_minutes, st.name AS staff_name,
                    st.google_calendar_id, st.google_refresh_token IS NOT NULL as is_google_connected
             FROM bookings b
             JOIN services s ON b.service_id = s.service_id
             JOIN staff st ON st.staff_id = b.staff_id
             WHERE b.booking_id = $1 FOR UPDATE`, [bookingId]
        );
        if (bookingResult.rowCount === 0) throw new Error(`Booking ${bookingId} not found.`);
        originalBookingDetails = bookingResult.rows[0];
        console.log(`${logPrefix} Locked original booking ${bookingId}.`);

        // Check Status
        if (['cancelled', 'completed', 'no-show'].includes(originalBookingDetails.status)) {
            throw new Error(`Cannot reschedule booking in status: ${originalBookingDetails.status}.`);
        }

        // Calculate New Times (UTC)
        const serviceDuration = originalBookingDetails.duration_minutes;
        const newStartTimeLocal = moment.tz(`${newDate} ${newTime}`, 'YYYY-MM-DD HH:mm', businessTimezone);
        if (!newStartTimeLocal.isValid()) throw new Error('Invalid new date/time.');
        if (newStartTimeLocal.isBefore(moment.tz(businessTimezone))) throw new Error('Cannot reschedule to a time in the past.');
        const newEndTimeLocal = newStartTimeLocal.clone().add(serviceDuration, 'minutes');
        const newBookingStartTimeUTC = newStartTimeLocal.clone().utc().toISOString();
        const newBookingEndTimeUTC = newEndTimeLocal.clone().utc().toISOString();
        console.log(`${logPrefix} New proposed slot UTC: ${newBookingStartTimeUTC} - ${newBookingEndTimeUTC}`);

        // Check Availability
        const staffId = originalBookingDetails.staff_id;
        const availabilityResult = await checkAvailability({
            staffId, newBookingStartTimeUTC, newBookingEndTimeUTC,
            bookingTimezone: businessTimezone, // Use business TZ context for check
            dbClient: client, // Use transaction client
             staffDetails: { // Pass necessary details
                 name: originalBookingDetails.staff_name,
                 google_calendar_id: originalBookingDetails.google_calendar_id,
                 is_google_connected: originalBookingDetails.is_google_connected,
                 is_active: true // Assume active if has non-terminal booking
             },
            bookingIdToExclude: bookingId
        });

        if (!availabilityResult.isAvailable) {
            console.log(`${logPrefix} Slot not available: ${availabilityResult.reasons.join(' ')}`);
            throw new Error(`Slot not available. ${availabilityResult.reasons.join(' ')}`); // Throw specific error
        }
        console.log(`${logPrefix} Slot available. Updating DB...`);

        // Update Booking in DB
        const rescheduleTimestamp = moment.utc().toISOString();
        const combinedNotes = `[Rescheduled by ${session.user.email} on ${rescheduleTimestamp}]${rescheduleNotes ? ` ${rescheduleNotes}` : ''}`;
        const updateResult = await client.query(
            `UPDATE bookings SET booking_start_time = $1, booking_end_time = $2, notes = COALESCE(notes, '') || E'\n---\n' || $3,
                 updated_at = CURRENT_TIMESTAMP, status = 'confirmed'
             WHERE booking_id = $4 RETURNING google_event_id`,
            [newBookingStartTimeUTC, newBookingEndTimeUTC, combinedNotes, bookingId]
        );
        if (updateResult.rowCount === 0) throw new Error(`DB update failed for booking ${bookingId}.`);
        const updatedGCalEventId = updateResult.rows[0].google_event_id;
        console.log(`${logPrefix} DB updated.`);

        // Update Google Calendar Event (Best Effort)
        let gcalUpdateSuccess = false;
        if (updatedGCalEventId && originalBookingDetails.is_google_connected) {
             console.log(`${logPrefix} Attempting GCal event update: ${updatedGCalEventId}`);
             // ... (GCal update logic - same as in original Express route) ...
              const googleClientForUpdate = await getGoogleCalendarClient(staffId);
              if (googleClientForUpdate) {
                 try {
                     const calendarId = originalBookingDetails.google_calendar_id || 'primary';
                     const eventPatch = {
                         start: { dateTime: newBookingStartTimeUTC, timeZone: 'UTC' },
                         end: { dateTime: newBookingEndTimeUTC, timeZone: 'UTC' },
                         summary: `${originalBookingDetails.service_name} with ${originalBookingDetails.client_name} (Rescheduled)`,
                     };
                     await googleClientForUpdate.calendar.events.patch({ calendarId, eventId: updatedGCalEventId, resource: eventPatch, sendUpdates: 'none' });
                     gcalUpdateSuccess = true;
                     console.log(`${logPrefix} GCal event updated.`);
                 } catch (gcalPatchError: any) {
                     console.error(`${logPrefix} GCal update error:`, gcalPatchError.response?.data || gcalPatchError.message);
                     if (gcalPatchError.code === 404 || gcalPatchError.response?.status === 404) { gcalUpdateSuccess = true; } // Treat 404 as "success"
                     else { gcalUpdateSuccess = false; }
                 }
             } else { console.warn(`${logPrefix} Could not get GCal client for update.`); }
        } else { console.log(`${logPrefix} Skipping GCal update.`); }

        // Commit
        await client.query('COMMIT');
        console.log(`${logPrefix} Transaction committed.`);
        client.release(); client = undefined; // Prevent release in finally

        // Respond
        let message = `Booking ${bookingId} rescheduled successfully.`;
        if (updatedGCalEventId && !gcalUpdateSuccess) { message += ' Warning: Failed to update Google Calendar event.'; }
        else if (updatedGCalEventId && gcalUpdateSuccess) { message += ' Google Calendar event updated.'; }

         // Fetch and return full updated booking details
         const finalBookingResponse = await fetch(`${request.nextUrl.origin}/api/admin/bookings/${bookingId}`, {
             headers: { 'Cookie': request.headers.get('cookie') || '' } // Pass cookie for auth in internal fetch
         });
         const finalBooking = await finalBookingResponse.json();
         if (!finalBookingResponse.ok) {
              console.warn(`${logPrefix} Failed to fetch final booking details after reschedule.`);
              return NextResponse.json({ message }); // Return just the message if refetch fails
         }

        return NextResponse.json({ message, booking: finalBooking });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        if (client) { try { await client.query('ROLLBACK'); console.log(`${logPrefix} Transaction rolled back.`); } catch (rbErr) { console.error("Rollback failed:", rbErr); } }
        const status = (err.message.includes('Cannot reschedule') || err.message.includes('Slot not available')) ? 409
                     : (err.message.includes('not found') || err.message.includes('Invalid')) ? 400
                     : 500;
        const errorMessage = err.message.includes('Slot not available') ? err.message : // Include reason if available
                             err.message || "Failed to reschedule booking.";
        return NextResponse.json({ error: errorMessage, details: err.message.includes('Slot not available') ? err.message : undefined }, { status });
    } finally {
        if (client) client.release(); // Release if error occurred before commit/release
    }
}