// src/app/admin/reset-password/[token]/page.tsx
'use client'; // Needs state, form handling, route params

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation'; // App Router hooks
import Link from 'next/link';

// Reuse or adapt styles from login page
const styles = {
    container: { /* ...styles.container... */
        display: 'flex',
        flexDirection: 'column' as 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        padding: '20px',
     },
    form: { /* ...styles.form... */
        width: '100%',
        maxWidth: '400px',
        padding: '30px',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        backgroundColor: '#fff',
    },
    formGroup: { /* ...styles.formGroup... */
        marginBottom: '15px',
    },
    label: { /* ...styles.label... */
        display: 'block',
        marginBottom: '5px',
        fontWeight: 'bold',
    },
    input: { /* ...styles.input... */
        width: '100%',
        padding: '10px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        boxSizing: 'border-box' as 'border-box',
    },
    button: { /* ...styles.button... */
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
    buttonDisabled: { /* ...styles.buttonDisabled... */
        backgroundColor: '#aaa',
        cursor: 'not-allowed',
    },
    feedbackMessage: { /* ...styles.feedbackMessage... */
        marginTop: '15px',
        padding: '10px',
        borderRadius: '4px',
        textAlign: 'center' as 'center',
        fontSize: '0.9em',
    },
    successMessage: { /* ...styles.successMessage... */
        backgroundColor: '#d4edda',
        color: '#155724',
        border: '1px solid #c3e6cb',
    },
    errorMessage: { /* ...styles.errorMessage... */
         backgroundColor: '#f8d7da',
        color: '#721c24',
        border: '1px solid #f5c6cb',
    },
    linkContainer: { /* ...styles.linkContainer... */
        marginTop: '20px',
        fontSize: '0.9em',
        textAlign: 'center' as 'center',
    },
    link: { /* ...styles.link... */
        color: '#007bff',
        textDecoration: 'none',
    }
};


// The component automatically gets params from the dynamic route folder name '[token]'
export default function ResetPasswordPage({ params }: { params: { token: string } }) {
    const router = useRouter();
    const { token } = params; // Extract token from route params

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState(''); // For success message
    const [isLoading, setIsLoading] = useState(false);
    const [isTokenChecked, setIsTokenChecked] = useState(false); // Track if initial check done
    const [isTokenValid, setIsTokenValid] = useState(false); // Track token validity from backend check

    // Optional: Add an effect to verify token format or existence early (client-side check)
    useEffect(() => {
        if (!token || typeof token !== 'string' || token.length !== 64) { // Basic format check (64 hex chars)
            setError('Invalid or missing password reset token in the link.');
            setIsTokenValid(false);
        } else {
             // Assume valid for now, backend will do the real check
             // Could potentially make a quick HEAD or GET request here to pre-validate
             setIsTokenValid(true);
        }
        setIsTokenChecked(true);
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (!isTokenValid) {
            setError('Invalid or missing password reset token.');
            return;
        }
        if (!password || !confirmPassword) {
            setError('Please enter and confirm your new password.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        setIsLoading(true);

        try {
            // Send request to the backend API route (we will create this next)
            // We include the token in the URL path as per RESTful principles
            const response = await fetch(`/api/auth/reset-password/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, confirmPassword }), // Send only passwords
            });

            const data = await response.json();

            if (!response.ok) {
                 // If API returns error (e.g., token invalid/expired, server error)
                 setIsTokenValid(false); // Mark token as invalid after failed attempt
                 throw new Error(data.error || `Request failed with status ${response.status}`);
            }

            // Password reset successful!
            setMessage(data.message || 'Password reset successfully!');
            // Optionally redirect to login after a delay
            setTimeout(() => {
                router.push('/admin/login'); // Redirect to login page
            }, 3000); // 3 second delay

        } catch (err: any) {
            console.error("Reset password error:", err);
            setError(err.message || 'Failed to reset password. The link may be invalid or expired.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isTokenChecked) {
         return <div style={styles.container}><p>Verifying token...</p></div>; // Show loading while checking token
    }

    return (
        <div style={styles.container}>
            <form onSubmit={handleSubmit} style={styles.form}>
                <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Set New Password</h2>

                {/* Display Feedback */}
                {message && !error && (
                    <p style={{...styles.feedbackMessage, ...styles.successMessage}}>
                      {message} Redirecting to login...
                    </p>
                 )}
                {error && (
                  <p style={{...styles.feedbackMessage, ...styles.errorMessage}}>
                    {error}
                  </p>
                )}


                {/* Only show form if token seems valid client-side and no success message */}
                {isTokenValid && !message && (
                    <>
                        <div style={styles.formGroup}>
                            <label htmlFor="password" style={styles.label}>New Password:</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                                disabled={isLoading}
                                placeholder="Enter new password (min 8 chars)"
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="confirmPassword" style={styles.label}>Confirm New Password:</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                                disabled={isLoading}
                                placeholder="Confirm new password"
                                style={styles.input}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                             style={{...styles.button, ...(isLoading ? styles.buttonDisabled : {})}}
                        >
                            {isLoading ? 'Resetting...' : 'Set New Password'}
                        </button>
                    </>
                 )}

                 {/* Show relevant link based on state */}
                 <div style={styles.linkContainer}>
                    {!isTokenValid || message ? (
                         <Link href="/admin/request-reset" style={styles.link}>Request a new reset link</Link>
                     ) : (
                         <Link href="/admin/login" style={styles.link}>Back to Login</Link>
                     )}
                 </div>

            </form>
        </div>
    );
}