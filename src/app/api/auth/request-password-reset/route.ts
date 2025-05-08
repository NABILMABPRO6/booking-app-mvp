// src/app/api/auth/request-password-reset/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '@/lib/utils/emailService'; // Import our email util

// Consider adding rate limiting middleware if needed later

export async function POST(request: NextRequest) {
    const logPrefix = '[POST /api/auth/request-password-reset]';
    try {
        const { email } = await request.json();

        if (!email || typeof email !== 'string' || !/\S+@\S+\.\S+/.test(email)) {
            return NextResponse.json({ error: 'Valid email address is required.' }, { status: 400 });
        }

        console.log(`${logPrefix} Request received for email: ${email}`);

        // Find active admin or manager by email
        const userResult = await dbPool.query(
            `SELECT staff_id, name FROM staff
             WHERE lower(email) = lower($1)
               AND role IN ('admin', 'manager')
               AND is_active = TRUE`,
            [email]
        );

        // IMPORTANT: Always return a generic success message for security.
        // Perform actions only if user is found.
        if (userResult.rowCount > 0) {
            const user = userResult.rows[0];
            console.log(`${logPrefix} Found eligible user: ID ${user.staff_id}`);

            // Generate raw token
            const resetToken = crypto.randomBytes(32).toString('hex');

            // Hash the token using HMAC-SHA256
            const secret = process.env.RESET_TOKEN_SECRET;
            if (!secret) {
                console.error(`${logPrefix} FATAL: RESET_TOKEN_SECRET is not defined.`);
                // Log critical error, but still return generic success to user
            } else {
                const hashedToken = crypto
                    .createHmac('sha256', secret)
                    .update(resetToken)
                    .digest('hex');

                // Set expiry time (1 hour)
                const expiryDate = new Date(Date.now() + 3600000);

                // Store HMAC hash and expiry in DB
                try {
                    await dbPool.query(
                        `UPDATE staff SET password_reset_token = $1, password_reset_expires = $2, updated_at = CURRENT_TIMESTAMP
                         WHERE staff_id = $3`,
                        [hashedToken, expiryDate, user.staff_id]
                    );
                    console.log(`${logPrefix} Stored HMAC reset token hash for user ${user.staff_id}.`);

                    // Send email with the *original* (unhashed) token
                    // Reminder: This uses BREVO_API_KEY and EMAIL_FROM from .env.local
                    const emailSent = await sendPasswordResetEmail(email, resetToken);
                    if (!emailSent) {
                        console.error(`${logPrefix} CRITICAL: Failed to send reset email to ${email} for user ${user.staff_id}.`);
                        // Internal monitoring/alerting recommended here
                    } else {
                        console.log(`${logPrefix} Reset email initiated for ${email}.`);
                    }
                } catch (dbError) {
                     console.error(`${logPrefix} Error updating staff record for password reset token:`, dbError);
                     // Log error, but still return generic success
                }
            }
        } else {
            console.log(`${logPrefix} No active admin/manager found for ${email}. Not sending email.`);
        }

        // Always return generic success message
        return NextResponse.json({
            message: 'If an account with that email exists and is permitted, a password reset link has been sent.'
        }, { status: 200 });

    } catch (error: any) {
        console.error(`${logPrefix} Unexpected error:`, error);
        // Return generic message on internal errors too
        return NextResponse.json({
            message: 'If an account with that email exists and is permitted, a password reset link has been sent.'
        }, { status: 200 }); // Still return 200 for security
    }
}