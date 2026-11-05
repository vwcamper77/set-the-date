# Organiser helpers

`/admin/organiser-helpers` manages organiser-only follow-ups. The dashboard links to it. No Grok subscription or AI API is needed: event state determines each action.

## Rules

| Helper | When | Maximum attempts |
| --- | --- | --- |
| Share | Created 1–7 days ago, no share evidence and no guest votes | 2 |
| Responses | Shared, created 2–7 days ago, no guest votes | 2 |
| Closing | Deadline within 24 hours, shared, fewer than 3 guest responses | 1 |
| Finalise | Deadline passed within 7 days with guest responses; or no deadline, at least 3 responses, event 3–30 days old | 2 |
| Review | 2–14 days after confirmed event date; no organiser review already recorded | 1 |

Unfinalised events require a remaining proposed date. Trip windows include their existing flexibility padding and support legacy `selectedDates`, matching the current trip availability rules. Trips require `finalDate` and `finalEndDate` before review requests; the existing trip UI does not yet record a confirmed end, so no automated trip review requests are sent. A proposed window is not evidence that an event happened.

Defaults: 25 attempts per London calendar day, 48 hours between attempts to the same normalised organiser email across events, 6 attempts per event, sending 09:00–19:00 Europe/London. Caps count failed attempts too. Test, archived, cancelled, paused, opted-out, invalid-contact, and tokenless events are excluded. The test-address list matches the admin dashboard. Helpers never choose dates, write reviews, or contact attendees.

## GitHub-only rollout

1. Review and merge this branch through the normal GitHub pull request workflow. Let the existing Vercel Git integration build production. Do not deploy local output or call a deployment hook.
2. Store the same random secret (at least 32 random bytes) as `CRON_SECRET` in the production Vercel environment (already configured; never overwrite an existing cron secret). Keep it out of code, PRs and logs. Use a subsequent GitHub-triggered deployment if needed to apply environment changes. Existing Firebase Admin credentials and `BREVO_API_KEY` must be present. Preview deployments cannot send, unsubscribe, change settings, or take ownership of legacy reminders.
3. Vercel registers the hourly schedule in `vercel.json` when GitHub deploys production. It sends an authenticated GET at minute 17 of each hour. The runner takes a lease to prevent overlap, scans pages within its time budget, and persists a cursor for the next invocation. It records a heartbeat even while disabled. GitHub Actions is not required for scheduling.
4. Sign in to production admin, inspect the queue using **Check more events**, choose the daily cap and helper types, then turn on **Send automatically** and save. Activation requires a scheduler heartbeat within the last two hours and configured secrets. It is off by default until this step. Existing eligible events inside the short rule windows are included.
5. Check the first accepted email in Brevo, the organiser management/review links, unsubscribe, and the admin pause controls. Provider acceptance is not proof of inbox delivery.

## Delivery and cutover

Transactions read the current configuration, event, guest votes, reviews, organiser cooldown, and daily budget before claiming an attempt. Provider calls happen outside transactions. Overlapping runs cannot claim the same event or organiser simultaneously. Claims are counted before sending, and the event remains held after ambiguous provider outcomes or process failure. Admins check Brevo, then dismiss the held attempt after 15 minutes; dismissal does not resend or refund the attempt. Known HTTP 4xx provider rejections are recorded as failed; other failures are uncertain. A pause stops new claims; an email already claimed may finish.

The four legacy scheduled reminder endpoints are retired when `activatedAt` is first recorded. They stay retired during pauses, preventing old Cloud Functions from continuing to send around the pause control. Snapshot legacy counts before an old worker can overwrite them after ignoring the non-success HTTP response. Legacy worker resources are not redeployed or deleted by this change. Other transactional email flows remain separate. Historic manual review requests stored only in browser local storage cannot be deduplicated retroactively; existing submitted organiser reviews do suppress requests.

State is stored in top-level `organiserHelperSettings`, `organiserHelperEvents`, `organiserHelperRecipients`, `organiserHelperDays`, and `organiserHelperHistory` collections, accessed only by Admin SDK APIs. Existing checked-in Firestore rules deny client access to these collections by default. Recipient IDs are SHA-256 hashes of normalised email addresses. Event edit tokens never appear in the preview or delivery log. Each organiser email contains a separate random event opt-out token; loading its page does not change state, protecting against email link scanners. Confirming the form stops the event's helpers.

## Validation and remaining live checks

Automated tests cover decisions, trip windows, review suppression, London daylight saving, caps, concurrent claims, provider failure, uncertain delivery holds, unsubscribe, scheduler authentication, verified admin access, preview guards, and read-only previews. Run `npm test`; the suite uses in-memory data and does not send email. Run `npm run build` with dummy public Firebase configuration for an isolated build.

Live database access, deployed rules, provider delivery, and activation must be verified in the correct project. Owner sign-in as `setthedateapp@gmail.com` is complete and read-only checks verified the default STANDARD Firestore database. No production database or notification changes were made. The repository's existing public poll read/write rules remain a separate known limitation: this feature does not make the underlying poll data authoritative or remediate public poll creation/editing. Do not treat the local tests as a production security or delivery verification.

References: [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email).
