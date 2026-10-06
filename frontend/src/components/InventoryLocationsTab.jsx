import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryAPI } from '../api';
import { EmptyState, SurfaceCard } from './design';

const fmt = (value) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(value || 0));
const emptyRow = () => ({ warehouse: '', location: '', pallet: '', quantity: '' });
const messageOf = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return (typeof detail === 'string' ? detail : detail?.message) || fallback;
};

// Bodega, ubicacion (seccion) y palet son OPCIONALES. Cada articulo puede repartir su stock en varias ubicaciones;
// lo que no se asigna aparece como "sin ubicacion". Sirve para filtrar y hacer conteos fisicos por zona.
export default function InventoryLocationsTab({ organizationId, items = [], onChanged }) {
  const [options, setOptions] = useState({ warehouses: [], locations: [], pallets: [] });
  const [filters, setFilters] = useState({ warehouse: '', location: '', pallet: '', q: '' });
  const [report, setReport] = useState({ items: [], total_units: 0, count: 0 });
  const [itemId, setItemId] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      const params = { organization_id: organizationId };
      Object.entries(filters).forEach(([key, value]) => value && (params[key] = value));
      const [reportResponse, optionResponse] = await Promise.all([
        inventoryAPI.stockByLocation(params),
        inventoryAPI.getLocationOptions({ organization_id: organizationId }),
      ]);
      setReport(reportResponse.data);
      setOptions(optionResponse.data);
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar las ubicaciones'));
    }
  }, [organizationId, filters]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const openItem = async (id) => {
    setItemId(id);
    setEditor(null);
    if (!id) return;
    try {
      const { data } = await inventoryAPI.getItemLocations(id, { organization_id: organizationId });
      setEditor({ ...data, rows: data.locations.map((row) => ({ ...row })) });
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible cargar el artículo'));
    }
  };

  const setRow = (index, key, value) =>
    setEditor((current) => ({ ...current, rows: current.rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)) }));
  const assigned = editor ? editor.rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) : 0;
  const unassigned = editor ? Math.max(0, editor.total_quantity - assigned) : 0;
  const over = editor ? assigned > editor.total_quantity : false;

  const save = async () => {
    setSaving(true);
    try {
      const locations = editor.rows.map((row) => ({
        warehouse: row.warehouse || null,
        location: row.location || null,
        pallet: row.pallet || null,
        quantity: Number(row.quantity) || 0,
      }));
      await inventoryAPI.saveItemLocations(itemId, { organization_id: organizationId, locations });
      toast.success('Ubicaciones guardadas');
      await openItem(itemId);
      await loadReport();
      onChanged?.();
    } catch (error) {
      toast.error(messageOf(error, 'No fue posible guardar las ubicaciones'));
    } finally {
      setSaving(false);
    }
  };

  const select = (key, label, values) => (
    <label className="text-sm">
      {label}
      <select className="nexus-field" value={filters[key]} onChange={(event) => setFilters({ ...filters, [key]: event.target.value })}>
        <option value="">Todas</option>
        {values.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-6">
      <SurfaceCard>
        <div className="p-4 space-y-4">
          <h2 className="text-lg">Existencias por ubicación</h2>
          <p className="text-sm text-[var(--app-text-secondary)]">
            Filtra por bodega, ubicación o palet para saber qué hay en cada lugar. Los campos son opcionales.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {select('warehouse', 'Bodega', options.warehouses)}
            {select('location', 'Ubicación', options.locations)}
            {select('pallet', 'Palet', options.pallets)}
            <label className="text-sm">
              Buscar artículo
              <input className="nexus-field" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="SKU o nombre" />
            </label>
          </div>
          {report.items.length === 0 ? (
            <EmptyState title="Sin existencias en esa ubicación" description="Distribuye un artículo por ubicaciones para verlo aquí." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="stock-by-location-table">
                <thead>
                  <tr className="text-left text-[var(--app-text-secondary)]">
                    <th className="p-2">Artículo</th><th className="p-2">Bodega</th><th className="p-2">Ubicación</th>
                    <th className="p-2">Palet</th><th className="p-2 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row, index) => (
                    <tr key={`${row.item_id}-${index}`} className="border-t border-[var(--app-border)]">
                      <td className="p-2">{row.sku ? `${row.sku} · ` : ''}{row.name}</td>
                      <td className="p-2">{row.warehouse || '—'}</td>
                      <td className="p-2">{row.location || '—'}</td>
                      <td className="p-2">{row.pallet || '—'}</td>
                      <td className="p-2 text-right">{fmt(row.quantity)} {row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm" data-testid="stock-by-location-total">Total mostrado: <strong>{fmt(report.total_units)}</strong> unidades</p>
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="p-4 space-y-4">
          <h2 className="text-lg">Distribuir un artículo por ubicaciones</h2>
          <label className="text-sm block">
            Artículo
            <select className="nexus-field" value={itemId} onChange={(event) => openItem(event.target.value)} data-testid="location-item-select">
              <option value="">Selecciona un artículo</option>
              {items.map((item) => <option key={item.item_id} value={item.item_id}>{item.sku ? `${item.sku} · ` : ''}{item.name}</option>)}
            </select>
          </label>
          {editor && (
            <div className="space-y-3">
              <p className="text-sm">
                Total del artículo: <strong>{fmt(editor.total_quantity)}</strong> · Asignado: <strong>{fmt(assigned)}</strong> ·{' '}
                Sin ubicación: <strong data-testid="unassigned-quantity">{fmt(unassigned)}</strong>
              </p>
              {editor.over_assigned && !over && (
                <p role="alert" className="text-amber-400 text-sm">Las ubicaciones guardadas suman más que el stock actual: revisa las cantidades o haz un conteo físico.</p>
              )}
              {editor.rows.map((row, index) => (
                <div key={index} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end" data-testid="location-row">
                  <label className="text-xs">Bodega<input className="nexus-field" list="inv-warehouses" value={row.warehouse || ''} onChange={(event) => setRow(index, 'warehouse', event.target.value)} /></label>
                  <label className="text-xs">Ubicación<input className="nexus-field" list="inv-locations" value={row.location || ''} onChange={(event) => setRow(index, 'location', event.target.value)} /></label>
                  <label className="text-xs">Palet<input className="nexus-field" list="inv-pallets" value={row.pallet || ''} onChange={(event) => setRow(index, 'pallet', event.target.value)} /></label>
                  <label className="text-xs">Cantidad<input className="nexus-field" type="number" min="0" step="any" value={row.quantity} onChange={(event) => setRow(index, 'quantity', event.target.value)} /></label>
                  <button type="button" aria-label="Quitar ubicación" onClick={() => setEditor((current) => ({ ...current, rows: current.rows.filter((_, i) => i !== index) }))}><Trash2 size={16} /></button>
                </div>
              ))}
              <datalist id="inv-warehouses">{options.warehouses.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="inv-locations">{options.locations.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="inv-pallets">{options.pallets.map((value) => <option key={value} value={value} />)}</datalist>
              {over && <p role="alert" className="text-red-400 text-sm" data-testid="over-assigned">Las ubicaciones suman más que el stock total ({fmt(editor.total_quantity)}).</p>}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="nexus-button" onClick={() => setEditor((current) => ({ ...current, rows: [...current.rows, emptyRow()] }))}>
                  <Plus size={16} /> Agregar ubicación
                </button>
                <button type="button" className="nexus-button nexus-button-primary" data-testid="save-locations" disabled={saving || over} onClick={save}>
                  {saving ? 'Guardando…' : 'Guardar ubicaciones'}
                </button>
              </div>
            </div>
          )}
        </div>
      </SurfaceCard>
    </div>
  );
}
