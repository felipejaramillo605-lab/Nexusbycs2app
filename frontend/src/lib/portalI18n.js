// Idioma del portal del cliente (ingles / espanol). Solo el portal publico: los managers trabajan en espanol.
//
// Los textos del portal se escriben en espanol y `t('texto en espanol')` devuelve la traduccion al ingles si el idioma
// activo es ingles; sin traduccion devuelve el espanol (nunca se rompe una pantalla por una frase sin traducir).
// Marcadores posicionales: t('Hola, {0}', nombre).
//
// Idioma activo: lo que eligio la persona (interruptor ES | EN, recordado en este navegador) y, si no eligio,
// el idioma por defecto del pais de la organizacion (ingles en Estados Unidos, espanol en Colombia).
import { useCallback, useSyncExternalStore } from 'react';
import { useOptionalOrganization } from '../context/OrganizationContext';
import { getCountryProfile } from './countryProfile';
import { EN } from './portalI18n.en';

export const LANGUAGES = Object.freeze(['es', 'en']);
const STORAGE_KEY = 'nexus_portal_language';

const listeners = new Set();
let chosen = null;

const readStored = () => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(value) ? value : null;
  } catch {
    return null;
  }
};

if (typeof window !== 'undefined') chosen = readStored();

export const getChosenLanguage = () => chosen;

export function setPortalLanguage(language) {
  chosen = LANGUAGES.includes(language) ? language : null;
  try {
    if (chosen) window.localStorage.setItem(STORAGE_KEY, chosen);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento (modo privado): la eleccion vale solo para esta visita.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Idioma efectivo: eleccion de la persona o, si no hay, el de la organizacion. */
export const resolveLanguage = (organization, selected = chosen) => (
  LANGUAGES.includes(selected) ? selected : getCountryProfile(organization).portalLanguage
);

export function translate(text, language, args = []) {
  const source = String(text);
  const base = language === 'en' ? (EN[source] ?? source) : source;
  return args.length ? base.replace(/\{(\d+)\}/g, (match, index) => (args[Number(index)] ?? match)) : base;
}

/** Hook: { t, lang, setLang }. Re-renderiza al cambiar el idioma desde cualquier parte del portal. */
export function usePortalT() {
  const organization = useOptionalOrganization()?.organization;
  const selected = useSyncExternalStore(subscribe, getChosenLanguage, () => null);
  const lang = resolveLanguage(organization, selected);
  const t = useCallback((text, ...args) => translate(text, lang, args), [lang]);
  return { t, lang, setLang: setPortalLanguage };
}
