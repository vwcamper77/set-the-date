const toIsoDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (typeof value.toMillis === 'function') {
    return new Date(value.toMillis()).toISOString();
  }
  if (value?.seconds) {
    return new Date(value.seconds * 1000).toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizeRentalProperty = (property, slug) => {
  if (!property) return null;
  const normalised = { ...property };
  if (slug) {
    normalised.slug = slug;
  }
  ['createdAt', 'updatedAt', 'lastEditedAt', 'icalLastSyncedAt'].forEach((field) => {
    normalised[field] = toIsoDate(property[field]);
  });
  return normalised;
};
