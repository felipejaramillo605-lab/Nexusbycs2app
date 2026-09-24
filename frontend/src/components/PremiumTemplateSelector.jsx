// NEXUS_PREMIUM_TEMPLATE_SELECTOR_V1
import React, { useEffect, useState } from 'react';
import { Check, Crown, Lock, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { organizationAPI } from '../api';
import { PREMIUM_TEMPLATE_IMPLEMENTATIONS, PREMIUM_TEMPLATE_KEYS } from '../portal-templates';
import { AccessibleModal } from './design/AccessibleModal';

// Briefs for templates still in the roadmap (no visual implementation yet).
// Shown as "coming soon" tiles so managers see the full premium catalog,
// matching the design briefs already authored in the vault.
const UPCOMING_TEMPLATE_INFO = {
  claridad: { name: 'Claridad', description: 'Clínico y de confianza — en pausa hasta definir el perfil de cliente para salud' },
  noir: { name: 'Noir', description: 'Belleza de lujo, moody — próximamente' },
  atelier: { name: 'Atelier', description: 'Editorial y minimalista — próximamente' },
  recreo: { name: 'Recreo', description: 'Lúdico e infantil — próximamente' },
};

function TemplatePreviewSwatch({ template }) {
  const { theme } = template;
  return (
    <div
      className="h-24 rounded-lg relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${theme.bgStart} 0%, ${theme.bgEnd} 100%)` }}
    >
      <div
        className="absolute bottom-2 right-2 px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wide"
        style={{ backgroundColor: theme.accentPrimary, color: theme.onAccentPrimary }}
      >
        Reservar
      </div>
      <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full" style={{ backgroundColor: theme.accentSecondary }} />
      <div
        className="absolute top-2 left-2 text-xs font-medium"
        style={{ color: theme.textPrimary, fontFamily: `'${template.fontFamily}', serif` }}
      >
        {theme.name}
      </div>
    </div>
  );
}

function TemplatePreviewModal({ template, onClose }) {
  useEffect(() => {
    if (!template?.fontHref) return undefined;
    const id = `nexus-premium-preview-font-${template.key}`;
    if (document.getElementById(id)) return undefined;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = template.fontHref;
    document.head.appendChild(link);
    return () => link.remove();
  }, [template]);

  if (!template) return null;
  const { theme } = template;
  return (
    <AccessibleModal open={!!template} onClose={onClose} labelledBy="premium-template-preview-title" describedBy="premium-template-preview-description">
      <button type="button" className="float-right text-zinc-400" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      <h2 id="premium-template-preview-title" className="text-xl text-[var(--app-text-primary)]">{theme.name}</h2>
      <p id="premium-template-preview-description" className="text-sm text-zinc-400 mt-1 mb-4">{theme.description}</p>
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ background: `linear-gradient(135deg, ${theme.bgStart} 0%, ${theme.bgEnd} 100%)`, fontFamily: `'${template.fontFamily}', sans-serif` }}
      >
        <div style={{ color: theme.textPrimary, fontFamily: `'${template.fontFamily}', serif`, fontSize: '1.5rem', fontWeight: 600 }}>
          Bienvenido a tu negocio
        </div>
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: theme.surface, color: theme.textPrimary, boxShadow: theme.boxShadow !== 'none' ? theme.boxShadow : undefined, border: `1px solid ${theme.border}` }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>Corte clásico</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.75 }}>45 min · $25.000</div>
        </div>
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: theme.accentPrimary, color: theme.onAccentPrimary }}
        >
          Agendar cita
        </button>
      </div>
    </AccessibleModal>
  );
}

