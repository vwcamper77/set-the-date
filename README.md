# Set The Date

Set The Date is a lightweight group scheduling web app that helps organisers propose event dates, share polls, and collect votes to find the best date for any event. No login required for attendees.

---

## Features

- Propose multiple dates for your event
- Share a poll link via WhatsApp and other platforms
- Collect votes: Best / Maybe / No
- View results and suggested best date
- Automatic email reminders and notifications

---

## Getting Started

### Prerequisites

- **Node.js 18** or later (Next.js 15 requires at least Node 18).
- **npm** (ships with Node) or your preferred package manager.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root for the keys the app expects:

```bash
cp .env.local.example .env.local # if you already have an example file
# otherwise create .env.local and add the variables below thanks
```

Minimum variables to run locally:

```dotenv
# Frontend URLs
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Firebase (used for auth/analytics and to avoid runtime errors)
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-firebase-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-firebase-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-firebase-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-firebase-measurement-id

# Optional integrations (can be omitted if you do not need them locally)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token
NEXT_PUBLIC_BREVO_ATTENDEES_LIST_ID=0
NEXT_PUBLIC_GTM_ID=
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=
BREVO_API_KEY= # required only if you want to send emails locally
CRON_SECRET=   # required only if you plan to call cron-protected API routes
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_PARTNER_PRICE_ID=price_1SSGTrLdEkFpf0t0nBGGHgIc
STRIPE_PARTNER_TRIAL_DAYS=14
NEXT_PUBLIC_MARKETING_BASE_URL=https://setthedate.app
```

If you do not have credentials for a service, leave the value blank; features that rely
on that service will be skipped in development.

Need the venue Stripe price ID? Copy `.env.local.example` to `.env.local` and tweak values there—
that file contains the latest partner price reference.

### 3. Start the development server

```bash
npm run dev
```

By default Next.js serves the app at [http://localhost:3000](http://localhost:3000). Any
changes you make to the source files will hot-reload in the browser.

---

## Syncing with GitHub

This project now uses the `main` branch as its default and all history from the legacy
`work` branch has been migrated here. If you cloned the repo in an environment that still
references `work`, rename it locally before pushing:

```bash
git branch -m main
```

After renaming, add your GitHub remote (if it is not already configured) and push the
branch so GitHub stays in sync:

```bash
git remote add origin git@github.com:vwcamper77/set-the-date.git # or use HTTPS
git push -u origin main
```

Future `git push` and `git pull` commands will now default to `origin/main`.

---

## Forcing a Vercel Production Deploy

Vercel watches the `main` branch of this repo. If you need to redeploy without code changes,
create an empty commit and push it so Vercel sees a new revision:

```bash
git commit --allow-empty -m "trigger redeploy"
git push origin main
```

Alternatively, install the Vercel CLI (`npm i -g vercel`) and run `vercel --prod --confirm`
from the project root to force a deployment without touching Git.


