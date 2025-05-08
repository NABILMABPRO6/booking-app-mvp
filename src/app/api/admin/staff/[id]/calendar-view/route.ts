// src/app/api/admin/staff/[id]/calendar-view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import moment from 'moment-timezone';
import { getStaffDetails, getDbBusyBlocks, getGcalBusyBlocks } from '@/lib/services/availabilityService'; // Import helpers
// Assuming getGoogleCalendarClient is adapted if needed, or GCal helper uses pool

interface RouteContext { params: { id: string } } // Staff ID

export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/admin/staff/${params.id}/calendar-view]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // Expect YYYY-MM-DD
    if (!date) return NextResponse.json({ error: 'Missing required query parameter: date.' }, { status: 400 });

    console.log(`${logPrefix} Request by ${session.user.email} for date ${date}`);

    // Determine UTC date range based on business timezone
    const businessTimezone = process.env.BUSINESS_TIMEZONE || 'UTC';
    const dayStartLocal = moment.tz(date, 'YYYY-MM-DD', businessTimezone).startOf('day');
    if (!dayStartLocal.isValid()) return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    const dayEndLocal = dayStartLocal.clone().endOf('day');
    const timeMinUTC = dayStartLocal.clone().utc().toISOString();
    const timeMaxUTC = dayEndLocal.clone().utc().toISOString();
    console.log(`${logPrefix} Querying UTC range: ${timeMinUTC} to ${timeMaxUTC}`);

    try {
        // 1. Fetch DB Bookings
        const dbBookingsResult = await dbPool.query(
            `SELECT b.booking_id, b.client_name, b.booking_start_time, b.booking_end_time, b.status, s.name AS service_name
             FROM bookings b
             JOIN services s ON b.service_id = s.service_id
             WHERE b.staff_id = $1
               AND b.status NOT IN ('cancelled', 'no-show')
               AND tstzrange(b.booking_start_time, b.booking_end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
             ORDER BY b.booking_start_time`,
            [staffId, timeMinUTC, timeMaxUTC]
        );
        const dbEvents = dbBookingsResult.rows.map(row => ({
            id: `db-${row.booking_id}`,
            title: `${row.client_name} - ${row.service_name}`,
            start: moment.utc(row.booking_start_time).toISOString(),
            end: moment.utc(row.booking_end_time).toISOString(),
            status: row.status,
            source: 'database'
        }));
        console.log(`${logPrefix} Found ${dbEvents.length} DB events.`);

        // 2. Fetch Google Calendar Events (if connected)
        let googleEvents: any[] = [];
        const staffDetails = await getStaffDetails(staffId, dbPool); // Use pool
        if (staffDetails?.is_google_connected) {
            console.log(`${logPrefix} Staff connected, querying GCal...`);
            // Use getGcalBusyBlocks logic or directly call googleapis here
            // Simplified adaptation using getGcalBusyBlocks for consistency:
            const gcalBusyBlocks = await getGcalBusyBlocks(staffId, timeMinUTC, timeMaxUTC, staffDetails);
            if (gcalBusyBlocks === null) {
                console.warn(`${logPrefix} GCal check failed.`);
                // Optionally add an 'error' event to the calendar view
            } else {
                // Note: getGcalBusyBlocks returns start/end moments. We need the original event details ideally.
                // For a proper view, you might need to call google.calendar.events.list here directly like in the original code.
                // Let's simulate based on busy blocks for now, but this is LESS informative.
                 googleEvents = gcalBusyBlocks.map((block, index) => ({
                     id: `gcal-busy-${index}`,
                     title: 'Google Calendar Event', // Less specific title
                     start: block.start.toISOString(),
                     end: block.end.toISOString(),
                     source: 'google'
                 }));
                 console.log(`${logPrefix} Found ${googleEvents.length} GCal busy blocks (simplified).`);
                 // **TODO**: Replace above with actual google.calendar.events.list call for richer GCal data if needed.
            }
        } else {
            console.log(`${logPrefix} Staff not connected to GCal.`);
        }

        // 3. Combine and Sort
        const combinedEvents = [...dbEvents, ...googleEvents];
        combinedEvents.sort((a, b) => moment(a.start).diff(moment(b.start)));

        return NextResponse.json(combinedEvents);

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to fetch calendar view data" }, { status: 500 });
    }
}