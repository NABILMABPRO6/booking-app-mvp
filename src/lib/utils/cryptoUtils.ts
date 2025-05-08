// src/lib/utils/cryptoUtils.ts
import crypto from 'crypto';

const algorithm = 'aes-256-cbc'; // Using AES encryption

// Ensure the encryption key is loaded and valid (basic check)
const secretKey = process.env.TOKEN_ENCRYPTION_KEY;
if (!secretKey || secretKey.length !== 64) { // 32 bytes = 64 hex characters
    console.error('FATAL ERROR: TOKEN_ENCRYPTION_KEY is missing or invalid. It must be a 64-character hex string.');
    // In a real app, might throw or prevent startup
}
const key = Buffer.from(secretKey || crypto.randomBytes(32).toString('hex'), 'hex'); // Use fallback only to prevent crash during init

/** Encrypts plaintext using AES-256-CBC. */
export function encrypt(text: string): string | null {
    if (text == null || text === '') return null;
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error("Encryption failed:", error);
        return null;
    }
}

/** Decrypts text encrypted with the encrypt function. */
export function decrypt(encryptedText: string): string | null {
    if (encryptedText == null || !encryptedText.includes(':')) {
         console.warn('Decryption failed: Invalid input format.');
         return null;
    }
    try {
        const textParts = encryptedText.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex'); // Use non-null assertion as we checked includes(':')
        const encryptedData = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error("Decryption failed:", error);
        return null;
    }
}