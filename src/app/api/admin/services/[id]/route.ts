// src/app/api/admin/services/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth'; // Auth helper

interface RouteContext {
    params: {
        id: string; // The dynamic segment [id]
    };
}

// GET a single service by ID (Admin/Manager)
export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/admin/services/${params.id}]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceId = parseInt(params.id, 10);
    if (isNaN(serviceId)) {
        return NextResponse.json({ error: 'Invalid service ID.' }, { status: 400 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const result = await dbPool.query(
            `SELECT service_id, name, duration_minutes, price, description, is_active
             FROM services WHERE service_id = $1`,
            [serviceId]
        );
        if (result.rowCount === 0) {
            return NextResponse.json({ error: `Service with ID ${serviceId} not found.` }, { status: 404 });
        }
        return NextResponse.json(result.rows[0]);
    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve service" }, { status: 500 });
    }
}

// PUT (Update) a service by ID (Admin/Manager)
export async function PUT(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[PUT /api/admin/services/${params.id}]`;
    const session = await auth();
     if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceId = parseInt(params.id, 10);
    if (isNaN(serviceId)) {
        return NextResponse.json({ error: 'Invalid service ID.' }, { status: 400 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const body = await request.json();
        const { name, duration_minutes, price, description, is_active } = body;

        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        // Dynamically build query based on provided fields
        if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
        if (duration_minutes !== undefined && duration_minutes !== null) {
            const durationNum = parseInt(duration_minutes);
             if (isNaN(durationNum) || durationNum <= 0) return NextResponse.json({ error: 'duration_minutes must be a positive number.' }, { status: 400 });
            updates.push(`duration_minutes = $${paramIndex++}`); values.push(durationNum);
        }
         if (Object.prototype.hasOwnProperty.call(body, 'price')) { // Check if price key exists (even if null)
             const priceNum = (price !== null && price !== undefined && price !== '') ? parseFloat(price) : null;
            if (price !== null && price !== undefined && price !== '' && (isNaN(priceNum!) || priceNum! < 0)) {
                return NextResponse.json({ error: 'Price must be a non-negative number if provided.' }, { status: 400 });
            }
             updates.push(`price = $${paramIndex++}`); values.push(priceNum);
         }
        if (Object.prototype.hasOwnProperty.call(body, 'description')) { // Check if description key exists
            updates.push(`description = $${paramIndex++}`); values.push(description); // Allow null/empty
        }
        if (is_active !== undefined) {
             if (typeof is_active !== 'boolean') return NextResponse.json({ error: 'is_active must be true or false.' }, { status: 400 });
            updates.push(`is_active = $${paramIndex++}`); values.push(is_active);
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No update fields provided.' }, { status: 400 });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`); // Always update timestamp
        values.push(serviceId); // Add ID for WHERE clause
        const queryText = `UPDATE services SET ${updates.join(', ')} WHERE service_id = $${paramIndex} RETURNING *`;

        console.log(`${logPrefix} Executing Query: ${queryText} with Values: ${values}`);
        const result = await dbPool.query(queryText, values);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: `Service with ID ${serviceId} not found.` }, { status: 404 });
        }

        console.log(`${logPrefix} Service updated successfully:`, result.rows[0]);
        return NextResponse.json(result.rows[0]);

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        // Handle potential unique constraint errors if name needs to be unique
        return NextResponse.json({ error: "Failed to update service" }, { status: 500 });
    }
}

// DELETE a service by ID (Admin ONLY)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
     const logPrefix = `[DELETE /api/admin/services/${params.id}]`;
     const session = await auth();
    // Explicit Admin role check
     if (session?.user?.role !== 'admin') {
         return NextResponse.json({ error: 'Forbidden: Only Admins can delete services.' }, { status: 403 });
     }

    const serviceId = parseInt(params.id, 10);
    if (isNaN(serviceId)) {
        return NextResponse.json({ error: 'Invalid service ID.' }, { status: 400 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const result = await dbPool.query('DELETE FROM services WHERE service_id = $1 RETURNING *', [serviceId]);
        if (result.rowCount === 0) {
            return NextResponse.json({ error: `Service with ID ${serviceId} not found.` }, { status: 404 });
        }
        console.log(`${logPrefix} Service deleted successfully:`, result.rows[0]);
        return NextResponse.json({ message: `Service with ID ${serviceId} deleted successfully.` });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        // Check for foreign key violation (service used in bookings)
        if (err.code === '23503') { // PostgreSQL foreign_key_violation code
             console.warn(`${logPrefix} Attempted to delete service ${serviceId} which is still referenced.`);
             return NextResponse.json({ error: `Cannot delete service ${serviceId}. It is referenced by existing bookings or staff assignments.` }, { status: 409 }); // 409 Conflict
        }
        return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
    }
}