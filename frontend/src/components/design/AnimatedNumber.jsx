import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
export function AnimatedNumber({ value = 0, format = value => value, duration = 500 }) {
  const reduced = useReducedMotion(); const previous = useRef(Number(value) || 0); const [display, setDisplay] = useState(previous.current);
  useEffect(() => { const target = Number(value) || 0; if (reduced) { setDisplay(target); previous.current = target; return; } const start = previous.current; const began = performance.now(); let frame; const tick = now => { const progress = Math.min((now - began) / duration, 1); const eased = 1 - Math.pow(1 - progress, 3); setDisplay(start + (target - start) * eased); if (progress < 1) frame = requestAnimationFrame(tick); else previous.current = target; }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [value, duration, reduced]);
  return <>{format(display)}</>;
}
