import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  try {
    // Brevo API endpoint to create a contact
    const response = await fetch('https://api.sendinblue.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,  // Make sure your API key is in the .env file
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: name,
        },
        listIds: [parseInt(process.env.NEXT_PUBLIC_BREVO_ATTENDEES_LIST_ID)], // Use the attendees list
      }),
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json({ message: 'Attendee added to Brevo' });
    } else {
      console.error('Brevo API error:', data);
      return res.status(500).json({ error: 'Failed to add attendee to Brevo' });
    }
  } catch (err) {
    console.error('Error while sending to Brevo:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
