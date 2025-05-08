// src/app/api/admin/staff/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';
import { hashPassword } from '@/lib/utils/passwordUtils';

interface RouteContext { params: { id: string } }

// GET a single staff member (Admin/Manager)
export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/admin/staff/${params.id}]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const result = await dbPool.query(
            `SELECT staff_id, name, email, phone_number, role, is_active, google_calendar_id,
                    google_refresh_token IS NOT NULL as is_google_connected
             FROM staff WHERE staff_id = $1`, [staffId]
        );
        if (result.rowCount === 0) {
            return NextResponse.json({ error: `Staff ${staffId} not found.` }, { status: 404 });
        }
         // Exclude sensitive fields (though token is not selected here, password hash is)
         const { password_hash, google_refresh_token, ...staffData } = result.rows[0];
        return NextResponse.json(staffData);
    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve staff member" }, { status: 500 });
    }
}

// PUT (Update) staff member (Admin ONLY)
export async function PUT(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[PUT /api/admin/staff/${params.id}]`;
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Only Admins can update staff.' }, { status: 403 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const body = await request.json();
        const { name, email, phone_number, role, password, google_calendar_id, is_active } = body;

        // Validation (similar to POST, adapted for update)
        const validRoles = ['admin', 'manager', 'staff'];
        if (role !== undefined && !validRoles.includes(role)) return NextResponse.json({ error: `Invalid role.` }, { status: 400 });
        if (is_active !== undefined && typeof is_active !== 'boolean') return NextResponse.json({ error: 'is_active must be boolean.' }, { status: 400 });
        if (password && password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        // Build query dynamically
        if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
        if (email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(email || null); }
        if (phone_number !== undefined) { updates.push(`phone_number = $${paramIndex++}`); values.push(phone_number || null); }
        if (role !== undefined) { updates.push(`role = $${paramIndex++}`); values.push(role); }
        if (password) {
            console.log(`${logPrefix} Updating password for staff ${staffId}`);
            const hashedPassword = await hashPassword(password);
            updates.push(`password_hash = $${paramIndex++}`); values.push(hashedPassword);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'google_calendar_id')) {
             updates.push(`google_calendar_id = $${paramIndex++}`); values.push(google_calendar_id || null);
        }
        if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(is_active); }

        if (updates.length === 0) return NextResponse.json({ error: 'No update fields provided.' }, { status: 400 });

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(staffId);
        const queryText = `UPDATE staff SET ${updates.join(', ')} WHERE staff_id = $${paramIndex} RETURNING *`;

        const result = await dbPool.query(queryText, values);
        if (result.rowCount === 0) return NextResponse.json({ error: `Staff ${staffId} not found.` }, { status: 404 });

        // Return updated data, excluding sensitive fields
        const { password_hash: _, google_refresh_token: __, ...staffData } = result.rows[0];
        (staffData as any).is_google_connected = result.rows[0].google_refresh_token !== null;

        console.log(`${logPrefix} Staff updated successfully.`);
        return NextResponse.json(staffData);

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
         if (err.code === '23505') { // Unique violation (likely email)
             return NextResponse.json({ error: `Email '${err.detail?.match(/\((.*?)\)/)?.[1]}' might already be in use.` }, { status: 409 });
         }
        return NextResponse.json({ error: "Failed to update staff member" }, { status: 500 });
    }
}

// DELETE (Set Inactive) staff member (Admin ONLY)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[DELETE /api/admin/staff/${params.id}]`;
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden: Only Admins can deactivate staff.' }, { status: 403 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });

    // Prevent self-deactivation
    if (session.user.id === String(staffId)) { // Compare session user ID (string) with target staffId (number)
        return NextResponse.json({ error: "Administrators cannot deactivate their own account." }, { status: 403 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
         // Set inactive, clear sensitive fields
         const result = await dbPool.query(
             `UPDATE staff
              SET is_active = FALSE, password_hash = NULL, google_refresh_token = NULL,
                  google_calendar_id = NULL, password_reset_token = NULL, password_reset_expires = NULL,
                  updated_at = CURRENT_TIMESTAMP
              WHERE staff_id = $1
              RETURNING staff_id, name, is_active`,
             [staffId]
         );
        if (result.rowCount === 0) return NextResponse.json({ error: `Staff ${staffId} not found.` }, { status: 404 });

        console.log(`${logPrefix} Staff ${staffId} set inactive.`);
        return NextResponse.json({ message: `Staff member ${result.rows[0].name} (ID: ${staffId}) set to inactive.` });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to deactivate staff member" }, { status: 500 });
    }
}