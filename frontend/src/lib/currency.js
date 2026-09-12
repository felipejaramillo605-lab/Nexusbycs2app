// Single source of truth for money formatting across the app. Before this file existed, ~18
// pages each redefined their own `money`/`formatCurrency` helper independently, and a few of
// them had drifted to force 2 decimal places -- COP has 0 minor units by ISO 4217, so those
// were the outliers, not the norm. Centralizing here keeps every screen showing amounts the
// same way ("$45.000", never "$45.000,00").
export function formatCOP(value, currency = 'COP') {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

// For amounts stored in minor units (cents), as subscription/billing amounts are.
export function formatCOPMinor(minorValue, currency = 'COP') {
  return formatCOP((Number(minorValue) || 0) / 100, currency);
}
