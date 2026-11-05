const secret = process.env.ORGANISER_HELPERS_SECRET;
if (!secret) throw new Error('Set ORGANISER_HELPERS_SECRET in GitHub Actions and the production app environment.');
let cursor = null;
let failures = 0;
for (let page = 0; page < 500; page += 1) {
  const response = await fetch('https://plan.setthedate.app/api/cron/organiser-helpers', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor }), signal: AbortSignal.timeout(300000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Helper scheduler returned HTTP ${response.status}. Check the admin delivery history before rerunning.`);
  const result = await response.json();
  console.log(JSON.stringify({ page: page + 1, accepted: result.accepted || 0, failed: result.failed || 0, uncertain: result.uncertain || 0, paused: result.paused || false, quietHours: result.quietHours || false }));
  failures += (result.failed || 0) + (result.uncertain || 0);
  cursor = result.nextCursor;
  if (!cursor) {
    if (failures) throw new Error(`${failures} delivery attempts need attention. Check Organiser Helpers in admin.`);
    process.exit(0);
  }
}
throw new Error('Scan reached the page limit. Increase capacity before enabling more events.');
