// src/lib/utils/timeUtils.ts

/**
 * Converts a time string (HH:MM or HH:MM:SS) to the total number of minutes from midnight.
 * Handles potential errors gracefully.
 *
 * @param {string} timeStr - The time string (e.g., "09:00", "17:30").
 * @returns {number} Total minutes from midnight, or -1 if the format is invalid.
 */
export function timeToMinutes(timeStr: string | null | undefined): number {
    if (!timeStr || typeof timeStr !== 'string') {
        console.warn(`[timeToMinutes] Invalid input type: Expected string, got ${typeof timeStr}`);
        return -1;
    }
    const parts = timeStr.split(':');
    if (parts.length < 2) {
        console.warn(`[timeToMinutes] Invalid time format (missing ':'): "${timeStr}"`);
        return -1;
    }
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.warn(`[timeToMinutes] Could not parse valid hours/minutes from: "${timeStr}"`);
        return -1;
    }
    return hours * 60 + minutes;
}

/**
 * Converts total minutes from midnight into an HH:MM formatted string (24-hour clock).
 *
 * @param {number} totalMinutes - The total number of minutes from midnight.
 * @returns {string} The time formatted as HH:MM. Returns "00:00" for invalid input.
 */
export function formatTime(totalMinutes: number | null | undefined): string {
    if (typeof totalMinutes !== 'number' || isNaN(totalMinutes) || totalMinutes < 0) {
        console.warn(`[formatTime] Invalid input: Expected non-negative number, got ${totalMinutes}`);
        totalMinutes = 0; // Default to midnight on error
    }

    totalMinutes = Math.floor(totalMinutes) % (24 * 60); // Ensure integer and wrap around

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(mins).padStart(2, '0');

    return `${formattedHours}:${formattedMinutes}`;
}