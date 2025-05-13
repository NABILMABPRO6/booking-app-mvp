// src/lib/utils/__tests__/passwordUtils.test.ts
import bcryptDefaultImport from 'bcrypt'; // Import the actual module path to get its type and mocked version
import { hashPassword, comparePassword } from '../passwordUtils';

// Mock the bcrypt library
// This mock structure assumes 'bcrypt' default exports an object with 'hash' and 'compare' methods.
jest.mock('bcrypt', () => ({
    __esModule: true, // Important for ES Modules if bcrypt is one
    default: {
        hash: jest.fn(),
        compare: jest.fn(),
    },
    // If bcrypt *also* has named exports 'hash' and 'compare' (less common for this pattern),
    // you might need to mock them directly too:
    // hash: jest.fn(),
    // compare: jest.fn(),
}));

// Cast the imported module (which will be the mock) to its mocked type
// This gives us type safety and autocompletion for the mock functions.
const mockedBcrypt = bcryptDefaultImport as jest.Mocked<typeof bcryptDefaultImport>;

describe('passwordUtils', () => {
    const saltRounds = 10; // This value is used in your actual passwordUtils.ts

    beforeEach(() => {
        // Clear mock history and reset implementations before each test
        mockedBcrypt.hash.mockClear();
        mockedBcrypt.compare.mockClear();

        // You could also reset to a default implementation if needed, e.g.:
        // mockedBcrypt.hash.mockImplementation(async (data, salt) => `hashed_${data}_${salt}`);
        // mockedBcrypt.compare.mockImplementation(async (data, encrypted) => data === encrypted.replace('hashed_', '').split('_')[0]);
    });

    describe('hashPassword', () => {
        it('should hash a valid password successfully', async () => {
            const password = 'mySecurePassword123';
            const mockHashedPassword = 'mockedHashedPasswordValue';
            mockedBcrypt.hash.mockResolvedValue(mockHashedPassword);

            const hashedPassword = await hashPassword(password);

            expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, saltRounds);
            expect(hashedPassword).toBe(mockHashedPassword);
        });

        it('should return null if password is an empty string', async () => {
            const password = '';
            const hashedPassword = await hashPassword(password);

            expect(hashedPassword).toBeNull();
            expect(mockedBcrypt.hash).not.toHaveBeenCalled();
        });

        it('should return null if password is not a string (e.g., null)', async () => {
            const password = null as any;
            const hashedPassword = await hashPassword(password as any);

            expect(hashedPassword).toBeNull();
            expect(mockedBcrypt.hash).not.toHaveBeenCalled();
        });

        it('should return null if password is not a string (e.g., undefined)', async () => {
            const password = undefined as any;
            const hashedPassword = await hashPassword(password as any);

            expect(hashedPassword).toBeNull();
            expect(mockedBcrypt.hash).not.toHaveBeenCalled();
        });

        it('should return null if password is not a string (e.g., a number)', async () => {
            const password = 12345 as any;
            const hashedPassword = await hashPassword(password as any);

            expect(hashedPassword).toBeNull();
            expect(mockedBcrypt.hash).not.toHaveBeenCalled();
        });

        it('should throw an error if bcrypt.hash fails unexpectedly', async () => {
            const password = 'validPassword';
            const bcryptError = new Error('Bcrypt internal error');
            mockedBcrypt.hash.mockRejectedValue(bcryptError);

            await expect(hashPassword(password)).rejects.toThrow('Bcrypt internal error');
            expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, saltRounds);
        });
    });

    describe('comparePassword', () => {
        const plainPassword = 'mySecurePassword123';
        const validHash = 'someValidBcryptHash';

        it('should return true for matching passwords', async () => {
            mockedBcrypt.compare.mockResolvedValue(true);

            const isMatch = await comparePassword(plainPassword, validHash);

            expect(mockedBcrypt.compare).toHaveBeenCalledWith(plainPassword, validHash);
            expect(isMatch).toBe(true);
        });

        it('should return false for non-matching passwords', async () => {
            mockedBcrypt.compare.mockResolvedValue(false);

            const isMatch = await comparePassword(plainPassword, validHash);

            expect(mockedBcrypt.compare).toHaveBeenCalledWith(plainPassword, validHash);
            expect(isMatch).toBe(false);
        });

        it('should return false if plainPassword is not a string', async () => {
            const result = await comparePassword(null as any, validHash);
            expect(result).toBe(false);
            expect(mockedBcrypt.compare).not.toHaveBeenCalled();
        });

        it('should return false if hash is not a string', async () => {
            const result = await comparePassword(plainPassword, null as any);
            expect(result).toBe(false);
            expect(mockedBcrypt.compare).not.toHaveBeenCalled();
        });

        it('should return false if plainPassword is an empty string', async () => {
            const result = await comparePassword('', validHash);
            expect(result).toBe(false);
            expect(mockedBcrypt.compare).not.toHaveBeenCalled();
        });

        it('should return false if hash is an empty string', async () => {
            const result = await comparePassword(plainPassword, '');
            expect(result).toBe(false);
            expect(mockedBcrypt.compare).not.toHaveBeenCalled();
        });

        it('should return false and log error if bcrypt.compare throws an error', async () => {
            const bcryptError = new Error('Malformed hash');
            mockedBcrypt.compare.mockRejectedValue(bcryptError);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const isMatch = await comparePassword(plainPassword, 'malformedHashValue');

            expect(isMatch).toBe(false);
            expect(mockedBcrypt.compare).toHaveBeenCalledWith(plainPassword, 'malformedHashValue');
            expect(consoleErrorSpy).toHaveBeenCalledWith("Error during bcrypt.compare:", bcryptError);

            consoleErrorSpy.mockRestore();
        });
    });
});