// src/app/api/auth/google/initiate/[staffId]/route.ts
// NOTE: This route might be less necessary if using NextAuth's built-in Google Provider sign-in directly.
// However, if you need to initiate specifically for *linking* an existing staff member...
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth'; // Get session server-side
import { dbPool } from '@/lib/db';
import { OAuthConfig } from 'next-auth/providers'; // Get provider type
import { authConfig } from '@/lib/auth.config'; // Get configured providers

interface RouteContext { params: { staffId: string } }

export async function GET(request: NextRequest, { params }: RouteContext) {
    const logPrefix = `[GET /api/auth/google/initiate/${params.staffId}]`;
    const session = await auth();
    if (session?.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const staffId = parseInt(params.staffId, 10);
    if (isNaN(staffId)) return NextResponse.json({ error: 'Invalid staff ID.' }, { status: 400 });

    console.log(`${logPrefix} Request by ${session.user.email}`);

    try {
         const staffCheck = await dbPool.query('SELECT 1 FROM staff WHERE staff_id = $1', [staffId]);
         if (staffCheck.rowCount === 0) return NextResponse.json({ error: `Staff ${staffId} not found.` }, { status: 404 });

        // Find the Google provider config from authConfig
        const googleProvider = authConfig.providers.find(p => p.id === 'google') as OAuthConfig<any> | undefined;

         if (!googleProvider) {
             throw new Error('Google provider not configured in authConfig.');
         }

         // Construct the authorization URL using provider options
         // We need to manually construct state if needed, or perhaps just redirect
         // to the standard NextAuth signin flow for Google?

         // Option 1: Redirect to standard NextAuth Google sign-in
         // This implicitly links if user is logged in, but might not pass staffId reliably back?
         // const signInUrl = new URL('/api/auth/signin/google', request.url);
         // return NextResponse.redirect(signInUrl);

         // Option 2: Manual URL generation (more complex, less integrated with NextAuth state)
          const authUrlParams = new URLSearchParams({
             client_id: googleProvider.options!.clientId,
             redirect_uri: process.env.GOOGLE_REDIRECT_URI!, // Use the callback defined for NextAuth
             response_type: 'code',
             scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events', // Scopes needed
             access_type: 'offline',
             prompt: 'consent',
             // Pass staffId back in state (ensure callback handles it)
             state: JSON.stringify({ staffId: staffId, customAction: 'linkGCal' }) // Add indicator
         });
         const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authUrlParams.toString()}`;

         console.log(`${logPrefix} Generated manual Google Auth URL: ${authorizationUrl}`);
         return NextResponse.json({ authorizationUrl }); // Return URL for frontend redirect

    } catch (error: any) {
        console.error(`${logPrefix} Error:`, error);
        return NextResponse.json({ error: 'Failed to initiate Google authentication flow.' }, { status: 500 });
    }
}