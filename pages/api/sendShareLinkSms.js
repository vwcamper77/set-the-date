import { createHash } from 'crypto';
import { db, FieldValue } from '@/lib/firebaseAdmin';
import { sendBrevoSms } from '@/lib/brevo';
import {
  getInternationalPhoneError,
  normaliseInternationalPhoneNumber,
} from '@/lib/shareLinkSms';

const MAX_SMS_PER_POLL = 2;
const SHARE_BASE_URL = 'https://plan.setthedate.app/share';

const hashPhoneNumber = (phone) =>
  createHash('sha256').update(phone).digest('hex');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { pollId, phone } = req.body || {};
  const trimmedPollId = String(pollId || '').trim();
  const phoneError = getInternationalPhoneError(phone);

  if (!trimmedPollId) {
    return res.status(400).json({ error: 'Missing pollId.' });
  }

  if (phoneError) {
    return res.status(400).json({ error: phoneError });
  }

  if (!process.env.BREVO_SMS_SENDER) {
    return res.status(500).json({ error: 'SMS sender is not configured.' });
  }

  const normalisedPhone = normaliseInternationalPhoneNumber(phone);
  const shareUrl = `${SHARE_BASE_URL}/${trimmedPollId}`;
  const message = `Your Set The Date poll is ready: ${shareUrl}\n\nOpen it on your phone and share it in WhatsApp so people can vote.`;
  const pollRef = db.collection('polls').doc(trimmedPollId);
  let reservedSendSlot = false;
  let smsSent = false;

  try {
    await db.runTransaction(async (transaction) => {
      const pollSnap = await transaction.get(pollRef);

      if (!pollSnap.exists) {
        const error = new Error('Poll not found.');
        error.statusCode = 404;
        throw error;
      }

      const pollData = pollSnap.data() || {};
      const sentCount = Number(pollData.shareLinkSmsCount || 0);

      if (sentCount >= MAX_SMS_PER_POLL) {
        const error = new Error('This poll has already had its 2 text messages.');
        error.statusCode = 429;
        throw error;
      }

      transaction.update(pollRef, {
        shareLinkSmsCount: FieldValue.increment(1),
        lastShareLinkSmsReservedAt: FieldValue.serverTimestamp(),
      });
    });
    reservedSendSlot = true;

    await sendBrevoSms({
      sender: process.env.BREVO_SMS_SENDER,
      recipient: normalisedPhone,
      content: message,
      type: 'transactional',
      tag: 'share-link',
    });
    smsSent = true;

    try {
      await pollRef.update({
        lastShareLinkSmsSentAt: FieldValue.serverTimestamp(),
        lastShareLinkSmsPhone: hashPhoneNumber(normalisedPhone),
      });
    } catch (metadataError) {
      console.error('sendShareLinkSms metadata update error', metadataError);
    }

    return res.status(200).json({
      ok: true,
      message: 'Text sent. Open it on your phone and share it in WhatsApp.',
    });
  } catch (error) {
    if (reservedSendSlot && !smsSent && error?.statusCode !== 404 && error?.statusCode !== 429) {
      try {
        await pollRef.update({
          shareLinkSmsCount: FieldValue.increment(-1),
        });
      } catch (rollbackError) {
        console.error('sendShareLinkSms rollback error', rollbackError);
      }
    }

    const statusCode = error?.statusCode || 500;

    if (statusCode >= 500) {
      console.error('sendShareLinkSms error', error);
    }

    return res.status(statusCode).json({
      error:
        error?.message ||
        'We could not send that text just now. Please try again in a moment.',
    });
  }
}
