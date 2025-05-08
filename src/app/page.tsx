// src/app/page.tsx
'use client'; // Needs client-side state, effects, form handling

import React, { useState, useEffect, useCallback } from 'react';
import moment from 'moment-timezone'; // Keep moment-timezone
import DatePicker from "react-datepicker"; // Keep react-datepicker
import "react-datepicker/dist/react-datepicker.css"; // Import its CSS

// Define necessary types
interface Service {
    service_id: number;
    name: string;
    duration_minutes: number;
    price?: string | null; // Price is optional
    description?: string | null;
}

interface TimeSlot {
    time: string; // e.g., "09:00"
    staffId: number; // Assuming staffId is needed for booking, though maybe hidden from user
    staffName: string; // Display staff name if desired
}

interface BookingSuccessDetails {
    bookingId: number;
    serviceName: string;
    staffName: string;
    bookingStartTimeLocal: string; // Formatted local time string
    timezone: string;
}

// Simple inline styles (replace/adapt with Tailwind or CSS Modules)
const styles = {
  bookingPage: { maxWidth: '700px', margin: '30px auto', padding: '20px', fontFamily: 'sans-serif' },
  header: { textAlign: 'center' as 'center', marginBottom: '30px' },
  stepsContainer: { display: 'flex', flexDirection: 'column' as 'column', gap: '30px' },
  step: { padding: '20px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  stepDisabled: { opacity: 0.5, pointerEvents: 'none' as 'none' },
  stepTitle: { marginTop: '0', marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px', fontSize: '1.3em' },
  stepContent: {},
  stepGuidance: { fontSize: '0.9em', color: '#777', fontStyle: 'italic' as 'italic' },
  formInput: { width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' as 'border-box', marginBottom: '10px' },
  selectInput: { /* Add specific select styles if needed */ },
  dateInput: { /* Add specific date picker styles if needed */ },
  loadingIndicator: { textAlign: 'center' as 'center', padding: '20px', color: '#555' },
  errorMessage: { color: 'red', backgroundColor: '#fdd', border: '1px solid red', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' as 'center' },
  successMessage: { color: 'green', backgroundColor: '#dfd', border: '1px solid green', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center' as 'center' },
  slotsContainer: { display: 'flex', flexWrap: 'wrap' as 'wrap', gap: '10px', marginTop: '10px' },
  slotButton: { padding: '8px 15px', border: '1px solid #007bff', backgroundColor: 'white', color: '#007bff', borderRadius: '4px', cursor: 'pointer', transition: 'background-color 0.2s ease' },
  slotButtonSelected: { backgroundColor: '#007bff', color: 'white' },
  slotButtonDisabled: { backgroundColor: '#eee', color: '#aaa', borderColor: '#ddd', cursor: 'not-allowed' },
  summaryText: { lineHeight: 1.6, marginBottom: '15px', backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '4px' },
  formGroup: { marginBottom: '15px' },
  label: { display: 'block', marginBottom: '5px', fontWeight: '500' },
  submitButton: { width: '100%', padding: '12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', transition: 'background-color 0.2s ease' },
   successDetails: { border: '1px solid #ccc', padding: '15px', marginTop: '15px', borderRadius: '4px', backgroundColor: '#f9f9f9', fontSize: '0.9em'},
   timezoneText: { fontSize: '0.8em', textAlign: 'center' as 'center', marginTop: '10px', color: '#666' },
};


export default function BookingPage() {
    // --- State Variables ---
    const [services, setServices] = useState<Service[]>([]);
    const [selectedService, setSelectedService] = useState<string>(''); // Store Service ID as string
    const [selectedDate, setSelectedDate] = useState<Date | null>(null); // Store as Date object for DatePicker
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [clientTimezone, setClientTimezone] = useState<string>('');

    // --- Loading & Status State ---
    const [isServicesLoading, setIsServicesLoading] = useState(true);
    const [isSlotsLoading, setIsSlotsLoading] = useState(false);
    const [isBooking, setIsBooking] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [slotsError, setSlotsError] = useState<string | null>(null);
    const [bookingStatus, setBookingStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [bookingMessage, setBookingMessage] = useState<string>('');
    const [lastBookingSuccessDetails, setLastBookingSuccessDetails] = useState<BookingSuccessDetails | null>(null);

    // --- Get Client Timezone ---
    useEffect(() => {
        try {
            const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (detectedTimezone) {
                setClientTimezone(detectedTimezone);
                console.log("Detected client timezone:", detectedTimezone);
            } else {
                console.warn("Could not detect client timezone.");
                setFetchError("Could not detect your timezone. Please ensure browser/OS settings allow this.");
            }
        } catch (error) {
            console.error("Error detecting timezone:", error);
            setFetchError("An error occurred detecting your timezone.");
        }
    }, []);

    // --- Fetch Services ---
    const fetchServices = useCallback(async () => {
        console.log("Fetching services...");
        setIsServicesLoading(true);
        setFetchError(null);
        try {
            // Fetch from the public Next.js API route (we need to create this)
            const response = await fetch('/api/services'); // Public route
            if (!response.ok) throw new Error('Failed to load services.');
            const data: Service[] = await response.json();
            setServices(data);
        } catch (err: any) {
            console.error("Error fetching services:", err);
            setFetchError(err.message || "Failed to load services.");
            setServices([]);
        } finally {
            setIsServicesLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchServices();
    }, [fetchServices]);

    // --- Format Date for API Query ---
    const formatDateForAPI = useCallback((date: Date | null): string => {
        if (!date) return '';
        return moment(date).format('YYYY-MM-DD');
     }, []);

     // --- Fetch Available Slots ---
     const fetchSlots = useCallback(async () => {
         const dateString = formatDateForAPI(selectedDate);
         if (!selectedService || !dateString) {
             setAvailableSlots([]);
             return;
         }
         console.log(`Fetching slots for service ${selectedService}, date ${dateString}`);
         setIsSlotsLoading(true);
         setSlotsError(null);
         setAvailableSlots([]);
         setSelectedSlot(null); // Reset selected slot when date/service changes

         try {
             const params = new URLSearchParams({ serviceId: selectedService, date: dateString });
             // Fetch from the public Next.js API route (we need to create this)
             const response = await fetch(`/api/slots?${params.toString()}`);
             if (!response.ok) {
                  const errData = await response.json().catch(() => ({}));
                 throw new Error(errData.error || `Failed to load slots: ${response.statusText}`);
             }
             const data: TimeSlot[] = await response.json();
             setAvailableSlots(data);
             if (data.length === 0) console.log("No available slots found.");
         } catch (err: any) {
             console.error("Error fetching slots:", err);
             setSlotsError(err.message || "Failed to load available times.");
             setAvailableSlots([]);
         } finally {
             setIsSlotsLoading(false);
         }
     }, [selectedService, selectedDate, formatDateForAPI]);

     useEffect(() => {
         fetchSlots();
         // Only run fetchSlots when selectedService or selectedDate changes
     }, [selectedService, selectedDate, fetchSlots]);


    // --- Event Handlers ---
    const handleServiceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedService(event.target.value);
        setSelectedDate(null); // Reset date when service changes
        setAvailableSlots([]); setSelectedSlot(null); setSlotsError(null);
        setBookingStatus('idle'); setBookingMessage(''); setLastBookingSuccessDetails(null);
    };

    const handleDateChange = (date: Date | null) => {
        setSelectedDate(date);
        setSelectedSlot(null); // Reset slot when date changes
        setBookingStatus('idle'); setBookingMessage(''); setLastBookingSuccessDetails(null);
    };

    const handleSlotSelect = (slot: TimeSlot) => {
        setSelectedSlot(slot);
        setBookingStatus('idle'); setBookingMessage(''); setLastBookingSuccessDetails(null);
    };

    // --- Helper: Get Service Name from ID ---
     const getSelectedServiceName = useCallback(() => {
         if (!selectedService) return 'Selected Service';
         const serviceIdInt = parseInt(selectedService, 10);
         const service = services.find(s => s.service_id === serviceIdInt);
         return service ? service.name : 'Selected Service';
     }, [services, selectedService]);


    // --- Handle Booking Submission ---
    const handleBookingSubmit = async () => {
         // Validation
         if (!selectedService || !selectedDate || !selectedSlot || !clientName || !clientEmail || !clientTimezone) {
            setBookingMessage("Please complete all steps and provide your name and email.");
            setBookingStatus('error'); return;
        }
        if (!/\S+@\S+\.\S+/.test(clientEmail)) {
             setBookingMessage("Please enter a valid email address.");
             setBookingStatus('error'); return;
        }

        setIsBooking(true); setBookingStatus('loading'); setBookingMessage(''); setLastBookingSuccessDetails(null);

        const bookingData = {
             serviceId: parseInt(selectedService),
             staffId: selectedSlot.staffId, // Send staffId obtained from the slot
             date: formatDateForAPI(selectedDate),
             time: selectedSlot.time,
             timezone: clientTimezone,
             clientName: clientName.trim(),
             clientEmail: clientEmail.trim(),
             clientPhone: clientPhone.trim() || null,
             notes: notes.trim() || null
         };
         console.log("Submitting Booking Data:", bookingData);

         try {
             // POST to the booking API route we created
             const response = await fetch('/api/bookings', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(bookingData),
             });

             const result = await response.json();

             if (!response.ok) {
                 throw new Error(result.error || `Booking failed: ${response.statusText}`);
             }

             // Booking successful
             setBookingStatus('success');
             setBookingMessage(result.message || `Booking confirmed!`);
             setLastBookingSuccessDetails(result.bookingDetails); // Store details from API response
             console.log('Booking successful:', result.bookingDetails);

             // Reset form fields (except service/date perhaps)
             setSelectedSlot(null);
             setClientName(''); setClientEmail(''); setClientPhone(''); setNotes('');
             // Optionally refetch slots to ensure the booked one is now gone
             fetchSlots();

         } catch (err: any) {
             console.error("Booking submission failed:", err);
             setBookingStatus('error');
             setBookingMessage(err.message || 'An error occurred during booking.');
             setLastBookingSuccessDetails(null);
             // If it was a conflict error (409), refetch slots as availability changed
             if (err.message?.includes('longer available')) {
                 console.log("Conflict detected, refetching slots...");
                 fetchSlots();
             }
         } finally {
             setIsBooking(false);
         }
     };

    // --- Render Logic ---
    return (
        <main style={styles.bookingPage}>
            <header style={styles.header}>
                <h1>Book Your Appointment</h1>
                {fetchError && <p style={styles.errorMessage}>{fetchError}</p>}
            </header>

             <div style={styles.stepsContainer}>

                {/* Step 1: Service Selection */}
                <section style={styles.step}>
                    <h2 style={styles.stepTitle}>1. Select Service</h2>
                    <div style={styles.stepContent}>
                        <select
                            id="service-select"
                            value={selectedService}
                            onChange={handleServiceChange}
                            disabled={isServicesLoading || services.length === 0}
                            style={{...styles.formInput, ...styles.selectInput}}
                            aria-label="Select Service"
                        >
                            <option value="" disabled>
                                {isServicesLoading ? 'Loading services...' : (services.length === 0 && !fetchError ? 'No services available' : '-- Choose Service --')}
                            </option>
                            {services.map(service => (
                                <option key={service.service_id} value={service.service_id}>
                                    {service.name} ({service.duration_minutes} min)
                                    {service.price ? ` - $${parseFloat(service.price).toFixed(2)}` : ''}
                                </option>
                            ))}
                        </select>
                        {isServicesLoading && <div style={styles.loadingIndicator}>Loading...</div>}
                    </div>
                </section>

                 {/* Step 2: Date Selection */}
                 <section style={{...styles.step, ...(!selectedService && styles.stepDisabled)}}>
                     <h2 style={styles.stepTitle}>2. Select Date</h2>
                     <div style={styles.stepContent}>
                         <DatePicker
                             id="date-select"
                             selected={selectedDate} // Use Date object directly
                             onChange={handleDateChange}
                             minDate={new Date()} // Prevent past dates
                             disabled={!selectedService}
                             dateFormat="yyyy-MM-dd"
                             placeholderText="Select date"
                             className="form-input form-input--date" // Use CSS class for styling
                             wrapperClassName="date-picker-wrapper" // Apply styles to wrapper if needed
                             aria-label="Select Date"
                             autoComplete="off"
                             // Custom input styling (can also use className prop)
                             // customInput={<input style={{...styles.formInput, ...styles.dateInput}} />}
                         />
                         {!selectedService && <p style={styles.stepGuidance}>Please select a service first.</p>}
                     </div>
                 </section>

                 {/* Step 3: Time Selection */}
                 <section style={{...styles.step, ...(!selectedDate && styles.stepDisabled)}}>
                    <h2 style={styles.stepTitle}>3. Select Time</h2>
                    <div style={styles.stepContent}>
                        {!selectedDate && <p style={styles.stepGuidance}>Please select a date first.</p>}
                         {selectedDate && isSlotsLoading && (
                            <div style={styles.loadingIndicator}>Loading available times...</div>
                         )}
                         {selectedDate && !isSlotsLoading && slotsError && (
                            <p style={styles.errorMessage}>Error Loading Times: {slotsError}</p>
                         )}
                         {selectedDate && !isSlotsLoading && !slotsError && availableSlots.length === 0 && (
                             <p style={styles.stepGuidance}>
                                 No available slots found for {getSelectedServiceName()} on {formatDateForAPI(selectedDate)}. Please try another date.
                             </p>
                         )}
                         {selectedDate && !isSlotsLoading && !slotsError && availableSlots.length > 0 && (
                             <>
                                 <div style={styles.slotsContainer} role="radiogroup" aria-labelledby="slots-heading">
                                     <span id="slots-heading" className="sr-only">Available Time Slots</span>
                                     {availableSlots.map((slot, index) => (
                                         <button
                                             key={`${slot.time}-${slot.staffId}-${index}`} // Include staffId in key
                                             onClick={() => handleSlotSelect(slot)}
                                             style={{
                                                 ...styles.slotButton,
                                                 ...(selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId ? styles.slotButtonSelected : {}),
                                                 ...(isBooking ? styles.slotButtonDisabled : {})
                                             }}
                                             role="radio"
                                             aria-checked={selectedSlot?.time === slot.time && selectedSlot?.staffId === slot.staffId}
                                             aria-label={`Select time ${slot.time} with ${slot.staffName}`}
                                             disabled={isBooking}
                                         >
                                             {slot.time} {/* Display only time to user */}
                                             {/* Optional: Show staff name if needed: ` - ${slot.staffName}` */}
                                         </button>
                                     ))}
                                 </div>
                                  {clientTimezone && <p style={styles.timezoneText}>Times shown in your timezone: {clientTimezone}</p>}
                             </>
                         )}
                    </div>
                 </section>

                  {/* Step 4: Client Details & Confirmation */}
                  <section style={{...styles.step, ...(!selectedSlot && styles.stepDisabled)}}>
                      <h2 style={styles.stepTitle}>4. Your Details</h2>
                      <div style={styles.stepContent}>
                          {!selectedSlot && <p style={styles.stepGuidance}>Please select a time slot first.</p>}
                          {selectedSlot && (
                              <div className="client-details-form">
                                  <p style={styles.summaryText}>
                                      Booking: <strong>{getSelectedServiceName()}</strong><br />
                                      On: <strong>{formatDateForAPI(selectedDate)}</strong> at <strong>{selectedSlot.time}</strong><br />
                                      With: <strong>{selectedSlot.staffName}</strong> {/* Show staff name */}
                                  </p>
                                  <div style={styles.formGroup}>
                                      <label htmlFor="clientName" style={styles.label}>Name: *</label>
                                      <input type="text" id="clientName" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="Your Full Name" style={styles.formInput} aria-required="true" disabled={isBooking || bookingStatus === 'success'} />
                                  </div>
                                  <div style={styles.formGroup}>
                                      <label htmlFor="clientEmail" style={styles.label}>Email: *</label>
                                      <input type="email" id="clientEmail" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required placeholder="your.email@example.com" style={styles.formInput} aria-required="true" disabled={isBooking || bookingStatus === 'success'} />
                                  </div>
                                  <div style={styles.formGroup}>
                                      <label htmlFor="clientPhone" style={styles.label}>Phone (Optional):</label>
                                      <input type="tel" id="clientPhone" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="For SMS reminders (optional)" style={styles.formInput} disabled={isBooking || bookingStatus === 'success'} />
                                  </div>
                                  <div style={styles.formGroup}>
                                      <label htmlFor="notes" style={styles.label}>Notes (Optional):</label>
                                      <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special requests or information?" style={styles.formInput} rows={3} disabled={isBooking || bookingStatus === 'success'}></textarea>
                                  </div>

                                  {/* Booking Status/Messages */}
                                  {bookingStatus === 'loading' && <p style={styles.loadingIndicator}>Processing booking...</p>}
                                  {bookingStatus === 'error' && <p style={styles.errorMessage}>{bookingMessage}</p>}
                                  {bookingStatus === 'success' && (
                                     <div style={styles.successMessage}>
                                         <p>{bookingMessage}</p>
                                         {lastBookingSuccessDetails && (
                                             <div style={styles.successDetails}>
                                                 <h4>Booking Details:</h4>
                                                 <p><strong>Service:</strong> {lastBookingSuccessDetails.serviceName}</p>
                                                 <p><strong>Staff:</strong> {lastBookingSuccessDetails.staffName}</p>
                                                 <p><strong>Date & Time:</strong> {lastBookingSuccessDetails.bookingStartTimeLocal} ({lastBookingSuccessDetails.timezone})</p>
                                                 <p><strong>Booking ID:</strong> {lastBookingSuccessDetails.bookingId}</p>
                                                 <p><em>Please check your email for confirmation.</em></p>
                                             </div>
                                         )}
                                     </div>
                                  )}

                                  {/* Only show button if not successful */}
                                  {bookingStatus !== 'success' && (
                                      <button
                                          onClick={handleBookingSubmit}
                                          disabled={!clientName || !clientEmail || !clientTimezone || isBooking || bookingStatus === 'loading'}
                                          style={{...styles.submitButton, ...(isBooking ? styles.buttonDisabled : {})}}
                                      >
                                          {isBooking || bookingStatus === 'loading' ? 'Processing...' : 'Confirm Booking'}
                                      </button>
                                  )}
                              </div>
                          )}
                      </div>
                  </section>
             </div>
        </main>
    );
}