import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save, Smile } from 'lucide-react';
import {
  MAX_EMAIL_WORD_LENGTH,
  PROFESSIONAL_ICON_CHOICES,
  PROFESSIONAL_WORD_SUGGESTIONS,
  SERVICE_ICON_CHOICES,
  SERVICE_WORD_SUGGESTIONS,
  customEmailLabels,
  isValidEmailWord,
} from '../lib/emailLabels';

function IconPicker({ label, choices, value, onChange, testId }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-[var(--app-text-primary)]">{label}</legend>
      <div className="flex flex-wrap gap-2" data-testid={testId}>
        {choices.map((icon) => (
          <button
            key={icon}
            type="button"
            aria-pressed={value === icon}
            aria-label={`${label}: ${icon}`}
            onClick={() => onChange(icon)}
            className={`h-11 w-11 rounded-xl border text-xl transition-all ${
              value === icon ? 'border-[var(--app-primary)] bg-[var(--app-primary)]/20' : 'border-[var(--app-border)] bg-white/5 hover:bg-white/10'
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function WordField({ label, value, onChange, suggestions, listId, testId }) {
  const invalid = !isValidEmailWord(value);
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-[var(--app-text-primary)]">{label}</span>
      <input
        type="text"
        list={listId}
        value={value}
        maxLength={MAX_EMAIL_WORD_LENGTH}
        data-testid={testId}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--app-border)] bg-white/5 px-3 py-2 text-sm text-[var(--app-text-primary)]"
      />
      <datalist id={listId}>{suggestions.map((word) => <option key={word} value={word} />)}</datalist>
      {invalid && <span className="block text-xs text-red-400">Usa solo letras, números y signos simples.</span>}
    </label>
  );
}

const NO_LABELS = {};

/**
 * Personalización de los iconos y palabras de los correos de citas.
 * `custom` = lo que guardó el manager; `effective` = lo que hoy se envía (incluye el predeterminado de su tipo de negocio).
 */
export default function EmailLabelsCard({ custom = NO_LABELS, effective = NO_LABELS, onSave, saving = false }) {
  const [draft, setDraft] = useState({ ...effective, ...custom });

  useEffect(() => {
    setDraft({ ...effective, ...custom });
  }, [custom, effective]);

  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const valid = isValidEmailWord(draft.service_label) && isValidEmailWord(draft.professional_label);
  const serviceLabel = String(draft.service_label || '').trim() || 'Servicio';
  const professionalLabel = String(draft.professional_label || '').trim() || 'Profesional';

  const submit = (event) => {
    event.preventDefault();
    if (valid && onSave) onSave(customEmailLabels(draft));
  };

  const restore = () => {
    if (onSave) onSave({});
  };

  return (
    <div data-testid="email-labels-card" className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center"><Smile size={20} strokeWidth={1.5} className="text-sky-400" /></div>
        <div>
          <h2 className="text-lg font-medium text-[var(--app-text-primary)]">Iconos y palabras de los correos</h2>
          <p className="text-sm text-zinc-400">Elige los que mejor se ajusten a tu negocio en las confirmaciones y recordatorios de citas.</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <IconPicker label="Icono del servicio" choices={SERVICE_ICON_CHOICES} value={draft.service_icon} onChange={set('service_icon')} testId="email-service-icons" />
        <IconPicker label="Icono del profesional" choices={PROFESSIONAL_ICON_CHOICES} value={draft.professional_icon} onChange={set('professional_icon')} testId="email-professional-icons" />
        <div className="grid gap-4 sm:grid-cols-2">
          <WordField label="Cómo llamas al servicio" value={draft.service_label || ''} onChange={set('service_label')} suggestions={SERVICE_WORD_SUGGESTIONS} listId="email-service-words" testId="email-service-word" />
          <WordField label="Cómo llamas al profesional" value={draft.professional_label || ''} onChange={set('professional_label')} suggestions={PROFESSIONAL_WORD_SUGGESTIONS} listId="email-professional-words" testId="email-professional-word" />
        </div>
        <div data-testid="email-labels-preview" className="rounded-xl border border-[var(--app-border)] bg-white/5 p-3 text-sm text-[var(--app-text-primary)]" aria-label="Vista previa del correo">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Así se verá en el correo</div>
          <div className="flex justify-between py-1"><span>{draft.service_icon} {serviceLabel}</span><strong>Consulta inicial</strong></div>
          <div className="flex justify-between py-1"><span>{draft.professional_icon} {professionalLabel}</span><strong>Nombre del equipo</strong></div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" data-testid="email-labels-save" disabled={saving || !valid} className="flex-1 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><Loader2 size={18} className="animate-spin" />Guardando...</> : <><Save size={18} />Guardar correos</>}
          </button>
          <button type="button" data-testid="email-labels-restore" disabled={saving} onClick={restore} className="py-3 px-4 rounded-xl border border-[var(--app-border)] bg-white/5 text-sm text-[var(--app-text-primary)] hover:bg-white/10 flex items-center justify-center gap-2">
            <RotateCcw size={16} />Usar los de mi tipo de negocio
          </button>
        </div>
      </form>
    </div>
  );
}
