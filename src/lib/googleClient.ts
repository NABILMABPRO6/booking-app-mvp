// src/lib/googleClient.ts
import { google } from 'googleapis';
import { dbPool } from '@/lib/db'; // Use alias for DB pool import
import { decrypt } from '@/lib/utils/cryptoUtils'; // Use alias for crypto import
import type { OAuth2Client } from 'google-auth-library'; // Import specific type

// Define return type structure for clarity
interface GoogleClientInstance {
    authClient: OAuth2Client;
    calendar: ReturnType<typeof google.calendar>; // Get the type of the calendar API interface
}

/**
 * Creates an authenticated Google Calendar API client for a specific staff member.
 * Fetches and decrypts the refresh token from the database.
 * Handles token refresh and potential invalid grant errors.
 * @param {number} staffId The ID of the staff member.
 * @returns {Promise<GoogleClientInstance | null>} An object containing the authClient and calendar interface, or null if authentication fails.
 */
export async function getGoogleCalendarClient(staffId: number): Promise<GoogleClientInstance | null> {
    const logPrefix = `[getGoogleCalendarClient Staff ${staffId}]`;
    console.log(`${logPrefix} Attempting to get Google client...`);

    try {
        // 1. Fetch encrypted refresh token from DB using the pool
        // Reminder: Uses DB_USER, DB_PASSWORD etc from .env.local
        const tokenResult = await dbPool.query<{ google_refresh_token: string | null }>(
            'SELECT google_refresh_token FROM staff WHERE staff_id = $1',
            [staffId]
        );

        if (tokenResult.rowCount === 0 || !tokenResult.rows[0].google_refresh_token) {
            console.warn(`${logPrefix} No Google refresh token found.`);
            return null; // No token stored or staff not found
        }

        // 2. Decrypt the token
        // Reminder: Uses TOKEN_ENCRYPTION_KEY from .env.local
        const encryptedToken = tokenResult.rows[0].google_refresh_token;
        const refreshToken = decrypt(encryptedToken);

        if (!refreshToken) {
            console.error(`${logPrefix} Failed to decrypt token.`);
            // Consider clearing the potentially corrupted token from DB?
            // await dbPool.query('UPDATE staff SET google_refresh_token = NULL WHERE staff_id = $1', [staffId]);
            return null; // Decryption failed
        }
        // console.log(`${logPrefix} Refresh token decrypted successfully.`); // Avoid logging token itself

        // 3. Create OAuth2 client instance
        // Reminder: Uses GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI from .env.local
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.GOOGLE_REDIRECT_URI; // This should point to your Next.js API callback

        if (!clientId || !clientSecret || !redirectUri) {
            console.error(`${logPrefix} Missing Google OAuth environment variables.`);
            return null;
        }

        const authClient: OAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        // 4. Set refresh token credential
        authClient.setCredentials({
            refresh_token: refreshToken
        });

        // 5. Attempt to refresh the access token (validates the refresh token)
        try {
            console.log(`${logPrefix} Attempting to refresh access token...`);
            const tokenResponse = await authClient.getAccessToken();
            if (!tokenResponse.token) {
                throw new Error("Failed to obtain access token using refresh token.");
            }
            // console.log(`${logPrefix} Access token obtained/refreshed.`); // Success log
        } catch (refreshError: any) {
            console.error(`${logPrefix} Failed to refresh access token:`, refreshError.response?.data || refreshError.message);
            if (refreshError.response?.data?.error === 'invalid_grant') {
                console.warn(`${logPrefix} Invalid grant detected. Clearing token/GCal ID.`);
                try {
                    await dbPool.query('UPDATE staff SET google_refresh_token = NULL, google_calendar_id = NULL WHERE staff_id = $1', [staffId]);
                } catch (dbError) {
                    console.error(`${logPrefix} Failed to clear invalid token in DB:`, dbError);
                }
            }
            return null; // Return null as we couldn't get a valid client
        }

        // 6. Create the Calendar API service object
        const calendar = google.calendar({ version: 'v3', auth: authClient });

        // 7. Return the authenticated client and calendar interface
        console.log(`${logPrefix} Successfully created Google client instance.`);
        return { authClient, calendar };

    } catch (error: any) {
        console.error(`${logPrefix} Unexpected error:`, error.stack);
        return null; // Return null on any other unexpected error
    }
}