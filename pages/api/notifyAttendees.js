import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const escapeIcsValue = (value = '') =>
  value
    .toString()
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .trim();

const slugifyForFilename = (value = '') =>
  value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '') || 'set-the-date-event';

const buildCalendarLinks = (title, location, finalDate) => {
  const date = new Date(finalDate);
  if (Number.isNaN(date.getTime())) return null;

  const start = date.toISOString().slice(0, 10).replace(/-/g, '');
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replace(/-/g, '');

  const safeTitle = (title || 'Set The Date event').trim();
  const safeLocation = (location || 'Set The Date').trim();
  const details = `Confirmed plans for ${safeTitle}.`;

  const googleCalendarUrl = [
    'https://calendar.google.com/calendar/render',
    '?action=TEMPLATE',
    `&text=${encodeURIComponent(safeTitle)}`,
    `&details=${encodeURIComponent(details)}`,
    `&location=${encodeURIComponent(safeLocation)}`,
    `&dates=${start}/${end}`,
  ].join('');

  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const icsBody = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Set The Date//EN',
    'BEGIN:VEVENT',
    `UID:setthedate-${start}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsValue(safeTitle)}`,
    `DESCRIPTION:${escapeIcsValue(details)}`,
    `LOCATION:${escapeIcsValue(safeLocation)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsBody)}`;
  const fileName = `${slugifyForFilename(safeTitle)}.ics`;

  return { googleCalendarUrl, icsHref, fileName };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    pollId,
    eventTitle,
    organiser,
    location,
    message,
    type = 'update',
    finalDate,
    finalMeal,
  } = req.body;

  const isFinalised = type === 'finalised' && finalDate;

  if (
    (isFinalised && (!pollId || !eventTitle || !organiser || !location || !finalDate)) ||
    (!isFinalised && (!pollId || !eventTitle || !organiser || !location || !message))
  ) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://plan.setthedate.app';
  const pollUrl = `${baseUrl}/poll/${pollId}`;
  const resultsUrl = `${baseUrl}/results/${pollId}`;
  const calendarLinks = isFinalised ? buildCalendarLinks(eventTitle, location, finalDate) : null;
  const finalDateObj = isFinalised ? new Date(finalDate) : null;
  const finalDateHuman =
    finalDateObj && !Number.isNaN(finalDateObj.getTime())
      ? finalDateObj.toLocaleString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : finalDate || '';
  const finalMealLabel = finalMeal ? finalMeal.replace(/_/g, ' ') : '';

  try {
    const votesSnapshot = await getDocs(collection(db, 'polls', pollId, 'votes'));
    const attendees = votesSnapshot.docs.map((doc) => doc.data()).filter((v) => v.email);

    const htmlContent = () => {
      if (isFinalised && calendarLinks) {
        const monthLabel = finalDateObj
          ? finalDateObj.toLocaleString('en-GB', { month: 'short' }).toUpperCase()
          : '';
        const dayNumber = finalDateObj ? finalDateObj.getDate() : '';
        const weekdayLabel = finalDateObj
          ? finalDateObj.toLocaleString('en-GB', { weekday: 'long' })
          : '';
        const calendarBadge = `
          <div style="display:inline-block;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;text-align:center;font-family:Arial,sans-serif;">
            <div style="background:#0f172a;color:#fff;padding:6px 12px;font-weight:700;letter-spacing:1px;">${monthLabel}</div>
            <div style="padding:12px 16px;font-size:28px;font-weight:700;color:#0f172a;">${dayNumber}</div>
            <div style="background:#f8fafc;color:#0f172a;padding:6px 12px;font-size:12px;font-weight:600;">${weekdayLabel}</div>
          </div>
        `;
        const mealLine = finalMealLabel
          ? `<p style="margin:8px 0 0;font-size:14px;color:#0f172a;"><strong>Plan:</strong> ${finalMealLabel}</p>`
          : '';
        const organiserNote = message
          ? `<div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;"><strong>Message from ${organiser}:</strong><br/>${message}</div>`
          : '';

        return `
          <div style="text-align:center;">
            <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" alt="Set The Date" />
          </div>
          <p>Hi there,</p>
          <p><strong>${organiser}</strong> has locked in the date for <strong>${eventTitle}</strong>.</p>
          <p style="font-size:16px;margin:12px 0;"><strong>${finalDateHuman}</strong> in <strong>${location}</strong>.</p>
          ${mealLine}
          <div style="text-align:center;margin:16px 0;">${calendarBadge}</div>
          <p style="text-align:center;margin:16px 0;">
            <a href="${calendarLinks.googleCalendarUrl}" style="background:#0f172a;color:#fff;padding:12px 20px;text-decoration:none;border-radius:8px;font-weight:700;">Add to calendar</a>
          </p>
          <p style="text-align:center;margin:8px 0;">
            <a href="${calendarLinks.icsHref}" download="${calendarLinks.fileName}" style="color:#0f172a;font-weight:700;">Download .ics file</a>
          </p>
          <p style="text-align:center;margin:8px 0;">
            <a href="${resultsUrl}" style="color:#0f172a;font-weight:700;">Open the date picker and full details</a>
          </p>
          ${organiserNote}
          <p style="margin-top:24px;">See you there!</p>
        `;
      }

      return `
        <div style="text-align:center;">
          <img src="https://plan.setthedate.app/images/setthedate-logo.png" width="200" alt="Set The Date" />
        </div>
        <p>Hi there,</p>
        <p><strong>${organiser}</strong> has shared an update for the event: <strong>${eventTitle}</strong></p>
        <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin: 10px 0;">${message}</blockquote>
        <p><strong>Location:</strong> ${location}</p>
        <p>Check or update your availability below:</p>
        <p><a href="${pollUrl}" style="font-size: 18px;">Open Event Poll</a></p>
        <p style="margin-top:24px;">Thanks,<br/>Set The Date Team<br/>Founder, Set The Date</p>
      `;
    };

    for (const attendee of attendees) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Team at Set The Date', email: 'hello@setthedate.app' },
          replyTo: { name: 'Set The Date Team', email: 'hello@setthedate.app' },
          to: [{ email: attendee.email }],
          subject: isFinalised
            ? `${eventTitle} is locked in for ${finalDateHuman}`
            : `Update from ${organiser} about "${eventTitle}"`,
          htmlContent: htmlContent(),
        }),
      });
    }

    return res.status(200).json({ message: 'All attendees notified' });
  } catch (error) {
    console.error('Error notifying attendees:', error);
    return res.status(500).json({ error: 'Failed to notify attendees' });
  }
}
