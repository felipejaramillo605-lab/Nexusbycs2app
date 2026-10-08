// Perfil del pais donde ejerce la organizacion (espejo de backend/country_profiles.py).
// Colombia conserva todo; Estados Unidos oculta de forma temporal lo que depende de normativa colombiana
// (nomina, RRHH) o que aun requiere revision legal estadounidense (campanas de marketing).
// Los recordatorios y confirmaciones de citas no son marketing y se mantienen.

export const FEATURES = Object.freeze({
  MARKETING: 'marketing_campaigns',
  PAYROLL: 'payroll',
  HR: 'hr',
});

export const COUNTRY_PROFILES = Object.freeze({
  CO: Object.freeze({
    country: 'CO',
    label: 'Colombia',
    currency: 'COP',
    locale: 'es-CO',
    phoneCountry: 'CO',
    phonePrefix: '+57',
    timezone: 'America/Bogota',
    portalLanguage: 'es',
    disabledFeatures: Object.freeze([]),
    messagingConsentRequired: false,
  }),
  US: Object.freeze({
    country: 'US',
    label: 'Estados Unidos',
    currency: 'USD',
    locale: 'en-US',
    phoneCountry: 'US',
    phonePrefix: '+1',
    timezone: 'America/New_York',
    portalLanguage: 'en',
    disabledFeatures: Object.freeze([FEATURES.MARKETING, FEATURES.PAYROLL, FEATURES.HR]),
    messagingConsentRequired: true,
  }),
});

export const DEFAULT_COUNTRY = 'CO';

// Texto exacto que acepta el cliente para recibir mensajes de su cita por texto/WhatsApp (se guarda con la fecha y la IP).
// Apoyo tecnico: un abogado debe validar esta redaccion antes de operar en Estados Unidos.
export const MESSAGING_CONSENT_TEXT = 'Acepto recibir mensajes de texto o WhatsApp sobre mis citas (confirmaciones y recordatorios) en este número. La frecuencia varía y pueden aplicar tarifas de mensajes y datos. Responde STOP para dejar de recibirlos. No es necesario para reservar.';

export const normalizeCountry = (value) => {
  const code = String(value || '').trim().toUpperCase();
  return COUNTRY_PROFILES[code] ? code : DEFAULT_COUNTRY;
};

export const getCountryProfile = (organization) => COUNTRY_PROFILES[normalizeCountry(organization?.operating_country)];

export const featureEnabled = (organization, feature) => !getCountryProfile(organization).disabledFeatures.includes(feature);

/** Funcion a la que pertenece una ruta del manager o del profesional (si depende del pais). */
export const FEATURE_BY_PATH = Object.freeze({
  '/manager/payroll': FEATURES.PAYROLL,
  '/manager/hr': FEATURES.HR,
  '/manager/wellbeing': FEATURES.HR,
  '/manager/marketing': FEATURES.MARKETING,
  '/staff/autogestion': FEATURES.HR,
  '/staff/bienestar': FEATURES.HR,
});

export const featureForPath = (path) => FEATURE_BY_PATH[path] || null;

export const FEATURE_LABELS = Object.freeze({
  [FEATURES.MARKETING]: 'Campañas de marketing',
  [FEATURES.PAYROLL]: 'Nómina',
  [FEATURES.HR]: 'Recursos humanos',
});
