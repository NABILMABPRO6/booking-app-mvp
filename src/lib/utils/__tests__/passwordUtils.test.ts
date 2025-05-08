// src/lib/utils/__tests__/passwordUtils.test.ts

import { hashPassword, comparePassword } from '../passwordUtils'; // Adjust path if necessary

describe('passwordUtils', () => {
    describe('hashPassword', () => {
        it('should return a hash for a given password', async () => {
            const password = 'mysecretpassword';
            const hashedPassword = await hashPassword(password);
            expect(hashedPassword).toBeDefined();
            expect(typeof hashedPassword).toBe('string');
            expect(hashedPassword).not.toBe(password); // Hash should not be the same as the password
        });

        it('should return different hashes for the same password (due to salt)', async () => {
            const password = 'mysecretpassword';
            const hashedPassword1 = await hashPassword(password);
            const hashedPassword2 = await hashPassword(password);
            expect(hashedPassword1).not.toBe(hashedPassword2);
        });

        it('should return null if password is not a string', async () => {
            // @ts-expect-error Testing invalid input
            expect(await hashPassword(123)).toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await hashPassword(null)).toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await hashPassword(undefined)).toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await hashPassword({})).toBeNull();
        });

        it('should return null if password is an empty string', async () => {
            expect(await hashPassword('')).toBeNull();
        });
    });

    describe('comparePassword', () => {
        let consoleWarnSpy: jest.SpyInstance;

        beforeEach(() => {
            // Spy on console.warn before each test in this describe block
            // and provide a mock implementation to suppress the output.
            consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            // Restore the original console.warn after each test
            if (consoleWarnSpy) {
                consoleWarnSpy.mockRestore();
            }
        });

        it('should return true for a correct password and hash', async () => {
            const password = 'mySecurePassword123';
            const hashedPassword = await hashPassword(password);
            expect(hashedPassword).not.toBeNull(); // Ensure hash was created
            expect(await comparePassword(password, hashedPassword!)).toBe(true);
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should return false for an incorrect password', async () => {
            const password = 'mySecurePassword123';
            const wrongPassword = 'wrongPassword';
            const hashedPassword = await hashPassword(password);
            expect(hashedPassword).not.toBeNull();
            expect(await comparePassword(wrongPassword, hashedPassword!)).toBe(false);
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should return false and warn if password is not provided (undefined)', async () => {
            const hashedPassword = await hashPassword('testPassword');
            expect(hashedPassword).not.toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await comparePassword(undefined, hashedPassword!)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: false, hasHash: true }
            );
        });

        it('should return false and warn if password is not provided (null)', async () => {
            const hashedPassword = await hashPassword('testPassword');
            expect(hashedPassword).not.toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await comparePassword(null, hashedPassword!)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: false, hasHash: true }
            );
        });

        it('should return false and warn if password is not a string (number)', async () => {
            const hashedPassword = await hashPassword('testPassword');
            expect(hashedPassword).not.toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await comparePassword(123, hashedPassword!)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                // `!!123` is true, `typeof 123 === 'string'` is false.
                // The condition `!password || !hash || typeof password !== 'string' || typeof hash !== 'string'`
                // will be true because `typeof password !== 'string'` is true.
                { hasPassword: true, hasHash: true } // because !!123 is true
            );
        });

        it('should return false and warn if hash is not provided (undefined)', async () => {
            // @ts-expect-error Testing invalid input
            expect(await comparePassword('testPassword', undefined)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: true, hasHash: false }
            );
        });

        it('should return false and warn if hash is not provided (null)', async () => {
            // @ts-expect-error Testing invalid input
            expect(await comparePassword('testPassword', null)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: true, hasHash: false }
            );
        });

        it('should return false and warn if hash is not a string (number)', async () => {
            // @ts-expect-error Testing invalid input
            expect(await comparePassword('testPassword', 123)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                // `!!123` is true, `typeof 123 === 'string'` is false.
                { hasPassword: true, hasHash: true } // because !!123 is true
            );
        });

        it('should return false and warn if both password and hash are undefined', async () => {
            // @ts-expect-error Testing invalid input
            expect(await comparePassword(undefined, undefined)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: false, hasHash: false }
            );
        });

        // Replicating scenarios from the original log output specifically:
        // (Line 70 in original log: password undefined, hash present)
        it('log scenario line 70: should warn for undefined password, valid hash', async () => {
            const hash = await hashPassword("somepassword");
            expect(hash).not.toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await comparePassword(undefined, hash!)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: false, hasHash: true }
            );
        });

        // (Line 72 in original log: password null, hash present)
        it('log scenario line 72: should warn for null password, valid hash', async () => {
            const hash = await hashPassword("somepassword");
            expect(hash).not.toBeNull();
            // @ts-expect-error Testing invalid input
            expect(await comparePassword(null, hash!)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: false, hasHash: true }
            );
        });

        // (Line 77 in original log: password present, hash undefined)
        it('log scenario line 77: should warn for valid password, undefined hash', async () => {
            // @ts-expect-error Testing invalid input
            expect(await comparePassword("somepassword", undefined)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: true, hasHash: false }
            );
        });

        // (Line 79 in original log: password present, hash null)
        it('log scenario line 79: should warn for valid password, null hash', async () => {
            // @ts-expect-error Testing invalid input
            expect(await comparePassword("somepassword", null)).toBe(false);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "[comparePassword] Invalid input for comparison.",
                { hasPassword: true, hasHash: false }
            );
        });
    });
});