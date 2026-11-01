const DEFAULT_GMBF_VENTURES_URL = 'https://gmbf-ventures.vercel.app/';

export const FAMILY_SITES = Object.freeze({
  gmbfVentures: Object.freeze({
    name: 'GMBF Ventures Ltd',
    url: process.env.NEXT_PUBLIC_GMBF_VENTURES_URL || DEFAULT_GMBF_VENTURES_URL,
    analyticsDestination: 'gmbf_ventures',
  }),
  clearTill: Object.freeze({
    name: 'ClearTill',
    url: 'https://www.cleartill.money/',
    analyticsDestination: 'cleartill',
  }),
  talosTv: Object.freeze({
    name: 'TalosTV',
    url: 'https://talostv.com/',
    analyticsDestination: 'talostv',
  }),
  socialMediaReminder: Object.freeze({
    name: 'Social Media Reminder',
    url: 'https://socialmediareminder.com/',
    analyticsDestination: 'social_media_reminder',
  }),
  snagSort: Object.freeze({
    name: 'SnagSort',
    url: 'https://www.snagsort.com/',
    analyticsDestination: 'snagsort',
  }),
  guestSetGo: Object.freeze({ name: 'GuestSetGo', url: 'https://www.guestsetgo.com/', analyticsDestination: 'guestsetgo' }),
  setTheDate: Object.freeze({
    name: 'Set The Date',
    url: 'https://plan.setthedate.app/',
  }),
});

export const FAMILY_FOOTER_SIBLINGS = Object.freeze([
  FAMILY_SITES.clearTill,
  FAMILY_SITES.talosTv,
  FAMILY_SITES.socialMediaReminder,
  FAMILY_SITES.snagSort,
  FAMILY_SITES.guestSetGo,
]);
