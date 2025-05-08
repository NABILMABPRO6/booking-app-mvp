// src/app/api/slots/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { dbPool } from '@/lib/db';
import moment from 'moment-timezone';
import {
    getStaffDetails,
    getWorkingInterval,
    getDbBusyBlocks,
    getGcalBusyBlocks,
    calculateFreeIntervals,
    generateSlots,
} from '@/lib/services/availabilityService'; // Import necessary services
import { timeToMinutes, formatTime } from '@/lib/utils/timeUtils';

export async function GET(request: NextRequest) {
    const logPrefix = '[GET /api/slots]';
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');
    const date = searchParams.get('date');
    const requestedStaffId = searchParams.get('staffId'); // Optional staff ID

    console.log(`${logPrefix} Request received. Service: ${serviceId}, Date: ${date}, Staff: ${requestedStaffId || 'Any'}`);

    // --- 1. Input Validation ---
    if (!serviceId || !date) {
        return NextResponse.json({ error: 'Missing required query parameters: serviceId and date.' }, { status: 400 });
    }
    const parsedServiceId = parseInt(serviceId, 10);
    if (isNaN(parsedServiceId)) {
        return NextResponse.json({ error: 'Invalid serviceId.' }, { status: 400 });
    }
    const targetDate = moment(date, 'YYYY-MM-DD');
    if (!targetDate.isValid()) {
        return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }
    const parsedStaffId = requestedStaffId ? parseInt(requestedStaffId, 10) : null;
    if (requestedStaffId && isNaN(parsedStaffId!)) {
        return NextResponse.json({ error: 'Invalid staffId.' }, { status: 400 });
    }

    // --- 2. Timezone & Date Setup ---
    const businessTimezone = process.env.BUSINESS_TIMEZONE;
    if (!businessTimezone || !moment.tz.zone(businessTimezone)) {
        console.error(`${logPrefix} CRITICAL ERROR: BUSINESS_TIMEZONE is not set or invalid.`);
        return NextResponse.json({ error: 'Server configuration error [Timezone].' }, { status: 500 });
    }
    targetDate.tz(businessTimezone, true); // Interpret date IN the business timezone
    const dayOfWeek = targetDate.isoWeekday();
    const dayStartLocal = targetDate.clone().startOf('day');
    const dayEndLocal = targetDate.clone().endOf('day');
    const dayStartUTC = dayStartLocal.clone().utc();
    const dayEndUTC = dayEndLocal.clone().utc();
    console.log(`${logPrefix} - Target Date: ${targetDate.format()} (TZ: ${businessTimezone})`);
    console.log(`${logPrefix} - Day Boundaries UTC: ${dayStartUTC.toISOString()} to ${dayEndUTC.toISOString()}`);

    try {
        // --- 3. Fetch Service Details ---
        const serviceResult = await dbPool.query('SELECT duration_minutes FROM services WHERE service_id = $1 AND is_active = TRUE', [parsedServiceId]);
        if (serviceResult.rowCount === 0) {
            return NextResponse.json({ error: `Active service ${parsedServiceId} not found.` }, { status: 404 });
        }
        const serviceDuration = serviceResult.rows[0].duration_minutes;
        console.log(`${logPrefix} - Service ${parsedServiceId} Duration: ${serviceDuration} minutes`);

        // --- 4. Fetch Eligible Staff ---
        let staffQuery = `
            SELECT DISTINCT st.staff_id, st.name
            FROM staff st
            JOIN staff_services ss ON st.staff_id = ss.staff_id
            WHERE ss.service_id = $1 AND st.is_active = TRUE
        `;
        const queryParams: (string | number)[] = [parsedServiceId]; // Explicit type
        if (parsedStaffId !== null) {
            staffQuery += ' AND st.staff_id = $2';
            queryParams.push(parsedStaffId);
        }
        staffQuery += ' ORDER BY st.name';
        const staffResult = await dbPool.query(staffQuery, queryParams);
        const eligibleStaff = staffResult.rows;

        if (eligibleStaff.length === 0) {
            console.log(`${logPrefix} - No eligible staff found.`);
            return NextResponse.json([]); // No staff -> no slots
        }
        console.log(`${logPrefix} - Found ${eligibleStaff.length} eligible staff.`);

        // --- 5. Calculate Slots Per Staff Member ---
        const allSlots = [];
        const staffProcessingPromises = eligibleStaff.map(async (staff) => {
            const staffLogPrefix = `${logPrefix} [Staff ${staff.staff_id} (${staff.name})]`;
            console.log(`${staffLogPrefix} - Processing...`);
            try {
                const staffDetails = await getStaffDetails(staff.staff_id, dbPool); // Use pool
                if (!staffDetails || !staffDetails.is_active) {
                    console.log(`${staffLogPrefix} - Inactive or details missing.`);
                    return [];
                }

                const workingInterval = await getWorkingInterval(staff.staff_id, dayOfWeek, dbPool); // Use pool
                if (!workingInterval) {
                    console.log(`${staffLogPrefix} - No working hours.`);
                    return [];
                }
                const workingStartMins = timeToMinutes(workingInterval.start);
                const workingEndMins = timeToMinutes(workingInterval.end);
                if (workingStartMins < 0 || workingEndMins <= workingStartMins) {
                    console.log(`${staffLogPrefix} - Invalid working hours.`);
                    return [];
                }
                const workingIntervalsMinutes = [{ start: workingStartMins, end: workingEndMins }];
                console.log(`${staffLogPrefix} - Working Mins: ${workingStartMins}-${workingEndMins}`);


                const dbBusyBlocksUTC = await getDbBusyBlocks(staff.staff_id, dayStartUTC.toISOString(), dayEndUTC.toISOString(), dbPool); // Use pool
                const dbBusyMinutes = dbBusyBlocksUTC.map(block => {
                    const startLocal = block.start.clone().tz(businessTimezone);
                    const endLocal = block.end.clone().tz(businessTimezone);
                    const blockStartMinutes = startLocal.diff(dayStartLocal, 'minutes');
                    const blockEndMinutes = endLocal.diff(dayStartLocal, 'minutes');
                    const overlapStart = Math.max(blockStartMinutes, 0);
                    const overlapEnd = Math.min(blockEndMinutes, 1440);
                    return overlapStart < overlapEnd ? { start: overlapStart, end: overlapEnd } : null;
                }).filter(Boolean) as { start: number, end: number }[]; // Type assertion after filter
                 console.log(`${staffLogPrefix}   - DB Busy Mins: ${JSON.stringify(dbBusyMinutes)}`);

                const gcalBusyBlocksUTC = await getGcalBusyBlocks(staff.staff_id, dayStartUTC.toISOString(), dayEndUTC.toISOString(), staffDetails); // Pass details
                let gcalBusyMinutes: { start: number, end: number }[] = [];
                if (gcalBusyBlocksUTC === null) {
                    console.warn(`${staffLogPrefix} - WARNING: GCal check failed.`);
                    // Decide how to handle: block all day? or ignore GCal? Let's ignore for now.
                     gcalBusyMinutes = []; // Treat as no GCal blocks if failed
                } else {
                     gcalBusyMinutes = gcalBusyBlocksUTC.map(block => {
                         const startLocalGcal = block.start.clone().tz(businessTimezone);
                         const endLocalGcal = block.end.clone().tz(businessTimezone);
                         const blockStartMinutes = startLocalGcal.diff(dayStartLocal, 'minutes');
                         const blockEndMinutes = endLocalGcal.diff(dayStartLocal, 'minutes');
                         const overlapStart = Math.max(blockStartMinutes, 0);
                         const overlapEnd = Math.min(blockEndMinutes, 1440);
                         return overlapStart < overlapEnd ? { start: overlapStart, end: overlapEnd } : null;
                     }).filter(Boolean) as { start: number, end: number }[]; // Type assertion
                     console.log(`${staffLogPrefix}   - GCal Busy Mins: ${JSON.stringify(gcalBusyMinutes)}`);
                }


                const allBusyMinutes = [...dbBusyMinutes, ...gcalBusyMinutes];
                const freeIntervals = calculateFreeIntervals(workingIntervalsMinutes, allBusyMinutes);
                console.log(`${staffLogPrefix} - Free Mins: ${JSON.stringify(freeIntervals)}`);
                const availableMinutes = generateSlots(freeIntervals, serviceDuration, 15); // Use 15 min step for slots
                console.log(`${staffLogPrefix} - Available Starts (Mins): ${availableMinutes.join(', ')}`);

                return availableMinutes.map(startMinute => ({
                    time: formatTime(startMinute),
                    staffId: staff.staff_id,
                    staffName: staff.name,
                }));

            } catch (error) {
                console.error(`${staffLogPrefix} - Error:`, error);
                return []; // Return empty on error for this staff
            }
        });

        const results = await Promise.allSettled(staffProcessingPromises);
        results.forEach(result => {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                allSlots.push(...result.value);
            } // Log rejected promises if needed
        });

        // --- 6. Sort & Filter/Format Results ---
        // Group by time, collect staff for each slot
        const slotsByTime: { [time: string]: { staffId: number, staffName: string }[] } = {};
        for (const slot of allSlots) {
            if (!slotsByTime[slot.time]) {
                slotsByTime[slot.time] = [];
            }
            // Avoid duplicate staff for the same slot time (shouldn't happen with current logic but good practice)
            if (!slotsByTime[slot.time].some(s => s.staffId === slot.staffId)) {
                 slotsByTime[slot.time].push({ staffId: slot.staffId, staffName: slot.staffName });
            }
        }

        // Format for frontend: Return the earliest available staff member for each time slot
        // Or choose randomly, or based on some logic. Simple approach: first one.
        const finalSlots = Object.entries(slotsByTime)
            .map(([time, staffList]) => {
                if (staffList.length > 0) {
                     // If specific staff was requested, ensure they are in the list for this slot
                     if (parsedStaffId !== null) {
                         const specificStaff = staffList.find(s => s.staffId === parsedStaffId);
                         return specificStaff ? { time, staffId: specificStaff.staffId, staffName: specificStaff.staffName } : null;
                     } else {
                         // Otherwise, just return the first available staff member found for that time
                         return { time, staffId: staffList[0].staffId, staffName: staffList[0].staffName };
                     }
                }
                return null; // Should not happen if slotsByTime was populated correctly
            })
            .filter(Boolean) // Remove nulls if specific staff wasn't available for a time
            .sort((a, b) => a!.time.localeCompare(b!.time)); // Sort final list by time

        console.log(`${logPrefix} Total unique slots found: ${finalSlots.length}`);
        return NextResponse.json(finalSlots);

    } catch (error: any) {
        console.error(`${logPrefix} Unhandled error:`, error.stack);
        return NextResponse.json({ error: 'Internal server error while fetching slots.' }, { status: 500 });
    }
}