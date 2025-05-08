// src/app/admin/page.tsx
'use client'; // Needs client-side hooks for data fetching and state

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link'; // Use Next.js Link

// Define types for the expected data structure (based on API response)
interface DashboardCounts {
    todayBookings: number;
    upcomingBookings: number;
    activeStaff: number;
    activeServices: number;
}
interface StaffNeedingGCal {
    staff_id: number;
    name: string;
}
interface TodayAppointment {
    booking_id: number;
    time: string; // Already formatted by API
    client_name: string;
    service_name: string;
    staff_name: string;
}
interface DashboardData {
    counts: DashboardCounts;
    staffNeedingGCal: StaffNeedingGCal[];
    todaysAppointments: TodayAppointment[];
}

// Placeholder styles (replace with Tailwind/CSS Modules)
const styles = {
    dashboardContainer: { padding: '20px' },
    section: { marginBottom: '30px', padding: '20px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fff' },
    sectionTitle: { marginTop: '0', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' },
    kpiCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' },
    kpiCard: { border: '1px solid #ddd', padding: '15px', borderRadius: '5px', textAlign: 'center' as 'center' },
    kpiValue: { fontSize: '2em', fontWeight: 'bold', margin: '5px 0' },
    link: { color: '#007bff', textDecoration: 'none' },
    alertCard: { border: '1px solid #ffc107', backgroundColor: '#fff3cd', padding: '15px', borderRadius: '5px' },
    alertWarning: { color: '#856404', fontWeight: 'bold' },
    alertOk: { color: '#155724' },
    alertList: { paddingLeft: '20px', margin: '10px 0' },
    appointmentsList: { listStyle: 'none', padding: '0' },
    appointmentItem: { borderBottom: '1px solid #eee', padding: '10px 0', display: 'flex', gap: '10px', alignItems: 'center' },
    apptTime: { fontWeight: 'bold', minWidth: '70px'},
    errorMessage: { color: 'red' },
    loadingMessage: { fontStyle: 'italic' },
};

export default function AdminDashboardPage() {
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            console.log("Fetching dashboard summary data...");
            // Fetch from the Next.js API route
            const response = await fetch('/api/admin/dashboard/summary');

            if (!response.ok) {
                // Handle non-2xx responses
                const errorData = await response.json().catch(() => ({})); // Try to parse error JSON
                throw new Error(errorData.error || `Failed to fetch: ${response.statusText} (${response.status})`);
            }

            const data: DashboardData = await response.json();
            console.log("Dashboard data received:", data);
            setDashboardData(data);
        } catch (err: any) {
            console.error("Error fetching dashboard data:", err);
            setError(err.message || "Failed to load dashboard data.");
            setDashboardData(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // Helper to render loading/error states
    if (isLoading) {
        return <div style={styles.dashboardContainer}><p style={styles.loadingMessage}>Loading dashboard...</p></div>;
    }
    if (error) {
        return <div style={styles.dashboardContainer}><p style={styles.errorMessage}>Error: {error}</p></div>;
    }
    if (!dashboardData) {
        return <div style={styles.dashboardContainer}><p>No dashboard data available.</p></div>;
    }

    // Destructure data for easier access
    const { counts, staffNeedingGCal, todaysAppointments } = dashboardData;

    return (
        <div style={styles.dashboardContainer}>
            <h2>Admin Dashboard</h2>

            {/* KPI Cards Section */}
            <section style={styles.section}>
                <h3 style={styles.sectionTitle}>Overview</h3>
                <div style={styles.kpiCards}>
                    <div style={styles.kpiCard}>
                        <h4>Today's Bookings</h4>
                        <p style={styles.kpiValue}>{counts?.todayBookings ?? 'N/A'}</p>
                        <Link href="/admin/bookings" style={styles.link}>View Bookings</Link>
                    </div>
                    <div style={styles.kpiCard}>
                        <h4>Upcoming (7 days)</h4>
                        <p style={styles.kpiValue}>{counts?.upcomingBookings ?? 'N/A'}</p>
                        <Link href="/admin/bookings" style={styles.link}>View Bookings</Link>
                    </div>
                    <div style={styles.kpiCard}>
                        <h4>Active Staff</h4>
                        <p style={styles.kpiValue}>{counts?.activeStaff ?? 'N/A'}</p>
                        <Link href="/admin/staff" style={styles.link}>Manage Staff</Link>
                    </div>
                    <div style={styles.kpiCard}>
                        <h4>Active Services</h4>
                        <p style={styles.kpiValue}>{counts?.activeServices ?? 'N/A'}</p>
                        <Link href="/admin/services" style={styles.link}>Manage Services</Link>
                    </div>
                </div>
            </section>

            {/* Alerts Section */}
            <section style={styles.section}>
                <h3 style={styles.sectionTitle}>Alerts & Attention</h3>
                <div style={styles.alertCard}>
                    <h4>Staff Google Calendar Connection</h4>
                    {staffNeedingGCal && staffNeedingGCal.length > 0 ? (
                        <>
                            <p style={styles.alertWarning}>
                                {staffNeedingGCal.length} active staff member(s) need Google Calendar connected:
                            </p>
                            <ul style={styles.alertList}>
                                {staffNeedingGCal.map(staff => (
                                    <li key={staff.staff_id}>
                                        {staff.name} (ID: {staff.staff_id})
                                    </li>
                                ))}
                            </ul>
                            <Link href="/admin/staff" style={styles.link}>Go to Staff Management</Link>
                        </>
                    ) : (
                        <p style={styles.alertOk}>All active staff members seem connected to Google Calendar.</p>
                    )}
                </div>
            </section>

            {/* Today's Appointments Section */}
            <section style={styles.section}>
                <h3 style={styles.sectionTitle}>Today's Upcoming Appointments</h3>
                {todaysAppointments && todaysAppointments.length > 0 ? (
                    <ul style={styles.appointmentsList}>
                        {todaysAppointments.map(appt => (
                            <li key={appt.booking_id} style={styles.appointmentItem}>
                                <span style={styles.apptTime}>{appt.time}</span>
                                <span>{appt.client_name} - {appt.service_name} w/ {appt.staff_name}</span>
                                {/* Optional link to view full booking details */}
                                {/* <Link href={`/admin/bookings/${appt.booking_id}`} style={styles.link}> (Details)</Link> */}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>No upcoming appointments scheduled for the rest of today.</p>
                )}
                 <Link href="/admin/bookings" style={{ ...styles.link, display: 'block', marginTop: '10px' }}>View All Bookings</Link>
            </section>
        </div>
    );
}