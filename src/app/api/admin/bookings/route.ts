// src/app/api/admin/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import moment from 'moment-timezone';

// GET all bookings (Admin/Manager) with Pagination & Search
export async function GET(request: NextRequest) {
    const logPrefix = '[GET /api/admin/bookings]';
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const searchTerm = searchParams.get('search') || '';

    console.log(`${logPrefix} Params: Limit=${limit}, Offset=${offset}, Search='${searchTerm}'`);

    try {
        // Base query parts
        const selectData = `
            SELECT
                b.booking_id, b.client_name, b.client_email, b.client_phone,
                b.booking_start_time, b.booking_end_time, b.status, b.notes,
                b.created_at, b.updated_at, b.google_event_id, b.booking_timezone,
                s.service_id, s.name AS service_name,
                st.staff_id, st.name AS staff_name,
                c.customer_id -- Include customer_id
        `;
        const baseFrom = `
            FROM bookings b
            LEFT JOIN services s ON b.service_id = s.service_id
            LEFT JOIN staff st ON b.staff_id = st.staff_id
            LEFT JOIN customers c ON b.customer_id = c.customer_id -- Join customers table
        `;
        let whereClause = '';
        const queryParams: (string | number)[] = []; // Explicit type
        let paramIndex = 1;

        // Add WHERE clause if searchTerm exists
        if (searchTerm) {
            const searchTermLike = `%${searchTerm}%`;
            whereClause = `
                WHERE (
                    b.client_name ILIKE $${paramIndex} OR
                    b.client_email ILIKE $${paramIndex} OR
                    b.client_phone ILIKE $${paramIndex} OR
                    s.name ILIKE $${paramIndex} OR
                    st.name ILIKE $${paramIndex} OR
                    b.status ILIKE $${paramIndex} OR
                    CAST(b.booking_id AS TEXT) ILIKE $${paramIndex}
                    -- Add search on customer table fields if needed
                    -- OR c.name ILIKE $${paramIndex}
                    -- OR c.email ILIKE $${paramIndex}
                )
            `;
            queryParams.push(searchTermLike);
            paramIndex++;
        }

        // Construct Count Query
        const countQuery = `SELECT COUNT(*) ${baseFrom} ${whereClause}`;
        const countQueryParams = [...queryParams];

        // Construct Data Query
        const dataQuery = `
            ${selectData}
            ${baseFrom}
            ${whereClause}
            ORDER BY b.booking_start_time DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const dataQueryParams = [...queryParams, limit, offset];

        console.log(`${logPrefix} Count Query: ${countQuery} Params: ${countQueryParams}`);
        console.log(`${logPrefix} Data Query: ${dataQuery} Params: ${dataQueryParams}`);

        // Execute Queries
        const [countResult, dataResult] = await Promise.all([
            dbPool.query(countQuery, countQueryParams),
            dbPool.query(dataQuery, dataQueryParams)
        ]);

        const totalCount = parseInt(countResult.rows[0].count, 10);
        console.log(`${logPrefix} Total matching: ${totalCount}, Fetched: ${dataResult.rowCount}`);

        // Format results
        const bookings = dataResult.rows.map(booking => ({
            ...booking,
            // Ensure timestamps are ISO strings (UTC)
            booking_start_time: booking.booking_start_time ? moment.utc(booking.booking_start_time).toISOString() : null,
            booking_end_time: booking.booking_end_time ? moment.utc(booking.booking_end_time).toISOString() : null,
            created_at: booking.created_at ? moment.utc(booking.created_at).toISOString() : null,
            updated_at: booking.updated_at ? moment.utc(booking.updated_at).toISOString() : null,
            service_name: booking.service_name || 'N/A',
            staff_name: booking.staff_name || 'N/A',
        }));

        // Send response with headers for pagination
        const headers = new Headers();
        headers.set('X-Total-Count', String(totalCount));
        headers.set('Access-Control-Expose-Headers', 'X-Total-Count'); // Important for frontend access

        return NextResponse.json(bookings, { headers });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve bookings" }, { status: 500 });
    }
}