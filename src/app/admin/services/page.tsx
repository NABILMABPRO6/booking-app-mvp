// src/app/admin/services/page.tsx
'use client'; // Required for hooks and interactivity

import React, { useState, useEffect, useCallback, ChangeEvent, FormEvent } from 'react';
import { useSession } from 'next-auth/react'; // To check user role

// Define the Service type based on expected data
interface Service {
    service_id: number;
    name: string;
    duration_minutes: number;
    price: string | number | null; // Can be string from DB, handle number conversion
    description: string | null;
    is_active: boolean;
}

// Define status message type
interface StatusMessage {
    message: string | null;
    type: 'success' | 'error' | null;
}

// Basic inline styles (replace with Tailwind/CSS Modules)
const styles = {
    page: { padding: '20px', fontFamily: 'sans-serif' },
    heading: { marginBottom: '20px' },
    addForm: { marginBottom: '30px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' },
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '5px', fontWeight: '500' },
    input: { width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as 'border-box' },
    textarea: { width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', minHeight: '60px', boxSizing: 'border-box' as 'border-box' },
    checkboxGroup: { display: 'flex', alignItems: 'center', gap: '10px' },
    button: { padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' },
    buttonPrimary: { backgroundColor: '#007bff', color: 'white' },
    buttonSecondary: { backgroundColor: '#6c757d', color: 'white' },
    buttonSuccess: { backgroundColor: '#28a745', color: 'white' },
    buttonDanger: { backgroundColor: '#dc3545', color: 'white' },
    buttonDisabled: { backgroundColor: '#aaa', cursor: 'not-allowed' },
    tableContainer: { overflowX: 'auto' as 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' as 'collapse', marginTop: '20px' },
    th: { border: '1px solid #ddd', padding: '10px', textAlign: 'left' as 'left', backgroundColor: '#f2f2f2' },
    td: { border: '1px solid #ddd', padding: '10px', verticalAlign: 'top' as 'top' },
    actionCell: { whiteSpace: 'nowrap' as 'nowrap' },
    feedback: { padding: '10px', borderRadius: '4px', margin: '10px 0', textAlign: 'center' as 'center' },
    feedbackSuccess: { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' },
    feedbackError: { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' },
    modalOverlay: { position: 'fixed' as 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '500px', position: 'relative' as 'relative' },
    modalCloseButton: { position: 'absolute' as 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#aaa' },
    modalActions: { marginTop: '20px', textAlign: 'right' as 'right' },
    loadingMessage: { fontStyle: 'italic' as 'italic', color: '#555' },
    errorMessage: { color: 'red' },
};

export default function ServiceManagementPage() {
    const { data: session } = useSession(); // Get session to check roles
    const userRole = session?.user?.role;

    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add Form State
    const [newServiceName, setNewServiceName] = useState('');
    const [newServiceDuration, setNewServiceDuration] = useState('');
    const [newServicePrice, setNewServicePrice] = useState('');
    const [newServiceDescription, setNewServiceDescription] = useState('');
    const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
    const [addStatus, setAddStatus] = useState<StatusMessage>({ message: null, type: null });

    // Delete State
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [deleteStatus, setDeleteStatus] = useState<StatusMessage>({ message: null, type: null });

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [editServiceName, setEditServiceName] = useState('');
    const [editServiceDuration, setEditServiceDuration] = useState('');
    const [editServicePrice, setEditServicePrice] = useState('');
    const [editServiceDescription, setEditServiceDescription] = useState('');
    const [editServiceIsActive, setEditServiceIsActive] = useState(true);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    const [editStatus, setEditStatus] = useState<StatusMessage>({ message: null, type: null });


    // --- Fetch Services ---
    const fetchServices = useCallback(async () => {
        console.log('Fetching services...');
        setIsLoading(true);
        setError(null);
        setDeleteStatus({ message: null, type: null }); // Clear delete status on refetch
        // Keep addStatus visible for a bit if it was success
        setAddStatus(prev => prev.type === 'success' ? prev : { message: null, type: null });

        try {
            const response = await fetch('/api/admin/services'); // Fetch from admin API
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Failed to fetch services: ${response.statusText}`);
            }
            const data: Service[] = await response.json();
            setServices(data);
        } catch (err: any) {
            console.error("Error fetching services:", err);
            setError(err.message || "Failed to load services.");
            setServices([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchServices();
    }, [fetchServices]);

    // Clear success message after a delay
    useEffect(() => {
        if (addStatus.type === 'success') {
            const timer = setTimeout(() => setAddStatus({ message: null, type: null }), 4000);
            return () => clearTimeout(timer);
        }
    }, [addStatus]);
     useEffect(() => {
        if (deleteStatus.type === 'success') {
            const timer = setTimeout(() => setDeleteStatus({ message: null, type: null }), 4000);
            return () => clearTimeout(timer);
        }
    }, [deleteStatus]);

    // --- Add Service Handler ---
    const handleAddService = async (event: FormEvent) => {
        event.preventDefault();
        setIsSubmittingAdd(true);
        setAddStatus({ message: null, type: null });
        setDeleteStatus({ message: null, type: null });

        // Basic validation
        if (!newServiceName.trim() || !newServiceDuration.trim()) {
            setAddStatus({ message: 'Name and Duration are required.', type: 'error' });
            setIsSubmittingAdd(false);
            return;
        }
        // More validation can be added here (numeric duration/price)

        const newServiceData = {
            name: newServiceName.trim(),
            duration_minutes: parseInt(newServiceDuration), // Ensure backend handles potential NaN
            price: newServicePrice.trim() === '' ? null : newServicePrice, // Send null if empty
            description: newServiceDescription.trim() || null,
            is_active: true // New services default to active
        };

        try {
            const response = await fetch('/api/admin/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newServiceData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to add service.');

            setAddStatus({ message: `Service "${result.name}" added successfully!`, type: 'success' });
            setNewServiceName(''); setNewServiceDuration(''); setNewServicePrice(''); setNewServiceDescription('');
            fetchServices(); // Refetch list

        } catch (err: any) {
            console.error("Failed to add service:", err);
            setAddStatus({ message: err.message || 'An unexpected error occurred.', type: 'error' });
        } finally {
            setIsSubmittingAdd(false);
        }
    };

    // --- Delete Service Handler (Admin Only) ---
    const handleDeleteService = async (serviceId: number, serviceName: string) => {
        if (userRole !== 'admin') return; // Double check role
        if (!window.confirm(`ADMIN ACTION: Are you sure you want to permanently delete "${serviceName}" (ID: ${serviceId})? This action cannot be undone and might fail if the service is in use.`)) return;

        setDeletingId(serviceId);
        setDeleteStatus({ message: null, type: null });
        setAddStatus({ message: null, type: null });

        try {
            const response = await fetch(`/api/admin/services/${serviceId}`, {
                method: 'DELETE',
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to delete service.');

            setDeleteStatus({ message: result.message || `Service "${serviceName}" deleted.`, type: 'success' });
            fetchServices(); // Refetch list

        } catch (err: any) {
            console.error(`Failed to delete service ${serviceId}:`, err);
            setDeleteStatus({ message: err.message || 'An unexpected error occurred during deletion.', type: 'error' });
        } finally {
            setDeletingId(null);
        }
    };

     // --- Edit Modal Functions ---
     const handleOpenEditModal = (service: Service) => {
         if (!['admin', 'manager'].includes(userRole ?? '')) return;
         setEditingService(service);
         setEditServiceName(service.name);
         setEditServiceDuration(String(service.duration_minutes));
         setEditServicePrice(service.price === null || service.price === undefined ? '' : String(service.price));
         setEditServiceDescription(service.description || '');
         setEditServiceIsActive(service.is_active);
         setEditStatus({ message: null, type: null }); // Clear previous modal errors
         setIsEditModalOpen(true);
     };

     const handleCloseEditModal = () => {
         setIsEditModalOpen(false);
         // Delay reset slightly for smoother transition
         setTimeout(() => {
             setEditingService(null);
             // Clear form fields maybe? Or rely on population in handleOpenEditModal
         }, 300);
     };

     // Handle updating the service
     const handleUpdateService = async (event: FormEvent) => {
         event.preventDefault();
         if (!editingService) return;
         setIsSubmittingEdit(true);
         setEditStatus({ message: null, type: null });
         setAddStatus({ message: null, type: null });
         setDeleteStatus({ message: null, type: null });

         // Basic Validation
        if (!editServiceName.trim() || !editServiceDuration.trim()) {
            setEditStatus({ message: 'Name and Duration are required.', type: 'error' });
            setIsSubmittingEdit(false);
            return;
        }

         const updatedData = {
             name: editServiceName.trim(),
             duration_minutes: parseInt(editServiceDuration),
             price: editServicePrice.trim() === '' ? null : editServicePrice,
             description: editServiceDescription.trim() || null,
             is_active: editServiceIsActive
         };

         try {
             const response = await fetch(`/api/admin/services/${editingService.service_id}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(updatedData),
             });
             const result = await response.json();
             if (!response.ok) throw new Error(result.error || 'Failed to update service.');

             setAddStatus({ message: `Service "${result.name}" updated successfully!`, type: 'success' });
             handleCloseEditModal();
             fetchServices(); // Refetch list

         } catch (err: any) {
             console.error(`Failed to update service ${editingService.service_id}:`, err);
             setEditStatus({ message: err.message || 'An unexpected error occurred.', type: 'error' });
         } finally {
             setIsSubmittingEdit(false);
         }
     };

    // Check roles for rendering UI elements
    const canAddOrEdit = ['admin', 'manager'].includes(userRole ?? '');
    const canDelete = userRole === 'admin';

    return (
        <div style={styles.page}>
            <h2 style={styles.heading}>Manage Services</h2>

             {/* Display global status messages */}
             {addStatus.message && ( <p style={{...styles.feedback, ...(addStatus.type === 'success' ? styles.feedbackSuccess : styles.feedbackError)}}>{addStatus.message}</p> )}
             {deleteStatus.message && ( <p style={{...styles.feedback, ...(deleteStatus.type === 'success' ? styles.feedbackSuccess : styles.feedbackError)}}>{deleteStatus.message}</p> )}

            {/* Add Service Form - Conditional */}
            {canAddOrEdit && (
                 <form onSubmit={handleAddService} style={styles.addForm}>
                     <h3>Add New Service</h3>
                      {/* Input fields for new service */}
                     <div style={styles.formGroup}>
                        <label htmlFor="serviceName" style={styles.label}>Name*:</label>
                        <input type="text" id="serviceName" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} required style={styles.input} />
                     </div>
                     <div style={styles.formGroup}>
                        <label htmlFor="serviceDuration" style={styles.label}>Duration* (min):</label>
                        <input type="number" id="serviceDuration" value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} required min="1" style={styles.input}/>
                     </div>
                     <div style={styles.formGroup}>
                        <label htmlFor="servicePrice" style={styles.label}>Price ($):</label>
                        <input type="number" id="servicePrice" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} min="0" step="0.01" placeholder="e.g., 25.50 (optional)" style={styles.input}/>
                     </div>
                     <div style={styles.formGroup}>
                        <label htmlFor="serviceDesc" style={styles.label}>Description:</label>
                        <textarea id="serviceDesc" value={newServiceDescription} onChange={(e) => setNewServiceDescription(e.target.value)} rows={3} placeholder="Optional short description" style={styles.textarea} />
                     </div>
                     <button type="submit" disabled={isSubmittingAdd} style={{...styles.button, ...styles.buttonSuccess, ...(isSubmittingAdd ? styles.buttonDisabled : {})}}>
                        {isSubmittingAdd ? 'Adding...' : 'Add Service'}
                     </button>
                 </form>
            )}
             {!canAddOrEdit && !isLoading && (
                 <p style={styles.loadingMessage}><i>View services below. Contact an admin/manager to add or modify.</i></p>
             )}


            {/* Existing Services Table */}
            <h3>Existing Services</h3>
            {isLoading && <p style={styles.loadingMessage}>Loading services...</p>}
            {error && <p style={styles.errorMessage}>Error: {error}</p>}
            {!isLoading && !error && services.length === 0 && <p>No services found.</p>}
            {!isLoading && !error && services.length > 0 && (
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>ID</th>
                                <th style={styles.th}>Name</th>
                                <th style={styles.th}>Duration (min)</th>
                                <th style={styles.th}>Price</th>
                                <th style={styles.th}>Description</th>
                                <th style={styles.th}>Active</th>
                                {canAddOrEdit && <th style={styles.th}>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {services.map(service => (
                                <tr key={service.service_id}>
                                    <td style={styles.td}>{service.service_id}</td>
                                    <td style={styles.td}>{service.name}</td>
                                    <td style={styles.td}>{service.duration_minutes}</td>
                                    <td style={styles.td}>{service.price != null ? `$${Number(service.price).toFixed(2)}` : '-'}</td>
                                    <td style={styles.td}>{service.description || '-'}</td>
                                    <td style={styles.td}>{service.is_active ? 'Yes' : 'No'}</td>
                                     {/* Action Buttons - Conditional */}
                                     {canAddOrEdit && (
                                         <td style={{...styles.td, ...styles.actionCell}}>
                                             <button
                                                onClick={() => handleOpenEditModal(service)}
                                                style={{...styles.button, ...styles.buttonPrimary}}
                                                disabled={deletingId === service.service_id}
                                             >
                                                 Edit
                                             </button>
                                             {/* Delete Button - Admin Only */}
                                             {canDelete && (
                                                 <button
                                                    onClick={() => handleDeleteService(service.service_id, service.name)}
                                                    disabled={deletingId === service.service_id}
                                                    style={{...styles.button, ...styles.buttonDanger}}
                                                >
                                                    {deletingId === service.service_id ? 'Deleting...' : 'Delete'}
                                                </button>
                                             )}
                                         </td>
                                     )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}


             {/* Edit Modal - Conditional */}
             {isEditModalOpen && editingService && (
                 <div style={styles.modalOverlay}>
                     <div style={styles.modalContent}>
                         <button onClick={handleCloseEditModal} style={styles.modalCloseButton} aria-label="Close edit dialog" disabled={isSubmittingEdit}>×</button>
                         <h3>Edit Service: {editingService.name}</h3>

                         <form onSubmit={handleUpdateService}>
                             {/* Edit form fields */}
                             <div style={styles.formGroup}>
                                <label htmlFor="editServiceName" style={styles.label}>Name*:</label>
                                <input type="text" id="editServiceName" value={editServiceName} onChange={(e) => setEditServiceName(e.target.value)} required style={styles.input} />
                             </div>
                             <div style={styles.formGroup}>
                                <label htmlFor="editServiceDuration" style={styles.label}>Duration* (min):</label>
                                <input type="number" id="editServiceDuration" value={editServiceDuration} onChange={(e) => setEditServiceDuration(e.target.value)} required min="1" style={styles.input}/>
                             </div>
                              <div style={styles.formGroup}>
                                 <label htmlFor="editServicePrice" style={styles.label}>Price ($):</label>
                                 <input type="number" id="editServicePrice" value={editServicePrice} onChange={(e) => setEditServicePrice(e.target.value)} min="0" step="0.01" placeholder="Leave empty for no price" style={styles.input}/>
                              </div>
                             <div style={styles.formGroup}>
                                <label htmlFor="editServiceDesc" style={styles.label}>Description:</label>
                                <textarea id="editServiceDesc" value={editServiceDescription} onChange={(e) => setEditServiceDescription(e.target.value)} rows={3} style={styles.textarea} />
                             </div>
                             <div style={{...styles.formGroup, ...styles.checkboxGroup}}>
                                <label htmlFor="editServiceIsActive" style={{...styles.label, marginBottom: 0}}>Active:</label>
                                <input type="checkbox" id="editServiceIsActive" checked={editServiceIsActive} onChange={(e) => setEditServiceIsActive(e.target.checked)} />
                             </div>

                             {/* Modal Feedback */}
                            {editStatus.message && ( <p style={{...styles.feedback, ...(editStatus.type === 'success' ? styles.feedbackSuccess : styles.feedbackError)}}>{editStatus.message}</p> )}

                             {/* Modal Actions */}
                             <div style={styles.modalActions}>
                                 <button type="submit" disabled={isSubmittingEdit} style={{...styles.button, ...styles.buttonPrimary, ...(isSubmittingEdit ? styles.buttonDisabled : {})}}>
                                    {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                                 </button>
                                 <button type="button" onClick={handleCloseEditModal} disabled={isSubmittingEdit} style={{...styles.button, ...styles.buttonSecondary}}>
                                    Cancel
                                 </button>
                             </div>
                         </form>
                     </div>
                 </div>
             )}

        </div>
    );
}