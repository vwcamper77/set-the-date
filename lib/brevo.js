const BREVO_API_BASE = 'https://api.brevo.com/v3';

const buildHeaders = () => ({
  'api-key': process.env.BREVO_API_KEY || '',
  'Content-Type': 'application/json',
});

export const updateBrevoContact = async ({ email, attributes = {}, listIds = [] }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Missing BREVO_API_KEY');
  }

  await fetch(`${BREVO_API_BASE}/contacts`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      email,
      attributes,
      listIds,
      updateEnabled: true,
    }),
  });
};

export const sendBrevoEmail = async ({ sender, replyTo, to, subject, htmlContent, textContent }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error('Missing BREVO_API_KEY');
  }

  await fetch(`${BREVO_API_BASE}/smtp/email`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      sender,
      replyTo,
      to,
      subject,
      htmlContent,
      textContent,
    }),
  });
};

