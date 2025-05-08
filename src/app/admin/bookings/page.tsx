// src/app/admin/bookings/page.tsx
'use client';

import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useSession } from 'next-auth/react'; // Optional: for UI adjustments based on role
import Link from 'next/link'; // For linking if needed
import moment from 'moment-timezone';
import DatePicker from "react-datepicker"; // For Reschedule Modal
import "react-datepicker/dist/react-datepicker.css"; // DatePicker CSS

// --- Type Definitions ---
interface Booking {
    booking_id: number;
    client_name: string;
    client_email: string | null;
    client_phone: string | null;
    booking_start_time: string; // ISO String UTC
    booking_end_time: string; // ISO String UTC
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show' | string; // Allow string for flexibility
    notes: string | null;
    created_at: string; // ISO String UTC
    updated_at: string; // ISO String UTC
    google_event_id: string | null;
    booking_timezone: string | null;
    service_id: number;
    service_name: string;
    staff_id: number;
    staff_name: string;
    customer_id?: number | null; // Added customer link
}
interface TimeSlot { // For reschedule slots
    time: string;
    staffId: number;
    staffName: string; // Assuming API returns this
}
interface StatusMessage {
    message: string | null;
    type: 'success' | 'error' | 'info' | null;
}

// --- Styles (Basic Placeholders - Replace with Tailwind/CSS Modules) ---
const styles = {
    page: { padding: '20px', fontFamily: 'sans-serif' },
    heading: { marginBottom: '20px' },
    searchControls: { marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' },
    input: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', flexGrow: 1 },
    button: { padding: '8px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    buttonPrimary: { backgroundColor: '#007bff', color: 'white' },
    buttonSecondary: { backgroundColor: '#6c757d', color: 'white' },
    buttonDanger: { backgroundColor: '#dc3545', color: 'white' },
    buttonDisabled: { backgroundColor: '#aaa', cursor: 'not-allowed' },
    tableContainer: { overflowX: 'auto' as 'auto', marginTop: '20px' },
    table: { width: '100%', borderCollapse: 'collapse' as 'collapse' },
    th: { border: '1px solid #ddd', padding: '10px', textAlign: 'left' as 'left', backgroundColor: '#f2f2f2', fontSize: '0.9em' },
    td: { border: '1px solid #ddd', padding: '10px', verticalAlign: 'top' as 'top', fontSize: '0.9em' },
    actionCell: { whiteSpace: 'nowrap' as 'nowrap', display: 'flex', gap: '5px' },
    statusBadge: (status: string) => ({ /* Basic status badge */ padding: '3px 7px', borderRadius: '10px', color: 'white', fontSize: '0.8em', textTransform: 'capitalize' as 'capitalize', backgroundColor: status === 'confirmed' ? '#28a745' : status === 'scheduled' ? '#17a2b8' : status === 'completed' ? '#6c757d' : status === 'cancelled' ? '#dc3545' : status === 'no-show' ? '#ffc107' : '#6c757d' }),
    statusOk: { color: 'green', fontWeight: 'bold' },
    statusNotOk: { color: 'red' },
    paginationControls: { marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    feedback: { /* ... feedback styles ... */ },
    // Modal Styles
    modalOverlay: { /* ... (same as staff modal) ... */ position: 'fixed' as 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 1000, overflowY: 'auto' as 'auto', padding: '30px 10px' },
    modalContent: { /* ... (same as staff modal) ... */ backgroundColor: 'white', padding: '20px 30px 30px 30px', borderRadius: '8px', width: '95%', maxWidth: '700px', position: 'relative' as 'relative', margin: 'auto 0' },
    modalWide: { maxWidth: '900px' },
    modalCloseButton: { /* ... (same as staff modal) ... */ position: 'absolute' as 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#888', lineHeight: 1 },
    modalTitle: { marginTop: '0', marginBottom: '25px' },
    modalSection: { marginBottom: '15px', paddingBottom: '15px', borderBottom: '1px solid #eee' },
    modalSectionLast: { borderBottom: 'none', marginBottom: 0 },
    modalSectionTitle: { marginTop: '0', marginBottom: '10px', fontSize: '1.1em'},
    modalActions: { marginTop: '25px', textAlign: 'right' as 'right', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    modalNotes: { whiteSpace: 'pre-wrap' as 'pre-wrap', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto' as 'auto', fontSize: '0.9em' },
    slotsContainer: { /* ... reuse from booking page styles */ },
    slotButton: { /* ... reuse from booking page styles */ },
    slotButtonSelected: { /* ... reuse from booking page styles */ },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: '500' },
    datePickerWrapper: { width: '100%' }, // Make date picker full width
    // Spinner
    spinnerInline: { /* ... same as staff modal ... */ },
     // Feedback messages (reuse from staff modal)
    feedbackSuccess: { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', padding: '10px', borderRadius: '4px', margin: '10px 0', textAlign: 'center' as 'center' },
    feedbackError: { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', padding: '10px', borderRadius: '4px', margin: '10px 0', textAlign: 'center' as 'center' },
    feedbackInfo: { backgroundColor: '#d1ecf1', color: '#0c5460', border: '1px solid #bee5eb', padding: '10px', borderRadius: '4px', margin: '10px 0', textAlign: 'center' as 'center' },

};

// --- Component ---
export default function BookingManagementPage() {
    // Not strictly needed for API calls (handled by backend), but useful for UI logic
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    // Component State
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [limit] = useState(50); // Items per page
    const [totalBookings, setTotalBookings] = useState(0);
    const totalPages = Math.ceil(totalBookings / limit);

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSearchTerm, setActiveSearchTerm] = useState('');

    // View Details Modal State
    const [selectedBookingForDetails, setSelectedBookingForDetails] = useState<Booking | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [cancelErrorInDetails, setCancelErrorInDetails] = useState<string | null>(null);
    const [isCancellingFromDetails, setIsCancellingFromDetails] = useState(false);

    // Reschedule Modal State
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
    const [newSelectedDate, setNewSelectedDate] = useState<Date | null>(null); // Use Date object for picker
    const [newAvailableSlots, setNewAvailableSlots] = useState<TimeSlot[]>([]);
    const [newSelectedSlot, setNewSelectedSlot] = useState<TimeSlot | null>(null);
    const [isNewSlotsLoading, setIsNewSlotsLoading] = useState(false);
    const [newSlotsError, setNewSlotsError] = useState<string | null>(null);
    const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);
    const [rescheduleStatus, setRescheduleStatus] = useState<StatusMessage>({ message: null, type: null });

    // General Action State
    const [isCancellingInline, setIsCancellingInline] = useState<number | null>(null); // Store booking_id being cancelled inline

    // --- Helper Functions ---
    const formatDateTime = useCallback((isoString: string | null | undefined): string => {
        if (!isoString) return 'N/A';
        // Display time in the *browser's* local timezone for admin convenience
        return moment(isoString).format('YYYY-MM-DD @ h:mm A');
    }, []);

    const formatDateForAPI = useCallback((date: Date | null): string => {
        if (!date) return '';
        return moment(date).format('YYYY-MM-DD');
    }, []);


    // --- Fetch Bookings Function ---
    const fetchBookings = useCallback(async (page = 1, currentLimit = limit, search = activeSearchTerm) => {
        console.log(`Fetching bookings - Page: ${page}, Limit: ${currentLimit}, Search: '${search}'`);
        setIsLoading(true);
        setError(null);
        if (page !== currentPage) setCurrentPage(page); // Sync state if called externally
        const offset = (page - 1) * currentLimit;

        const params = new URLSearchParams({
            limit: currentLimit.toString(),
            offset: offset.toString(),
        });
        if (search) params.append('search', search);

        try {
            const response = await fetch(`/api/admin/bookings?${params.toString()}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Failed to fetch bookings: ${response.statusText}`);
            }
            const totalCountHeader = response.headers.get('X-Total-Count');
            const data: Booking[] = await response.json();

            setBookings(data);
            setTotalBookings(totalCountHeader ? parseInt(totalCountHeader, 10) : 0); // Handle missing header gracefully

        } catch (err: any) {
            console.error("Error fetching bookings:", err);
            setError(err.message || "Failed to load bookings.");
            setBookings([]); setTotalBookings(0);
        } finally {
            setIsLoading(false);
        }
    }, [limit, activeSearchTerm, currentPage]); // Dependencies for useCallback

    // Effect to fetch data on load and when dependencies change
    useEffect(() => {
        fetchBookings(currentPage, limit, activeSearchTerm);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, activeSearchTerm]); // fetchBookings is stable due to useCallback, limit is constant


    // --- Pagination Handlers ---
    const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(prev => prev + 1); };
    const handlePreviousPage = () => { if (currentPage > 1) setCurrentPage(prev => prev - 1); };

    // --- Search Handlers ---
    const handleSearchSubmit = () => {
        if (searchTerm.trim() !== activeSearchTerm) {
             setActiveSearchTerm(searchTerm.trim());
             setCurrentPage(1); // Reset to page 1 for new search
        }
    };
    const handleClearSearch = () => {
         if (searchTerm || activeSearchTerm) {
            setSearchTerm('');
            setActiveSearchTerm('');
            setCurrentPage(1); // Reset to page 1
         }
    };

    // --- Modal Handlers (Details) ---
    const handleViewDetails = (booking: Booking) => {
         setSelectedBookingForDetails(booking);
         setCancelErrorInDetails(null);
         setIsCancellingFromDetails(false);
         setIsDetailsModalOpen(true);
     };
     const handleCloseDetailsModal = useCallback(() => {
         setIsDetailsModalOpen(false);
         setTimeout(() => { setSelectedBookingForDetails(null); setCancelErrorInDetails(null); setIsCancellingFromDetails(false); }, 300);
     }, []);

    // --- Cancel Booking Logic ---
    const handleCancelBooking = useCallback(async (bookingId: number, bookingStatus: string, source: 'inline' | 'modal' = 'inline') => {
        const cancellableStatuses = ['confirmed', 'scheduled'];
        if (!cancellableStatuses.includes(bookingStatus)) {
            alert(`Booking cannot be cancelled (Status: ${bookingStatus}).`);
            return;
        }
        if (!window.confirm(`Are you sure you want to cancel booking ID ${bookingId}? This action cannot be undone.`)) return;

        if (source === 'modal') { setIsCancellingFromDetails(true); setCancelErrorInDetails(null); }
        else { setIsCancellingInline(bookingId); }

        try {
            const response = await fetch(`/api/admin/bookings/${bookingId}/cancel`, { method: 'PUT' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not cancel booking.');

            alert(result.message || 'Booking cancelled successfully.'); // Simple alert for now
            if (source === 'modal') handleCloseDetailsModal();
            fetchBookings(currentPage, limit, activeSearchTerm); // Refresh list

        } catch (err: any) {
            console.error("Failed to cancel booking:", err);
            const errorMsg = err.message || "Could not cancel booking.";
            if (source === 'modal') setCancelErrorInDetails(errorMsg);
            else alert(`Cancellation Error: ${errorMsg}`);
        } finally {
            if (source === 'modal') setIsCancellingFromDetails(false);
            else setIsCancellingInline(null);
        }
     }, [fetchBookings, currentPage, limit, activeSearchTerm, handleCloseDetailsModal]);


    // --- Modal Handlers (Reschedule) ---
    const handleOpenRescheduleModal = (booking: Booking) => {
         setReschedulingBooking(booking);
         setNewSelectedDate(null); setNewAvailableSlots([]); setNewSelectedSlot(null);
         setNewSlotsError(null); setRescheduleStatus({ message: null, type: null });
         setIsSubmittingReschedule(false);
         setIsRescheduleModalOpen(true);
     };
    const handleCloseRescheduleModal = useCallback(() => {
         setIsRescheduleModalOpen(false);
         setTimeout(() => {
             setReschedulingBooking(null); setNewSelectedDate(null); setNewAvailableSlots([]);
             setNewSelectedSlot(null); setNewSlotsError(null); setRescheduleStatus({ message: null, type: null });
             setIsSubmittingReschedule(false);
         }, 300);
     }, []);

    const handleNewDateChange = (date: Date | null) => {
         setNewSelectedDate(date);
         setNewSelectedSlot(null); setNewAvailableSlots([]); setNewSlotsError(null);
         setRescheduleStatus({ message: null, type: null });
     };

     // Fetch Available Slots for NEW Date
     const fetchSlotsForNewDate = useCallback(async () => {
        const dateString = formatDateForAPI(newSelectedDate);
         if (!reschedulingBooking?.service_id || !reschedulingBooking?.staff_id || !dateString) return;

         console.log(`Reschedule: Fetching slots for Staff ${reschedulingBooking.staff_id}, Service ${reschedulingBooking.service_id}, Date ${dateString}`);
         setIsNewSlotsLoading(true);
         setNewSlotsError(null); setNewAvailableSlots([]); setNewSelectedSlot(null);

         try {
             const params = new URLSearchParams({
                 serviceId: String(reschedulingBooking.service_id),
                 staffId: String(reschedulingBooking.staff_id), // Specify staff for reschedule consistency
                 date: dateString
             });
             // Use the PUBLIC slots endpoint
             const response = await fetch(`/api/slots?${params.toString()}`);
             if (!response.ok) throw new Error('Failed to load available times.');
             const data: TimeSlot[] = await response.json();
             setNewAvailableSlots(data);
         } catch (err: any) {
             console.error("Error fetching new slots:", err);
             setNewSlotsError(err.message || "Failed to load times.");
             setNewAvailableSlots([]);
         } finally { setIsNewSlotsLoading(false); }
      }, [reschedulingBooking, newSelectedDate, formatDateForAPI]);

     useEffect(() => {
         if (isRescheduleModalOpen && reschedulingBooking && newSelectedDate) {
             fetchSlotsForNewDate();
         }
     }, [isRescheduleModalOpen, newSelectedDate, reschedulingBooking, fetchSlotsForNewDate]);

     const handleNewSlotSelect = (slot: TimeSlot) => {
         setNewSelectedSlot(slot);
         setRescheduleStatus({ message: null, type: null });
     };

     // Handle Submission of Reschedule Request
     const handleRescheduleSubmit = useCallback(async () => {
         if (!reschedulingBooking || !newSelectedDate || !newSelectedSlot) {
             setRescheduleStatus({ message: 'Please select a new date and time slot.', type: 'error' }); return;
         }
         const formattedDate = formatDateForAPI(newSelectedDate);
         console.log(`Submitting reschedule for Booking ${reschedulingBooking.booking_id} to ${formattedDate} ${newSelectedSlot.time}`);
         setIsSubmittingReschedule(true);
         setRescheduleStatus({ message: 'Submitting...', type: 'info' });

         try {
             const response = await fetch(`/api/admin/bookings/${reschedulingBooking.booking_id}/reschedule`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     newDate: formattedDate,
                     newTime: newSelectedSlot.time
                 })
             });
             const result = await response.json();
             if (!response.ok) throw new Error(result.error || 'Could not reschedule booking.');

             setRescheduleStatus({ message: result.message || 'Booking rescheduled successfully!', type: 'success' });
             setTimeout(() => {
                  handleCloseRescheduleModal();
                  fetchBookings(currentPage, limit, activeSearchTerm); // Refresh list
              }, 1500);

         } catch (err: any) {
             console.error("Reschedule failed:", err);
             setRescheduleStatus({ message: err.message || "Could not reschedule booking.", type: 'error' });
             setIsSubmittingReschedule(false); // Allow retry
         }
      }, [reschedulingBooking, newSelectedDate, newSelectedSlot, formatDateForAPI, handleCloseRescheduleModal, fetchBookings, currentPage, limit, activeSearchTerm]);


    // --- Render Logic ---
    return (
        <div style={styles.page}>
            <h2 style={styles.heading}>Booking Management</h2>

            {/* Search Controls */}
            <div style={styles.searchControls}>
                <input
                    type="text"
                    placeholder="Search by Client, Service, Staff, Status, ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                    style={styles.input}
                    aria-label="Search Bookings"
                    disabled={isLoading}
                />
                <button onClick={handleSearchSubmit} style={{...styles.button, ...styles.buttonPrimary}} disabled={isLoading}>Search</button>
                {(searchTerm || activeSearchTerm) && (
                    <button onClick={handleClearSearch} style={{...styles.button, ...styles.buttonSecondary}} disabled={isLoading}>Clear</button>
                )}
            </div>

            {/* Status Messages */}
            {error && <p style={styles.feedbackError}>Error: {error}</p>}

            {/* Bookings Table */}
            <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                             {/* Adjust columns as needed */}
                             <th style={styles.th}>ID</th>
                             <th style={styles.th}>Client</th>
                             <th style={styles.th}>Service</th>
                             <th style={styles.th}>Staff</th>
                             <th style={styles.th}>Time (Local)</th>
                             <th style={styles.th}>Status</th>
                             <th style={styles.th}>GCal</th>
                             <th style={styles.th}>Actions</th>
                         </tr>
                    </thead>
                    <tbody>
                        {isLoading && bookings.length === 0 && ( <tr><td colSpan={8}><p style={styles.loadingMessage}>Loading bookings...</p></td></tr> )}
                         {!isLoading && !error && bookings.length === 0 && ( <tr><td colSpan={8}>No bookings found{activeSearchTerm ? ` for "${activeSearchTerm}"` : ''}.</td></tr> )}
                         {!error && bookings.map(booking => {
                             const isCurrentInlineCancelling = isCancellingInline === booking.booking_id;
                             const canCancel = ['confirmed', 'scheduled'].includes(booking.status);
                             const canReschedule = ['confirmed', 'scheduled'].includes(booking.status);
                             return (
                                 <tr key={booking.booking_id}>
                                     <td style={styles.td}>{booking.booking_id}</td>
                                     <td style={styles.td}>{booking.client_name}<br /><small>{booking.client_email || 'N/A'}</small></td>
                                     <td style={styles.td}>{booking.service_name}</td>
                                     <td style={styles.td}>{booking.staff_name}</td>
                                     <td style={styles.td}>{formatDateTime(booking.booking_start_time)}</td>
                                     <td style={styles.td}><span style={styles.statusBadge(booking.status)}>{booking.status}</span></td>
                                     <td style={styles.td}>{booking.google_event_id ? <span style={styles.statusOk}>Yes</span> : <span style={styles.statusNotOk}>No</span>}</td>
                                     <td style={{...styles.td, ...styles.actionCell}}>
                                         <button onClick={() => handleViewDetails(booking)} style={{...styles.button, ...styles.buttonSecondary}} disabled={!!isCancellingInline || isSubmittingReschedule}>View</button>
                                         <button onClick={() => handleCancelBooking(booking.booking_id, booking.status, 'inline')} style={{...styles.button, ...styles.buttonDanger}} disabled={!canCancel || isCurrentInlineCancelling || isSubmittingReschedule} title={!canCancel ? `Cannot Cancel: Status is ${booking.status}` : 'Cancel'}> {isCurrentInlineCancelling ? '...' : 'Cancel'} </button>
                                         <button onClick={() => handleOpenRescheduleModal(booking)} style={{...styles.button, ...styles.buttonPrimary}} disabled={!canReschedule || !!isCancellingInline || isSubmittingReschedule} title={!canReschedule ? `Cannot Reschedule: Status is ${booking.status}` : 'Reschedule'}> Reschedule </button>
                                     </td>
                                 </tr>
                             );
                         })}
                     </tbody>
                 </table>
             </div>

             {/* Pagination Controls */}
             {totalBookings > 0 && totalPages > 1 && (
                 <div style={styles.paginationControls}>
                     <button onClick={handlePreviousPage} disabled={currentPage <= 1 || isLoading} style={{...styles.button, ...styles.buttonSecondary}}> Previous </button>
                     <span> Page {currentPage} of {totalPages} (Total: {totalBookings}) </span>
                     <button onClick={handleNextPage} disabled={currentPage >= totalPages || isLoading} style={{...styles.button, ...styles.buttonSecondary}}> Next </button>
                 </div>
             )}


            {/* Details Modal */}
             {isDetailsModalOpen && selectedBookingForDetails && (
                 <div style={styles.modalOverlay} onClick={handleCloseDetailsModal}>
                     <div style={{...styles.modalContent, ...styles.modalWide}} onClick={e => e.stopPropagation()}> {/* Prevent closing when clicking inside */}
                         <button onClick={handleCloseDetailsModal} style={styles.modalCloseButton} disabled={isCancellingFromDetails}>×</button>
                         <h3 style={styles.modalTitle}>Booking Details (ID: {selectedBookingForDetails.booking_id})</h3>

                         {/* Modal Content Sections */}
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                             <div style={styles.modalSection}>
                                 <h4 style={styles.modalSectionTitle}>Client & Contact</h4>
                                 <p><strong>Name:</strong> {selectedBookingForDetails.client_name || 'N/A'}</p>
                                 <p><strong>Email:</strong> {selectedBookingForDetails.client_email || 'N/A'}</p>
                                 <p><strong>Phone:</strong> {selectedBookingForDetails.client_phone || 'N/A'}</p>
                                 {/* <p><strong>Customer ID:</strong> {selectedBookingForDetails.customer_id || 'N/A'}</p> */}
                             </div>
                             <div style={styles.modalSection}>
                                 <h4 style={styles.modalSectionTitle}>Appointment Info</h4>
                                 <p><strong>Service:</strong> {selectedBookingForDetails.service_name || 'N/A'}</p>
                                 <p><strong>Staff:</strong> {selectedBookingForDetails.staff_name || 'N/A'}</p>
                                 <p><strong>Time:</strong> {formatDateTime(selectedBookingForDetails.booking_start_time)}</p>
                                 <p><strong>Status:</strong> <span style={styles.statusBadge(selectedBookingForDetails.status)}>{selectedBookingForDetails.status}</span></p>
                             </div>
                             <div style={{...styles.modalSection, gridColumn: '1 / -1'}}>
                                <h4 style={styles.modalSectionTitle}>Notes</h4>
                                <pre style={styles.modalNotes}>{selectedBookingForDetails.notes || '(No notes provided)'}</pre>
                             </div>
                             <div style={{...styles.modalSection, ...styles.modalSectionLast, gridColumn: '1 / -1'}}>
                                 <h4 style={styles.modalSectionTitle}>System Info</h4>
                                 <p><small>Created: {formatDateTime(selectedBookingForDetails.created_at)} | Updated: {formatDateTime(selectedBookingForDetails.updated_at)} | Timezone: {selectedBookingForDetails.booking_timezone || 'N/A'} | GCal ID: {selectedBookingForDetails.google_event_id || 'N/A'}</small></p>
                             </div>
                         </div>

                         {/* Modal Actions */}
                         <div style={styles.modalActions}>
                             {cancelErrorInDetails && <p style={styles.feedbackError}>{cancelErrorInDetails}</p>}
                             <button
                                 onClick={() => handleCancelBooking(selectedBookingForDetails.booking_id, selectedBookingForDetails.status, 'modal')}
                                 style={{...styles.button, ...styles.buttonDanger}}
                                 disabled={isCancellingFromDetails || !['confirmed', 'scheduled'].includes(selectedBookingForDetails.status)}
                                 title={!['confirmed', 'scheduled'].includes(selectedBookingForDetails.status) ? `Cannot cancel: Status is ${selectedBookingForDetails.status}` : 'Cancel this booking'}
                             >
                                 {isCancellingFromDetails ? 'Cancelling...' : 'Cancel Booking'}
                             </button>
                             <button onClick={handleCloseDetailsModal} style={{...styles.button, ...styles.buttonSecondary}} disabled={isCancellingFromDetails}>Close</button>
                         </div>
                     </div>
                 </div>
             )}


             {/* Reschedule Modal */}
            {isRescheduleModalOpen && reschedulingBooking && (
                <div style={styles.modalOverlay} onClick={handleCloseRescheduleModal}>
                    <div style={{...styles.modalContent, ...styles.modalWide}} onClick={e => e.stopPropagation()}>
                         <button onClick={handleCloseRescheduleModal} style={styles.modalCloseButton} disabled={isSubmittingReschedule}>×</button>
                         <h3 style={styles.modalTitle}>Reschedule Booking ID: {reschedulingBooking.booking_id}</h3>

                         <div style={styles.modalSection}>
                             <h4 style={styles.modalSectionTitle}>Current Appointment</h4>
                             <p><strong>Service:</strong> {reschedulingBooking.service_name}</p>
                             <p><strong>Staff:</strong> {reschedulingBooking.staff_name}</p>
                             <p><strong>Time:</strong> {formatDateTime(reschedulingBooking.booking_start_time)}</p>
                         </div>

                         {/* New Date Picker */}
                         <div style={styles.formGroup}>
                             <label htmlFor="new-date-select" style={styles.label}>Select New Date:</label>
                             <DatePicker
                                id="new-date-select"
                                selected={newSelectedDate}
                                onChange={handleNewDateChange}
                                minDate={new Date()}
                                dateFormat="yyyy-MM-dd"
                                placeholderText="Select new date"
                                className="form-input" // Use class for styling
                                wrapperClassName="date-picker-wrapper" // Apply styles to wrapper
                                disabled={isSubmittingReschedule || isNewSlotsLoading}
                                aria-label="Select new date for rescheduling"
                             />
                         </div>

                         {/* New Slot Selector */}
                         {newSelectedDate && (
                             <div style={{...styles.formGroup, marginTop: '15px' }}>
                                 <label style={styles.label}>Select New Time Slot for {formatDateForAPI(newSelectedDate)}:</label>
                                 {isNewSlotsLoading && <p style={styles.loadingMessage}>Loading available slots...</p>}
                                 {newSlotsError && <p style={styles.feedbackError}>Error: {newSlotsError}</p>}
                                 {!isNewSlotsLoading && !newSlotsError && newAvailableSlots.length === 0 && <p>No available slots found for this date.</p>}
                                 {!isNewSlotsLoading && !newSlotsError && newAvailableSlots.length > 0 && (
                                     <div style={styles.slotsContainer} role="radiogroup">
                                         {newAvailableSlots.map((slot, index) => (
                                             <button
                                                key={`${slot.time}-${slot.staffId}-${index}`}
                                                onClick={() => handleNewSlotSelect(slot)}
                                                style={{
                                                    ...styles.slotButton,
                                                    ...(newSelectedSlot?.time === slot.time ? styles.slotButtonSelected : {}),
                                                    ...(isSubmittingReschedule ? styles.buttonDisabled : {})
                                                }}
                                                role="radio"
                                                aria-checked={newSelectedSlot?.time === slot.time}
                                                disabled={isSubmittingReschedule}
                                             >
                                                {slot.time}
                                              </button>
                                         ))}
                                     </div>
                                 )}
                             </div>
                         )}

                         {/* Reschedule Actions & Feedback */}
                         <div style={styles.modalActions}>
                            {/* Feedback Area */}
                            <div style={{ flexGrow: 1, textAlign: 'left' }}>
                                {rescheduleStatus.message && (
                                    <p style={{
                                        ...(rescheduleStatus.type === 'success' ? styles.feedbackSuccess : rescheduleStatus.type === 'error' ? styles.feedbackError : styles.feedbackInfo),
                                        display: 'inline-block', padding: '5px 10px', margin: 0
                                    }}>
                                        {rescheduleStatus.type === 'info' && <span style={styles.spinnerInline}></span>} {rescheduleStatus.message}
                                    </p>
                                )}
                            </div>
                             <button
                                onClick={handleRescheduleSubmit}
                                style={{...styles.button, ...styles.buttonPrimary}}
                                disabled={!newSelectedDate || !newSelectedSlot || isSubmittingReschedule || rescheduleStatus.type === 'success' || isNewSlotsLoading}
                            >
                                {isSubmittingReschedule ? 'Rescheduling...' : 'Confirm Reschedule'}
                             </button>
                             <button
                                onClick={handleCloseRescheduleModal}
                                style={{...styles.button, ...styles.buttonSecondary}}
                                disabled={isSubmittingReschedule}
                            >
                                Cancel
                             </button>
                         </div>
                    </div>
                </div>
            )}

        </div> // End page div
    );
}