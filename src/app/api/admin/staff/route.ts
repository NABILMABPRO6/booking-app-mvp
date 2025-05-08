// src/app/api/admin/staff/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import { hashPassword } from '@/lib/utils/passwordUtils';

// GET all staff (Admin/Manager)
export async function GET(request: NextRequest) {
    const logPrefix = '[GET /api/admin/staff]';
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        // Fetch staff, include GCal connection status
        const result = await dbPool.query(
            `SELECT staff_id, name, email, phone_number, role, is_active, google_calendar_id,
                    google_refresh_token IS NOT NULL as is_google_connected
             FROM staff ORDER BY name`
        );
        return NextResponse.json(result.rows);
    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve staff" }, { status: 500 });
    }
}

// POST a new staff member (Admin ONLY)
export async function POST(request: NextRequest) {
    const logPrefix = '[POST /api/admin/staff]';
    const session = await auth();
    // Only Admins can create staff
    if (session?.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Only Admins can add staff.' }, { status: 403 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const body = await request.json();
        const { name, email, phone_number, role = 'staff', password, google_calendar_id, is_active = true } = body;

        // Validation
        if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
        const validRoles = ['admin', 'manager', 'staff'];
        if (!validRoles.includes(role)) return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }, { status: 400 });
        if (['admin', 'manager'].includes(role) && !password) {
            return NextResponse.json({ error: `Password is required for role '${role}'.` }, { status: 400 });
        }
        if (password && password.length < 8) {
             return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
        }

        let hashedPassword = null;
        if (password) {
            hashedPassword = await hashPassword(password);
        }

        // Database Insertion
        const result = await dbPool.query(
            `INSERT INTO staff (name, email, phone_number, role, password_hash, google_calendar_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, email || null, phone_number || null, role, hashedPassword, google_calendar_id || null, is_active]
        );

        // Exclude sensitive fields from response
        const { password_hash, google_refresh_token, ...staffData } = result.rows[0];
        // Add calculated connection status
        (staffData as any).is_google_connected = false; // New user won't have token yet

        console.log(`${logPrefix} Staff added successfully:`, staffData.staff_id);
        return NextResponse.json(staffData, { status: 201 });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        if (err.code === '23505') { // Unique violation (likely email)
            return NextResponse.json({ error: `Email '${err.detail?.match(/\((.*?)\)/)?.[1]}' already exists.` }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to add staff member" }, { status: 500 });
    }
}