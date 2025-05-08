// src/app/api/admin/bookings/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import moment from 'moment-timezone';
import { getGoogleCalendarClient } from '@/lib/googleClient'; // Import google client helper

interface RouteContext { params: { id: string } }

// PUT (Cancel) a booking (Admin/Manager)
export async function PUT(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[PUT /api/admin/bookings/${params.id}/cancel]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const bookingId = parseInt(params.id, 10);
    if (isNaN(bookingId)) return NextResponse.json({ error: 'Invalid booking ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    const body = await request.json().catch(() => ({})); // Allow empty body
    const cancelNote = body?.note || `Cancelled by Admin/Manager (${session.user.email})`;

    let client; // DB transaction client
    let gcalDeletionAttempted = false;
    let gcalDeletionSuccess = false;

    try {
        client = await dbPool.connect();
        await client.query('BEGIN');
        console.log(`${logPrefix} Transaction started.`);

        // Lock and Fetch Booking
        const bookingResult = await client.query(
            `SELECT booking_id, status, google_event_id, staff_id FROM bookings WHERE booking_id = $1 FOR UPDATE`, [bookingId]
        );
        if (bookingResult.rowCount === 0) throw new Error(`Booking ${bookingId} not found.`);
        const booking = bookingResult.rows[0];

        // Check if Already Cancelled/Completed
        if (['cancelled', 'completed', 'no-show'].includes(booking.status)) {
            throw new Error(`Booking already in terminal status: ${booking.status}.`); // Use specific error message
        }

        // Update DB
        const cancellationTimestamp = moment.utc().toISOString();
        const formattedCancelNote = `[Cancellation: ${cancellationTimestamp}] ${cancelNote}`;
        const updateResult = await client.query(
            `UPDATE bookings SET status = 'cancelled', notes = COALESCE(notes || E'\n---\n', '') || $2, updated_at = CURRENT_TIMESTAMP
             WHERE booking_id = $1 RETURNING google_event_id, staff_id`,
            [bookingId, formattedCancelNote]
        );
        if (updateResult.rowCount === 0) throw new Error(`Failed to update booking ${bookingId} status.`);
        console.log(`${logPrefix} DB status updated to cancelled.`);
        const { google_event_id, staff_id } = updateResult.rows[0];

        // Attempt GCal Deletion
        if (google_event_id && staff_id) {
            gcalDeletionAttempted = true;
            console.log(`${logPrefix} Attempting GCal delete for event ${google_event_id}`);
            try {
                 const googleClient = await getGoogleCalendarClient(staff_id); // Assumes uses pool
                 if (googleClient) {
                     const staffGCalIdRes = await client.query('SELECT google_calendar_id FROM staff WHERE staff_id = $1', [staff_id]);
                     const calendarId = staffGCalIdRes.rows[0]?.google_calendar_id || 'primary';
                     await googleClient.calendar.events.delete({ calendarId, eventId: google_event_id, sendUpdates: 'none' });
                     gcalDeletionSuccess = true;
                     console.log(`${logPrefix} GCal event ${google_event_id} deleted.`);
                 } else { console.warn(`${logPrefix} Could not get GCal client.`); }
            } catch (gcalError: any) {
                 console.error(`${logPrefix} GCal delete error:`, gcalError.response?.data || gcalError.message);
                 if (gcalError.code === 404 || gcalError.response?.status === 404) { gcalDeletionSuccess = true; console.log(`${logPrefix} GCal event not found (404).`); }
                 else { gcalDeletionSuccess = false; }
            }
        } else { console.log(`${logPrefix} Skipping GCal delete (no event ID or staff ID).`); }

        // Commit
        await client.query('COMMIT');
        console.log(`${logPrefix} Transaction committed.`);
        client.release(); // Release after commit
        client = undefined; // Prevent release in finally

        // Respond
        let message = `Booking ${bookingId} cancelled successfully.`;
        if (gcalDeletionAttempted && !gcalDeletionSuccess) { message += ' Warning: Failed to delete Google Calendar event.'; }
        else if (gcalDeletionAttempted && gcalDeletionSuccess) { message += ' Associated Google Calendar event deleted.'; }

        // Fetch final booking details (optional, or let frontend refetch)
        // const finalBookingResponse = await fetch(`/api/admin/bookings/${bookingId}`, { headers: request.headers }); // Needs auth headers passed
        // const finalBooking = await finalBookingResponse.json();

        return NextResponse.json({ message: message /*, booking: finalBooking */ });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        if (client) { try { await client.query('ROLLBACK'); console.log(`${logPrefix} Transaction rolled back.`); } catch (rbErr) { console.error("Rollback failed:", rbErr); } }
        const status = (err.message.includes('terminal status')) ? 409 : (err.message.includes('not found')) ? 404 : 500;
        return NextResponse.json({ error: err.message || "Failed to cancel booking." }, { status });
    } finally {
        if (client) client.release(); // Release if error occurred before commit/release
    }
}