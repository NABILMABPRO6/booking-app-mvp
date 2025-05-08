// src/app/admin/staff/page.tsx
'use client';

import React, { useState, useEffect, useCallback, FormEvent, ChangeEvent } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link'; // Import Link if needed within modal (e.g., GCal connect might redirect)

// --- Type Definitions ---
interface StaffMember {
    staff_id: number;
    name: string;
    email: string | null;
    phone_number: string | null;
    role: 'admin' | 'manager' | 'staff';
    is_active: boolean;
    google_calendar_id: string | null;
    is_google_connected: boolean;
}
interface StatusMessage {
    message: string | null;
    type: 'success' | 'error' | 'info' | null; // Added 'info' type
}
interface Service { // Needed for assignment section
    service_id: number;
    name: string;
    duration_minutes: number;
}
interface WorkingHoursData { // For fetching/saving hours
    [dayKey: string]: { start_time: string; end_time: string } | null;
}
interface WorkingHoursDayState { // For managing state in the form
    isActive: boolean;
    start_time: string;
    end_time: string;
}
interface WorkingHoursFormState { // For managing state in the form
    [dayId: string]: WorkingHoursDayState;
}

// --- Placeholder for Staff Calendar View Component ---
// We'll create this component separately later
function StaffCalendarView({ staffId }: { staffId: number }) {
    return (
        <div style={{ border: '1px dashed blue', padding: '10px', marginTop: '15px', minHeight: '200px' }}>
            <h4>Staff Calendar View Placeholder</h4>
            <p>Calendar content for Staff ID: {staffId} will be loaded here.</p>
            {/* TODO: Implement actual calendar fetching and display */}
        </div>
    );
}


