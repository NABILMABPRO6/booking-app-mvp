// src/components/admin/Sidebar.tsx
'use client'; // Needs client-side hooks for session, navigation, and interactions

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation'; // App Router hooks
import { useSession, signOut } from 'next-auth/react'; // Use session hook

// Placeholder styles (adapt using Tailwind or CSS Modules later)
const styles = {
    sidebar: {
        width: '250px',
        backgroundColor: '#f4f4f4',
        padding: '15px',
        height: '100vh', // Full height
        borderRight: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column' as 'column',
    },
    heading: {
        marginBottom: '20px',
        fontSize: '1.2em',
        fontWeight: 'bold',
        textAlign: 'center' as 'center',
    },
    userInfo: {
        marginBottom: '20px',
        padding: '10px',
        border: '1px dashed #ccc',
        borderRadius: '4px',
        fontSize: '0.9em',
        textAlign: 'center' as 'center',
    },
    navList: {
        listStyle: 'none',
        padding: '0',
        margin: '0',
        flexGrow: 1, // Allow list to grow
    },
    navItem: {
        marginBottom: '10px',
    },
    navLink: {
        textDecoration: 'none',
        color: '#333',
        display: 'block',
        padding: '8px 10px',
        borderRadius: '4px',
        transition: 'background-color 0.2s ease',
    },
    navLinkActive: {
        backgroundColor: '#ddd',
        fontWeight: 'bold',
    },
    hr: {
      border: 'none',
      borderTop: '1px solid #ddd',
      margin: '15px 0',
    },
    logoutButton: {
      width: '100%',
      padding: '10px',
      backgroundColor: '#dc3545',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      marginTop: 'auto', // Push to bottom
      fontSize: '1em',
    },
     roleBadge: (role: string) => ({ // Function to return style based on role
        display: 'inline-block',
        padding: '2px 6px',
        fontSize: '0.75em',
        borderRadius: '4px',
        color: '#fff',
        backgroundColor: role === 'admin' ? '#007bff' : (role === 'manager' ? '#28a745' : '#6c757d'), // Blue for admin, Green for manager, Grey for staff
        marginLeft: '5px',
        textTransform: 'capitalize' as 'capitalize',
    }),
};


export default function Sidebar() {
    const pathname = usePathname(); // Get current path
    const router = useRouter();
    const { data: session, status } = useSession(); // Get session data and status

    const user = session?.user;
    const isLoading = status === 'loading';

    const handleLogout = async () => {
        console.log("Admin logging out...");
        // Use signOut from next-auth - redirects to login page by default
        await signOut({ callbackUrl: '/admin/login' }); // Specify where to go after logout
    };

    // Helper to check if a link is active (considering base path /admin)
    const isActive = (path: string): boolean => {
        // Exact match for dashboard, startsWith for others
        if (path === '/admin') return pathname === path;
        return pathname.startsWith(path);
    };

    return (
        <nav style={styles.sidebar}>
            <h3 style={styles.heading}>Admin Menu</h3>

            {isLoading && <div style={styles.userInfo}>Loading user...</div>}

            {user && !isLoading && (
                <div style={styles.userInfo}>
                    Welcome, {user.name || user.email}<br />
                    (Role: <span style={styles.roleBadge(user.role || 'unknown')}>{user.role || 'Unknown'}</span>)
                </div>
            )}

            <ul style={styles.navList}>
                 <li style={styles.navItem}>
                     <Link
                         href="/admin"
                         style={isActive('/admin') ? { ...styles.navLink, ...styles.navLinkActive } : styles.navLink}
                     >
                         Dashboard
                     </Link>
                 </li>

                 {/* Conditional Rendering based on role stored in session */}
                 {user?.role === 'admin' && (
                     <li style={styles.navItem}>
                         <Link
                             href="/admin/staff"
                             style={isActive('/admin/staff') ? { ...styles.navLink, ...styles.navLinkActive } : styles.navLink}
                         >
                             Staff Management
                         </Link>
                     </li>
                 )}

                 {(user?.role === 'admin' || user?.role === 'manager') && (
                     <>
                         <li style={styles.navItem}>
                             <Link
                                 href="/admin/services"
                                 style={isActive('/admin/services') ? { ...styles.navLink, ...styles.navLinkActive } : styles.navLink}
                             >
                                 Service Management
                             </Link>
                         </li>
                         <li style={styles.navItem}>
                             <Link
                                 href="/admin/bookings"
                                 style={isActive('/admin/bookings') ? { ...styles.navLink, ...styles.navLinkActive } : styles.navLink}
                             >
                                 Booking Management
                             </Link>
                         </li>
                         {/* Add other links for admin/manager here */}
                     </>
                 )}

                <hr style={styles.hr} />

                 <li style={styles.navItem}>
                     <Link
                         href="/"
                         style={styles.navLink}
                     >
                         Back to Booking Page
                     </Link>
                 </li>

            </ul>

            {/* Logout Button */}
             <button onClick={handleLogout} style={styles.logoutButton} disabled={isLoading}>
                 Logout
             </button>
        </nav>
    );
}