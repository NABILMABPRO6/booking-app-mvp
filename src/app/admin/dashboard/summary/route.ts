// src/app/api/admin/dashboard/summary/route.ts
import { NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import moment from 'moment-timezone';
import { auth } from '@/lib/auth'; // Import the auth helper

export async function GET(request: Request) {
    const logPrefix = '[GET /api/admin/dashboard/summary]';

    // --- Authentication Check ---
    const session = await auth(); // Get session server-side
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        console.warn(`${logPrefix} Unauthorized access attempt.`);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`${logPrefix} Request received by user: ${session.user.email} (Role: ${session.user.role})`);

    // --- Fetch Data ---
    const businessTimezone = process.env.BUSINESS_TIMEZONE || 'UTC';

    try {
        // Define Date Ranges based on Business Timezone
        const now = moment.tz(businessTimezone);
        const todayStartUTC = now.clone().startOf('day').utc().toISOString();
        const todayEndUTC = now.clone().endOf('day').utc().toISOString();
        const next7DaysEndUTC = now.clone().add(7, 'days').endOf('day').utc().toISOString();
        const nowUTC = moment.utc().toISOString(); // Current time in UTC

        console.log(`${logPrefix} Today Range UTC [${todayStartUTC} - ${todayEndUTC}]`);
        console.log(`${logPrefix} Upcoming Range UTC [${todayStartUTC} - ${next7DaysEndUTC}]`);
        console.log(`${logPrefix} Now UTC [${nowUTC}]`);

        // Queries (using dbPool directly)
        const todayBookingsQuery = dbPool.query(
            `SELECT COUNT(*) FROM bookings WHERE status IN ('confirmed', 'scheduled') AND booking_start_time >= $1 AND booking_start_time < $2`,
            [todayStartUTC, todayEndUTC]
        );
        const upcomingBookingsQuery = dbPool.query(
            `SELECT COUNT(*) FROM bookings WHERE status IN ('confirmed', 'scheduled') AND booking_start_time >= $1 AND booking_start_time < $2`,
            [nowUTC, next7DaysEndUTC] // From now up to 7 days
        );
        const activeStaffQuery = dbPool.query(
            `SELECT COUNT(*) FROM staff WHERE is_active = TRUE`
        );
        const activeServicesQuery = dbPool.query(
            `SELECT COUNT(*) FROM services WHERE is_active = TRUE`
        );
        const staffNeedingGCalQuery = dbPool.query(
            `SELECT staff_id, name FROM staff WHERE is_active = TRUE AND google_refresh_token IS NULL ORDER BY name`
        );
        const todaysAppointmentsQuery = dbPool.query(
             `SELECT b.booking_id, b.booking_start_time, b.client_name, s.name as service_name, st.name as staff_name
              FROM bookings b
              JOIN services s ON b.service_id = s.service_id
              JOIN staff st ON b.staff_id = st.staff_id
              WHERE b.status IN ('confirmed', 'scheduled')
                AND b.booking_start_time >= $1 -- Start from now (UTC)
                AND b.booking_start_time < $2  -- Until end of today (UTC)
              ORDER BY b.booking_start_time ASC
              LIMIT 5`,
              [nowUTC, todayEndUTC]
        );

        // Execute Queries Concurrently
        const [
            todayResult, upcomingResult, activeStaffResult, activeServicesResult,
            staffNeedingGCalResult, todaysAppointmentsResult
        ] = await Promise.all([
            todayBookingsQuery, upcomingBookingsQuery, activeStaffQuery, activeServicesQuery,
            staffNeedingGCalQuery, todaysAppointmentsResult
        ]);

        // Format Results
        const summaryData = {
            counts: {
                todayBookings: parseInt(todayResult.rows[0].count, 10),
                upcomingBookings: parseInt(upcomingResult.rows[0].count, 10),
                activeStaff: parseInt(activeStaffResult.rows[0].count, 10),
                activeServices: parseInt(activeServicesResult.rows[0].count, 10),
            },
            staffNeedingGCal: staffNeedingGCalResult.rows,
            todaysAppointments: todaysAppointmentsResult.rows.map(appt => ({
                ...appt,
                time: moment.utc(appt.booking_start_time).tz(businessTimezone).format('HH:mm A'), // Format time for display
            })),
        };

        console.log(`${logPrefix} Successfully fetched summary data.`);
        return NextResponse.json(summaryData);

    } catch (err: any) {
        console.error(`${logPrefix} Error fetching dashboard summary:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve dashboard summary data." }, { status: 500 });
    }
}