import React, { useState } from 'react';
import { getConsent, hasOptionalProviders, saveConsent } from '../lib/consent';

export default function ConsentBanner() {
  const [open, setOpen] = useState(hasOptionalProviders() && !getConsent().updatedAt);
  const [preferences, setPreferences] = useState(false);
  if (!hasOptionalProviders()) return <ConsentPreferencesLink />;
  const apply = (choice) => { saveConsent(choice); setOpen(false); setPreferences(false); };
  return (
    <>
      <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>Preferencias de privacidad</button>
      {open && <section role="dialog" aria-label="Preferencias de privacidad" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-slate-300 bg-white p-5 shadow-xl">
        <p className="font-semibold">Preferencias de privacidad</p>
        <p className="mt-1 text-sm text-slate-600">Las categorías opcionales están desactivadas hasta que elijas una opción.</p>
        {preferences && <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" onChange={(event) => setPreferences(event.target.checked)} /> Permitir analítica y marketing</label>}
        <div className="mt-4 flex gap-3">
          <button type="button" className="rounded border px-4 py-2" onClick={() => apply({ analytics: false, marketing: false })}>Rechazar todo</button>
          <button type="button" className="rounded border px-4 py-2" onClick={() => preferences ? apply({ analytics: true, marketing: true }) : setPreferences(true)}>Aceptar</button>
        </div>
      </section>}
    </>
  );
}

export function ConsentPreferencesLink() {
  return <button type="button" className="fixed bottom-2 right-2 z-40 text-xs text-slate-500 underline" onClick={() => {}}>
    Preferencias de privacidad
  </button>;
}
