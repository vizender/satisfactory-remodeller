import { useEffect, useState } from "react";

const MOBILE_ACK_KEY = "remodeller:mobile-warning-ack";

export function detectMobileLikeViewport(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia("(max-width: 1024px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const touch = navigator.maxTouchPoints > 0;
  return (narrow && coarse) || (narrow && touch);
}

export function useMobileLikeViewport(): boolean {
  const [mobile, setMobile] = useState(detectMobileLikeViewport);

  useEffect(() => {
    const update = () => setMobile(detectMobileLikeViewport());
    const q1 = window.matchMedia("(max-width: 1024px)");
    const q2 = window.matchMedia("(pointer: coarse)");
    q1.addEventListener("change", update);
    q2.addEventListener("change", update);
    return () => {
      q1.removeEventListener("change", update);
      q2.removeEventListener("change", update);
    };
  }, []);

  return mobile;
}

export function isMobileWarningAcknowledged(): boolean {
  try {
    return sessionStorage.getItem(MOBILE_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeMobileWarning(): void {
  try {
    sessionStorage.setItem(MOBILE_ACK_KEY, "1");
  } catch {
    /* ignore */
  }
}
