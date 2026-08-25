// NEXUS_ONBOARDING_V1
import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ONBOARDING_STEPS, ONBOARDING_ROLE_LABEL } from './onboardingSteps';
import { ONBOARDING_ILLUSTRATIONS } from './onboardingIllustrations';

const STORAGE_PREFIX = 'nexus-onboarding-seen-';

// Exposed so a "Ver tutorial de nuevo" button (e.g. in Settings) can re-trigger it.
export const resetOnboarding = (role) => {
  try { localStorage.removeItem(`${STORAGE_PREFIX}${role}`); } catch { /* storage unavailable */ }
};

export default function OnboardingTour({ role, autoStart = true }) {
  const steps = useMemo(() => ONBOARDING_STEPS[role] || [], [role]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!autoStart || !role || !steps.length) return;
    let seen = true;
    try { seen = localStorage.getItem(`${STORAGE_PREFIX}${role}`) === '1'; } catch { seen = true; }
    if (!seen) { setIndex(0); setOpen(true); }
  }, [role, autoStart, steps.length]);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(`${STORAGE_PREFIX}${role}`, '1'); } catch { /* storage unavailable */ }
  };

  if (!open || !steps.length) return null;

  const step = steps[index];
  const Illustration = ONBOARDING_ILLUSTRATIONS[step.illustration] || ONBOARDING_ILLUSTRATIONS.dashboard;
  const isLast = index === steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nexus-onboarding-title"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-elevated,#fff)] p-6 shadow-2xl"
          initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <div className="flex items-start justify-between mb-4">
            <span className="text-xs font-medium uppercase tracking-widest text-[var(--app-primary)]">
              {ONBOARDING_ROLE_LABEL[role] || 'Bienvenida'} · {index + 1}/{steps.length}
            </span>
            <button type="button" onClick={close} aria-label="Cerrar tutorial" className="text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]">
              <X size={18} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={reduced ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <Illustration />
              <h2 id="nexus-onboarding-title" className="mt-4 text-lg font-semibold text-[var(--app-text-primary)]">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-secondary)]">
                {step.description}
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === index ? 18 : 6,
                    background: i === index ? 'var(--app-primary)' : 'var(--app-border)',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setIndex(i => Math.max(0, i - 1))}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-[var(--app-text-secondary)] hover:text-[var(--app-text-primary)]"
                >
                  <ChevronLeft size={16} /> Atrás
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? close() : setIndex(i => i + 1))}
                className="btn-primary flex items-center gap-1 px-4 py-2 text-sm"
              >
                {isLast ? 'Empezar' : 'Siguiente'}
                {!isLast && <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