export default function PremiumTemplateSelector({ organizationId, currentTemplate = 'classic', contracted = false, onTemplateChange, onRequestPremium }) {
  const [saving, setSaving] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(currentTemplate);
  const [previewKey, setPreviewKey] = useState(null);

  useEffect(() => {
    setSelectedTemplate(PREMIUM_TEMPLATE_IMPLEMENTATIONS[currentTemplate] ? currentTemplate : currentTemplate);
  }, [currentTemplate]);

  const handleSelect = async (key) => {
    if (saving || !contracted || !PREMIUM_TEMPLATE_IMPLEMENTATIONS[key]) return;
    const previous = selectedTemplate;
    setSelectedTemplate(key);
    setSaving(true);
    try {
      await organizationAPI.update(organizationId, { portal_template: key });
      toast.success('Plantilla premium actualizada');
      onTemplateChange?.(key);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible actualizar la plantilla');
      setSelectedTemplate(previous);
    } finally {
      setSaving(false);
    }
  };

  const availableTemplates = PREMIUM_TEMPLATE_KEYS
    .map((key) => PREMIUM_TEMPLATE_IMPLEMENTATIONS[key])
    .filter(Boolean);
  const upcomingKeys = PREMIUM_TEMPLATE_KEYS.filter((key) => !PREMIUM_TEMPLATE_IMPLEMENTATIONS[key]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--app-surface-solid)] border border-[var(--app-border)] flex items-center justify-center">
          <Crown size={20} className="text-[var(--app-primary)]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--app-text-primary)]">Plantillas Premium</h3>
          <p className="text-sm text-[var(--app-text-secondary)]">Diseños originales y profundos para el portal de tus clientes, incluidos en el plan Premium.</p>
        </div>
      </div>

      {!contracted && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--app-primary)]/40 bg-[var(--app-primary)]/10 p-4">
          <Lock size={18} className="text-[var(--app-primary)] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--app-text-primary)] font-medium">Estas plantillas requieren el plan Premium</p>
            <p className="text-xs text-[var(--app-text-secondary)]">Puedes ver la vista previa de cada una. Para activarlas, solicita el plan Premium.</p>
          </div>
          {onRequestPremium && (
            <button type="button" onClick={onRequestPremium} className="shrink-0 nexus-button nexus-button-primary inline-flex items-center gap-2 text-sm">
              <Sparkles size={14} /> Solicitar Premium
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {availableTemplates.map((template) => {
          const { theme } = template;
          const isSelected = contracted && selectedTemplate === template.key;
          const locked = !contracted;
          return (
            <div
              key={template.key}
              className={`relative rounded-xl border-2 p-4 transition-all ${
                isSelected ? 'border-[var(--app-primary)] bg-[var(--app-primary)]/10' : 'border-[var(--app-border)] bg-[var(--app-surface-solid)]'
              } ${locked ? 'opacity-90' : ''}`}
            >
              {locked && (
                <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                  <Lock size={10} /> Premium
                </span>
              )}
              <button
                type="button"
                onClick={() => setPreviewKey(template.key)}
                className="block w-full text-left"
                aria-label={`Ver vista previa de ${theme.name}`}
              >
                <TemplatePreviewSwatch template={template} />
              </button>
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--app-text-primary)]">{theme.name}</span>
                  {isSelected && <Check size={18} className="text-[var(--app-primary)]" />}
                </div>
                <p className="text-xs text-[var(--app-text-secondary)]">{theme.description}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewKey(template.key)}
                  className="flex-1 rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-primary)] hover:border-[var(--app-primary)]/50"
                >
                  Vista previa
                </button>
                <button
                  type="button"
                  disabled={locked || saving}
                  onClick={() => handleSelect(template.key)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    locked
                      ? 'bg-[var(--app-surface-muted)] text-[var(--app-text-muted)] cursor-not-allowed'
                      : 'bg-[var(--app-primary)] text-white disabled:opacity-60'
                  }`}
                >
                  {isSelected ? 'Activa' : 'Usar esta plantilla'}
                </button>
              </div>
            </div>
          );
        })}

        {upcomingKeys.map((key) => {
          const info = UPCOMING_TEMPLATE_INFO[key] || { name: key, description: 'Próximamente' };
          return (
            <div key={key} className="rounded-xl border border-dashed border-[var(--app-border)] p-4 opacity-60">
              <div className="h-24 rounded-lg bg-[var(--app-surface-muted)] grid place-items-center text-xs text-[var(--app-text-muted)]">
                En construcción
              </div>
              <div className="mt-3 space-y-1">
                <span className="font-medium text-[var(--app-text-secondary)]">{info.name}</span>
                <p className="text-xs text-[var(--app-text-muted)]">{info.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <TemplatePreviewModal
        template={availableTemplates.find((t) => t.key === previewKey) || null}
        onClose={() => setPreviewKey(null)}
      />
    </div>
  );
}
