// src/app/api/admin/staff/[id]/working-hours/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import { timeToMinutes } from '@/lib/utils/timeUtils'; // Import time util

interface RouteContext { params: { id: string } } // Staff ID

// GET working hours (Admin/Manager)
export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/admin/staff/${params.id}/working-hours]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const result = await dbPool.query(
            `SELECT day_of_week, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
             FROM staff_working_hours WHERE staff_id = $1 ORDER BY day_of_week`,
            [staffId]
        );

        // Format response as object keyed by day number (string '1' to '7')
        const hoursByDay: { [key: string]: { start_time: string; end_time: string } | null } = {};
        for (let i = 1; i <= 7; i++) { hoursByDay[String(i)] = null; } // Initialize
        result.rows.forEach(row => {
            hoursByDay[String(row.day_of_week)] = { start_time: row.start_time, end_time: row.end_time };
        });
        console.log(`${logPrefix} Returning hours:`, hoursByDay);
        return NextResponse.json(hoursByDay);

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve working hours" }, { status: 500 });
    }
}

// PUT set/update working hours (Admin/Manager)
export async function PUT(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[PUT /api/admin/staff/${params.id}/working-hours]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    let client;
    try {
        const { workingHours } = await request.json(); // Expect { workingHours: { '1': {start, end} | null, ... } }
        if (typeof workingHours !== 'object' || workingHours === null) {
            return NextResponse.json({ error: 'Invalid request body format.' }, { status: 400 });
        }
        console.log(`${logPrefix} Received payload:`, JSON.stringify(workingHours, null, 2));

        // Validate structure and times
        for (let day = 1; day <= 7; day++) {
            const dayKey = String(day);
            const hours = workingHours[dayKey];
            if (hours === null || hours === undefined) continue; // Allowed
            if (typeof hours !== 'object' || !hours.start_time || !hours.end_time ||
                !/^\d{2}:\d{2}$/.test(hours.start_time) || !/^\d{2}:\d{2}$/.test(hours.end_time)) {
                return NextResponse.json({ error: `Invalid format for day ${day}. Use HH:MM.` }, { status: 400 });
            }
            if (timeToMinutes(hours.end_time) <= timeToMinutes(hours.start_time)) {
                return NextResponse.json({ error: `End time must be after start time for day ${day}.` }, { status: 400 });
            }
        }

        // --- Transaction ---
        client = await dbPool.connect();
        await client.query('BEGIN');
        console.log(`${logPrefix} Transaction started.`);

        // Delete existing hours first
        await client.query('DELETE FROM staff_working_hours WHERE staff_id = $1', [staffId]);
        console.log(`${logPrefix} Deleted existing hours.`);

        // Insert new hours
        const insertPromises = [];
        for (let day = 1; day <= 7; day++) {
            const hours = workingHours[String(day)];
            if (hours?.start_time && hours?.end_time) {
                console.log(`${logPrefix} Inserting Day ${day}: ${hours.start_time}-${hours.end_time}`);
                insertPromises.push(
                    client.query(
                        'INSERT INTO staff_working_hours (staff_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3::TIME, $4::TIME)',
                        [staffId, day, hours.start_time, hours.end_time]
                    )
                );
            }
        }
        await Promise.all(insertPromises);
        console.log(`${logPrefix} Inserted ${insertPromises.length} new hour entries.`);

        await client.query('COMMIT');
        console.log(`${logPrefix} Transaction committed.`);
        client.release(); // Release client after successful commit
        client = undefined; // Prevent release in finally

        // Fetch and return updated hours (using pool after commit)
        const getResponse = await GET(request, { params }); // Reuse GET logic
        return getResponse;

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        if (client) {
            try { await client.query('ROLLBACK'); console.log(`${logPrefix} Transaction rolled back.`); }
            catch (rbErr) { console.error(`${logPrefix} Rollback failed:`, rbErr); }
        }
        // Specific error checks can go here (e.g., '23503' for staff not found)
        return NextResponse.json({ error: "Failed to update working hours" }, { status: 500 });
    } finally {
        if (client) client.release(); // Release if error occurred before commit/release
    }
}