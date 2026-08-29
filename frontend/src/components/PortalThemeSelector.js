import React, { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { CLIENT_PORTAL_THEMES } from '../constants/clientPortalThemes';
import { toast } from 'sonner';
import { organizationAPI } from '../api';

export default function PortalThemeSelector({ organizationId, currentTheme = 'classic', onThemeChange }) {
  const [saving, setSaving] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);

  useEffect(() => {
    const validTheme = CLIENT_PORTAL_THEMES[currentTheme] ? currentTheme : 'classic';
    setSelectedTheme(validTheme);
  }, [currentTheme]);

  const handleThemeSelect = async (themeKey) => {
      if (saving || !CLIENT_PORTAL_THEMES[themeKey]) return;
    
    setSelectedTheme(themeKey);
    setSaving(true);

    try {
      await organizationAPI.update(organizationId, {
        client_portal_theme: themeKey
      });
      
      toast.success('Tema actualizado correctamente');
      if (onThemeChange) onThemeChange(themeKey);
    } catch (error) {
      console.error('Error updating theme:', error);
      toast.error('Error al actualizar el tema');
      setSelectedTheme(currentTheme); // Revert on error
    } finally {
      setSaving(false);
    }
  };

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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.values(CLIENT_PORTAL_THEMES).map((theme) => {
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
                </div>
                <p className="text-xs text-[var(--app-text-secondary)]">
                  {theme.description}
                </p>
              </div>
            </button>
          );
        })}
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
