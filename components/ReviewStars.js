const StarIcon = ({ filled, sizeClass, className }) => (
  <svg
    viewBox="0 0 20 20"
    className={`${sizeClass} ${className}`}
    aria-hidden="true"
  >
    <path
      d="M10 1.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L10 1.5z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export default function ReviewStars({
  rating = 0,
  sizeClass = "h-4 w-4",
  className = "",
}) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const label = `${value} out of 5`;

  return (
    <div className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={label}>
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < value;
        return (
          <StarIcon
            key={`star-${index}`}
            filled={filled}
            sizeClass={sizeClass}
            className={filled ? "text-amber-500" : "text-slate-300"}
          />
        );
      })}
    </div>
  );
}
