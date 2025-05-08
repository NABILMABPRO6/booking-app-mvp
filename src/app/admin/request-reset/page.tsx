// src/app/admin/request-reset/page.tsx
'use client'; // Needs state and form handling

import React, { useState } from 'react';
import Link from 'next/link';

// Reuse or adapt styles from login page or use Tailwind/CSS Modules
const styles = {
    container: {
        display: 'flex',
        flexDirection: 'column' as 'column',
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
    feedbackMessage: {
        marginTop: '15px',
        padding: '10px',
        borderRadius: '4px',
        textAlign: 'center' as 'center',
        fontSize: '0.9em',
    },
    successMessage: {
        backgroundColor: '#d4edda',
        color: '#155724',
        border: '1px solid #c3e6cb',
    },
    errorMessage: {
        backgroundColor: '#f8d7da',
        color: '#721c24',
        border: '1px solid #f5c6cb',
    },
    linkContainer: {
        marginTop: '20px',
        fontSize: '0.9em',
        textAlign: 'center' as 'center',
    },
    link: {
        color: '#007bff',
        textDecoration: 'none',
    }
};

export default function RequestPasswordResetPage() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');
        setError('');

        if (!email) {
            setError('Please enter your email address.');
            setIsLoading(false);
            return;
        }

        try {
            // Send request to the backend API route (we need to create this next)
            const response = await fetch('/api/auth/request-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle errors returned from the API
                throw new Error(data.error || `Request failed with status ${response.status}`);
            }

            // Display the success/generic message from the API
            setMessage(data.message || 'Password reset request submitted.');
            setEmail(''); // Clear input on success

        } catch (err: any) {
            console.error("Request password reset error:", err);
            setError(err.message || 'Failed to submit request. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <form onSubmit={handleSubmit} style={styles.form}>
                <h2 style={{ textAlign: 'center', marginBottom: '15px' }}>Request Password Reset</h2>
                <p style={{ textAlign: 'center', marginBottom: '20px', fontSize: '0.9em', color: '#555' }}>
                    Enter your Admin/Manager email. If it exists, a reset link will be sent.
                </p>

                {/* Display Feedback Messages */}
                {message && !error && (
                  <p style={{...styles.feedbackMessage, ...styles.successMessage}}>
                    {message}
                  </p>
                )}
                {error && (
                  <p style={{...styles.feedbackMessage, ...styles.errorMessage}}>
                    {error}
                  </p>
                )}

                <div style={styles.formGroup}>
                    <label htmlFor="email" style={styles.label}>Email Address:</label>
                    <input
                        type="email"
                        id="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        disabled={isLoading}
                        placeholder="your.email@example.com"
                        style={styles.input}
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    style={{...styles.button, ...(isLoading ? styles.buttonDisabled : {})}}
                >
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>

                <div style={styles.linkContainer}>
                    <Link href="/admin/login" style={styles.link}>
                        Back to Login
                    </Link>
                </div>
            </form>
        </div>
    );
}