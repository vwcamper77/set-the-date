# WordPress transition: verified inventory and release gates

Inspection date: 25 October 2026. No nameservers, DNS records, production routes or scheduled functions were changed during this work.

## What can move

| Existing feature | Destination | Current evidence / remaining work |
| --- | --- | --- |
| 19 published blog posts | Rebuilt marketing website | All 19 existing paths returned 200 on staging. Still compare full body content, media, downloads, metadata and canonicals. |
| Homepage, about, guides, comparison pages | Rebuilt website | 17 of 29 published page paths load; 11 community/member paths redirect home; sample page returns 404. Restore or explicitly map useful missing pages. |
| Contact Form 7 enquiry | Shared support inbox | WordPress currently emails hello@setthedate.app through Brevo. Website staging uses /api/contact; its backend and ticket integration have NOT been verified. Do not retire this WordPress route yet. |
| Venue Request Playbook form | Venue enquiry / support category | Existing Spectra form has no explicit saved recipient. Missing from rebuilt venue page. Restore delivery, follow-up and download before cutover. |
| Brevo signup | Brevo list integration | WordPress [sibwp_form id=1] targets Attendees, list 5. Confirmation, double opt-in and CAPTCHA are disabled. Consent and form placement need review before recreating. |
| Event questions and group coordination | /event/{id}/community | New event-specific conversation, pinned update, verified organiser/admin moderation, close discussion. Guests post without accounts. Visible to anyone with event link; no notification emails. |
| Lost event access | /help | Existing support/recovery branch sends management links to original organiser email. Case-normalisation of older emails and live delivery still require verification. |
| Support inbox | /admin/support | Existing support branch stores tickets in supportTickets and sends replies through Brevo. Not a migration of historic WordPress messages or email mailbox threads. |
| 20 WordPress users | Deliberate account transition | Do not copy passwords into Firebase. Existing My Events is device-local, not a synced account history. Require verified ownership when attaching legacy events; invite/reset-password flow needs implementation and testing. |
| BuddyBoss forums, groups, activity | Event conversations where useful | A full BuddyBoss migration is not implemented. Preserve a read-only export before retiring the old site. |

## Email continuity

Keep plan.setthedate.app and its existing Firebase scheduled functions in place. Keep the Brevo API configuration, sender addresses, list IDs and existing templates. Existing reminders are scheduled separately from the marketing website in functions/index.js. Moving nameservers does not migrate mailboxes or these schedules.

Confirmed in Brevo: setthedate.app authenticated; hello@setthedate.app and noreply@setthedate.app verified; WordPress transactional sending enabled. Existing account and event email activity is visible. This does not establish delivery for the new website endpoint.

This branch adds mocked response tests for organiser creation, vote notices and cancellation email handlers, including HTTP 401/429/500 failures. These handlers previously returned success even when Brevo rejected a request; they now surface the failure. Sender, reply-to, recipient and production management/share links are preserved. No live test emails were sent and no customer notifications were triggered. The community code does not import or call Brevo.

Additional existing issues requiring a separate reviewed fix: the event cancellation screen deletes the poll without calling notifyAttendeesOfCancellation; sendAttendeeConfirmation imports the modular web database but uses the old db.collection interface. Identify actual callers before changing finalisation behaviour. Neither issue is claimed fixed here.

## Before production / nameserver cutover

1. Resolve the existing open poll read/write Firestore permissions safely across creation, votes, edit, results and scheduled jobs (PR #43 launch blocker). Verify deployed rules as well as repository rules. Do not restrict production rules blindly.
2. Community API is disabled by default. Enable EVENT_COMMUNITY_ENABLED=true only in an approved environment after permissions and moderation are verified. Review community abuse controls and permissions; current messages are plain text, max 1,500 characters, with 10 posts per IP per hour. Names are unverified. Only a verified matching organiser email or verified admin can moderate. All new community data is server-only under eventCommunities; no client rules are opened. Keep deleted-event discussion inaccessible; decide retention/cleanup policy before launch.
3. Test real enquiry, recovery and reply delivery using an explicitly authorised test mailbox; verify inbox, reply-to and Brevo delivery events. Do not use customer addresses or bulk resend reminders.
4. Export WordPress content, media, users and recoverable form submissions. Contact Form 7 itself does not store submissions; check actual storage plugins and mailbox history. Do not promise historic enquiries exist in the new inbox.
5. Obtain the authoritative DNS zone and mailbox host details; preserve NS, MX, SPF, DKIM, DMARC, verification records and subdomains. The local DNS read attempt was denied, so a full DNS baseline is still outstanding.
6. Review content and old-to-new URL mapping, restore venue lead capture, preserve useful member access paths, and test mobile layouts and downloads.
7. Merge approved changes through GitHub and deploy through the provider's Git integration / GitHub Actions only. Keep WordPress and existing DNS available until the replacement is verified, with a documented rollback route.

The marketing website is a separate Vercel project. Its inspected deployment reports source `cli`; its source repository/Git integration must be established before future releases under the GitHub-first preference. This branch does not deploy or replace that website.


## Controlled delivery check — 25 October 2026

User authorised setthedateapp@gmail.com as the test inbox and requested forwarding specifically from hello@setthedate.app to gavinferns@hotmail.com.

- Submitted one clearly labelled support test through the authorised earlier preview. Ticket reference: 0MTjzRvL. Submission returned 201 and the ticket appeared in the authenticated admin inbox.
- Sent one tracked reply from that inbox through Brevo to the nominated Gmail address. The reply request returned 200 and the matching message appeared in Gmail Inbox. This verifies this support send path, not all scheduled email flows or the marketing website contact endpoint.
- Submitted one recovery request to the nominated Gmail address; response was the expected generic 200. No matching recovery email was found at the time checked, so recovery delivery is NOT signed off. No customer events were changed or new test polls created.
- Public DNS reads confirm MX: priority 0 mail.setthedate.app; mail A: 209.42.255.23; nameservers sd01a-nl.privatesystems.net and sd01b-nl.privatesystems.net. SPF: v=spf1 ip4:209.42.255.23 ip4:209.42.255.70 +a +mx ~all. DMARC: v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com. Preserve these and export the full authoritative zone including DKIM before any DNS move.
- The existing cPanel login is available at https://cpanel.setthedate.app/. Forwarding is pending the hosting-account sign-in. No forwarder or mailbox configuration has been changed.