// --- Styles ---
const styles = { // Keep or replace with your styling solution
    page: { padding: '20px', fontFamily: 'sans-serif' },
    heading: { marginBottom: '20px' },
    addForm: { marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: '500' },
    input: { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as 'border-box' },
    select: { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as 'border-box' },
    checkboxGroup: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' },
    button: { padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px', fontSize: '0.9em' },
    buttonSuccess: { backgroundColor: '#28a745', color: 'white' },
    buttonDanger: { backgroundColor: '#dc3545', color: 'white' },
    buttonPrimary: { backgroundColor: '#007bff', color: 'white' },
    buttonSecondary: { backgroundColor: '#6c757d', color: 'white' },
    buttonDisabled: { backgroundColor: '#aaa', cursor: 'not-allowed' },
    tableContainer: { overflowX: 'auto' as 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' as 'collapse', marginTop: '20px' },
    th: { border: '1px solid #ddd', padding: '10px', textAlign: 'left' as 'left', backgroundColor: '#f2f2f2' },
    td: { border: '1px solid #ddd', padding: '10px', verticalAlign: 'middle' as 'middle' },
    actionCell: { whiteSpace: 'nowrap' as 'nowrap' },
    feedback: { padding: '10px', borderRadius: '4px', margin: '10px 0', textAlign: 'center' as 'center', fontSize: '0.9em' },
    feedbackSuccess: { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' },
    feedbackError: { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' },
    feedbackInfo: { backgroundColor: '#d1ecf1', color: '#0c5460', border: '1px solid #bee5eb' },
    loadingMessage: { fontStyle: 'italic' as 'italic', color: '#555' },
    errorMessage: { color: 'red' },
    statusOk: { color: 'green', fontWeight: 'bold' },
    statusNotOk: { color: 'red' },
    roleBadge: (role: string) => ({ /* ... */ }),
    // --- Modal Styles ---
    modalOverlay: { position: 'fixed' as 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 1000, overflowY: 'auto' as 'auto', padding: '30px 10px' },
    modalContent: { backgroundColor: 'white', padding: '20px 30px 30px 30px', borderRadius: '8px', width: '95%', maxWidth: '900px', position: 'relative' as 'relative', margin: 'auto 0' }, // Allow vertical margin auto
    modalCloseButton: { position: 'absolute' as 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#888', lineHeight: 1 },
    modalTitle: { marginTop: '0', marginBottom: '25px' },
    modalSectionsContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '25px' }, // Responsive columns
    modalSection: { border: '1px solid #eee', padding: '15px', borderRadius: '5px' },
    modalSectionTitle: { marginTop: '0', marginBottom: '15px', fontSize: '1.1em', borderBottom: '1px solid #eee', paddingBottom: '8px' },
    modalFullWidthSection: { gridColumn: '1 / -1' }, // Span full width if needed
    modalActions: { marginTop: '25px', textAlign: 'right' as 'right', borderTop: '1px solid #eee', paddingTop: '20px' },
    workingHoursRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
    dayLabel: { width: '80px', textAlign: 'right' as 'right', fontSize: '0.9em' },
    timeInput: { padding: '5px', width: '90px' },
    assignmentRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', fontSize: '0.9em' },
    spinnerInline: { display: 'inline-block', width: '1em', height: '1em', border: '2px solid #ccc', borderTopColor: '#333', borderRadius: '50%', animation: 'spin 1s linear infinite', marginLeft: '5px' }, // Basic spinner
     // Add keyframes for spinner animation in a global CSS file or styled-components
    // @keyframes spin { to { transform: rotate(360deg); } }
};

// --- Helper Functions ---
const initializeWorkingHoursState = (): WorkingHoursFormState => {
    const hours: WorkingHoursFormState = {};
    for (let i = 1; i <= 7; i++) {
        hours[String(i)] = { isActive: false, start_time: '09:00', end_time: '17:00' };
    }
    return hours;
};

// --- Component ---
export default function StaffManagementPage() {
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    // --- Existing State ---
    const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newStaffName, setNewStaffName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffPhone, setNewStaffPhone] = useState('');
    const [newStaffRole, setNewStaffRole] = useState<'staff' | 'manager' | 'admin'>('staff');
    const [newStaffPassword, setNewStaffPassword] = useState('');
    const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
    const [addStatus, setAddStatus] = useState<StatusMessage>({ message: null, type: null });
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [deleteStatus, setDeleteStatus] = useState<StatusMessage>({ message: null, type: null });

    // --- New State for Edit Modal ---
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
    // Edit Details
    const [editStaffName, setEditStaffName] = useState('');
    const [editStaffEmail, setEditStaffEmail] = useState('');
    const [editStaffPhone, setEditStaffPhone] = useState('');
    const [editStaffRole, setEditStaffRole] = useState<'staff' | 'manager' | 'admin'>('staff');
    const [editStaffPassword, setEditStaffPassword] = useState(''); // For reset
    const [editStaffIsActive, setEditStaffIsActive] = useState(true);
    const [isSubmittingDetails, setIsSubmittingDetails] = useState(false);
    const [editDetailsStatus, setEditDetailsStatus] = useState<StatusMessage>({ message: null, type: null });
    // Google Calendar
    const [googleAuthFeedback, setGoogleAuthFeedback] = useState<StatusMessage>({ message: null, type: null });
    // Services
    const [allServices, setAllServices] = useState<Service[]>([]);
    const [assignedServiceIds, setAssignedServiceIds] = useState<Set<number>>(new Set());
    const [isLoadingModalData, setIsLoadingModalData] = useState(false); // Loading state specifically for modal content
    const [assignmentChangeInProgress, setAssignmentChangeInProgress] = useState<number | null>(null); // Track which assignment is being updated
    const [assignmentStatus, setAssignmentStatus] = useState<StatusMessage>({ message: null, type: null });
    // Working Hours
    const [editWorkingHours, setEditWorkingHours] = useState<WorkingHoursFormState>(initializeWorkingHoursState());
    const [isSubmittingWorkingHours, setIsSubmittingWorkingHours] = useState(false);
    const [workingHoursStatus, setWorkingHoursStatus] = useState<StatusMessage>({ message: null, type: null });


    // --- Role Checks ---
    const isAdmin = userRole === 'admin';
    const isManager = userRole === 'manager';
    const canManageStaff = isAdmin || isManager;
    const canEditStaffDetails = isAdmin; // Only admin can edit details/role/password/active
    const canManageAssignments = isAdmin || isManager;
    const canManageWorkingHours = isAdmin || isManager;
    const canManageGCal = isAdmin;

    // --- Data Fetching Callbacks (Main List, Modal Data) ---
    const fetchStaff = useCallback(async () => { /* ... (same as before) ... */
         console.log('Fetching staff...');
         setIsLoading(true); setError(null);
         setDeleteStatus({ message: null, type: null });
         setAddStatus(prev => prev.type === 'success' ? prev : { message: null, type: null });
         try {
             const response = await fetch('/api/admin/staff');
             if (!response.ok) throw new Error('Failed to fetch staff');
             const data: StaffMember[] = await response.json();
             setStaffMembers(data);
         } catch (err: any) {
             console.error("Error fetching staff:", err); setError(err.message); setStaffMembers([]);
         } finally { setIsLoading(false); }
     }, []);

    useEffect(() => { fetchStaff(); }, [fetchStaff]);

     const fetchModalData = useCallback(async (staffId: number) => {
         console.log(`Fetching modal data for staff ${staffId}...`);
         setIsLoadingModalData(true);
         setAssignmentStatus({ message: null, type: null }); // Clear status on load
         setWorkingHoursStatus({ message: null, type: null });
         setEditDetailsStatus({ message: null, type: null });
         setGoogleAuthFeedback({ message: null, type: null });

         try {
             const [servicesRes, assignmentsRes, workingHoursRes] = await Promise.all([
                 fetch('/api/services'), // Fetch all available services (public endpoint is fine)
                 fetch(`/api/admin/staff/${staffId}/services`), // Fetch assigned services
                 fetch(`/api/admin/staff/${staffId}/working-hours`), // Fetch working hours
             ]);

             if (!servicesRes.ok || !assignmentsRes.ok || !workingHoursRes.ok) {
                 throw new Error('Failed to load all modal data.');
             }

             const servicesData: Service[] = await servicesRes.json();
             const assignmentsData: { service_id: number }[] = await assignmentsRes.json();
             const workingHoursData: WorkingHoursData = await workingHoursRes.json();

             setAllServices(servicesData);
             setAssignedServiceIds(new Set(assignmentsData.map(s => s.service_id)));

             // Process fetched working hours into form state
             const currentHoursState = initializeWorkingHoursState();
             Object.keys(workingHoursData).forEach(dayKey => {
                 const dayData = workingHoursData[dayKey];
                 if (dayData) {
                     currentHoursState[dayKey] = {
                         isActive: true,
                         start_time: dayData.start_time,
                         end_time: dayData.end_time,
                     };
                 } else {
                      currentHoursState[dayKey] = { isActive: false, start_time: '09:00', end_time: '17:00' };
                 }
             });
             setEditWorkingHours(currentHoursState);
             console.log('Modal data loaded successfully.');

         } catch (err: any) {
             console.error("Error fetching modal data:", err);
             setEditDetailsStatus({ message: `Error loading details: ${err.message}`, type: 'error' });
             // Reset states on error
             setAllServices([]); setAssignedServiceIds(new Set()); setEditWorkingHours(initializeWorkingHoursState());
         } finally {
             setIsLoadingModalData(false);
         }
     }, []);

    // --- Add/Deactivate Handlers (same as before) ---
    const handleAddStaff = useCallback(async (event: FormEvent) => { /* ... (same as before) ... */
         event.preventDefault();
         if (!isAdmin) return;
         // Validation...
         if (!newStaffName.trim()) { setAddStatus({ message: 'Name is required.', type: 'error' }); return; }
         if (['admin', 'manager'].includes(newStaffRole) && !newStaffPassword) { setAddStatus({ message: `Password required for role '${newStaffRole}'.`, type: 'error' }); return; }
         if (newStaffPassword && newStaffPassword.length < 8) { setAddStatus({ message: `Password must be at least 8 characters.`, type: 'error' }); return; }

         setIsSubmittingAdd(true); setAddStatus({ message: null, type: null }); setDeleteStatus({ message: null, type: null });
         const newStaffData = { name: newStaffName.trim(), email: newStaffEmail.trim() || null, phone_number: newStaffPhone.trim() || null, role: newStaffRole, password: (newStaffRole === 'admin' || newStaffRole === 'manager') ? newStaffPassword : null, is_active: true };
         try {
             const response = await fetch('/api/admin/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newStaffData) });
             const result = await response.json();
             if (!response.ok) throw new Error(result.error || 'Failed to add staff.');
             setAddStatus({ message: `Staff "${result.name}" added!`, type: 'success' });
             setNewStaffName(''); setNewStaffEmail(''); setNewStaffPhone(''); setNewStaffRole('staff'); setNewStaffPassword('');
             fetchStaff();
         } catch (err: any) { setAddStatus({ message: err.message, type: 'error' }); }
         finally { setIsSubmittingAdd(false); }
     }, [isAdmin, newStaffName, newStaffEmail, newStaffPhone, newStaffRole, newStaffPassword, fetchStaff]);

    const handleDeactivateStaff = useCallback(async (staffId: number, staffName: string) => { /* ... (same as before) ... */
         if (!isAdmin || session?.user?.id === String(staffId)) { alert("Cannot deactivate self or insufficient permissions."); return; }
         if (!window.confirm(`ADMIN ACTION: Deactivate "${staffName}" (ID: ${staffId})?`)) return;
         setDeletingId(staffId); setDeleteStatus({ message: null, type: null }); setAddStatus({ message: null, type: null });
         try {
             const response = await fetch(`/api/admin/staff/${staffId}`, { method: 'DELETE' });
             const result = await response.json();
             if (!response.ok) throw new Error(result.error || 'Failed to deactivate staff.');
             setDeleteStatus({ message: result.message, type: 'success' });
             fetchStaff();
             if (editingStaff?.staff_id === staffId) { setIsEditModalOpen(false); setEditingStaff(null); }
         } catch (err: any) { setDeleteStatus({ message: err.message, type: 'error' }); }
         finally { setDeletingId(null); }
     }, [isAdmin, session?.user?.id, editingStaff?.staff_id, fetchStaff]);


    // --- Modal Open/Close Handlers ---
     const handleOpenEditModal = useCallback((staff: StaffMember) => {
         if (!canManageStaff) return;
         setEditingStaff(staff); // Set the staff member being edited
         // Populate basic details form state
         setEditStaffName(staff.name);
         setEditStaffEmail(staff.email || '');
         setEditStaffPhone(staff.phone_number || '');
         setEditStaffRole(staff.role);
         setEditStaffIsActive(staff.is_active);
         setEditStaffPassword(''); // Clear password reset field
         // Clear all modal status messages
         setEditDetailsStatus({ message: null, type: null });
         setAssignmentStatus({ message: null, type: null });
         setWorkingHoursStatus({ message: null, type: null });
         setGoogleAuthFeedback({ message: null, type: null });
         // Fetch detailed data (services, hours)
         fetchModalData(staff.staff_id);
         setIsEditModalOpen(true); // Open the modal
     }, [canManageStaff, fetchModalData]); // Include fetchModalData dependency

     const handleCloseEditModal = useCallback(() => {
         setIsEditModalOpen(false);
         // Delay reset to allow modal fade out animation if any
         setTimeout(() => {
             setEditingStaff(null);
             setAllServices([]);
             setAssignedServiceIds(new Set());
             setEditWorkingHours(initializeWorkingHoursState());
             setIsLoadingModalData(false); // Ensure loading indicator resets
             // Optionally clear form fields too
             setEditStaffName(''); setEditStaffEmail(''); setEditStaffPhone(''); setEditStaffRole('staff'); setEditStaffPassword(''); setEditStaffIsActive(true);
         }, 300);
     }, []);

     // --- Modal Action Handlers ---

     // Update Staff Details
     const handleUpdateStaffDetails = async (event: FormEvent) => {
         event.preventDefault();
         if (!editingStaff || !canEditStaffDetails) return;
         // Validation...
         if (!editStaffName.trim()) { setEditDetailsStatus({ message: 'Name is required.', type: 'error' }); return; }
         if (editStaffPassword && editStaffPassword.length < 8) { setEditDetailsStatus({ message: 'New password must be at least 8 characters.', type: 'error' }); return; }


         setIsSubmittingDetails(true);
         setEditDetailsStatus({ message: 'Saving details...', type: 'info' });

         const updatedData: Partial<StaffMember & { password?: string }> = {
             name: editStaffName.trim(),
             email: editStaffEmail.trim() || null,
             phone_number: editStaffPhone.trim() || null,
             role: editStaffRole,
             is_active: editStaffIsActive,
             // Include password only if field is not empty
             ...(editStaffPassword && { password: editStaffPassword }),
         };

         try {
             const response = await fetch(`/api/admin/staff/${editingStaff.staff_id}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(updatedData),
             });
             const result = await response.json();
             if (!response.ok) throw new Error(result.error || 'Failed to update details.');

             setEditDetailsStatus({ message: "Staff details saved!", type: 'success' });
             setEditStaffPassword(''); // Clear password field after successful update
             // Update local state for immediate reflection in modal (optional)
             setEditingStaff(prev => prev ? { ...prev, ...result } : null);
             fetchStaff(); // Refresh the main list
             // Clear message after delay
             setTimeout(() => setEditDetailsStatus({ message: null, type: null }), 3000);

         } catch (err: any) {
             setEditDetailsStatus({ message: err.message, type: 'error' });
         } finally {
             setIsSubmittingDetails(false);
         }
     };

      // Update Service Assignment
      const handleAssignmentChange = async (serviceId: number, isChecked: boolean) => {
          if (!editingStaff || !canManageAssignments) return;
          setAssignmentChangeInProgress(serviceId);
          setAssignmentStatus({ message: 'Updating...', type: 'info' });

          const staffId = editingStaff.staff_id;
          const url = `/api/admin/staff/${staffId}/services${isChecked ? '' : '/' + serviceId}`;
          const method = isChecked ? 'POST' : 'DELETE';
          const body = isChecked ? JSON.stringify({ serviceId }) : null;

          try {
              const response = await fetch(url, {
                  method: method,
                  headers: isChecked ? { 'Content-Type': 'application/json' } : {},
                  body: body,
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || `Failed to ${isChecked ? 'assign' : 'unassign'} service.`);

              // Update local state for immediate UI feedback
              setAssignedServiceIds(prev => {
                  const newSet = new Set(prev);
                  if (isChecked) newSet.add(serviceId);
                  else newSet.delete(serviceId);
                  return newSet;
              });
              setAssignmentStatus({ message: `Assignment updated.`, type: 'success' });
              setTimeout(() => setAssignmentStatus({ message: null, type: null }), 2000);

          } catch (err: any) {
              setAssignmentStatus({ message: err.message, type: 'error' });
              // Optionally revert local state change on error
          } finally {
              setAssignmentChangeInProgress(null);
          }
      };

      // Update Working Hours
      const handleWorkingHoursChange = useCallback((dayId: string, field: keyof WorkingHoursDayState, value: string | boolean) => {
          setEditWorkingHours(prev => ({
              ...prev,
              [dayId]: { ...prev[dayId], [field]: value }
          }));
          setWorkingHoursStatus({ message: null, type: null }); // Clear status on change
      }, []);

      const handleUpdateWorkingHours = async () => {
           if (!editingStaff || !canManageWorkingHours) return;
           setIsSubmittingWorkingHours(true);
           setWorkingHoursStatus({ message: 'Saving schedule...', type: 'info' });

           // Prepare data in the format expected by the API
           const hoursToSave: WorkingHoursData = {};
           let validationError: string | null = null;
           for (const dayIdStr in editWorkingHours) {
               const dayId = parseInt(dayIdStr);
               if (isNaN(dayId)) continue;
               const dayState = editWorkingHours[dayIdStr];
               if (dayState.isActive) {
                   // Basic validation before sending
                   if (!dayState.start_time || !dayState.end_time) { validationError = `Missing time for day ${dayId}.`; break; }
                   if (timeToMinutes(dayState.end_time) <= timeToMinutes(dayState.start_time)) { validationError = `End time must be after start time for day ${dayId}.`; break; }
                   hoursToSave[dayIdStr] = { start_time: dayState.start_time, end_time: dayState.end_time };
               } else {
                   hoursToSave[dayIdStr] = null; // Explicitly send null for inactive days
               }
           }

           if (validationError) {
                setWorkingHoursStatus({ message: validationError, type: 'error' });
                setIsSubmittingWorkingHours(false);
                return;
           }

           try {
               const response = await fetch(`/api/admin/staff/${editingStaff.staff_id}/working-hours`, {
                   method: 'PUT',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ workingHours: hoursToSave }),
               });
               const result = await response.json(); // API returns updated hours map
               if (!response.ok) throw new Error(result.error || 'Failed to save working hours.');

               setWorkingHoursStatus({ message: "Schedule saved successfully!", type: 'success' });
               // Update local state with potentially formatted data from response if needed, or just rely on success message.
               // Example: setEditWorkingHours(processFetchedHours(result));
               setTimeout(() => setWorkingHoursStatus({ message: null, type: null }), 3000);

           } catch (err: any) {
               setWorkingHoursStatus({ message: err.message, type: 'error' });
           } finally {
               setIsSubmittingWorkingHours(false);
           }
       };

      // Google Calendar Connect/Disconnect (Initiates flow, backend handles callback)
      const handleConnectGoogleCalendar = (staffId: number) => {
           if (!isAdmin) return;
           setGoogleAuthFeedback({ message: 'Redirecting to Google...', type: 'info' });
           // In Next.js, directly navigating is simpler than relying on API response for URL
           window.location.href = `/api/auth/google/initiate/${staffId}`; // Use the specific initiation route we need to create next
      };

      const handleDisconnectGoogleCalendar = async (staffId: number) => {
           if (!isAdmin) return;
           if (!window.confirm("Are you sure you want to disconnect Google Calendar? This will remove the stored authorization.")) return;
           setGoogleAuthFeedback({ message: 'Disconnecting...', type: 'info' });
           try {
                const response = await fetch(`/api/auth/google/${staffId}`, { // Specific disconnect route
                    method: 'DELETE',
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Failed to disconnect.');

                setGoogleAuthFeedback({ message: result.message, type: 'success' });
                // Update staff list and potentially the editingStaff state if this staff was being edited
                fetchStaff();
                if (editingStaff?.staff_id === staffId) {
                     // Re-fetch modal data or just update connection status locally
                     setEditingStaff(prev => prev ? { ...prev, is_google_connected: false, google_calendar_id: null } : null);
                     // Might need to re-run fetchModalData if other GCal dependent things changed
                }
                setTimeout(() => setGoogleAuthFeedback({ message: null, type: null }), 4000);
           } catch (err: any) {
                setGoogleAuthFeedback({ message: err.message, type: 'error' });
           }
      };


    // --- Render Logic ---
    return (
        <div style={styles.page}>
            {/* ... (Add Form and Staff Table as before) ... */}
             <h2 style={styles.heading}>Manage Staff</h2>
             {/* Status Messages */}
             {/* ... Add/Delete Status ... */}
             {/* Add Staff Form (Admin Only) */}
             {/* ... Form JSX ... */}
             {/* Existing Staff Table */}
             {/* ... Table JSX ... */}


            {/* --- Edit Modal --- */}
            {isEditModalOpen && editingStaff && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <button onClick={handleCloseEditModal} style={styles.modalCloseButton} aria-label="Close edit dialog" disabled={isLoadingModalData || isSubmittingDetails || isSubmittingWorkingHours || !!assignmentChangeInProgress}>×</button>
                        <h3 style={styles.modalTitle}>{canEditStaffDetails ? 'Edit Staff' : 'View Staff Details'}: {editingStaff.name}</h3>

                        {isLoadingModalData && <p style={styles.loadingMessage}>Loading details...</p>}

                        {!isLoadingModalData && (
                             // Use CSS Grid for layout within modal
                             <div style={styles.modalSectionsContainer}>

                                {/* Section 1: Staff Details Form */}
                                <form onSubmit={handleUpdateStaffDetails} style={styles.modalSection}>
                                    <h4 style={styles.modalSectionTitle}>Staff Details { !canEditStaffDetails && '(View Only)' }</h4>
                                     {/* Detail Fields */}
                                     <div style={styles.formGroup}> <label style={styles.label} htmlFor={`edit-name-${editingStaff.staff_id}`}>Name*:</label> <input id={`edit-name-${editingStaff.staff_id}`} type="text" value={editStaffName} onChange={(e) => setEditStaffName(e.target.value)} required disabled={!canEditStaffDetails || isSubmittingDetails} style={styles.input} /> </div>
                                     <div style={styles.formGroup}> <label style={styles.label} htmlFor={`edit-email-${editingStaff.staff_id}`}>Email:</label> <input id={`edit-email-${editingStaff.staff_id}`} type="email" value={editStaffEmail} onChange={(e) => setEditStaffEmail(e.target.value)} disabled={!canEditStaffDetails || isSubmittingDetails} style={styles.input} /> </div>
                                     <div style={styles.formGroup}> <label style={styles.label} htmlFor={`edit-phone-${editingStaff.staff_id}`}>Phone:</label> <input id={`edit-phone-${editingStaff.staff_id}`} type="tel" value={editStaffPhone} onChange={(e) => setEditStaffPhone(e.target.value)} disabled={!canEditStaffDetails || isSubmittingDetails} style={styles.input} /> </div>
                                     <div style={styles.formGroup}><label style={styles.label} htmlFor={`edit-role-${editingStaff.staff_id}`}>Role:</label> <select id={`edit-role-${editingStaff.staff_id}`} value={editStaffRole} onChange={(e) => setEditStaffRole(e.target.value as typeof editStaffRole)} disabled={!canEditStaffDetails || isSubmittingDetails} style={styles.select}> <option value="staff">Staff</option> <option value="manager">Manager</option> <option value="admin">Admin</option> </select> </div>
                                     <div style={styles.formGroup}><label style={styles.label} htmlFor={`edit-pass-${editingStaff.staff_id}`}>Reset Password:</label> <input id={`edit-pass-${editingStaff.staff_id}`} type="password" value={editStaffPassword} onChange={(e) => setEditStaffPassword(e.target.value)} placeholder="Enter new password to change" autoComplete="new-password" disabled={!canEditStaffDetails || isSubmittingDetails} style={styles.input}/></div>
                                     <div style={{...styles.formGroup, ...styles.checkboxGroup}}> <label style={{...styles.label, marginBottom: 0}} htmlFor={`edit-active-${editingStaff.staff_id}`}>Active:</label> <input id={`edit-active-${editingStaff.staff_id}`} type="checkbox" checked={editStaffIsActive} onChange={(e) => setEditStaffIsActive(e.target.checked)} disabled={!canEditStaffDetails || isSubmittingDetails} /> </div>
                                     {/* Save Button & Status */}
                                     {canEditStaffDetails && ( <button type="submit" disabled={isSubmittingDetails} style={{...styles.button, ...styles.buttonPrimary}}> {isSubmittingDetails ? 'Saving...' : 'Save Details'} </button> )}
                                     {editDetailsStatus.message && <p style={{...styles.feedback, ...(editDetailsStatus.type === 'success' ? styles.feedbackSuccess : editDetailsStatus.type === 'error' ? styles.feedbackError : styles.feedbackInfo)}}>{editDetailsStatus.message}</p>}
                                 </form>

                                {/* Section 2: Google Calendar */}
                                <div style={styles.modalSection}>
                                     <h4 style={styles.modalSectionTitle}>Google Calendar</h4>
                                     <p>Status: {editingStaff.is_google_connected ? <span style={styles.statusOk}>Connected</span> : <span style={styles.statusNotOk}>Not Connected</span>}</p>
                                     {editingStaff.is_google_connected && editingStaff.google_calendar_id && <p style={{fontSize: '0.8em'}}>Using Calendar: {editingStaff.google_calendar_id}</p>}
                                     {canManageGCal && (
                                         editingStaff.is_google_connected
                                         ? ( <button type="button" onClick={() => handleDisconnectGoogleCalendar(editingStaff.staff_id)} style={{...styles.button, ...styles.buttonDanger}}> Disconnect </button> )
                                         : ( <button type="button" onClick={() => handleConnectGoogleCalendar(editingStaff.staff_id)} style={{...styles.button, ...styles.buttonSuccess}}> Connect </button> )
                                     )}
                                      {googleAuthFeedback.message && <p style={{...styles.feedback, ...(googleAuthFeedback.type === 'success' ? styles.feedbackSuccess : googleAuthFeedback.type === 'error' ? styles.feedbackError : styles.feedbackInfo)}}>{googleAuthFeedback.message}</p>}
                                 </div>

                                 {/* Section 3: Working Hours */}
                                 <div style={styles.modalSection}>
                                      <h4 style={styles.modalSectionTitle}>Default Weekly Hours</h4>
                                       {Object.keys(editWorkingHours).sort((a,b) => parseInt(a) - parseInt(b)).map(dayId => {
                                           const dayState = editWorkingHours[dayId];
                                           const dayName = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][parseInt(dayId) - 1];
                                           return (
                                               <div key={dayId} style={styles.workingHoursRow}>
                                                   <input type="checkbox" id={`day-active-${dayId}`} checked={dayState.isActive} onChange={(e) => handleWorkingHoursChange(dayId, 'isActive', e.target.checked)} disabled={!canManageWorkingHours || isSubmittingWorkingHours} />
                                                   <label htmlFor={`day-active-${dayId}`} style={styles.dayLabel}>{dayName}:</label>
                                                   <input style={styles.timeInput} type="time" value={dayState.start_time} onChange={(e) => handleWorkingHoursChange(dayId, 'start_time', e.target.value)} disabled={!dayState.isActive || !canManageWorkingHours || isSubmittingWorkingHours} />
                                                   <span>-</span>
                                                   <input style={styles.timeInput} type="time" value={dayState.end_time} onChange={(e) => handleWorkingHoursChange(dayId, 'end_time', e.target.value)} disabled={!dayState.isActive || !canManageWorkingHours || isSubmittingWorkingHours} />
                                               </div>
                                           );
                                       })}
                                       {canManageWorkingHours && ( <button type="button" onClick={handleUpdateWorkingHours} disabled={isSubmittingWorkingHours} style={{...styles.button, ...styles.buttonPrimary, marginTop: '10px'}}> {isSubmittingWorkingHours ? 'Saving...' : 'Save Schedule'} </button> )}
                                        {workingHoursStatus.message && <p style={{...styles.feedback, ...(workingHoursStatus.type === 'success' ? styles.feedbackSuccess : workingHoursStatus.type === 'error' ? styles.feedbackError : styles.feedbackInfo)}}>{workingHoursStatus.message}</p>}
                                   </div>

                                   {/* Section 4: Assigned Services */}
                                   <div style={styles.modalSection}>
                                       <h4 style={styles.modalSectionTitle}>Assigned Services</h4>
                                       {allServices.length === 0 && <p style={styles.loadingMessage}>No services available.</p>}
                                       {allServices.map(service => (
                                           <div key={service.service_id} style={styles.assignmentRow}>
                                               <input type="checkbox" id={`service-assign-${service.service_id}`} checked={assignedServiceIds.has(service.service_id)} onChange={(e) => handleAssignmentChange(service.service_id, e.target.checked)} disabled={!canManageAssignments || assignmentChangeInProgress === service.service_id} />
                                               <label htmlFor={`service-assign-${service.service_id}`}>
                                                   {service.name} ({service.duration_minutes} min)
                                                   {assignmentChangeInProgress === service.service_id && <span style={styles.spinnerInline}></span>}
                                               </label>
                                           </div>
                                       ))}
                                        {assignmentStatus.message && <p style={{...styles.feedback, ...(assignmentStatus.type === 'success' ? styles.feedbackSuccess : assignmentStatus.type === 'error' ? styles.feedbackError : styles.feedbackInfo)}}>{assignmentStatus.message}</p>}
                                   </div>

                                  {/* Section 5: Calendar View (Placeholder) */}
                                   {canManageStaff && ( // Only show calendar view if user can manage staff
                                       <div style={{...styles.modalSection, ...styles.modalFullWidthSection}}>
                                           <StaffCalendarView staffId={editingStaff.staff_id} />
                                       </div>
                                   )}

                             </div> // End modalSectionsContainer
                        )}

                        {/* Modal Footer/Actions */}
                        <div style={styles.modalActions}>
                             <button type="button" onClick={handleCloseEditModal} style={{...styles.button, ...styles.buttonSecondary}} disabled={isSubmittingDetails || isSubmittingWorkingHours || isLoadingModalData || !!assignmentChangeInProgress}> Close </button>
                         </div>
                    </div>
                </div>
            )}


        </div> // End page div
    );
}