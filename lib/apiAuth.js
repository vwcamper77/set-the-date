import { auth as adminAuth } from '@/lib/firebaseAdmin';

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export const verifyRequestFirebaseUser = async (req) => {
  const header = req.headers.authorization || '';
  const match = header.match(BEARER_PATTERN);
  if (!match) {
    const error = new Error('Missing authorization token');
    error.statusCode = 401;
    throw error;
  }

  const token = match[1];
  try {
    return await adminAuth.verifyIdToken(token);
  } catch (error) {
    const authError = new Error('Invalid or expired token');
    authError.statusCode = 401;
    authError.cause = error;
    throw authError;
  }
};

