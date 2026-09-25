import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { billingAPI } from '../../api';
import { ActionButton, FieldGuide, SurfaceCard } from '../design';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

const DEFAULT_PROFILE = {
  billing_email: '',
  billing_contact_name: '',
  billing_contact_phone: '',
  legal_name: '',
  tax_id: '',
  address: '',
  city: '',
  cc_emails: '',
  copy_primary_manager: true,
  email_enabled: true,
};

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted from OwnerSubscriptions.js (plan
// PR 6, third increment). Unlike the org-scoped panels extracted in earlier
// rounds (announcements, PQRS, audit, deliveries -- still fed by the parent's
// load()), this one is made fully self-contained: saving a billing profile has
// no plausible effect on the subscription/invoices/audit/announcements/tickets
// the parent's load(orgId) also refreshes, so there's no reason to keep pulling
// all of that just to save this one form. Re-fetches whenever organizationId
// changes, same as the org switch already did through the parent before.
export default function BillingProfileCard({ organizationId }) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    billingAPI
      .getProfile({ organization_id: organizationId })
      .then((r) => setProfile({ ...r.data, cc_emails: (r.data.cc_emails || []).join(', ') }))
      .catch((e) => toast.error(detail(e, 'No fue posible cargar el perfil')));
  }, [organizationId]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await billingAPI.saveProfile(
        { ...profile, cc_emails: String(profile.cc_emails || '').split(',').map((x) => x.trim()).filter(Boolean) },
        { organization_id: organizationId }
      );
      toast.success('Perfil guardado');
    } catch (err) {
      toast.error(detail(err, 'No fue posible guardar el perfil'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard>
      <h2>Perfil de facturación</h2>
      <form className="nexus-guided-form" onSubmit={save}>
        <label><FieldGuide label="Correo de facturación" required /><input type="email" value={profile.billing_email || ''} onChange={(e) => setProfile({ ...profile, billing_email: e.target.value })} required /></label>
        <label><FieldGuide label="Contacto" required /><input value={profile.billing_contact_name || ''} onChange={(e) => setProfile({ ...profile, billing_contact_name: e.target.value })} required /></label>
        <label><FieldGuide label="Razón social" /><input value={profile.legal_name || ''} onChange={(e) => setProfile({ ...profile, legal_name: e.target.value })} /></label>
        <label><FieldGuide label="NIT o identificación" /><input value={profile.tax_id || ''} onChange={(e) => setProfile({ ...profile, tax_id: e.target.value })} /></label>
        <label className="nexus-field-wide"><FieldGuide label="Correos en copia" hint="Separados por coma" /><input value={profile.cc_emails || ''} onChange={(e) => setProfile({ ...profile, cc_emails: e.target.value })} /></label>
        <ActionButton type="submit" icon={Save} disabled={busy}>Guardar perfil</ActionButton>
      </form>
    </SurfaceCard>
  );
}
