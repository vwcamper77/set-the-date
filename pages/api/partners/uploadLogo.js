import { randomUUID } from 'crypto';
import { verifyRequestFirebaseUser } from '@/lib/apiAuth';
import { db, defaultBucket } from '@/lib/firebaseAdmin';
import { normaliseEmail } from '@/lib/organiserService';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

const sanitizeFileName = (value = '') => {
  const fallback = `asset-${Date.now()}.png`;
  if (!value || typeof value !== 'string') return fallback;
  const normalised = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalised || fallback;
};

const extractBase64 = (dataUrl = '') => {
  if (!dataUrl) return { contentType: '', base64: '' };
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (match) {
    return { contentType: match[1], base64: match[2] };
  }
  return { contentType: '', base64: dataUrl };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!defaultBucket) {
    return res.status(500).json({ error: 'Storage bucket is not configured.' });
  }

  const { slug, fileName, contentType, dataUrl, target = 'logo' } = req.body || {};

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Missing partner slug.' });
  }

  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing encoded file data.' });
  }

  try {
    const decoded = await verifyRequestFirebaseUser(req);
    const requesterEmail = normaliseEmail(decoded.email || decoded.userEmail || '');
    if (!requesterEmail) {
      return res.status(401).json({ error: 'Your login is missing an email address.' });
    }

    const partnerRef = db.collection('partners').doc(slug);
    const partnerSnapshot = await partnerRef.get();
    if (!partnerSnapshot.exists) {
      return res.status(404).json({ error: 'Partner not found.' });
    }

    const partnerData = partnerSnapshot.data();
    const contactEmail = normaliseEmail(partnerData.contactEmail || '');
    if (contactEmail && contactEmail !== requesterEmail) {
      return res.status(403).json({ error: 'You do not have permission to update this venue.' });
    }

    const { contentType: detectedType, base64 } = extractBase64(dataUrl);
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ error: 'Invalid file payload.' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: 'Logo must be smaller than 5MB.' });
    }

    const safeName = sanitizeFileName(fileName);
    const safeTarget =
      typeof target === 'string' && target.trim()
        ? target.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'logo'
        : 'logo';
    const storagePath = `partners/${slug}/${safeTarget}-${Date.now()}-${safeName}`;
    const downloadToken = randomUUID();
    const file = defaultBucket.file(storagePath);

    await file.save(buffer, {
      metadata: {
        contentType: detectedType || contentType || 'application/octet-stream',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
        cacheControl: 'public,max-age=31536000,immutable',
      },
    });

    const encodedPath = encodeURIComponent(storagePath);
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${defaultBucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    return res.status(200).json({ url: publicUrl, path: storagePath });
  } catch (error) {
    const status = error?.statusCode === 401 ? 401 : 400;
    console.error('partner logo upload failed', error);
    return res.status(status).json({
      error: error?.message || 'Unable to upload logo.',
    });
  }
}
