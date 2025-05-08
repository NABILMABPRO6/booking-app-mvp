// src/app/api/admin/staff/[id]/services/[serviceId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth';

interface RouteContext { params: { id: string, serviceId: string } } // Staff ID and Service ID

// DELETE service assignment (Admin/Manager)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[DELETE /api/admin/staff/${params.id}/services/${params.serviceId}]`;
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const staffId = parseInt(params.id, 10);
    const serviceId = parseInt(params.serviceId, 10);
    if (isNaN(staffId) || isNaN(serviceId)) {
        return NextResponse.json({ error: 'Invalid staff or service ID.' }, { status: 400 });
    }
    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
        const result = await dbPool.query(
            'DELETE FROM staff_services WHERE staff_id = $1 AND service_id = $2 RETURNING *',
            [staffId, serviceId]
        );

        if (result.rowCount === 0) {
            return NextResponse.json({ error: `Assignment between staff ${staffId} and service ${serviceId} not found.` }, { status: 404 });
        }

        console.log(`${logPrefix} Assignment removed.`);
        return NextResponse.json({ message: `Assignment removed successfully.` });

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
    }
}