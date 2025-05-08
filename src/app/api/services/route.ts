// src/app/api/services/route.ts
import { NextResponse } from 'next/server';
import { dbPool } from '@/lib/db'; // Import our database pool

export async function GET(request: Request) {
    const logPrefix = '[GET /api/services]';
    console.log(`${logPrefix} Public request received.`);

    try {
        // Query only active services for the public booking page
        const result = await dbPool.query(
            `SELECT service_id, name, duration_minutes, price, description
             FROM services
             WHERE is_active = TRUE
             ORDER BY name` // Optional: Order consistently
        );

        console.log(`${logPrefix} Found ${result.rowCount} active services.`);
        return NextResponse.json(result.rows);

    } catch (err: any) { // Type error as any
        console.error(`${logPrefix} Error fetching active services:`, err.stack);
        return NextResponse.json(
            { error: "Failed to retrieve available services." },
            { status: 500 }
        );
    }

    // Note: No specific authentication check needed here as it's a public route.
    // Database connection errors are implicitly handled by the pool setup or caught here.
}

// You could add POST, PUT, DELETE here later if needed for public service interactions,
// but typically service management is done via the protected /api/admin/services routes.