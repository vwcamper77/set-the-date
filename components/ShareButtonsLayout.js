const SHARE_OPTIONS = [
  {
    id: 'whatsapp',
    label: 'Share via WhatsApp',
    note: 'Fastest replies in group chats.',
    accent: 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-200',
    abbr: 'WA',
    badge: 'Most popular',
  },
  {
    id: 'sms',
    label: 'Share via SMS',
    note: 'Great for people who live in texts.',
    accent: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-200',
    abbr: 'SMS',
    wrapperClass: 'sm:hidden',
  },
  {
    id: 'email',
    label: 'Share via Email',
    note: 'Send a detailed invite straight to inboxes.',
    accent: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-200',
    abbr: 'EM',
  },
  {
    id: 'discord',
    label: 'Share via Discord',
    note: 'Perfect for servers and gamer groups.',
    accent: 'bg-indigo-500 hover:bg-indigo-600 focus:ring-indigo-200',
    abbr: 'DC',
  },
  {
    id: 'slack',
    label: 'Share via Slack',
    note: 'Drop it in #social or #team-plans.',
    accent: 'bg-pink-500 hover:bg-pink-600 focus:ring-pink-200',
    abbr: 'SL',
  },
  {
    id: 'copy',
    label: 'Copy Poll Link',
    note: 'Paste anywhere else you organise.',
    accent: 'bg-slate-900 hover:bg-slate-800 focus:ring-slate-400',
    abbr: 'LINK',
  },
];

const baseButtonClass =
  'group relative flex w-full max-w-lg items-center gap-4 rounded-2xl px-5 py-4 text-left text-white shadow-lg transition focus:outline-none focus:ring-4 focus:ring-offset-2';

export default function ShareButtonsLayout({ onShare }) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {SHARE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.id}
          onClick={() => onShare(option.id)}
          className={`${baseButtonClass} ${option.accent} ${option.wrapperClass || ''}`}
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-semibold tracking-wide">
            {option.abbr}
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold">{option.label}</p>
            <p className="text-sm opacity-90">{option.note}</p>
          </div>
          <svg
            className="h-5 w-5 text-white/90 transition group-hover:translate-x-1"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M7 5l5 5-5 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {option.badge ? (
            <span className="absolute -top-2 right-4 rounded-full bg-white/95 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-700 shadow-sm">
              {option.badge}
            </span>
          ) : null}
        </button>
      ))}
      <p className="mt-2 max-w-lg text-center text-xs text-slate-500">
        Tip: copy the poll link if you prefer another app and keep nudging people until they vote.
      </p>
    </div>
  );
}
