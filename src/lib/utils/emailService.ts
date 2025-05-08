// src/lib/utils/emailService.ts
import axios from 'axios';

// Warn if env vars missing (runs at build/startup time)
if (!process.env.BREVO_API_KEY) {
    console.error('!!! CONFIGURATION WARNING: BREVO_API_KEY missing !!!');
}

export const sendPasswordResetEmail = async (toEmail: string, resetToken: string): Promise<boolean> => {
    const apiKey = process.env.BREVO_API_KEY;
    // Use APP_BASE_URL now defined in .env.local
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const emailFrom = process.env.EMAIL_FROM;
    const logPrefix = '[sendPasswordResetEmail]';

    if (!apiKey || !emailFrom) {
        console.error(`${logPrefix} Configuration Error: BREVO_API_KEY and EMAIL_FROM must be set.`);
        return false;
    }

    const resetUrl = `${appBaseUrl}/admin/reset-password/${resetToken}`; // Points to frontend page

    // Parse sender name/email
    const fromMatch = emailFrom.match(/(.*)<(.*)>/);
    const senderName = fromMatch ? fromMatch[1].trim() : 'Booking App';
    const senderEmail = fromMatch ? fromMatch[2].trim() : emailFrom;

    const payload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: toEmail }],
        subject: 'Password Reset Request – Booking App',
        htmlContent: `...`, // Same HTML content as before
        textContent: `...`, // Same text content as before
    };
    // --- PASTE YOUR ORIGINAL HTML/TEXT CONTENT HERE ---
     payload.htmlContent = `
          <div style="font-family: sans-serif; line-height:1.6;">
            <p>Hello,</p>
            <p>You requested a password reset for the Booking App Admin account: <strong>${toEmail}</strong>.</p>
            <p>Click below to set a new password:</p>
            <p style="margin:20px 0;">
              <a href="${resetUrl}" style="background-color:#007bff;color:#fff;padding:12px 20px;text-decoration:none;border-radius:5px;font-size:16px;">
                Reset Your Password
              </a>
            </p>
            <p>Or paste this link in your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
            <p>This link expires in <strong>1 hour</strong>. If you didn’t request it, ignore this email.</p>
            <hr style="border-top:1px solid #eee;margin:20px 0;"/>
            <p style="font-size:.9em;color:#777;">Thanks,<br/>The Booking App Team</p>
          </div>
        `;
      payload.textContent = `
        Hello,
        You requested a password reset for your Booking App Admin account (${toEmail}).
        Reset link: ${resetUrl}
        This link expires in 1 hour.
        If you didn’t request it, ignore this email.
        Thanks,
        The Booking App Team
        `;
    // --- END OF PASTED CONTENT ---


    try {
        console.log(`${logPrefix} Sending password reset email to ${toEmail} via Brevo...`);
        const response = await axios.post(
            'https://api.brevo.com/v3/smtp/email',
            payload,
            { headers: { 'api-key': apiKey, 'Content-Type': 'application/json' } }
        );
        console.log(`${logPrefix} Brevo API success:`, response.data?.messageId || 'OK');
        return true;
    } catch (err: any) { // Use any type for error
        console.error(`${logPrefix} Error sending Brevo email to ${toEmail}:`,
            err.response?.data ?? err.message);
        return false;
    }
};