// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db'; // Our database pool
import moment from 'moment-timezone';
import {
    checkAvailability,
    getStaffDetails,
} from '@/lib/services/availabilityService'; // Import necessary services
import { getGoogleCalendarClient } from '@/lib/googleClient'; // Import google client helper

// We likely need this for the availability check -> service duration
async function getServiceDetails(serviceId: number, client: any) {
    const serviceResult = await client.query(
        'SELECT name, duration_minutes FROM services WHERE service_id = $1 AND is_active = TRUE FOR UPDATE',
        [serviceId]
    );
    if (serviceResult.rowCount === 0) {
        throw new Error(`Active service with ID ${serviceId} not found or is inactive.`);
    }
    return serviceResult.rows[0];
}

// Find or Create Customer function within the transaction
async function findOrCreateCustomer(client: any, name: string, email: string, phone: string | null): Promise<number> {
    const logPrefix = '[findOrCreateCustomer]';
    console.log(`${logPrefix} Searching for customer with email: ${email}`);

    // Attempt to find existing customer by email (case-insensitive check is good practice)
    let customerResult = await client.query(
        'SELECT customer_id FROM customers WHERE lower(email) = lower($1)',
        [email]
    );

    if (customerResult.rowCount > 0) {
        const customerId = customerResult.rows[0].customer_id;
        console.log(`${logPrefix} Found existing customer ID: ${customerId}. Optional: Update details.`);
        // Optional: Update name/phone if provided values differ?
        // await client.query(
        //     'UPDATE customers SET name = $1, phone = $2, updated_at = CURRENT_TIMESTAMP WHERE customer_id = $3 AND (name != $1 OR phone IS DISTINCT FROM $2)',
        //     [name, phone, customerId]
        // );
        return customerId;
    } else {
        console.log(`${logPrefix} Customer not found. Creating new customer.`);
        const insertResult = await client.query(
            'INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING customer_id',
            [name, email, phone] // Ensure email is stored as provided (case might matter elsewhere)
        );
        const newCustomerId = insertResult.rows[0].customer_id;
        console.log(`${logPrefix} Created new customer ID: ${newCustomerId}`);
        return newCustomerId;
    }
}


