// src/lib/utils/__tests__/cryptoUtils.test.ts

import { encrypt, decrypt } from '../cryptoUtils';

describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string correctly', () => {
        const text = 'Hello, World!';
        const encrypted = encrypt(text);
        expect(encrypted).toBeDefined();
        const decrypted = decrypt(encrypted!);
        expect(decrypted).toBe(text);
    });

    it('should return null when decrypting invalid input format (invalid hex)', () => {
        const invalidHexInput = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:xxxxxxxxxxxxxxxx';
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(decrypt(invalidHexInput)).toBeNull();
        // SIMPLIFIED ASSERTION: Check only the first argument passed to console.error
        expect(errorSpy).toHaveBeenCalledWith('Decryption failed:', expect.anything());
        errorSpy.mockRestore();
    });

    it('should return null when decrypting with incorrect key (simulated by bad data)', () => {
        const originalText = 'Text to encrypt';
        const encryptedText = encrypt(originalText);
        const parts = encryptedText!.split(':');
        const tamperedEncrypted = parts[0] + ':' + 'a'.repeat(parts[1].length);
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        expect(decrypt(tamperedEncrypted)).toBeNull();
        // SIMPLIFIED ASSERTION: Check only the first argument passed to console.error
        expect(errorSpy).toHaveBeenCalledWith('Decryption failed:', expect.anything());
        errorSpy.mockRestore();
    });

    it('should return null when decrypting invalid input format (no colon)', () => {
        const invalidInput = 'sometextwithoutacolon';
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(decrypt(invalidInput)).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith('Decryption failed: Invalid input format.');
        warnSpy.mockRestore();
    });

    it('should return null when decrypting null or undefined', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(decrypt(null as any)).toBeNull();
        expect(decrypt(undefined as any)).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(2);
        warnSpy.mockRestore();
    });
});
