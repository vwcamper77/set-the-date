import React from "react";

export default function WhatsAppShareButton({ url }) {
  const handleClick = () => {
    const fullUrl = url || window.location.href;
    const encodedUrl = encodeURIComponent(fullUrl);
    const whatsappUrl = `https://wa.me/?text=${encodedUrl}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <button
      onClick={handleClick}
      className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
    >
      Share on WhatsApp
    </button>
  );
}
