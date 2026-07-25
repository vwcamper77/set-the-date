import { FAMILY_SITES } from '@/lib/familySites';

export const buildGmbfOrganization = () => ({
  '@type': 'Organization',
  '@id': `${FAMILY_SITES.gmbfVentures.url}#organization`,
  name: FAMILY_SITES.gmbfVentures.name,
  url: FAMILY_SITES.gmbfVentures.url,
  identifier: {
    '@type': 'PropertyValue',
    propertyID: 'Companies House company number',
    value: '17286832',
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: '124 City Road',
    addressLocality: 'London',
    postalCode: 'EC1V 2NX',
    addressCountry: 'GB',
  },
});

export const buildSetTheDateOrganization = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${FAMILY_SITES.setTheDate.url}#organization`,
  name: FAMILY_SITES.setTheDate.name,
  url: FAMILY_SITES.setTheDate.url,
  parentOrganization: buildGmbfOrganization(),
});
