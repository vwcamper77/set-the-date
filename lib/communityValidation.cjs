const EVENT_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MESSAGE_ID = /^[a-zA-Z0-9]{10,80}$/;
function cleanText(value, max) {
  if (typeof value !== 'string') throw new Error('Please enter text.');
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`Please use between 1 and ${max} characters.`);
  return text;
}
function validateMessage(body = {}) {
  return { name: cleanText(body.name, 60), text: cleanText(body.text, 1500) };
}
function canModerate(user, poll, isAdmin) {
  if (!user || !user.email_verified) return false;
  if (isAdmin(user.email)) return true;
  return typeof poll.organiserEmail === 'string' &&
    user.email?.trim().toLowerCase() === poll.organiserEmail.trim().toLowerCase();
}
module.exports = { EVENT_ID, MESSAGE_ID, validateMessage, canModerate };
