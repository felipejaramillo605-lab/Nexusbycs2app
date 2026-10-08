import React from 'react';
import { Globe2 } from 'lucide-react';
import { COUNTRY_PROFILES, FEATURE_LABELS } from '../lib/countryProfile';

const OPTIONS = [
  { code: 'CO', title: 'Colombia', detail: 'Pesos colombianos (COP), +57, nómina y normativa colombiana. Todas las funciones.' },
  { code: 'US', title: 'Estados Unidos', detail: 'Dólares (USD), +1 y portal del cliente en inglés/español. Algunas funciones se ocultan temporalmente.' },
];

/** Pregunta en el alta: pais donde ejerce la empresa. Define moneda, prefijo telefonico, zona horaria y funciones disponibles. */
export default function CountryOfOperationField({ value, onChange }) {
  const profile = COUNTRY_PROFILES[value] || COUNTRY_PROFILES.CO;
  return (
    <fieldset className="nexus-field-wide space-y-3" data-testid="country-of-operation">
      <legend className="flex items-center gap-2 text-sm font-medium text-[var(--app-text-primary)]"><Globe2 size={16} /> ¿Dónde ejerce la empresa?</legend>
      <p className="text-xs text-[var(--app-text-secondary)]">
        Fija la moneda, el prefijo telefónico, la zona horaria y las funciones disponibles. Se elige al crear la empresa.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="País de operación">
        {OPTIONS.map((option) => (
          <label
            key={option.code}
            className={`cursor-pointer rounded-xl border-2 p-4 transition-colors ${value === option.code ? 'border-[var(--app-primary)] bg-[var(--app-primary-soft)]' : 'border-[var(--app-border)]'}`}
          >
            <input
              type="radio"
              name="operating_country"
              value={option.code}
              checked={value === option.code}
              onChange={() => onChange(option.code)}
              className="sr-only"
            />
            <span className="block font-medium text-[var(--app-text-primary)]">{option.title}</span>
            <span className="mt-1 block text-xs text-[var(--app-text-secondary)]">{option.detail}</span>
          </label>
        ))}
      </div>
      {profile.disabledFeatures.length > 0 && (
        <p className="rounded-lg border border-[var(--app-border)] p-3 text-xs text-[var(--app-text-secondary)]" data-testid="country-disabled-notice">
          Temporalmente no disponible para {profile.label}: {profile.disabledFeatures.map((feature) => FEATURE_LABELS[feature]).join(', ')}.
          Los recordatorios y las confirmaciones de citas se mantienen.
        </p>
      )}
    </fieldset>
  );
}

/** Etiquetas del perfil fiscal segun el pais (NIT/Departamento en Colombia; EIN/Estado en Estados Unidos). */
export const fiscalLabels = (country) => (country === 'US'
  ? {
    documentOptions: [['EIN', 'EIN (Employer Identification Number)'], ['OTHER', 'Otro']],
    documentExample: 'EIN',
    taxId: 'Número de identificación (EIN)',
    taxIdExample: '12-3456789',
    region: 'Estado',
    regionExample: 'Florida',
    cityExample: 'Miami',
    addressExample: '123 Brickell Ave, Suite 400',
    phoneExample: '+1 305 123 4567',
    whatsappExample: 'https://wa.me/13051234567',
    country: 'United States',
  }
  : {
    documentOptions: [['NIT', 'NIT'], ['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['PASSPORT', 'Pasaporte'], ['OTHER', 'Otro']],
    documentExample: 'NIT',
    taxId: 'Número de identificación',
    taxIdExample: '900123456',
    region: 'Departamento',
    regionExample: 'Antioquia',
    cityExample: 'Medellín',
    addressExample: 'Calle 10 # 20-30',
    phoneExample: '+57 300 123 4567',
    whatsappExample: 'https://wa.me/573001234567',
    country: 'Colombia',
  });
