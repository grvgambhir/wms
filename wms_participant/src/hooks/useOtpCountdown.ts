import { useEffect, useState } from 'react';

/** Mock OTP expiry countdown — resets when `resetKey` changes (e.g. resend). */
export function useOtpCountdown(seconds: number, resetKey = 0) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [resetKey, seconds]);

  useEffect(() => {
    if (remaining <= 0) return;

    const timer = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining]);

  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const secs = String(remaining % 60).padStart(2, '0');

  return { remaining, label: `${minutes}:${secs}` };
}
