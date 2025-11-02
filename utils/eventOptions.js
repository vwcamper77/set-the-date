export const HOLIDAY_DURATION_OPTIONS = [
  { value: '2_nights', label: '2 nights' },
  { value: '3_nights', label: '3 nights' },
  { value: '4_nights', label: '4 nights' },
  { value: '5_nights', label: '5 nights' },
  { value: '1_week', label: '1 week' },
  { value: '10_nights', label: '10 nights' },
  { value: '2_weeks', label: '2 weeks' },
  { value: 'unlimited', label: "I'm flexible" },
];

export const getHolidayDurationLabel = (value) => {
  if (!value) return '';
  const option = HOLIDAY_DURATION_OPTIONS.find((entry) => entry.value === value);
  return option ? option.label : value;
};
