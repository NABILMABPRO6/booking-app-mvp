// src/app/api/admin/bookings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import moment from 'moment-timezone';

interface RouteContext { params: { id: string } }

// GET a single booking (Admin/Manager)
export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/admin/bookings/${params.id}]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const bookingId = parseInt(params.id, 10);
    if (isNaN(bookingId)) return NextResponse.json({ error: 'Invalid booking ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        // Include customer details in the fetch
        const result = await dbPool.query(
             `SELECT b.*, s.name AS service_name, st.name AS staff_name, c.customer_id, c.name as customer_name
              FROM bookings b
              LEFT JOIN services s ON b.service_id = s.service_id
              LEFT JOIN staff st ON b.staff_id = st.staff_id
              LEFT JOIN customers c ON b.customer_id = c.customer_id
              WHERE b.booking_id = $1`, [bookingId]
         );
        if (result.rowCount === 0) return NextResponse.json({ error: `Booking ${bookingId} not found.` }, { status: 404 });

        const booking = result.rows[0];
        const formattedBooking = {
             ...booking,
             booking_start_time: booking.booking_start_time ? moment.utc(booking.booking_start_time).toISOString() : null,
             booking_end_time: booking.booking_end_time ? moment.utc(booking.booking_end_time).toISOString() : null,
             created_at: booking.created_at ? moment.utc(booking.created_at).toISOString() : null,
             updated_at: booking.updated_at ? moment.utc(booking.updated_at).toISOString() : null,
             service_name: booking.service_name || 'N/A',
             staff_name: booking.staff_name || 'N/A',
             customer_name: booking.customer_name || booking.client_name || 'N/A' // Fallback if customer link broken/missing
         };
        return NextResponse.json(formattedBooking);
    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve booking" }, { status: 500 });
    }
}

// PUT (Update Status/Notes ONLY) (Admin/Manager)
export async function PUT(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[PUT /api/admin/bookings/${params.id}]`;
    const session = await auth();
     if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const bookingId = parseInt(params.id, 10);
    if (isNaN(bookingId)) return NextResponse.json({ error: 'Invalid booking ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const body = await request.json();
        const { status, notes } = body;

        // Validation for allowed fields/statuses
        const allowedStatuses = ['scheduled', 'confirmed', 'completed', 'no-show']; // Exclude 'cancelled'
        if (status !== undefined && !allowedStatuses.includes(status)) {
            return NextResponse.json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}. Use /cancel endpoint.` }, { status: 400 });
        }
        if (status === undefined && !Object.prototype.hasOwnProperty.call(body, 'notes')) {
            return NextResponse.json({ error: 'No update fields provided (allowed: status, notes).' }, { status: 400 });
        }

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(status); }
        if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
            updates.push(`notes = $${paramIndex++}`); values.push(notes ?? null); // Allow setting notes to null
        }

        if (updates.length === 0) return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 }); // Should be caught above

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(bookingId);
        const queryText = `UPDATE bookings SET ${updates.join(', ')} WHERE booking_id = $${paramIndex} RETURNING booking_id`;

        const result = await dbPool.query(queryText, values);
        if (result.rowCount === 0) return NextResponse.json({ error: `Booking ${bookingId} not found.` }, { status: 404 });

        console.log(`${logPrefix} Booking status/notes updated.`);
        // Fetch and return the full updated booking (could reuse GET logic)
        const updatedBookingResponse = await GET(request, { params }); // Reuse GET to fetch full updated data
        return updatedBookingResponse;

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
    }
}

// Optional: Add DELETE handler here for hard delete (Admin only) if needed