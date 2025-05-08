// src/lib/auth.config.ts
import type { NextAuthConfig } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { dbPool } from './db'; // Import our database pool
import { comparePassword } from './utils/passwordUtils'; // We will create this utility soon

// Ensure environment variables are defined (runtime check might be needed elsewhere too)
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("FATAL ERROR: Google OAuth environment variables missing!");
    // In a real app, you might prevent startup or throw a clearer error
}
if (!process.env.JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET environment variable missing!");
}

export const authConfig: NextAuthConfig = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!, // Use non-null assertion if check above passed
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!, // Use non-null assertion
            authorization: {
                params: {
                    prompt: "consent", // Force consent screen
                    access_type: "offline", // Get refresh token
                    response_type: "code",
                    // Add scopes needed for calendar access later if Google login is for staff
                    // scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"
                },
            },
        }),
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                // Define the fields expected on the login form
                email: { label: "Email", type: "email", placeholder: "admin@example.com" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials, req) {
                // --- Login Logic ---
                // This function replaces your old /api/auth/login Express route
                console.log("[NextAuth Authorize] Attempting credentials login for:", credentials?.email);

                if (!credentials?.email || !credentials?.password) {
                    console.log("[NextAuth Authorize] Missing email or password.");
                    return null; // Indicates failure
                }

                try {
                    const userResult = await dbPool.query(
                        `SELECT staff_id, name, email, role, is_active, password_hash
                         FROM staff
                         WHERE email = $1`,
                        [credentials.email]
                    );

                    if (userResult.rowCount === 0) {
                        console.log(`[NextAuth Authorize] User not found: ${credentials.email}`);
                        return null;
                    }

                    const user = userResult.rows[0];

                    // IMPORTANT: Only allow admin/manager login via credentials
                    if (!['admin', 'manager'].includes(user.role)) {
                        console.log(`[NextAuth Authorize] Role not permitted for credentials login: ${user.role}`);
                        return null; // Or throw an error maybe? Null is standard.
                    }

                    if (!user.is_active) {
                        console.log(`[NextAuth Authorize] User inactive: ${credentials.email}`);
                        // You could throw a specific error here if needed
                        // throw new Error("Account is inactive.");
                        return null;
                    }

                    if (!user.password_hash) {
                         console.log(`[NextAuth Authorize] User has no password hash set: ${credentials.email}`);
                         return null;
                    }

                    // We will create comparePassword utility next
                    const isPasswordValid = await comparePassword(credentials.password, user.password_hash);

                    if (!isPasswordValid) {
                        console.log(`[NextAuth Authorize] Invalid password for: ${credentials.email}`);
                        return null;
                    }

                    console.log(`[NextAuth Authorize] Credentials VALID for: ${credentials.email}`);
                    // Return the user object (must include at least `id`)
                    // We add other fields needed for the JWT/session callbacks later
                    return {
                        id: user.staff_id.toString(), // id must be string for next-auth User type
                        name: user.name,
                        email: user.email,
                        role: user.role, // Add role here
                        // Do NOT include password_hash
                    };

                } catch (error) {
                    console.error("[NextAuth Authorize] Error during authorization:", error);
                    return null; // Return null on database or other errors
                }
            }
        })
    ],
    session: {
        strategy: "jwt", // Use JSON Web Tokens for session management
    },
    callbacks: {
        // We will add jwt and session callbacks here later
        // To add role and id to the token and session object
    },
    pages: {
        signIn: '/admin/login', // Redirect users to this page if they need to sign in
        // error: '/auth/error', // Optional: Custom error page
    },
    // Add other configurations like secret, debug options if needed
    secret: process.env.JWT_SECRET, // Secret used to sign JWTs, session cookies etc.
    debug: process.env.NODE_ENV === 'development', // Enable debug messages in development
};