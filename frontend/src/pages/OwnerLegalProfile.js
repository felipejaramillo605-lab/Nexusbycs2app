import React, { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { legalAPI } from '../api';
import { ActionButton, MotionPage, PageHeader, StatusBadge, SurfaceCard } from '../components/design';

const EMPTY = {
  full_name: '',
  municipality: '',
  email: '',
  phone: '',
  document_type: 'CC',
  document_number: '',
  full_address: '',
};
const FIELDS = [
  ['full_name', 'Nombre completo'],
  ['municipality', 'Municipio (público)'],
  ['email', 'Correo de contacto (público)'],
  ['phone', 'Teléfono de atención de solicitudes (público)'],
  ['document_number', 'Número de documento (solo usuarios que aceptan el contrato)'],
  ['full_address', 'Dirección completa (solo usuarios que aceptan el contrato)'],
];

export default function OwnerLegalProfile() {
  const [form, setForm] = useState(EMPTY);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await legalAPI.ownerGetProfile();
      setMeta({ version: data.version, accepted: data.acceptances_current_version });
      if (data.profile) setForm({ ...EMPTY, ...data.profile });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No pudimos cargar los datos legales');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await legalAPI.ownerSaveProfile(form);
      toast.success('Datos legales guardados');
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Revisa los campos e intenta de nuevo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nexus-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <MotionPage className="space-y-6">
          <PageHeader
            eyebrow="IT y auditoría"
            title="Datos legales"
            description="Responsable del tratamiento. El documento y la dirección solo los ven los usuarios registrados que aceptan el contrato."
            actions={meta && <StatusBadge tone="info">{`Versión ${meta.version} · ${meta.accepted} aceptaciones`}</StatusBadge>}
          />
          <SurfaceCard>
            <form onSubmit={save} className="space-y-4">
              {FIELDS.map(([name, label]) => (
                <label key={name} className="block">
                  {label}
                  <input
                    className="nexus-field"
                    name={name}
                    value={form[name]}
                    onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                    autoComplete="off"
                  />
                </label>
              ))}
              <ActionButton type="submit" icon={Save} loading={busy}>Guardar</ActionButton>
            </form>
          </SurfaceCard>
        </MotionPage>
      </div>
    </div>
  );
}
