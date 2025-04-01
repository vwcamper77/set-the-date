import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { pollId, attendeeEmail, eventTitle, organiser, location, message } = req.body;

    // Set up the email transport (using Gmail as an example)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'your-email@gmail.com',
        pass: 'your-email-password',
      },
    });

    // Send email to attendee
    const mailOptions = {
      from: 'your-email@gmail.com',
      to: attendeeEmail,
      subject: `Event Update: ${eventTitle}`,
      text: `${message}\n\nEvent Organiser: ${organiser}\nLocation: ${location}`,
    };

    try {
      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: 'Notification sent' });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}
