// NEXUS_PORTAL_PERSONALIZATION_V1
import React, { useEffect, useState } from 'react';
import { Image, MessageSquare, Save, Users, Tag, Clock, MapPin, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { organizationAPI } from '../api';

const TOGGLES = [
  { key: 'portal_show_team', label: 'Mostrar equipo', hint: 'Fotos y nombres de tus profesionales en el portal del cliente', icon: Users },
  { key: 'portal_show_prices', label: 'Mostrar precios', hint: 'Precio de cada servicio visible antes de agendar', icon: Tag },
  { key: 'portal_show_hours', label: 'Mostrar horario', hint: 'Horario de atención en la pantalla de bienvenida', icon: Clock },
  { key: 'portal_show_map', label: 'Mostrar ubicación', hint: 'Dirección y enlace a mapa en el portal', icon: MapPin },
  { key: 'catalog_enabled', label: 'Catálogo de productos', hint: 'Permite vender productos desde el portal del cliente (ropa, cosméticos, etc.)', icon: ShoppingBag },
];

export default function PortalCustomizationPanel({ organizationId, initial, onSaved }) {
  const [form, setForm] = useState({
    logo_url: '',
    portal_welcome_message: '',
    portal_show_team: true,
    portal_show_prices: true,
    portal_show_hours: true,
    portal_show_map: false,
    catalog_enabled: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setForm(current => ({
      ...current,
      logo_url: initial.logo_url || '',
      portal_welcome_message: initial.portal_welcome_message || '',
      portal_show_team: initial.portal_show_team ?? true,
      portal_show_prices: initial.portal_show_prices ?? true,
      portal_show_hours: initial.portal_show_hours ?? true,
      portal_show_map: initial.portal_show_map ?? false,
      catalog_enabled: initial.catalog_enabled ?? false,
    }));
  }, [initial]);

  const save = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    setSaving(true);
    try {
      const payload = {
        logo_url: form.logo_url.trim() || null,
        portal_welcome_message: form.portal_welcome_message.trim() || null,
        portal_show_team: form.portal_show_team,
        portal_show_prices: form.portal_show_prices,
        portal_show_hours: form.portal_show_hours,
        portal_show_map: form.portal_show_map,
        catalog_enabled: form.catalog_enabled,
      };
      const response = await organizationAPI.update(organizationId, payload);
      toast.success('Portal personalizado guardado');
      onSaved?.(response.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No fue posible guardar la personalización');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[var(--app-primary-soft)] flex items-center justify-center">
          <Image size={20} strokeWidth={1.5} className="text-[var(--app-primary)]" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-[var(--app-text-primary)]">Identidad y contenido del portal</h3>
          <p className="text-sm text-[var(--app-text-secondary)]">Así es como tus clientes ven tu negocio al agendar o revisar sus citas.</p>
        </div>
      </div>

      <form className="space-y-5" onSubmit={save}>
        {/* NEXUS_ORGANIZATION_LOGO_UPLOAD_V1: this used to be a raw "paste any
            URL" text field for logo_url. Replaced with a read-only preview
            that points to the real upload flow (Configuración > General) --
            having two independent ways to set the same field (a validated
            file upload vs. an arbitrary external URL) meant either one could
            silently overwrite the other's value on save. */}
        <div className="block">
          <span className="text-sm font-medium text-[var(--app-text-primary)]">Logo del negocio</span>
          <span className="block text-xs text-[var(--app-text-secondary)] mb-2">
            Se administra desde <strong className="text-[var(--app-text-primary)]">Configuración → General</strong>.
          </span>
          <div className="flex items-center gap-3">
            {form.logo_url ? (
              <img
                src={form.logo_url}
                alt="Vista previa del logo"
                className="h-12 w-12 rounded-lg object-contain border border-[var(--app-border)] bg-[var(--app-surface-solid)] p-1"
                onError={e => { e.currentTarget.style.opacity = 0.2; }}
              />
            ) : (
              <span className="h-12 w-12 rounded-lg border border-dashed border-[var(--app-border)] grid place-items-center text-xs text-[var(--app-text-muted)]">
                Sin logo
              </span>
            )}
            <span className="text-xs text-[var(--app-text-secondary)]">{form.logo_url ? 'Logo actual' : 'Aún no has subido un logo'}</span>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-[var(--app-text-primary)] flex items-center gap-2">
            <MessageSquare size={14} /> Frase de bienvenida
          </span>
          <span className="block text-xs text-[var(--app-text-secondary)] mb-2">Aparece en la pantalla de inicio del portal del cliente. Máximo 280 caracteres.</span>
          <textarea
            value={form.portal_welcome_message}
            onChange={e => setForm({ ...form, portal_welcome_message: e.target.value.slice(0, 280) })}
            placeholder="Bienvenido a Mi Barbería, tu espacio de confianza desde 2020."
            rows={2}
            className="w-full rounded-xl border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm text-[var(--app-text-primary)] focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)] outline-none resize-none"
          />
          <span className="block text-right text-xs text-[var(--app-text-secondary)]">{form.portal_welcome_message.length}/280</span>
        </label>

        <div>
          <span className="text-sm font-medium text-[var(--app-text-primary)]">Qué mostrar en el portal</span>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TOGGLES.map(({ key, label, hint, icon: Icon }) => (
              <label key={key} className="flex items-start gap-3 rounded-xl border border-[var(--app-border)] p-3 cursor-pointer hover:border-[var(--app-primary)]/50 transition-colors">
                <input
                  type="checkbox"
                  checked={!!form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.checked })}
                  className="mt-1 accent-[var(--app-primary)]"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium text-[var(--app-text-primary)]"><Icon size={14} />{label}</span>
                  <span className="block text-xs text-[var(--app-text-secondary)]">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary flex items-center gap-2 disabled:opacity-60"
        >
          <Save size={16} />
          {saving ? 'Guardando…' : 'Guardar personalización'}
        </button>
      </form>
    </div>
  );
}
