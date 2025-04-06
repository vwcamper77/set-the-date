import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, firstName, lastName } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Missing email' });
  }

  const ATTENDEE_LIST_ID = Number(process.env.NEXT_PUBLIC_BREVO_ATTENDEES_LIST_ID);


  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/contacts',
      {
        email,
        attributes: {
          FIRSTNAME: firstName || '',
          LASTNAME: lastName || '',
        },
        listIds: [ATTENDEE_LIST_ID],
        updateEnabled: true,
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ Added ${email} to Brevo list ${ATTENDEE_LIST_ID}`);
    res.status(200).json({ message: 'Attendee added to Brevo' });
  } catch (error) {
    console.error('❌ Brevo API error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Brevo API error',
      error: error.response?.data || error.message,
    });
  }
}
