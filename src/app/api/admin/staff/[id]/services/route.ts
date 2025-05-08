// src/app/api/admin/staff/[id]/services/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteContext { params: { id: string } } // Staff ID

// GET services assigned to a staff member (Admin/Manager)
export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/admin/staff/${params.id}/services]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const result = await dbPool.query(
            `SELECT s.service_id, s.name, s.duration_minutes, s.price, s.description
             FROM services s JOIN staff_services ss ON s.service_id = ss.service_id
             WHERE ss.staff_id = $1 AND s.is_active = TRUE ORDER BY s.name`,
            [staffId]
        );
        return NextResponse.json(result.rows);
    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve assigned services" }, { status: 500 });
    }
}

// POST assign a service to staff (Admin/Manager)
export async function POST(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[POST /api/admin/staff/${params.id}/services]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const { serviceId } = await request.json();
        if (!serviceId || isNaN(parseInt(serviceId))) {
            return NextResponse.json({ error: 'Missing or invalid serviceId in request body.' }, { status: 400 });
        }
        const parsedServiceId = parseInt(serviceId);

        // Check if staff and service exist and are active (optional but good practice)
        const staffCheck = await dbPool.query('SELECT 1 FROM staff WHERE staff_id = $1 AND is_active = TRUE', [staffId]);
        const serviceCheck = await dbPool.query('SELECT 1 FROM services WHERE service_id = $1 AND is_active = TRUE', [parsedServiceId]);
        if (staffCheck.rowCount === 0) return NextResponse.json({ error: `Active staff ${staffId} not found.` }, { status: 404 });
        if (serviceCheck.rowCount === 0) return NextResponse.json({ error: `Active service ${parsedServiceId} not found.` }, { status: 404 });

        // Insert assignment, ignore if already exists
        await dbPool.query(
            'INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2) ON CONFLICT (staff_id, service_id) DO NOTHING',
            [staffId, parsedServiceId]
        );

        console.log(`${logPrefix} Assigned service ${parsedServiceId} to staff ${staffId}.`);
        // Return 201 or 200 - 200 might be better since ON CONFLICT does nothing if exists
        return NextResponse.json({ message: `Service ${parsedServiceId} assigned to staff ${staffId}.` }, { status: 200 });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        if (err.code === '23503') { // Foreign key violation (less likely with checks above)
             return NextResponse.json({ error: `Staff or Service not found (FK violation).` }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to assign service" }, { status: 500 });
    }
}