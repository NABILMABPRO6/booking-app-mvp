// src/app/api/auth/reset-password/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import crypto from 'crypto';
import { hashPassword } from '@/lib/utils/passwordUtils'; // Import password hashing utility

// The POST function receives the request and context (including params)
export async function POST(
    request: NextRequest,
    { params }: { params: { token: string } } // Destructure token from context params
) {
    const logPrefix = '[POST /api/auth/reset-password]';
    const { token } = params; // Get the token from the URL path segment
    let client; // Declare client outside try block

    try {
        const { password, confirmPassword } = await request.json();

        // --- Basic Input Validation ---
        if (!token || typeof token !== 'string' || token.length !== 64) { // Check token format
            return NextResponse.json({ error: 'Invalid reset token format.' }, { status: 400 });
        }
        if (!password || !confirmPassword) {
            return NextResponse.json({ error: 'Both new password fields are required.' }, { status: 400 });
        }
        if (password !== confirmPassword) {
            return NextResponse.json({ error: 'New passwords do not match.' }, { status: 400 });
        }
        if (password.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
        }
        // Add more complex password rules here if desired

        // --- Token Verification & Password Update ---

        // Hash the incoming token using HMAC to perform lookup
        const secret = process.env.RESET_TOKEN_SECRET;
        if (!secret) {
            console.error(`${logPrefix} FATAL: RESET_TOKEN_SECRET is not defined.`);
            return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
        }
        const hashedTokenParam = crypto
            .createHmac('sha256', secret)
            .update(token)
            .digest('hex');
        console.log(`${logPrefix} Attempting password reset with token HMAC hash: ${hashedTokenParam.substring(0, 10)}...`);

        // --- Transaction ---
        client = await dbPool.connect();
        await client.query('BEGIN');
        console.log(`${logPrefix} Transaction started.`);

        try {
            // Find user by hashed token, check expiry and role, and lock row
            const userResult = await client.query(
                `SELECT staff_id
                 FROM staff
                 WHERE password_reset_token = $1
                   AND password_reset_expires > NOW()
                   AND role IN ('admin', 'manager')
                 FOR UPDATE`, // Lock the row
                [hashedTokenParam]
            );

            if (userResult.rowCount === 0) {
                console.log(`${logPrefix} Reset failed: Invalid/expired token or lock timeout.`);
                await client.query('ROLLBACK'); // Release lock early
                client.release(); // Release client
                return NextResponse.json({ error: 'Password reset link is invalid, has expired, or already used.' }, { status: 400 });
            }

            const validUser = userResult.rows[0];
            console.log(`${logPrefix} Token matched for user ${validUser.staff_id}. Hashing new password.`);

            // Hash the new password
            const newPasswordHash = await hashPassword(password);

            // Update password and clear reset fields
            const updateResult = await client.query(
                `UPDATE staff
                 SET password_hash = $1,
                     password_reset_token = NULL,
                     password_reset_expires = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE staff_id = $2`,
                [newPasswordHash, validUser.staff_id]
            );

            if (updateResult.rowCount === 0) {
                 // Should not happen with FOR UPDATE lock
                 throw new Error(`Failed to update password for staff_id ${validUser.staff_id}.`);
            }

            await client.query('COMMIT'); // Commit changes
            console.log(`${logPrefix} Password reset successful for user ${validUser.staff_id}. Transaction committed.`);

            // Success response
            return NextResponse.json({ message: 'Password has been reset successfully.' }, { status: 200 });

        } catch (transactionError) {
            console.error(`${logPrefix} Error during reset transaction:`, transactionError);
            await client.query('ROLLBACK');
            throw transactionError; // Re-throw to be caught by outer catch
        }
        // --- End Transaction Try ---

    } catch (error: any) {
        console.error(`${logPrefix} Unexpected error:`, error);
        // Ensure rollback happens if transaction started but failed before commit/rollback
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore rollback error */ }
        }
        return NextResponse.json({ error: 'An internal error occurred while resetting the password.' }, { status: 500 });
    } finally {
        if (client) {
            client.release(); // Release client back to pool
            console.log(`${logPrefix} DB client released.`);
        }
    }
}