import React from 'react';
import { usePortalT } from '../lib/portalI18n';

const OPTIONS = [['es', 'ES', 'Español'], ['en', 'EN', 'English']];

/** Interruptor de idioma del portal del cliente (espanol / ingles). La eleccion se recuerda en este navegador. */
export default function PortalLanguageSwitch({ className = '' }) {
  const { lang, setLang, t } = usePortalT();
  return (
    <div className={`nexus-lang-switch ${className}`.trim()} role="group" aria-label={t('Idioma')} data-testid="portal-language-switch">
      {OPTIONS.map(([code, short, full]) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={lang === code}
          aria-label={full}
          title={full}
          onClick={() => setLang(code)}
        >
          {short}
        </button>
      ))}
    </div>
  );
}
