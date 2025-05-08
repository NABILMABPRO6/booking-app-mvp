// src/lib/auth.ts
import NextAuth from 'next-auth';
import { authConfig } from './auth.config'; // Import our specific configuration
import { dbPool } from './db'; // Needed for adapter if using one, or callbacks
import { encrypt, decrypt } from './utils/cryptoUtils'; // Needed for Google token handling

// Extend the built-in Session and JWT types to include our custom properties (like role, id)
// Ref: https://next-auth.js.org/getting-started/typescript#module-augmentation
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            role?: string | null; // Add custom role property
        };
        accessToken?: string | null; // Example: if you store access token
        error?: string | null;      // Example: to pass errors like token refresh failure
    }

    interface User { // The User object returned by the authorize function or provider profile
        id: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
        role?: string | null; // Add role here too
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id?: string;             // Store user ID in the JWT
        role?: string | null;    // Store user role in the JWT
        accessToken?: string;    // Example: for storing provider access token
        refreshToken?: string;   // Example: for storing provider refresh token (handle securely!)
        accessTokenExpires?: number; // Example: store expiry time
        error?: string;          // Example: error during token refresh
        // Add any other properties you want persisted in the JWT
    }
}


// --- Update Auth Config with Callbacks and Events ---

// Add callbacks to include role and ID in JWT and Session
authConfig.callbacks = {
    ...authConfig.callbacks, // Keep existing callbacks if any defined elsewhere

    // This callback runs whenever a JWT is created or updated.
    // The `user` object is only passed on initial sign-in.
    // `token` is the existing JWT (if any).
    async jwt({ token, user, account, profile }) {
        // console.log("[JWT Callback] Triggered", { hasToken: !!token, hasUser: !!user, hasAccount: !!account });

        // 1. Initial Sign-in: Persist user details from authorize/provider into the token
        if (user && account) {
            // console.log("[JWT Callback] Initial sign-in, adding user details to token:", user);
            token.id = user.id; // user.id comes from the authorize function or provider profile
            token.role = user.role; // Add role from user object
            token.name = user.name;
            token.email = user.email;
            token.picture = user.image;

            // Example: Handling Google provider specifics on initial login
            if (account.provider === 'google') {
                // Store tokens from Google if needed (e.g., for future API calls)
                // Note: Refresh tokens are sensitive, consider encryption if storing long-term
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token; // Handle potential expiry/rotation
                token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined; // Convert seconds to ms
                // console.log("[JWT Callback] Storing Google tokens in JWT.");
            }
        }

        // 2. Subsequent Requests: Return the existing token, potentially refreshing it if needed (Example below)
        // Example: Simple check if access token exists and hasn't expired
        // More complex refresh logic might be needed depending on the provider
        /*
        if (token.accessTokenExpires && Date.now() >= token.accessTokenExpires) {
             console.log("[JWT Callback] Access token expired, attempting refresh...");
             // Add token refresh logic here if needed
             // If refresh fails, set an error: token.error = "RefreshAccessTokenError"
        }
        */

        return token; // The updated token is returned
    },

    // This callback runs whenever a session is accessed.
    // It receives the JWT (`token`) and returns the `session` object available client-side.
    async session({ session, token }) {
        // console.log("[Session Callback] Triggered, adding token data to session");
        // Add the custom properties from the JWT (`token`) to the `session.user` object
        if (token) {
            session.user.id = token.id ?? session.user.id; // Get ID from token
            session.user.role = token.role ?? session.user.role; // Get role from token
            session.user.name = token.name ?? session.user.name;
            session.user.email = token.email ?? session.user.email;
            session.user.image = token.picture ?? session.user.image;
            // Example: Pass token error state to session if needed
            session.error = token.error;
        }
        // console.log("[Session Callback] Final session object:", session);
        return session; // The session object is returned
    },
};

// Add events for handling Google OAuth token storage/encryption
authConfig.events = {
    ...authConfig.events,
    async signIn(message) {
         /* on successful sign in */
         console.log("[SignIn Event] User signed in:", message.user.email, "Provider:", message.account?.provider);
    },
    async linkAccount(message) {
        // This event fires when a user connects an OAuth account (e.g., Google)
        // This is where we store the encrypted refresh token for Google
        if (message.account?.provider === 'google' && message.account.refresh_token) {
            const staffId = message.user.id; // Assuming user.id is the staff_id string
            console.log(`[LinkAccount Event] Linking Google for user/staff ID: ${staffId}`);
            try {
                const encryptedToken = encrypt(message.account.refresh_token);
                if (!encryptedToken) {
                    console.error(`[LinkAccount Event] Failed to encrypt refresh token for user ${staffId}.`);
                    return; // Or handle error more robustly
                }

                // Fetch primary email to use as default Google Calendar ID
                let primaryCalendarId = 'primary'; // Default
                if (message.account.access_token) {
                    try {
                        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${message.account.access_token}` },
                        });
                        if (profileResponse.ok) {
                            const profileData = await profileResponse.json();
                            if (profileData.email) {
                                primaryCalendarId = profileData.email;
                                console.log(`[LinkAccount Event] Using primary email ${primaryCalendarId} as calendar ID for staff ${staffId}.`);
                            }
                        } else {
                            console.warn(`[LinkAccount Event] Failed to fetch Google userinfo: ${profileResponse.statusText}`);
                        }
                    } catch (fetchError) {
                        console.error('[LinkAccount Event] Error fetching Google userinfo:', fetchError);
                    }
                }


                await dbPool.query(
                    `UPDATE staff
                     SET google_refresh_token = $1,
                         google_calendar_id = $2, -- Store the inferred Calendar ID
                         updated_at = CURRENT_TIMESTAMP
                     WHERE staff_id = $3`,
                    [encryptedToken, primaryCalendarId, parseInt(staffId)] // Ensure staffId is number for query
                );
                console.log(`[LinkAccount Event] Successfully stored encrypted Google refresh token and calendar ID for staff ${staffId}.`);
            } catch (error) {
                console.error(`[LinkAccount Event] Error storing Google refresh token for staff ${staffId}:`, error);
                // Handle DB error appropriately
            }
        }
    }
}


// Initialize NextAuth.js with the final configuration
export const {
    handlers: { GET, POST }, // Route handlers for GET and POST requests (e.g., /api/auth/signin/google)
    auth,                   // Function to get the session in Server Components, Server Actions, API Routes
    signIn,                 // Function to initiate sign-in flows
    signOut,                // Function to initiate sign-out flows
} = NextAuth(authConfig);