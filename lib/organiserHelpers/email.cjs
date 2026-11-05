function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function buildEmail({ poll, pollId, type, stopUrl }) {
  const title = poll.eventTitle || 'your event';
  const base = 'https://plan.setthedate.app';
  const id = encodeURIComponent(pollId);
  const token = encodeURIComponent(poll.editToken);
  const resultsPath = poll.eventType === 'holiday' ? 'trip-results' : 'results';
  const messages = {
    share: { subject: `Ready to share "${title}"?`, text: `Your event "${title}" is ready. Share the link with your group so they can choose the dates that work for them.`, label: 'Share your event', url: `${base}/share/${id}` },
    votes: { subject: `Give "${title}" a little nudge`, text: `We have not seen any guest responses for "${title}" yet. A quick reminder in your group chat can help everyone find a date.`, label: 'Open your share page', url: `${base}/share/${id}` },
    closing: { subject: `Voting for "${title}" closes soon`, text: `Voting for "${title}" closes within the next 24 hours. Remind your group to respond, or manage your poll if you need to make a change.`, label: 'Manage your event', url: `${base}/edit/${id}?token=${token}` },
    finalise: { subject: `Choose the date for "${title}"`, text: `Your group has responded to "${title}". Review their availability and choose the date that works best.`, label: 'Review availability', url: `${base}/${resultsPath}/${id}?token=${token}` },
    review: { subject: `How did "${title}" go?`, text: `We hope "${title}" went well. Could you leave a quick, honest review of Set The Date? We only show your review publicly with your consent.`, label: 'Leave a review', url: `${base}/review/${id}?token=${token}` },
  };
  const message = messages[type];
  if (!message) throw new Error('Unknown helper type');
  const greeting = `Hi ${poll.organiserFirstName || 'there'},`;
  return { sender: { name: 'Set The Date Team', email: 'hello@setthedate.app' }, replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
    to: [{ email: poll.organiserEmail.trim().toLowerCase() }], subject: message.subject,
    textContent: `${greeting}\n\n${message.text}\n\n${message.label}: ${message.url}\n\nThanks,\nThe Set The Date Team\n\nStop reminders for this event: ${stopUrl}`,
    htmlContent: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#183c31"><p>${escapeHtml(greeting)}</p><p>${escapeHtml(message.text)}</p><p><a href="${escapeHtml(message.url)}" style="display:inline-block;padding:14px 20px;background:#155e45;color:white;border-radius:8px">${message.label}</a></p><p>Thanks,<br>The Set The Date Team</p><p style="font-size:12px"><a href="${escapeHtml(stopUrl)}">Stop reminders for this event</a></p></div>` };
}
module.exports = { buildEmail, escapeHtml };
