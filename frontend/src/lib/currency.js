// Single source of truth for money formatting across the app. Before this file existed, ~18
// pages each redefined their own `money`/`formatCurrency` helper independently, and a few of
// them had drifted to force 2 decimal places -- COP has 0 minor units by ISO 4217, so those
// were the outliers, not the norm. Centralizing here keeps every screen showing amounts the
// same way ("$45.000", never "$45.000,00").
//
// La moneda funcional sigue al pais de la organizacion activa (COP para Colombia, USD para Estados Unidos):
// OrganizationContext la fija con setActiveCurrency al cargar la organizacion. Sin organizacion es COP.

const LOCALE_BY_CURRENCY = { COP: 'es-CO', USD: 'en-US' };
const DECIMALS_BY_CURRENCY = { COP: 0, USD: 2 };

let activeCurrency = 'COP';

export function setActiveCurrency(currency) {
  activeCurrency = LOCALE_BY_CURRENCY[currency] ? currency : 'COP';
}

export function getActiveCurrency() {
  return activeCurrency;
}

export function formatCOP(value, currency = activeCurrency) {
  const decimals = DECIMALS_BY_CURRENCY[currency] ?? 0;
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] || 'es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0);
}

// For amounts stored in minor units (cents), as subscription/billing amounts are.
// Facturas y suscripciones de Nexus se emiten en COP salvo que la factura indique otra moneda.
export function formatCOPMinor(minorValue, currency = 'COP') {
  return formatCOP((Number(minorValue) || 0) / 100, currency);
}
