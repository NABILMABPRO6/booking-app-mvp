// src/app/admin/login/page.tsx
'use client'; // This page needs client-side interactivity (state, form handling)

import React, { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react'; // Use the signIn function from next-auth
import { useRouter, useSearchParams } from 'next/navigation'; // Use Next.js App Router hooks
import Link from 'next/link'; // Use Next.js Link for navigation

// Simple component-level styling (or use Tailwind classes if installed)
const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as 'column', // Explicitly type for CSSProperties
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        padding: '20px',
    },
    form: {
        width: '100%',
        maxWidth: '400px',
        padding: '30px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        backgroundColor: '#fff',
    },
    formGroup: {
        marginBottom: '15px',
    },
    label: {
        display: 'block',
        marginBottom: '5px',
        fontWeight: 'bold',
    },
    input: {
        width: '100%',
        padding: '10px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        boxSizing: 'border-box' as 'border-box',
    },
    button: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#007bff',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
        transition: 'background-color 0.2s ease',
    },
    buttonDisabled: {
        backgroundColor: '#aaa',
        cursor: 'not-allowed',
    },
    errorMessage: {
        color: 'red',
        marginBottom: '15px',
        textAlign: 'center' as 'center',
        fontSize: '0.9em',
    },
    linkContainer: {
      marginTop: '20px',
      fontSize: '0.9em',
      textAlign: 'center' as 'center',
    },
    link: {
      color: '#007bff',
      textDecoration: 'none',
    },
    linkHover: { // You would typically handle hover with CSS classes
      textDecoration: 'underline',
    }
};


export default function AdminLoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Check for error messages passed from NextAuth in URL params
    useEffect(() => {
        const authError = searchParams.get('error');
        if (authError) {
            // Map common NextAuth errors to user-friendly messages
            switch (authError) {
                case 'CredentialsSignin':
                    setError('Invalid email or password. Please try again.');
                    break;
                case 'AccessDenied':
                     setError('Access Denied. You might not have permission.');
                     break;
                default:
                    setError('An authentication error occurred. Please try again.');
            }
             // Clean the URL query parameters after reading the error
             // Use replace to avoid adding to browser history
             router.replace('/admin/login', undefined);
        }
    }, [searchParams, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(''); // Clear previous errors

        try {
            // Use the signIn function from next-auth
            const result = await signIn('credentials', {
                redirect: false, // Prevent NextAuth from redirecting automatically
                email: email,
                password: password,
                // callbackUrl: '/admin' // Optional: where to redirect on success if redirect wasn't false
            });

            if (result?.error) {
                console.error("Login Error from next-auth:", result.error);
                // Use the error mapping logic from useEffect or set a generic message
                 setError('Invalid email or password. Please try again.');
                 setIsLoading(false);
            } else if (result?.ok && !result?.error) {
                // Login successful!
                console.log('Login successful, redirecting to admin dashboard...');
                // Manually redirect to the admin dashboard (or intended page)
                 const callbackUrl = searchParams.get('callbackUrl') || '/admin'; // Redirect back if provided
                 router.push(callbackUrl); // Use push for normal navigation
            } else {
                 // Handle other potential states if needed
                 setError('An unexpected error occurred during login.');
                 setIsLoading(false);
            }

        } catch (err) {
            // Catch unexpected errors during the signIn process itself
            console.error("Unexpected Login error:", err);
            setError('Login failed due to an unexpected error.');
            setIsLoading(false);
        }
        // Removed finally block as loading state is handled within the if/else branches now
    };

    return (
        <div style={styles.container}>
            <form onSubmit={handleLogin} style={styles.form}>
                <h2 style={{ textAlign: 'center', marginBottom: '25px' }}>Admin Login</h2>

                {error && <p style={styles.errorMessage}>{error}</p>}

                <div style={styles.formGroup}>
                    <label htmlFor="email" style={styles.label}>Email:</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        disabled={isLoading}
                        placeholder="admin@example.com"
                        style={styles.input}
                    />
                </div>
                <div style={styles.formGroup}>
                    <label htmlFor="password" style={styles.label}>Password:</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        disabled={isLoading}
                        placeholder="Enter your password"
                        style={styles.input}
                    />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{...styles.button, ...(isLoading ? styles.buttonDisabled : {})}}
                >
                    {isLoading ? 'Logging in...' : 'Login'}
                </button>

                 <div style={styles.linkContainer}>
                   <Link href="/admin/request-reset" style={styles.link}>
                     Forgot Password?
                   </Link>
                 </div>
                 <div style={styles.linkContainer}>
                   <Link href="/" style={styles.link}>
                     Return to Booking Page
                   </Link>
                 </div>
            </form>
        </div>
    );
}