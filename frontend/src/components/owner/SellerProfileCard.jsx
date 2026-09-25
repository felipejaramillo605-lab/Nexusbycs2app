import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { platformBillingAPI } from '../../api';
import { ActionButton, FieldGuide, SurfaceCard } from '../design';

const detail = (error, fallback) => error.response?.data?.detail || fallback;

const DEFAULT_SELLER = {
  commercial_name: 'Nexus by CS2',
  legal_name: '',
  tax_id: '',
  address: '',
  city: '',
  billing_email: '',
  phone: '',
  legal_notice: 'Documento administrativo de cobro generado por Nexus. No constituye factura electrónica de venta validada por la DIAN.',
  invoice_prefix: 'NXS',
};

// NEXUS_OWNER_SUBSCRIPTIONS_SPLIT_V1: extracted verbatim from OwnerSubscriptions.js
// (plan PR 6) -- same markup, same fetch/save calls, now self-contained since
// `seller` state was never read outside this one card.
export default function SellerProfileCard() {
  const [seller, setSeller] = useState(DEFAULT_SELLER);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platformBillingAPI.getSellerProfile().then((r) => setSeller(r.data)).catch((e) => toast.error(detail(e, 'No fue posible cargar la configuración operativa')));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await platformBillingAPI.saveSellerProfile(seller);
      toast.success('Perfil fiscal guardado');
    } catch (err) {
      toast.error(detail(err, 'No fue posible guardar el perfil fiscal'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard>
      <h2>Perfil fiscal de Nexus</h2>
      <form className="nexus-guided-form" onSubmit={save}>
        <label><FieldGuide label="Nombre comercial" example="Nexus by CS2" required /><input value={seller.commercial_name || ''} onChange={(e) => setSeller({ ...seller, commercial_name: e.target.value })} required /></label>
        <label><FieldGuide label="Razón social" hint="Usa el nombre legal real." /><input value={seller.legal_name || ''} onChange={(e) => setSeller({ ...seller, legal_name: e.target.value })} /></label>
        <label><FieldGuide label="NIT o identificación" /><input value={seller.tax_id || ''} onChange={(e) => setSeller({ ...seller, tax_id: e.target.value })} /></label>
        <label><FieldGuide label="Correo de facturación" /><input type="email" value={seller.billing_email || ''} onChange={(e) => setSeller({ ...seller, billing_email: e.target.value })} /></label>
        <label><FieldGuide label="Dirección" /><input value={seller.address || ''} onChange={(e) => setSeller({ ...seller, address: e.target.value })} /></label>
        <label><FieldGuide label="Ciudad" /><input value={seller.city || ''} onChange={(e) => setSeller({ ...seller, city: e.target.value })} /></label>
        <label><FieldGuide label="Teléfono" /><input value={seller.phone || ''} onChange={(e) => setSeller({ ...seller, phone: e.target.value })} /></label>
        <label><FieldGuide label="Prefijo documental" example="NXS" required /><input value={seller.invoice_prefix || 'NXS'} onChange={(e) => setSeller({ ...seller, invoice_prefix: e.target.value.toUpperCase() })} required /></label>
        <label className="nexus-field-wide"><FieldGuide label="Texto legal" required /><textarea value={seller.legal_notice || ''} onChange={(e) => setSeller({ ...seller, legal_notice: e.target.value })} required /></label>
        <ActionButton type="submit" icon={Save} disabled={busy}>Guardar perfil fiscal</ActionButton>
      </form>
    </SurfaceCard>
  );
}
