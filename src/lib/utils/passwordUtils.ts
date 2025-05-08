// src/lib/utils/passwordUtils.ts
import bcrypt from 'bcrypt';

// Define the salt rounds (cost factor). 10-12 is generally recommended.
const saltRounds = 10;

/**
 * Hashes a plain text password using bcrypt.
 * @param {string} password - The plain text password to hash. Cannot be empty.
 * @returns {Promise<string>} - A promise that resolves with the hashed password.
 * @throws {Error} if the password is empty.
 */
export const hashPassword = async (password: string): Promise<string> => {
    if (!password) {
        throw new Error("Password cannot be empty");
    }
    // bcrypt.hash handles generating the salt and hashing
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Compares a plain text password with a stored bcrypt hash.
 * @param {string} password - The plain text password submitted by the user.
 * @param {string} hash - The stored password hash from the database.
 * @returns {Promise<boolean>} - A promise that resolves with true if the passwords match, false otherwise.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
    // If either password or hash is missing or not a string, comparison is impossible/false.
    if (!password || !hash || typeof password !== 'string' || typeof hash !== 'string') {
         console.warn("[comparePassword] Invalid input for comparison.", { hasPassword: !!password, hasHash: !!hash });
        return false;
    }
    try {
        // bcrypt.compare automatically extracts the salt from the hash and compares.
        const isMatch = await bcrypt.compare(password, hash);
        return isMatch;
    } catch (error) {
        // Log error during comparison (e.g., hash format might be invalid)
        console.error("[comparePassword] Error during password comparison:", error);
        // Return false in case of error to prevent accidental login
        return false;
    }
};

// Note: Removed the manual hash generation CLI part from the original file.
// If needed, create a separate script for that.