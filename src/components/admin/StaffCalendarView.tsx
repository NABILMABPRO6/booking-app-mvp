// src/components/admin/StaffCalendarView.tsx
'use client'; // Needs hooks for state and data fetching

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer, Event as BigCalendarEvent } from 'react-big-calendar';
import moment from 'moment-timezone'; // Use moment-timezone for consistency
import 'react-big-calendar/lib/css/react-big-calendar.css'; // Base CSS

// Define the structure of events coming from our API
interface ApiEvent {
    id: string; // db-bookingId or googleEventId
    title: string;
    start: string; // ISO String (UTC)
    end: string; // ISO String (UTC)
    status?: string; // e.g., 'confirmed', 'tentative'
    source: 'database' | 'google' | string; // Source identifier
}

// Define the structure for react-big-calendar (start/end as Date objects)
interface CalendarEvent extends BigCalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource?: any; // Can store original API event data or source here
    status?: string;
    source: string;
}

// Setup moment localizer
const localizer = momentLocalizer(moment);

// Component Styles (inline for simplicity, adapt as needed)
const styles = {
    container: { border: '1px solid #eee', padding: '15px', borderRadius: '5px', marginTop: '15px', backgroundColor: '#fdfdfd' },
    title: { marginTop: '0', marginBottom: '15px', fontSize: '1.1em', borderBottom: '1px solid #eee', paddingBottom: '8px' },
    controls: { marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' },
    dateInput: { padding: '5px', border: '1px solid #ccc', borderRadius: '4px' },
    calendarContainer: { height: '600px' }, // Essential for react-big-calendar
    loadingMessage: { fontStyle: 'italic' as 'italic', color: '#555', textAlign: 'center' as 'center', padding: '20px' },
    errorMessage: { color: 'red', textAlign: 'center' as 'center', padding: '10px' },
    infoMessage: { color: '#333', textAlign: 'center' as 'center', padding: '10px' },
    legend: { marginTop: '15px', display: 'flex', flexWrap: 'wrap' as 'wrap', gap: '15px', fontSize: '0.85em', borderTop: '1px solid #eee', paddingTop: '10px' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '5px' },
    legendColorBox: { width: '15px', height: '15px', border: '1px solid #555', borderRadius: '3px' },
};


export default function StaffCalendarView({ staffId }: { staffId: number | null }) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    // Default to today's date using the browser's local timezone initially
    const [selectedDate, setSelectedDate] = useState<Date>(moment().startOf('day').toDate());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCalendarData = useCallback(async (date: Date) => {
        // Don't fetch if staffId is null or invalid
        if (staffId === null || isNaN(staffId)) {
            setEvents([]);
            setError(null);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        // Format date as YYYY-MM-DD for the API query parameter
        const dateString = moment(date).format('YYYY-MM-DD');
        const logPrefix = `[StaffCalendarView Staff ${staffId} Date ${dateString}]`;
        console.log(`${logPrefix} Fetching calendar view data...`);

        try {
            // Fetch from the correct API endpoint
            const response = await fetch(`/api/admin/staff/${staffId}/calendar-view?date=${dateString}`);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Failed to load schedule: ${response.statusText}`);
            }
            const apiEvents: ApiEvent[] = await response.json();

            // Process events for react-big-calendar (convert start/end to Date objects)
            const formattedEvents: CalendarEvent[] = apiEvents.map(event => ({
                ...event,
                start: moment.utc(event.start).toDate(), // Parse UTC string, convert to local Date object for calendar
                end: moment.utc(event.end).toDate(),
                resource: { source: event.source }
            }));

            console.log(`${logPrefix} Found ${formattedEvents.length} events.`);
            setEvents(formattedEvents);

        } catch (err: any) {
            console.error(`${logPrefix} Error fetching calendar data:`, err);
            setError(err.message || "Failed to load schedule");
            setEvents([]);
        } finally {
            setIsLoading(false);
        }
    }, [staffId]); // Dependency is staffId

    // Fetch data when staffId or selectedDate changes
    useEffect(() => {
        if (staffId) { // Only fetch if staffId is valid
             fetchCalendarData(selectedDate);
        } else {
             setEvents([]); setError(null); setIsLoading(false); // Clear if no staffId
        }
    }, [staffId, selectedDate, fetchCalendarData]);

    // Handler for calendar navigation
    const handleNavigate = (newDate: Date) => {
        console.log("Navigating calendar view to:", moment(newDate).format('YYYY-MM-DD'));
        setSelectedDate(newDate);
    };

    // Handler for the date input picker change
    const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = event.target.value ? moment(event.target.value, 'YYYY-MM-DD').toDate() : new Date();
        setSelectedDate(newDate);
    }

    // Style getter for calendar events
    const eventStyleGetter = (event: CalendarEvent): { style: React.CSSProperties } => {
        let backgroundColor = '#7a7a7a'; // Default grey
        let borderColor = '#555';

        if (event.source === 'google') {
            backgroundColor = '#db6a1d'; // Orange for Google
            borderColor = '#b85610';
        } else if (event.source === 'database') {
            backgroundColor = '#3174ad'; // Blue for DB bookings
            borderColor = '#255b88';
            // Optionally check booking status for different styling
            if (event.status === 'scheduled') backgroundColor = '#17a2b8'; // Teal for scheduled
        }

        const style: React.CSSProperties = {
            backgroundColor,
            borderRadius: '4px',
            opacity: 0.9,
            color: 'white',
            border: `1px solid ${borderColor}`,
            display: 'block',
            padding: '2px 4px',
            fontSize: '0.8em',
            cursor: 'default'
        };
        return { style };
    };

    // Custom tooltip content
    const getTooltip = (event: CalendarEvent): string => {
        return `${event.title || '(No Title)'}\nSource: ${event.source}${event.status ? `\nStatus: ${event.status}` : ''}`;
    };


    return (
        <div style={styles.container}>
            <h4 style={styles.title}>Staff Schedule View</h4>

             {/* Controls */}
             <div style={styles.controls}>
                <label htmlFor={`calendar-date-picker-${staffId}`}>Select Date:</label>
                <input
                    style={styles.dateInput}
                    type="date"
                    id={`calendar-date-picker-${staffId}`} // Unique ID if multiple calendars could exist
                    value={moment(selectedDate).format('YYYY-MM-DD')}
                    onChange={handleDateChange}
                    disabled={isLoading || !staffId}
                />
            </div>

            {/* Status Messages */}
            {isLoading && <p style={styles.loadingMessage}>Loading schedule...</p>}
            {error && <p style={styles.errorMessage}>Error: {error}</p>}
            {!isLoading && !error && events.length === 0 && staffId &&
                <p style={styles.infoMessage}>No scheduled events found for this date.</p>
            }
            {!staffId && <p style={styles.infoMessage}>Staff member not selected.</p>}


            {/* Calendar */}
            <div style={styles.calendarContainer}>
                 {staffId && ( // Render calendar only if staffId is valid
                     <Calendar
                        localizer={localizer}
                        events={events}
                        startAccessor="start"
                        endAccessor="end"
                        titleAccessor="title"
                        style={{ height: '100%' }}
                        views={['day', 'week']}
                        defaultView="day"
                        date={selectedDate}
                        onNavigate={handleNavigate}
                        eventPropGetter={eventStyleGetter}
                        tooltipAccessor={getTooltip}
                        step={15}
                        timeslots={4}
                        // Optional: Set min/max times based on typical business hours
                        // min={moment(selectedDate).set({ hour: 7, minute: 0 }).toDate()}
                        // max={moment(selectedDate).set({ hour: 21, minute: 0 }).toDate()}
                    />
                 )}
            </div>

             {/* Legend */}
             <div style={styles.legend}>
                 <span style={styles.legendItem}>
                     <span style={{...styles.legendColorBox, backgroundColor: '#3174ad'}}></span>
                     DB Booking (Confirmed)
                 </span>
                  <span style={styles.legendItem}>
                      <span style={{...styles.legendColorBox, backgroundColor: '#17a2b8'}}></span>
                      DB Booking (Scheduled)
                  </span>
                 <span style={styles.legendItem}>
                     <span style={{...styles.legendColorBox, backgroundColor: '#db6a1d'}}></span>
                     Google Calendar Event
                 </span>
             </div>
        </div>
    );
}