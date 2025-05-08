// src/lib/utils/__tests__/passwordUtils.test.ts

import { hashPassword, comparePassword } from '../passwordUtils'; // Import functions from the parent directory's utils
import bcrypt from 'bcrypt'; // Import bcrypt to potentially inspect hash format

// Group tests for hashPassword function
describe('hashPassword', () => {
    it('should hash a given password string', async () => {
        const plainPassword = 'mysecretpassword';
        const hashedPassword = await hashPassword(plainPassword);

        // Check that the result is a non-empty string
        expect(hashedPassword).toBeDefined();
        expect(typeof hashedPassword).toBe('string');
        expect(hashedPassword.length).toBeGreaterThan(0);

        // Check that the hash is not the same as the plain password
        expect(hashedPassword).not.toBe(plainPassword);

        // Optional: Check if the hash looks like a bcrypt hash (starts with $2a$, $2b$, or $2y$)
         expect(hashedPassword).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('should generate different hashes for the same password (due to salt)', async () => {
        const plainPassword = 'anotherpassword123';
        const hash1 = await hashPassword(plainPassword);
        const hash2 = await hashPassword(plainPassword);

        expect(hash1).not.toBe(hash2); // Hashes should differ because of the random salt
    });

    it('should throw an error if the password is empty', async () => {
        // We expect the promise returned by hashPassword('') to reject
        await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
    });

     // Consider adding a test for null/undefined input if your types allowed it,
     // but TypeScript should prevent this if the function signature is `password: string`.
});

// Group tests for comparePassword function
describe('comparePassword', () => {
    let plainPassword = 'testComparePassword';
    let hashedPassword: string;

    // Hash the password once before running the tests in this describe block
    beforeAll(async () => {
        hashedPassword = await hashPassword(plainPassword);
    });

    it('should return true for a correct password and hash combination', async () => {
        const isMatch = await comparePassword(plainPassword, hashedPassword);
        expect(isMatch).toBe(true);
    });

    it('should return false for an incorrect password', async () => {
        const incorrectPassword = 'wrongPassword';
        const isMatch = await comparePassword(incorrectPassword, hashedPassword);
        expect(isMatch).toBe(false);
    });

    it('should return false for an invalid or malformed hash', async () => {
        const invalidHash = 'not-a-real-bcrypt-hash';
        const isMatch = await comparePassword(plainPassword, invalidHash);
        expect(isMatch).toBe(false); // bcrypt.compare handles malformed hashes gracefully
    });

    it('should return false if the plain password is empty or null', async () => {
        // Test with empty string
        expect(await comparePassword('', hashedPassword)).toBe(false);
         // Test with null (need type assertion as TS expects string)
         expect(await comparePassword(null as any, hashedPassword)).toBe(false);
    });

    it('should return false if the hash is empty or null', async () => {
         // Test with empty string
        expect(await comparePassword(plainPassword, '')).toBe(false);
        // Test with null (need type assertion as TS expects string)
        expect(await comparePassword(plainPassword, null as any)).toBe(false);
    });
});