// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt'; // Helper to get JWT token from request

// Define paths that should be PUBLIC within the admin section (login, password reset)
const publicAdminPaths = [
    '/admin/login',
    '/admin/request-reset',
    '/admin/reset-password', // Matches /admin/reset-password/* due to startsWith check below
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const logPrefix = '[Middleware]';

    // 1. Check if the request is for an admin path
    if (pathname.startsWith('/admin')) {
        console.log(`${logPrefix} Processing request for admin path: ${pathname}`);

        // 2. Check if the path is one of the public admin paths
        const isPublicAdminPath = publicAdminPaths.some(path =>
            pathname === path || (path.endsWith('*') && pathname.startsWith(path.slice(0, -1))) || pathname.startsWith(path + '/') // Handle exact, wildcard, and subpaths like /reset-password/:token
        );

        if (isPublicAdminPath) {
            console.log(`${logPrefix} Path is public admin path, allowing access: ${pathname}`);
            return NextResponse.next(); // Allow access to public admin pages
        }

        // 3. Path requires authentication, check for session token
        console.log(`${logPrefix} Path requires authentication. Checking token...`);

        // Reminder: This uses the JWT_SECRET from your .env.local
        const token = await getToken({
            req: request,
            secret: process.env.JWT_SECRET,
            // Ensure cookie name matches if customized in NextAuth config (usually not needed)
            // cookieName: 'next-auth.session-token',
             secureCookie: process.env.NODE_ENV === 'production', // Use secure cookies in production
             salt: process.env.NODE_ENV === 'production' // Match salt if using one
                ? '__Secure-next-auth.session-token'
                : 'next-auth.session-token', // Default salt calculation based on NODE_ENV
        });

        // 4. If no token (not logged in), redirect to login page
        if (!token) {
            const loginUrl = new URL('/admin/login', request.url);
            // Add callbackUrl so user is redirected back after login
            loginUrl.searchParams.set('callbackUrl', pathname);
            console.log(`${logPrefix} No token found. Redirecting to login: ${loginUrl.toString()}`);
            return NextResponse.redirect(loginUrl);
        }

        // 5. Token exists, check role (optional but good practice)
        // Roles 'admin' and 'manager' are allowed in the protected admin area
         if (!token.role || !['admin', 'manager'].includes(token.role as string)) {
             console.warn(`${logPrefix} Token found, but role (${token.role}) is not authorized for /admin. Redirecting to login.`);
             const loginUrl = new URL('/admin/login', request.url);
             loginUrl.searchParams.set('error', 'AccessDenied'); // Indicate reason
             return NextResponse.redirect(loginUrl);
             // Alternatively, redirect to a dedicated "access denied" page or the homepage:
             // return NextResponse.redirect(new URL('/access-denied', request.url));
             // return NextResponse.redirect(new URL('/', request.url));
         }

        // 6. User is authenticated and has a valid role, allow access
        console.log(`${logPrefix} Token valid and role (${token.role}) authorized. Allowing access to: ${pathname}`);
        return NextResponse.next();
    }

    // If not an admin path, just continue
    return NextResponse.next();
}

// Configure the middleware to run only on specific paths (matcher)
// This improves performance by not running the middleware on every request (e.g., static assets)
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes - Auth handled separately, or within API route logic)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - assets (assuming you have a public/assets folder)
         * But specifically INCLUDE /admin/* paths for checking
         */
        '/((?!api|_next/static|_next/image|favicon.ico|assets).*)', // General non-API/static matcher
        '/admin/:path*', // Ensure admin paths ARE matched
    ],
};