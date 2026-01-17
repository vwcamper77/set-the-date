// lib/brevo.js
const BREVO_API_BASE = "https://api.brevo.com/v3";

const buildHeaders = () => ({
  "api-key": process.env.BREVO_API_KEY || "",
  "Content-Type": "application/json",
  accept: "application/json",
});

async function throwIfNotOk(res, label) {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error(`${label} failed (${res.status}): ${text || res.statusText}`);
}

export const updateBrevoContact = async ({ email, attributes = {}, listIds = [] }) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("Missing BREVO_API_KEY");
  }

  const res = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      email,
      attributes,
      listIds,
      updateEnabled: true,
    }),
  });

  await throwIfNotOk(res, "Brevo contacts");
};

export const sendBrevoEmail = async ({
  sender,
  replyTo,
  to,
  subject,
  htmlContent,
  textContent,
}) => {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("Missing BREVO_API_KEY");
  }

  const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
    method: "POST",
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

  await throwIfNotOk(res, "Brevo smtp/email");
};
