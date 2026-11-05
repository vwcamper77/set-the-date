# Set The Date — World Event Timeline

This is the **cloud-source version** of the 10-second worldwide event-creation animation. It is an offline administration/marketing tool, **not** a public page or a production analytics endpoint. Nothing is deployed by adding it to this branch.

## What it represents

- **Period:** 1 April 2025–23 October 2026 inclusive, measured by poll **creation** date (\`createdAt\`), *not* the dates proposed for an event.
- **Map markers:** coarse event destinations from the poll's \`location\` field, *not* where an organiser lives or created the poll.
- **Sources:** \`set-the-date\` Firebase project's \`polls\` collection. Known test accounts are excluded; verify any additional internal/test records before publication.
- **Privacy:** export includes **only** creation timestamp and approximate city/region coordinates. No names, emails, poll IDs, titles, edit tokens or votes are exported. Do not commit raw data.
- **Coverage:** place names that cannot be resolved are excluded with counts in the export report. Mapbox coordinates are rounded to two decimal places, avoiding precise venue pins. The visual must never claim 100% geographic coverage unless verified.

## Run against live Firestore (read-only)

Run in a trusted local or cloud shell with administrator access, not from a client-side page:

\`\`\`bash
pip install firebase-admin requests pillow
# ffmpeg must be installed separately, e.g. brew install ffmpeg
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/to/service-account.json
export MAPBOX_ACCESS_TOKEN=YOUR_EXISTING_MAPBOX_TOKEN
python scripts/event-world-map/export_firestore_events.py \
  --project-id set-the-date \
  --out scripts/event-world-map/private/public_events.json
python scripts/event-world-map/render_world_map.py \
  --data scripts/event-world-map/private/public_events.json \
  --out scripts/event-world-map/private/event-world-map.mp4
\`\`\`

Use Application Default Credentials instead of a service-account file if configured. The export is a **read-only** Firestore operation; neither script changes database documents or security rules.

The renderer automatically downloads and caches simplified world-country outlines from a public GeoJSON source when the local \`world.geojson\` does not exist. If working offline, place the \`world.geojson\` supplied in the previous generator archive alongside the render script.

## Video output

- 1600 × 900, 16:9; H.264 MP4; 30 frames/second; precisely 10 seconds.
- A horizontal April 2025–October 2026 date slider runs across the bottom.
- Yellow location lights emerge when a poll is created and persist through October 2026.
- Same-location polls accumulate at the same point. An on-screen counter shows mapped events, **not all created polls**.
- No organiser personal information appears in the video.

## Data quality and publication checks

Check \`public_events.audit.json\` after export for total polls, test exclusions, records outside the window, invalid/ambiguous locations, and mapped total. A successful render does not prove the coverage or accuracy of every geocoded destination. Spot-check location matches—especially generic names like "Springfield", "online", or venue-only strings—before public use. Always label the footage "event locations" rather than "organiser locations".

**Status:** Scripts committed here; *not* evidence that the Firestore export has been run or that a live-data MP4 has been produced. The previously supplied preview MP4 is demonstrative only and should not be presented as traction data.

## Security note

The repository's \`firestore.rules\` previously permitted unrestricted poll and vote reads/writes. Independently verify deployed rules and restrict access before building further administrative reporting. This branch deliberately does not touch those rules.
