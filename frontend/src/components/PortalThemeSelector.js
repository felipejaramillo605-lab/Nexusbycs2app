import React, { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { CLIENT_PORTAL_THEMES } from '../constants/clientPortalThemes';
import { toast } from 'sonner';
import { organizationAPI } from '../api';
import { getBusinessProfile } from '../lib/businessProfiles';

// El portal publico usa la plantilla premium si hay una activa (portal_template) y, si no, este tema normal.
// Por eso elegir un tema normal debe guardar tambien portal_template = 'classic'; si no, la premium sigue ganando.
export default function PortalThemeSelector({ organizationId, currentTheme = 'classic', businessType = 'barbershop', premiumActive = false, onThemeChange, onTemplateReset }) {
  const [saving, setSaving] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(premiumActive ? null : currentTheme);

  useEffect(() => {
    const validTheme = CLIENT_PORTAL_THEMES[currentTheme] ? currentTheme : 'classic';
    setSelectedTheme(premiumActive ? null : validTheme);
  }, [currentTheme, premiumActive]);

  const handleThemeSelect = (themeKey) => {
    if (saving || !CLIENT_PORTAL_THEMES[themeKey]) return;
    setSelectedTheme(themeKey);
  };

  // Hay algo por guardar si cambia el tema o si hoy manda una plantilla premium y se elige un tema normal.
  const dirty = !!selectedTheme && (selectedTheme !== currentTheme || premiumActive);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await organizationAPI.update(organizationId, { client_portal_theme: selectedTheme, portal_template: 'classic' });
      toast.success(premiumActive ? 'Tema guardado; la plantilla premium se desactivó' : 'Tema guardado');
      if (onThemeChange) onThemeChange(selectedTheme);
      if (onTemplateReset) onTemplateReset('classic');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'No fue posible guardar el tema');
    } finally {
      setSaving(false);
    }
  };

  const profile = getBusinessProfile(businessType);
  const themeRank = (themeKey) => {
    const index = profile.recommendedThemes.indexOf(themeKey);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const themes = Object.values(CLIENT_PORTAL_THEMES).sort((left, right) => themeRank(left.key) - themeRank(right.key));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[var(--app-surface-solid)] border border-[var(--app-border)] flex items-center justify-center">
          <Palette size={20} className="text-[var(--app-primary)]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--app-text-primary)]">
            Tema Visual del Portal
          </h3>
          <p className="text-sm text-[var(--app-text-secondary)]">
            Personaliza la apariencia de las páginas públicas de reserva
          </p>
          <p className="mt-1 text-xs text-[var(--app-primary)]">Recomendadas para {profile.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map((theme) => {
          const isSelected = selectedTheme === theme.key;
          
          return (
            <button
              key={theme.key}
              onClick={() => handleThemeSelect(theme.key)}
              disabled={saving}
              className={`
                relative p-4 rounded-xl border-2 transition-all text-left
                ${isSelected 
                  ? 'border-[var(--app-primary)] bg-[var(--app-primary)]/10' 
                  : 'border-[var(--app-border)] bg-[var(--app-surface-solid)] hover:border-[var(--app-primary)]/50'
                }
                ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* Theme Preview */}
              <div 
                className="h-16 rounded-lg mb-3 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${theme.bgStart} 0%, ${theme.bgEnd} 100%)`
                }}
              >
                <div 
                  className="absolute bottom-2 right-2 w-12 h-6 rounded"
                  style={{ backgroundColor: theme.accentPrimary }}
                />
                <div 
                  className="absolute bottom-2 left-2 w-6 h-6 rounded-full"
                  style={{ backgroundColor: theme.accentSecondary }}
                />
              </div>

              {/* Theme Info */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--app-text-primary)]">
                    {theme.name}
                  </span>
                  {isSelected && (
                    <Check size={18} className="text-[var(--app-primary)]" />
                  )}
                  {!isSelected && profile.recommendedThemes.includes(theme.key) && (
                    <span className="rounded-full bg-[var(--app-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--app-primary)]">Sugerida</span>
                  )}
                </div>
                <p className="text-xs text-[var(--app-text-secondary)]">
                  {theme.description}
                </p>
                {theme.category === 'group' && (
                  <span className="inline-block rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-text-secondary)]" data-testid={`group-chip-${theme.key}`}>Clases grupales</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {premiumActive && (
        <p className="text-sm text-[var(--app-primary)]" data-testid="premium-active-notice">
          Hoy tu portal usa una plantilla premium. Si eliges un tema normal y guardas, la premium se desactiva.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="save-portal-theme"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="nexus-button nexus-button-primary disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {dirty && <span className="text-xs text-[var(--app-text-secondary)]">Tienes cambios sin guardar</span>}
      </div>

      <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
        <p className="text-sm text-[var(--app-text-secondary)]">
          ℹ️ Este tema solo afecta las páginas públicas de reserva (/book/, /portal/). 
          El dashboard de administración mantiene su diseño actual.
        </p>
      </div>
    </div>
  );
}
