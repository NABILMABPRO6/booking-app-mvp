// src/lib/utils/passwordUtils.ts
import bcrypt from 'bcrypt';

const saltRounds = 10;

/**
 * Hashes a password using bcrypt.
 */
export const hashPassword = async (password: string): Promise<string | null> => {
    // Validate input: password must be a non-empty string
    // Cast to 'any' for the typeof check to satisfy tests passing non-strings,
    // while public signature remains 'string'.
    if (typeof (password as any) !== 'string' || password === '') {
        return null; // Return null for invalid or empty string passwords
    }

    try {
        return await bcrypt.hash(password, saltRounds);
    } catch (error) {
        console.error("Error during bcrypt.hash (unexpected):", error);
        throw error; // Re-throw unexpected errors from bcrypt itself
    }
};

/**
 * Compares a plaintext password with a hashed password.
 */
export const comparePassword = async (
    password: string,
    hash: string | null | undefined
): Promise<boolean> => {
    // Validate inputs:
    // - `password` must be a non-empty string.
    // - `hash` must also be a non-empty string for a meaningful comparison.
    // Cast to 'any' for typeof checks to cover test cases, public signature is stricter.
    if (typeof (password as any) !== 'string' || password === '' ||
        typeof (hash as any) !== 'string' || hash === '') {
        return false; // Return false for invalid inputs
    }

    try {
        return await bcrypt.compare(password, hash);
    } catch (error) {
        // Log the specific error from bcrypt and return false
        console.error("Error during bcrypt.compare:", error); // <<< Matches test expectation
        return false;
    }
};