#!/usr/bin/env node

/**
 * Export polls + votes from Firestore into a local JSON file.
 *
 * Usage:
 *   node scripts/export-polls-with-votes.js --out tmp/polls-with-votes.json
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const outPath = getArg('--out', 'tmp/polls-with-votes.json');

const privateKey = process.env.FIREBASE_PRIVATE_KEY_BASE64
  ? Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
  : process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : null;

const canUseServiceAccount = Boolean(
  process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey
);

if (!admin.apps.length) {
  if (canUseServiceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    });
  }
}

const db = admin.firestore();

const normalizeTimestamp = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return null;
};

(async () => {
  const pollsSnap = await db.collection('polls').get();
  const payload = [];

  for (const pollDoc of pollsSnap.docs) {
    const poll = pollDoc.data();
    const votesSnap = await db.collection('polls').doc(pollDoc.id).collection('votes').get();
    const votes = votesSnap.docs.map((voteDoc) => {
      const data = voteDoc.data();
      return {
        id: voteDoc.id,
        ...data,
        createdAt: normalizeTimestamp(data.createdAt),
        updatedAt: normalizeTimestamp(data.updatedAt),
      };
    });

    payload.push({
      id: pollDoc.id,
      ...poll,
      createdAt: normalizeTimestamp(poll.createdAt),
      updatedAt: normalizeTimestamp(poll.updatedAt),
      deadline: normalizeTimestamp(poll.deadline),
      finalDate: normalizeTimestamp(poll.finalDate),
      votes,
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Exported ${payload.length} polls to ${outPath}`);
})();
