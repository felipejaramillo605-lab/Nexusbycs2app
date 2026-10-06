import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { payrollAPI } from '../api';
import { SurfaceCard } from './design';
import { saveBlob } from '../lib/download';

const cop = (value) => `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value || 0))}`;

// Colillas de pago del propio profesional: solo nominas aprobadas o pagadas. Si no hay ninguna, no muestra nada.
export default function StaffPaySlips() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.resolve(payrollAPI?.mySlips?.())
      .then((response) => mounted && setItems(response?.data?.items || []))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (items.length === 0) return null;
  const download = async (item) => {
    try {
      saveBlob(await payrollAPI.downloadMySlip(item.run_id), `colilla_${item.number}.pdf`);
    } catch (error) {
      toast.error('No fue posible descargar la colilla');
    }
  };

  return (
    <SurfaceCard>
      <div className="p-4 space-y-3" data-testid="staff-payslips">
        <h2 className="text-lg">Mis colillas de pago</h2>
        {items.map((item) => (
          <div key={item.run_id} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-[var(--app-border)]" data-testid="payslip-row">
            <div>
              <strong>{item.label}</strong>
              <div className="text-sm text-[var(--app-text-secondary)]">
                {item.contract_type === 'fixed_salary' ? `Neto pagado: ${cop(item.net_pay)}` : `Honorarios por servicio: ${cop(item.commission_total)}`}
                {item.version > 1 ? ` · corregida (v${item.version})` : ''}
              </div>
            </div>
            <button type="button" className="nexus-button" onClick={() => download(item)}><Download size={16} /> Descargar colilla</button>
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}
