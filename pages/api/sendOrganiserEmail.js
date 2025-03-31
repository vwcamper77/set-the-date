// pages/api/sendOrganiserEmail.js
import { db } from '@/lib/firebase';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method Not Allowed' });
    }
  
    const { firstName, email, pollId } = req.body;
  
    if (!firstName || !email || !pollId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
  
    const pollLink = `https://plan.eveningout.social/poll/${pollId}`;
  
    const htmlContent = `
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="https://plan.eveningout.social/images/eveningout-logo.png" alt="Evening Out" width="200" style="max-width: 100%; border-radius: 16px;" />
      </div>
      <p>Hey ${firstName},</p>
      <p>Your Evening Out ✨ best date poll is live!</p>
      <p>Click below to invite your friends and collect votes:</p>
      <p><a href="${pollLink}" style="font-size: 18px; color: #007bff;">${pollLink}</a></p>
      <br />
      <p>We'll notify you once the date is confirmed.</p>
      <p>– The Evening Out Team</p>
      <p style="font-size: 12px; color: #666; margin-top: 20px;">
        💡 Don’t see this email? Check your spam or junk folder and mark it as “Not Spam” so you don’t miss your evening out!
      </p>
    `;
  
    try {
      // Add to Brevo contact list
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          attributes: { FIRSTNAME: firstName },
          listIds: [4], // Organisers list
          updateEnabled: true
        }),
      });
  
      // Send confirmation email
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Evening Out', email: 'noreply@eveningout.social' },
          to: [{ email, name: firstName }],
          subject: 'Your "Evening Out ✨" poll is live!',
          htmlContent,
        }),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send organiser email. Status: ${response.status} - ${errorText}`);
      }
  
      res.status(200).json({ message: 'Organiser email sent and contact added.' });
    } catch (error) {
      console.error('Error sending organiser email or adding contact:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
  