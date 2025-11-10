const timestampReplacer = (_, value) => {
  if (value && typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return null;
    }
  }
  return value;
};

export const serializeFirestoreData = (input) => {
  if (input === null || typeof input === 'undefined') return null;
  return JSON.parse(JSON.stringify(input, timestampReplacer));
};
