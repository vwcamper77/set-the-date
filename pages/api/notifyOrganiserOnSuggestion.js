export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  const {
    organiserEmail,
    organiserName,
    eventTitle,
    pollId,
    editToken,
    message,
    senderName,
    senderEmail,
  } = req.body;

  // Logging the request body to see what's being sent
  console.log('Received suggestion data:', req.body);

  // Validate all required fields
  if (!organiserEmail || !senderName || !senderEmail || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Logic for sending email or processing the suggestion
    // For now, we'll just log the data (you can replace this with your actual logic)
    console.log('Sending suggestion to organiser:', organiserEmail, senderName, message);

    // Respond back successfully
    return res.status(200).json({ message: 'Suggestion sent successfully' });
  } catch (err) {
    console.error('Error sending suggestion:', err);
    return res.status(500).json({ error: 'Failed to send suggestion' });
  }
}