// POST handler for creating bookings
export async function POST(request: NextRequest) {
    const logPrefix = '[POST /api/bookings]';
    let client; // Declare client variable outside try block

    try {
        const body = await request.json();
        console.log(`${logPrefix} Request received:`, body);

        const {
            serviceId, staffId, date, time, timezone, // Booking details
            clientName, clientEmail, clientPhone, notes // Client details
        } = body;

        // --- Basic Input Validation ---
        if (!serviceId || !staffId || !date || !time || !timezone || !clientName || !clientEmail) {
            console.warn(`${logPrefix} Missing required booking fields.`);
            return NextResponse.json({ error: 'Missing required booking fields.' }, { status: 400 });
        }
        if (!moment.tz.zone(timezone)) {
            console.warn(`${logPrefix} Invalid timezone provided: ${timezone}`);
            return NextResponse.json({ error: `Invalid timezone provided: ${timezone}` }, { status: 400 });
        }
        const parsedServiceId = parseInt(serviceId, 10);
        const parsedStaffId = parseInt(staffId, 10);
        if (isNaN(parsedServiceId) || isNaN(parsedStaffId)) {
             return NextResponse.json({ error: 'Invalid Service ID or Staff ID.' }, { status: 400 });
        }

        // Use BUSINESS_TIMEZONE for availability check context
        const businessTimezone = process.env.BUSINESS_TIMEZONE;
        if (!businessTimezone || !moment.tz.zone(businessTimezone)) {
            console.error(`${logPrefix} CRITICAL ERROR: BUSINESS_TIMEZONE is not set or invalid in .env`);
            return NextResponse.json({ error: 'Server configuration error [Timezone].' }, { status: 500 });
        }

        // Acquire a client from the pool and start transaction
        client = await dbPool.connect();
        console.log(`${logPrefix} DB client acquired. Starting transaction.`);
        await client.query('BEGIN');

        // --- 1. Fetch Service/Staff Details (Lock Rows) ---
        const serviceDetails = await getServiceDetails(parsedServiceId, client);
        // Lock staff row as well
        const staffDetails = await getStaffDetails(parsedStaffId, client, true); // Pass client, request LOCK

        // Ensure staff details were found and staff is active
        if (!staffDetails || !staffDetails.is_active) {
            throw new Error(`Active staff member with ID ${parsedStaffId} not found or is inactive.`);
        }

        const serviceDuration = serviceDetails.duration_minutes;
        const serviceName = serviceDetails.name;
        const staffName = staffDetails.name;

        // --- 2. Find or Create Customer ---
        // This function handles finding by email or inserting a new customer row
        const customerId = await findOrCreateCustomer(client, clientName, clientEmail, clientPhone || null);

        // --- 3. Calculate Time Boundaries (UTC) ---
        const localBookingTimeStr = `${date} ${time}`;
        const bookingStartTimeInClientTz = moment.tz(localBookingTimeStr, 'YYYY-MM-DD HH:mm', timezone);
        if (!bookingStartTimeInClientTz.isValid()) {
            throw new Error('Invalid date or time format provided for booking.');
        }
        const bookingEndTimeInClientTz = bookingStartTimeInClientTz.clone().add(serviceDuration, 'minutes');
        const bookingStartTimeUTC = bookingStartTimeInClientTz.clone().utc().toISOString();
        const bookingEndTimeUTC = bookingEndTimeInClientTz.clone().utc().toISOString();
        console.log(`${logPrefix} Booking time (Client TZ ${timezone}): ${bookingStartTimeInClientTz.format()} -> UTC: ${bookingStartTimeUTC}`);

        // --- 4. Check Availability using the Service ---
        console.log(`${logPrefix} Calling availability service for new booking...`);
        const availabilityResult = await checkAvailability({
            staffId: parsedStaffId,
            newBookingStartTimeUTC: bookingStartTimeUTC,
            newBookingEndTimeUTC: bookingEndTimeUTC,
            bookingTimezone: businessTimezone, // Use BUSINESS timezone for checking schedule rules
            dbClient: client, // Pass transaction client!
            staffDetails: staffDetails,
            bookingIdToExclude: null
        });

        // --- 5. Final Decision ---
        if (!availabilityResult.isAvailable) {
            await client.query('ROLLBACK');
            console.log(`${logPrefix} Booking rejected for Staff ${parsedStaffId}:`, availabilityResult.reasons.join(" "));
            return NextResponse.json({
                error: 'Sorry, the selected time slot is no longer available.',
                details: availabilityResult.reasons // Provide reasons from service
            }, { status: 409 }); // 409 Conflict status code
        }

        // --- 6. Insert Booking (Linking Customer) ---
        console.log(`${logPrefix} Slot available for Staff ${parsedStaffId}. Inserting booking for Customer ${customerId}...`);
        const insertQuery = `
            INSERT INTO bookings
                (staff_id, service_id, customer_id, client_name, client_email, client_phone, notes,
                 booking_start_time, booking_end_time, status, booking_timezone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed', $10)
            RETURNING booking_id, created_at`;
        const insertValues = [
            parsedStaffId, parsedServiceId, customerId, clientName, clientEmail, clientPhone || null, notes || null,
            bookingStartTimeUTC, bookingEndTimeUTC, timezone // Store client's original timezone
        ];
        const insertResult = await client.query(insertQuery, insertValues);
        const newBookingId = insertResult.rows[0].booking_id;
        const createdAt = insertResult.rows[0].created_at;
        console.log(`${logPrefix} Booking ${newBookingId} inserted into DB.`);

        // --- 7. Add to Google Calendar (Best Effort - Needs getGoogleCalendarClient adaptation) ---
        let googleEventId = null;
         if (staffDetails.is_google_connected && staffDetails.google_calendar_id) {
             console.log(`${logPrefix} Attempting GCal event creation for booking ${newBookingId} (Staff ${staffId})...`);
             // Ensure getGoogleCalendarClient can work with the pool client if necessary or just use pool directly
             // For now, assume it uses pool internally based on staff ID
             const googleClientForEvent = await getGoogleCalendarClient(parsedStaffId);
             if (googleClientForEvent) {
                try {
                    const calendarId = staffDetails.google_calendar_id; // Use ID fetched earlier
                    const eventResource = { /* ... (same as before) ... */
                       summary: `${serviceName} with ${clientName}`,
                        description: `Client: ${clientName}\nEmail: ${clientEmail}\nPhone: ${clientPhone || 'N/A'}\nNotes: ${notes || 'N/A'}\nBooking ID: ${newBookingId}\nBooked via: System`,
                        start: { dateTime: bookingStartTimeUTC, timeZone: 'UTC' },
                        end: { dateTime: bookingEndTimeUTC, timeZone: 'UTC' },
                        status: 'confirmed',
                    };
                    const gcalResponse = await googleClientForEvent.calendar.events.insert({
                        calendarId: calendarId,
                        resource: eventResource,
                        sendNotifications: false
                    });
                    googleEventId = gcalResponse.data.id;
                    console.log(`${logPrefix} GCal event created ID: ${googleEventId}`);
                    await client.query('UPDATE bookings SET google_event_id = $1 WHERE booking_id = $2', [googleEventId, newBookingId]);
                    console.log(`${logPrefix} Booking ${newBookingId} updated with GCal event ID.`);
                } catch (gcalInsertError: any) { // Type error as any
                    console.error(`${logPrefix} GCal Event Creation Failed for booking ${newBookingId} (Staff ${staffId}):`, gcalInsertError.message);
                    if (gcalInsertError.response && gcalInsertError.response.data) {
                         console.error(`${logPrefix} Google API Error details:`, JSON.stringify(gcalInsertError.response.data, null, 2));
                    }
                 }
             } else { console.warn(`${logPrefix} Could not get GCal client for event creation (booking ${newBookingId}).`); }
         } else { console.log(`${logPrefix} Skipping GCal creation - staff ${parsedStaffId} not connected or calendar ID missing.`); }


        // --- 8. Commit ---
        await client.query('COMMIT');
        console.log(`${logPrefix} Transaction committed for booking ${newBookingId}.`);

        // --- 9. Success Response ---
        const displayStartTime = moment.utc(bookingStartTimeUTC).tz(timezone).format('YYYY-MM-DD HH:mm');
        const displayEndTime = moment.utc(bookingEndTimeUTC).tz(timezone).format('YYYY-MM-DD HH:mm');

        return NextResponse.json({
            message: 'Booking confirmed successfully!',
            bookingDetails: {
                bookingId: newBookingId, customerId, serviceId: parsedServiceId, staffId: parsedStaffId,
                staffName, serviceName, clientName, clientEmail,
                bookingStartTimeUTC: bookingStartTimeUTC,
                bookingEndTimeUTC: bookingEndTimeUTC,
                bookingStartTimeLocal: displayStartTime, // Show client the time in THEIR timezone
                bookingEndTimeLocal: displayEndTime,
                timezone: timezone, googleEventId: googleEventId, createdAt: createdAt
            }
        }, { status: 201 }); // 201 Created status

    } catch (error: any) { // Catch errors, type as any
        console.error(`${logPrefix} Error processing booking request:`, error.stack);
        // Ensure rollback happens if client was acquired
        if (client) {
            try {
                await client.query('ROLLBACK');
                console.log(`${logPrefix} Booking transaction rolled back due to error.`);
            } catch (rollbackError) {
                console.error(`${logPrefix} Booking rollback failed:`, rollbackError);
            }
        }

        // Determine error message and status
        const errorMessage = (error.message.includes('not found or is inactive') || error.message.includes('Invalid date or time'))
                            ? error.message
                            : (error.message.includes('Sorry, the selected time slot')
                                ? error.message : 'Internal server error while processing booking.');
        const errorStatus = (error.message.includes('not found or is inactive') || error.message.includes('Invalid date or time')) ? 400
                            : (error.message.includes('Sorry, the selected time slot') ? 409 // Conflict
                                : 500);

        return NextResponse.json({ error: errorMessage }, { status: errorStatus });

    } finally {
        // Ensure client is always released
        if (client) {
            client.release();
            console.log(`${logPrefix} DB client released.`);
        }
    }
}

// You can add other handlers (GET, PUT, DELETE) for /api/bookings here later if needed
// export async function GET(request: NextRequest) { ... }