// src/app/api/admin/services/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import { auth } from '@/lib/auth'; // Auth helper

// GET all services (Admin/Manager)
export async function GET(request: NextRequest) {
    const logPrefix = '[GET /api/admin/services]';
    const session = await auth();
    if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`${logPrefix} Request by ${session.user.email} (Role: ${session.user.role})`);

    try {
        // Fetch all services, including inactive ones for the admin view
        const result = await dbPool.query(
            `SELECT service_id, name, duration_minutes, price, description, is_active
             FROM services ORDER BY name`
        );
        return NextResponse.json(result.rows);
    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
        return NextResponse.json({ error: "Failed to retrieve services" }, { status: 500 });
    }
}

// POST a new service (Admin/Manager)
export async function POST(request: NextRequest) {
    const logPrefix = '[POST /api/admin/services]';
    const session = await auth();
     if (!session?.user || !['admin', 'manager'].includes(session.user.role ?? '')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log(`${logPrefix} Request by ${session.user.email} (Role: ${session.user.role})`);

    try {
        const body = await request.json();
        const { name, duration_minutes, price, description, is_active = true } = body;

        // Validation
        if (!name || duration_minutes == null) {
            return NextResponse.json({ error: 'Missing required fields: name and duration_minutes.' }, { status: 400 });
        }
        const durationNum = parseInt(duration_minutes);
        if (isNaN(durationNum) || durationNum <= 0) {
            return NextResponse.json({ error: 'duration_minutes must be a positive number.' }, { status: 400 });
        }
        const priceNum = (price !== null && price !== undefined && price !== '') ? parseFloat(price) : null;
        if (price !== null && price !== undefined && price !== '' && (isNaN(priceNum!) || priceNum! < 0)) {
            return NextResponse.json({ error: 'Price must be a non-negative number if provided.' }, { status: 400 });
        }
        if (typeof is_active !== 'boolean') {
            return NextResponse.json({ error: 'is_active must be true or false.' }, { status: 400 });
        }

        // Database Insertion
        const result = await dbPool.query(
            `INSERT INTO services (name, duration_minutes, price, description, is_active)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, durationNum, priceNum, description || null, is_active]
        );

        console.log(`${logPrefix} Service added successfully:`, result.rows[0]);
        return NextResponse.json(result.rows[0], { status: 201 }); // 201 Created

    } catch (err: any) {
        console.error(`${logPrefix} Error:`, err.stack);
         // Handle potential unique constraint errors if name needs to be unique
        return NextResponse.json({ error: "Failed to add service" }, { status: 500 });
    }
}