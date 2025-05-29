export default function ShareButtonsLayout({ onShare }) {
  return (
    <div className="flex flex-col gap-3 items-center">
      <button onClick={() => onShare("whatsapp")} className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded w-64">
        📲 Share via WhatsApp
      </button>

      <button onClick={() => onShare("email")} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded w-64">
        📧 Share via Email
      </button>

      <button onClick={() => onShare("discord")} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded w-64">
        💬 Share via Discord
      </button>

      <button onClick={() => onShare("slack")} className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded w-64">
        💼 Share via Slack
      </button>

      <button onClick={() => onShare("sms")} className="bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded w-64 sm:hidden">
        📱 Share via SMS
      </button>

      <button onClick={() => onShare("copy")} className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded w-64">
        🔗 Copy Poll Link
      </button>
    </div>
  );
}
