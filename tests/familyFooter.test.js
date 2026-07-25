const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

test('family footer has the approved ownership and sibling link copy', () => {
  const footer = read('components/SiteFooter.jsx');

  assert.match(footer, /SetTheDate is a product of/);
  assert.match(footer, />\s*GMBF Ventures Ltd\s*</);
  assert.match(footer, /Also from GMBF Ventures/);
  assert.match(footer, /\{site\.name\}/);
});

test('family site configuration contains the approved URLs and no SetTheDate sibling', () => {
  const config = read('lib/familySites.js');
  const siblingList = config.match(
    /FAMILY_FOOTER_SIBLINGS[\s\S]*?\[([\s\S]*?)\]/
  )?.[1];

  assert.match(config, /NEXT_PUBLIC_GMBF_VENTURES_URL/);
  assert.match(config, /https:\/\/gmbf-ventures\.vercel\.app\//);
  assert.match(config, /https:\/\/www\.cleartill\.money\//);
  assert.match(config, /https:\/\/talostv\.com\//);
  assert.match(config, /https:\/\/plan\.setthedate\.app\//);
  assert.match(siblingList, /clearTill/);
  assert.match(siblingList, /talosTv/);
  assert.doesNotMatch(siblingList, /setTheDate/);
});

test('family links are same-tab, keyboard-visible, and tracked with approved properties', () => {
  const footer = read('components/SiteFooter.jsx');

  assert.doesNotMatch(footer, /target=/);
  assert.doesNotMatch(footer, /rel=/);
  assert.match(footer, /aria-label="Visit GMBF Ventures Ltd"/);
  assert.match(footer, /focus-visible:outline/);
  assert.match(footer, /family_footer_click/);
  assert.match(footer, /source_product: 'setthedate'/);
  assert.match(footer, /placement: 'footer'/);
});

test('footer keeps existing web, partner-page, and native-app visibility rules', () => {
  const app = read('pages/_app.js');
  const partnerPage = read('pages/p/[slug].js');

  assert.match(app, /showPromoFooter && !isNativeIosApp && <SiteFooter \/>/);
  assert.match(partnerPage, /PartnerPublicPage\.showPromoFooter = false/);
  assert.match(app, /isNativeIosApp && <IosOrganizerNav \/>/);
});

test('footer layout wraps at narrow widths without adding app safe-area styles', () => {
  const footer = read('components/SiteFooter.jsx');

  assert.match(footer, /flex-col/);
  assert.match(footer, /sm:flex-row/);
  assert.match(footer, /flex-wrap/);
  assert.doesNotMatch(footer, /safe-area-inset/);
});

test('structured data preserves Set The Date and identifies its parent organisation', () => {
  const schema = read('lib/structuredData.js');

  assert.match(schema, /buildSetTheDateOrganization/);
  assert.match(schema, /parentOrganization: buildGmbfOrganization\(\)/);
  assert.match(schema, /17286832/);
  assert.match(schema, /124 City Road/);
  assert.match(schema, /EC1V 2NX/);
});
