'use client';

import { isHolidaySeason } from '@/lib/holidaySeason';

const SNOWFLAKE_COUNT = 12;

export default function HolidaySnowfall() {
  if (!isHolidaySeason()) {
    return null;
  }

  return (
    <div className="snowflakes" aria-hidden="true">
      {Array.from({ length: SNOWFLAKE_COUNT }).map((_, index) => (
        <div key={index} className="snowflake">
          <div className="inner">❅</div>
        </div>
      ))}
    </div>
  );
}
