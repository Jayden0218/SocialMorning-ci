/**
 * Sending the sign-in code (owner, 2026-09-27): the owner's Gmail, over SMTP with an app
 * password (env GMAIL_USER, GMAIL_APP_PASSWORD). Port 465 is open on Vercel; the send is
 * awaited before the route answers, because Vercel pauses work after the response.
 * Tests pass a fake that records what would have gone out.
 */
import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string };
export type Mailer = { send(m: Mail): Promise<void> };

export function gmailMailer(user: string, appPassword: string): Mailer {
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass: appPassword } });
  return {
    async send(m) {
      await transport.sendMail({ from: `SocialNet <${user}>`, to: m.to, subject: m.subject, text: m.text });
    },
  };
}
