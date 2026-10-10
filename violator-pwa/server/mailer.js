import nodemailer from 'nodemailer'
import { config } from './config.js'

// Sends email through the app's own Gmail (GMAIL_USER, with an app password
// in GMAIL_APP_PASSWORD). Returns null when those aren't set — locally and in
// Preview — and the payment code then simply skips the email.
export function createMailer() {
  const user = config.gmailUser
  const pass = config.gmailAppPassword
  if (!user || !pass) return null

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    // The payment is answered only after the email is handed over, so a
    // slow mail server mustn't keep the success page waiting for minutes.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  })

  return {
    async send({ to, subject, text, html, attachments }) {
      await transport.sendMail({ from: { name: 'MTPB Violator Portal', address: user }, to, subject, text, html, attachments })
    },
  }
}
