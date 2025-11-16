import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

const uppercaseLabelStyle = {
  fontSize: 18,
  textTransform: 'uppercase',
  letterSpacing: '0.4em',
  color: '#94a3b8',
};

const buildHighlightDates = (calendarDates, sortedDates) => {
  const source = Array.isArray(calendarDates) && calendarDates.length ? calendarDates : sortedDates;
  if (!Array.isArray(source) || !source.length) {
    return [];
  }

  const seen = new Set();
  const highlights = [];
  for (let i = 0; i < source.length; i += 1) {
    const value = source[i];
    if (!value || typeof value !== 'string') continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().split('T')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    highlights.push({
      weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      day: date.getDate(),
      month: date.toLocaleDateString('en-GB', { month: 'short' }),
    });
    if (highlights.length >= 6) break;
  }

  return highlights;
};

const safeDatesList = (formattedDates = []) => {
  if (Array.isArray(formattedDates) && formattedDates.length) {
    return formattedDates.slice(0, 4);
  }

  return ['Add a few dates so everyone can vote.'];
};

const getIdFromUrl = (url) => {
  if (!url) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : null;
};

export default async function handler(req) {
  const requestUrl = new URL(req.url);
  const id = getIdFromUrl(requestUrl);

  if (!id) {
    return new Response('Missing poll id', { status: 400 });
  }

  const origin = requestUrl.origin;
  const dataResponse = await fetch(`${origin}/api/share/event-snapshot-data/${id}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  const snapshotData = dataResponse.ok ? await dataResponse.json() : null;
  const {
    eventTitle = 'Set The Date event',
    organiser = '',
    location = 'Location TBC',
    formattedDates = [],
    calendarDates = [],
    sortedDates = [],
    isHolidayEvent = false,
    formattedHolidayStart = '',
    formattedHolidayEnd = '',
    proposedDurationLabel = '',
  } = snapshotData || {};

  const highlightedDates = buildHighlightDates(calendarDates, sortedDates);
  const datesList = safeDatesList(formattedDates);
  const hostLabel = requestUrl.hostname || 'plan.setthedate.app';
  const logoUrl = new URL('/images/setthedate-logo-small.png', requestUrl).toString();

  const travelWindowLine =
    isHolidayEvent && formattedHolidayStart && formattedHolidayEnd
      ? `${formattedHolidayStart} \u2013 ${formattedHolidayEnd}`
      : '';

  return new ImageResponse(
    (
      <div
        style={{
          fontFamily: 'Inter, Arial, sans-serif',
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          padding: '48px',
          background: '#f8fafc',
          color: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              style={{
                width: '110px',
                height: '110px',
                borderRadius: '24px',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 25px 70px rgba(15,23,42,0.15)',
              }}
            >
              <img src={logoUrl} alt="Set The Date" style={{ width: '90px', height: '90px' }} />
            </div>
            <div>
              <div style={{ ...uppercaseLabelStyle, fontSize: 14, color: '#0ca678', letterSpacing: '0.35em' }}>
                Set The Date
              </div>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Event snapshot</p>
              <p style={{ margin: 0, fontSize: 20, color: '#475569' }}>
                {organiser ? `${organiser} needs your vote` : 'Send your votes back fast'}
              </p>
            </div>
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              borderRadius: '999px',
              padding: '12px 20px',
              background: '#fff',
            }}
          >
            {hostLabel}
          </div>
        </div>

        <div style={{ marginTop: '36px', display: 'flex', gap: '30px', flex: 1 }}>
          <div
            style={{
              flex: 1.35,
              background: '#fff',
              borderRadius: '32px',
              padding: '36px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 40px 90px rgba(15,23,42,0.10)',
            }}
          >
            <p style={uppercaseLabelStyle}>Event snapshot</p>
            <h1
              style={{
                fontSize: 44,
                margin: '12px 0 0',
                lineHeight: 1.15,
              }}
            >
              {eventTitle}
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 26, color: '#0f172a' }}>{location}</p>
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isHolidayEvent && travelWindowLine ? (
                <>
                  <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Proposed travel window</p>
                  <p style={{ fontSize: 22, margin: 0 }}>{travelWindowLine}</p>
                  {proposedDurationLabel ? (
                    <p style={{ margin: 0, fontSize: 18, color: '#475569' }}>
                      Ideal trip length: {proposedDurationLabel}
                    </p>
                  ) : null}
                </>
              ) : (
                datesList.map((dateLine, index) => (
                  <div
                    key={`date-${index}`}
                    style={{
                      fontSize: 22,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      color: '#0f172a',
                    }}
                  >
                    <span
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: '#ecfccb',
                        color: '#365314',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                      }}
                    >
                      {index + 1}
                    </span>
                    {dateLine}
                  </div>
                ))
              )}
            </div>
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '24px',
                borderTop: '1px solid #e2e8f0',
                fontSize: 18,
                color: '#475569',
              }}
            >
              {organiser
                ? `${organiser} is waiting on your vote.`
                : 'Votes lock in the date faster.'}
            </div>
          </div>

          <div style={{ flex: 0.85, display: 'flex', flexDirection: 'column', gap: '26px' }}>
            <div
              style={{
                flex: 1,
                borderRadius: '30px',
                padding: '28px',
                background: 'linear-gradient(160deg, #dbeafe, #f0f9ff)',
                border: '1px solid #bfdbfe',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ ...uppercaseLabelStyle, color: '#1d4ed8', margin: 0 }}>Location map</p>
                <p style={{ margin: '12px 0 0', fontSize: 24, fontWeight: 600 }}>{location}</p>
                <p style={{ margin: '6px 0 0', fontSize: 18, color: '#1e3a8a' }}>
                  {"Exact location TBC - we'll confirm once the venue is locked."}
                </p>
              </div>
              <div
                style={{
                  marginTop: '30px',
                  width: '100%',
                  height: '130px',
                  borderRadius: '24px',
                  border: '2px dashed rgba(15,23,42,0.2)',
                  background:
                    'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.35), transparent 40%), radial-gradient(circle at 80% 0%, rgba(6,182,212,0.35), transparent 38%)',
                }}
              />
            </div>

            <div
              style={{
                flex: 1,
                borderRadius: '30px',
                padding: '28px',
                background: '#fff',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <p style={{ ...uppercaseLabelStyle, margin: 0 }}>Calendar</p>
              <p style={{ margin: '8px 0 0', fontSize: 18, color: '#475569' }}>
                Highlighted days show the options you picked.
              </p>
              <div
                style={{
                  marginTop: '22px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                {(highlightedDates.length ? highlightedDates : [{ weekday: 'TBC', day: '-', month: '' }]).map(
                  (entry, index) => (
                    <div
                      key={`calendar-${index}`}
                      style={{
                        borderRadius: '18px',
                        background: '#ecfeff',
                        border: '1px solid #99f6e4',
                        padding: '12px',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{entry.weekday}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 700 }}>{entry.day}</p>
                      <p style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{entry.month}</p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'max-age=0, s-maxage=600, stale-while-revalidate=1200',
      },
    },
  );
}
