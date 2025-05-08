// src/app/api/auth/google/[staffId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { dbPool } from '@/lib/db';

interface RouteContext { params: { staffId: string } }

// DELETE Google connection for a staff member (Admin only)
export async function DELETE(request: NextRequest, { params }: RouteContext) {
     const logPrefix = `[DELETE /api/auth/google/${params.staffId}]`;
     const session = await auth();
     if (session?.user?.role !== 'admin') {
         return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
     }
     const staffId = parseInt(params.staffId, 10);
     if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });

     console.log(`${logPrefix} Request by ${session.user.email}`);

     try {
          // Clear Google fields in DB
          const result = await dbPool.query(
             `UPDATE staff
              SET google_refresh_token = NULL, google_calendar_id = NULL,
                  updated_at = CURRENT_TIMESTAMP
              WHERE staff_id = $1
              RETURNING staff_id`,
             [staffId]
          );
         if (result.rowCount === 0) return NextResponse.json({ error: `Staff ${staffId} not found.` }, { status: 404 });

         console.log(`${logPrefix} Disconnected Google Calendar for staff ID: ${result.rows[0].staff_id}`);
         return NextResponse.json({ message: `Google Calendar disconnected successfully for staff ID ${staffId}.` });
     } catch (err: any) {
         console.error(`${logPrefix} Error:`, err.stack);
         return NextResponse.json({ error: "Failed to disconnect Google Calendar" }, { status: 500 });
     }
}