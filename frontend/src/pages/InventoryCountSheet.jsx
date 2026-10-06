import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryAPI } from '../api';

const CONDITIONS = [
  ['good', 'Bueno'],
  ['damaged', 'Dañado'],
  ['expired', 'Vencido'],
  ['other', 'Otro'],
];
const blank = { target_id: '', condition: 'good', quantity: '', warehouse: '', location: '', pallet: '', label_price: '', code: '' };
const placeOf = (row) => [row.warehouse, row.location, row.pallet].filter(Boolean).join(' · ') || 'Sin ubicación';
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};

// Hoja de conteo para quien tiene acceso temporal (celular): cuenta uno por uno y envia al terminar.
// El campo "codigo" queda listo para escaner QR / codigo de barras mas adelante.
export default function InventoryCountSheet() {
  const { countId } = useParams();
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await inventoryAPI.getCountSheet(countId);
      setSheet(data);
      setError('');
    } catch (err) {
      setError(messageOf(err, 'No fue posible abrir el conteo'));
    }
  }, [countId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => [...(sheet?.items || [])].sort((a, b) => `${a.sku}${placeOf(a)}`.localeCompare(`${b.sku}${placeOf(b)}`)),
    [sheet],
  );
  const target = useMemo(() => rows.find((r) => r.target_id === form.target_id), [rows, form.target_id]);
  const locked = !!sheet?.submitted_at;
  const counted = rows.reduce((sum, r) => sum + r.entries.length, 0);

  const pick = (targetId) => {
    const row = rows.find((r) => r.target_id === targetId);
    setEditing(null);
    setForm({ ...blank, target_id: targetId, warehouse: row?.warehouse || '', location: row?.location || '', pallet: row?.pallet || '' });
  };

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const body = {
        item_id: target.item_id,
        condition: form.condition,
        quantity: Number(form.quantity),
        warehouse: form.warehouse || null,
        location: form.location || null,
        pallet: form.pallet || null,
        label_price: form.label_price === '' ? null : Number(form.label_price),
        code: form.code || null,
      };
      if (editing) await inventoryAPI.updateCountEntry(countId, editing, body);
      else await inventoryAPI.addCountEntry(countId, body);
      toast.success(editing ? 'Registro actualizado' : 'Registro guardado');
      setEditing(null);
      setForm({ ...blank, target_id: form.target_id, warehouse: form.warehouse, location: form.location, pallet: form.pallet });
      await load();
    } catch (err) {
      toast.error(messageOf(err, 'No fue posible guardar'));
    } finally {
      setBusy(false);
    }
  };

  const edit = (row, entry) => {
    setEditing(entry.entry_id);
    setForm({
      target_id: row.target_id,
      condition: entry.condition,
      quantity: String(entry.quantity),
      warehouse: row.warehouse || '',
      location: row.location || '',
      pallet: row.pallet || '',
      label_price: entry.label_price ?? '',
      code: entry.code || '',
    });
  };

  const remove = async (entry) => {
    try {
      await inventoryAPI.deleteCountEntry(countId, entry.entry_id);
      await load();
    } catch (err) {
      toast.error(messageOf(err, 'No fue posible eliminar'));
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await inventoryAPI.submitCount(countId);
      toast.success('Conteo enviado al manager');
      await load();
    } catch (err) {
      toast.error(messageOf(err, 'No fue posible enviar'));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main className="max-w-xl mx-auto p-4 space-y-3">
        <p role="alert" data-testid="count-error">{error}</p>
        <Link to="/" className="nexus-link-action">Volver al inicio</Link>
      </main>
    );
  }
  if (!sheet) return <main className="max-w-xl mx-auto p-4">Cargando conteo…</main>;

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-5" data-testid="count-sheet">
      <header>
        <button type="button" className="nexus-link-action" onClick={() => window.history.back()}>← Volver</button>
        <h1 className="text-xl">{sheet.count_number} · {sheet.name}</h1>
        <p className="text-sm text-[var(--app-text-secondary)]">
          Tu acceso vence {new Date(sheet.expires_at).toLocaleString('es-CO')} · registros: {counted}
        </p>
        {sheet.submitted_at && <p className="text-sm text-emerald-400" data-testid="submitted-note">Ya enviaste tu conteo. Si el manager pide un reconteo, aparecerá aquí.</p>}
      </header>

      {rows.some((r) => r.recount_requested && r.entries.length === 0) && (
        <p role="alert" className="text-amber-400 text-sm" data-testid="recount-note">El manager pidió contar de nuevo: {rows.filter((r) => r.recount_requested && r.entries.length === 0).map((r) => r.name).join(', ')}.</p>
      )}

      {!locked && (
        <section className="space-y-3 p-4 rounded-xl border border-[var(--app-border)]">
          <label className="text-sm block">Artículo y lugar
            <select className="nexus-field" value={form.target_id} onChange={(e) => pick(e.target.value)} data-testid="sheet-target">
              <option value="">Selecciona qué vas a contar</option>
              {rows.map((r) => <option key={r.target_id} value={r.target_id}>{`${r.sku ? `${r.sku} · ` : ''}${r.name} — ${placeOf(r)}${r.recount_requested ? ' (reconteo)' : ''}`}</option>)}
            </select>
          </label>
          {target && (
            <>
              {target.recount_note && <p className="text-sm text-amber-400">Nota del manager: {target.recount_note}</p>}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Estado
                  <select className="nexus-field" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                    {CONDITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="text-sm">Cantidad ({target.unit})
                  <input className="nexus-field" type="number" inputMode="decimal" min="0" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} data-testid="sheet-quantity" />
                </label>
                <label className="text-sm">Precio en la etiqueta
                  <input className="nexus-field" type="number" inputMode="decimal" min="0" step="any" value={form.label_price} onChange={(e) => setForm({ ...form, label_price: e.target.value })} />
                </label>
                <label className="text-sm">Código (QR / barras)
                  <input className="nexus-field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </label>
                <label className="text-sm">Bodega
                  <input className="nexus-field" value={form.warehouse} onChange={(e) => setForm({ ...form, warehouse: e.target.value })} />
                </label>
                <label className="text-sm">Ubicación
                  <input className="nexus-field" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </label>
                <label className="text-sm col-span-2">Palet
                  <input className="nexus-field" value={form.pallet} onChange={(e) => setForm({ ...form, pallet: e.target.value })} />
                </label>
              </div>
              <button type="button" className="nexus-button nexus-button-primary w-full" disabled={busy || form.quantity === ''} onClick={save} data-testid="sheet-save">
                {editing ? 'Actualizar registro' : 'Guardar registro'}
              </button>
            </>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg">Lo que has contado</h2>
        {rows.every((r) => r.entries.length === 0) && <p className="text-sm text-[var(--app-text-secondary)]">Aún no has registrado nada.</p>}
        {rows.filter((r) => r.entries.length > 0).map((r) => (
          <div key={r.target_id} className="p-3 rounded-xl border border-[var(--app-border)]" data-testid="sheet-item">
            <div className="font-medium">{r.sku ? `${r.sku} · ` : ''}{r.name} <span className="text-sm text-[var(--app-text-secondary)]">{placeOf(r)}</span></div>
            {r.system_quantity !== undefined && <div className="text-xs text-[var(--app-text-secondary)]">Sistema: {r.system_quantity}</div>}
            {r.entries.map((e) => (
              <div key={e.entry_id} className="flex items-center justify-between text-sm pt-1">
                <span>{e.quantity} {r.unit} · {CONDITIONS.find(([v]) => v === e.condition)?.[1]}{e.label_price != null ? ` · etiqueta ${e.label_price}` : ''}{e.code ? ` · ${e.code}` : ''}</span>
                {!e.submitted && (
                  <span className="flex gap-3">
                    <button type="button" className="nexus-link-action" onClick={() => edit(r, e)}>Editar</button>
                    <button type="button" aria-label="Eliminar registro" onClick={() => remove(e)}><Trash2 size={16} /></button>
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      {!locked && (
        <button type="button" className="nexus-button nexus-button-primary w-full" disabled={busy || counted === 0} onClick={submit} data-testid="sheet-submit">
          Guardar y enviar conteo
        </button>
      )}
    </main>
  );
}
