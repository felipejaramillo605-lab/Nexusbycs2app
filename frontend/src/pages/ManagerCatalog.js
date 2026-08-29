// NEXUS_PRODUCT_CATALOG_V10_FRONTEND_V1
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { catalogAPI, organizationAPI, supplierAPI } from '../api';
import { ArrowLeft, Plus, Search, Edit3, Archive, Eye, EyeOff, Upload, Link2, Trash2, ImagePlus, Package, RefreshCw, ShoppingBag, Info, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { confirmAction, MetricCard, SurfaceCard, LoadingState, EmptyState, FieldGuide } from '../components/design';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

const money = v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0));
const fmt = v => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(v || 0));

const blank = { name: '', description: '', sale_price: 0, unit_cost: 0, quantity: 0, min_stock: 0, supplier_id: '', photo_urls: [], published: false };

// NEXUS_PRODUCT_CATALOG_V10_1_PHOTO_GUIDANCE — must match backend/professional_media.py limits
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export default function ManagerCatalog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const organizationId = (user?.role === 'owner' ? params.get('org_id') : user?.organization_id) || user?.organization_id;

  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(blank);
  const [photoUrl, setPhotoUrl] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null); // { file, previewUrl }
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [stockDialog, setStockDialog] = useState(null);
  const [stockForm, setStockForm] = useState({ quantity: 0, reason: '' });

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [p, s, o] = await Promise.all([
        catalogAPI.list({ organization_id: organizationId, include_archived: false }),
        supplierAPI.getAll({ organization_id: organizationId, active: true, page_size: 100 }).catch(() => ({ data: { items: [] } })),
        organizationAPI.getAll(),
      ]);
      setItems(p.data);
      setSuppliers(s.data.items || s.data || []);
      setOrgName(o.data.find(x => x.organization_id === organizationId)?.name || '');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() =>
    items.filter(x => `${x.name} ${x.description || ''}`.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  const published = items.filter(x => x.published).length;
  const totalValue = items.reduce((s, x) => s + (x.quantity || 0) * (x.unit_cost || 0), 0);
  const lowStock = items.filter(x => x.is_low_stock).length;

  const openEditor = (item) => {
    setEditor(item || {});
    setForm(item ? {
      name: item.name,
      description: item.description || '',
      sale_price: item.sale_price || 0,
      unit_cost: item.unit_cost || 0,
      quantity: item.quantity || 0,
      min_stock: item.min_stock || 0,
      supplier_id: item.supplier_id || '',
      photo_urls: [],
      published: item.published || false,
    } : blank);
    setPhotoUrl('');
    cancelPendingPhoto();
  };

  const save = async () => {
    try {
      const data = {
        ...form,
        sale_price: Number(form.sale_price),
        unit_cost: Number(form.unit_cost),
        quantity: Number(form.quantity),
        min_stock: Number(form.min_stock),
        supplier_id: form.supplier_id || null,
        published: form.published,
      };
      if (editor?.product_id) {
        const { quantity, ...updateData } = data;
        await catalogAPI.update(editor.product_id, updateData, { organization_id: organizationId });
      } else {
        await catalogAPI.create(data, { organization_id: organizationId });
      }
      toast.success(editor?.product_id ? 'Producto actualizado' : 'Producto creado');
      setEditor(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible guardar');
    }
  };

  const archive = async (item) => {
    if (!await confirmAction(`¿Archivar "${item.name}"? Se retirará del catálogo.`)) return;
    try {
      await catalogAPI.archive(item.product_id, { organization_id: organizationId });
      toast.success('Producto archivado');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible archivar');
    }
  };

  const togglePublish = async (item) => {
    try {
      await catalogAPI.update(item.product_id, { published: !item.published }, { organization_id: organizationId });
      toast.success(item.published ? 'Producto despublicado' : 'Producto publicado en el catálogo');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible cambiar el estado');
    }
  };

  // NEXUS_PRODUCT_CATALOG_V10_1_PHOTO_GUIDANCE
  // Selecting a file only stages it locally (with an instant browser preview) —
  // it is NOT uploaded yet. The manager confirms before it's sent to the server,
  // where it gets auto-converted/resized to WebP 1200px (see professional_media.normalize_image).
  const selectPhoto = (file) => {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Formato no permitido. Usa JPG, PNG o WEBP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo permitido: 5 MB.`);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({ file, previewUrl });
  };

  const cancelPendingPhoto = () => {
    if (pendingPhoto?.previewUrl) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
  };

  const confirmUploadPhoto = async (productId) => {
    if (!pendingPhoto) return;
    setUploadingPhoto(true);
    try {
      await catalogAPI.uploadPhoto(productId, pendingPhoto.file, { organization_id: organizationId });
      toast.success('Foto subida y optimizada automáticamente');
      URL.revokeObjectURL(pendingPhoto.previewUrl);
      setPendingPhoto(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addUrl = async (productId, url) => {
    try {
      await catalogAPI.addPhotoUrl(productId, url, { organization_id: organizationId });
      toast.success('Foto agregada');
      setPhotoUrl('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible agregar la URL');
    }
  };

  const deletePhoto = async (productId, index) => {
    try {
      await catalogAPI.deletePhoto(productId, index, { organization_id: organizationId });
      toast.success('Foto eliminada');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible eliminar la foto');
    }
  };

  const saveStock = async () => {
    try {
      await catalogAPI.adjustStock(stockDialog.product_id, Number(stockForm.quantity), stockForm.reason || 'manual_adjustment', { organization_id: organizationId });
      toast.success('Stock actualizado');
      setStockDialog(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No fue posible ajustar el stock');
    }
  };

  if (loading) return <div className="min-h-screen nexus-screen"><LoadingState label="Preparando el catálogo de productos" /></div>;

  return (
    <div className="min-h-screen nexus-screen p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')} className="p-3 rounded-2xl bg-[var(--app-surface)] border border-[var(--app-border)]">
              <ArrowLeft />
            </button>
            <div>
              <p className="text-sm text-[var(--app-text-secondary)]">{orgName || 'Operación'}</p>
              <h1 className="text-3xl md:text-4xl font-semibold text-[var(--app-text-primary)]">Catálogo de productos</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openEditor()} className="px-4 py-3 rounded-xl bg-[var(--app-primary)] text-white flex gap-2">
              <Plus size={18} />Nuevo producto
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Productos" value={items.length} icon={ShoppingBag} />
          <MetricCard label="Publicados" value={published} icon={Eye} />
          <MetricCard label="Stock bajo" value={lowStock} icon={Package} />
          <MetricCard label="Valor inventario" value={money(totalValue)} icon={Package} />
        </div>

        <SurfaceCard>
          <div className="p-4 flex gap-3 items-center border-b border-[var(--app-border)]">
            <Search size={18} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="flex-1 bg-transparent outline-none text-[var(--app-text-primary)]" />
          </div>
          {!filtered.length ? (
            <EmptyState title="Sin productos" description="Agrega tu primer producto al catálogo para que tus clientes puedan verlo." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--app-text-secondary)] border-b border-[var(--app-border)]">
                    <th className="p-4">Producto</th>
                    <th className="p-4">Precio venta</th>
                    <th className="p-4">Costo</th>
                    <th className="p-4">Stock</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(x => (
                    <tr key={x.product_id} className="border-b border-[var(--app-border)] hover:bg-white/5">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {x.photos?.length > 0 ? (
                            <img src={x.photos[0]} alt={x.name} className="w-10 h-10 rounded-lg object-cover border border-[var(--app-border)]" onError={e => { e.currentTarget.style.display = 'none'; }} />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white/5 border border-[var(--app-border)] flex items-center justify-center"><ImagePlus size={16} className="text-[var(--app-text-secondary)]" /></div>
                          )}
                          <div>
                            <div className="font-medium text-[var(--app-text-primary)]">{x.name}</div>
                            {x.description && <div className="text-xs text-[var(--app-text-secondary)] line-clamp-1">{x.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-[var(--app-text-primary)] font-medium">{money(x.sale_price)}</td>
                      <td className="p-4 text-[var(--app-text-secondary)]">{money(x.unit_cost)}</td>
                      <td className="p-4">
                        <button onClick={() => { setStockDialog(x); setStockForm({ quantity: x.quantity, reason: '' }); }} className="text-[var(--app-text-primary)] hover:text-[var(--app-primary)] transition-colors">
                          {fmt(x.quantity)}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs inline-block w-fit ${x.published ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-500/15 text-gray-400'}`}>
                            {x.published ? 'Publicado' : 'Borrador'}
                          </span>
                          {x.is_low_stock && <span className="px-2 py-1 rounded-full text-xs bg-red-500/15 text-red-400 inline-block w-fit">Stock bajo</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-1">
                          <button title={x.published ? 'Despublicar' : 'Publicar'} onClick={() => togglePublish(x)} className="p-2">
                            {x.published ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                          <button title="Editar" onClick={() => openEditor(x)} className="p-2"><Edit3 size={18} /></button>
                          <button title="Archivar" onClick={() => archive(x)} className="p-2 text-red-400"><Archive size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SurfaceCard>

        {/* Editor dialog */}
        <Dialog open={!!editor} onOpenChange={o => { if (!o) { setEditor(null); cancelPendingPhoto(); } }}>
          <DialogContent className="bg-[var(--app-surface-elevated)] max-w-2xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{editor?.product_id ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <label className="block">
                <FieldGuide label="Nombre del producto" hint="Nombre que verá el cliente en el catálogo." example="Cera para barba 100g" required />
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
              </label>

              <label className="block">
                <FieldGuide label="Descripción" hint="Descripción breve del producto. Máximo 1000 caracteres." example="Cera natural con fijación media..." optional />
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value.slice(0, 1000) })} rows={3} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] resize-none" />
                <span className="block text-right text-xs text-[var(--app-text-secondary)]">{form.description.length}/1000</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <FieldGuide label="Precio de venta" hint="Precio que paga el cliente." example="45000" unit="COP" required />
                  <input type="number" min="0" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
                </label>
                <label>
                  <FieldGuide label="Costo unitario" hint="Costo de adquisición por unidad." example="18000" unit="COP" optional />
                  <input type="number" min="0" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
                </label>
              </div>

              {!editor?.product_id && (
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <FieldGuide label="Stock inicial" hint="Cantidad disponible al crear." example="24" required />
                    <input type="number" min="0" step="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
                  </label>
                  <label>
                    <FieldGuide label="Stock mínimo" hint="Alerta cuando el stock baje de este nivel." example="5" optional />
                    <input type="number" min="0" step="1" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
                  </label>
                </div>
              )}

              <label className="block">
                <FieldGuide label="Proveedor" hint="Vincula el producto con un proveedor registrado." optional />
                <select value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]">
                  <option value="">Sin proveedor</option>
                  {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.business_name}</option>)}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-[var(--app-border)] p-3 cursor-pointer hover:border-[var(--app-primary)]/50">
                <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} className="accent-[var(--app-primary)]" />
                <span>
                  <span className="text-sm font-medium text-[var(--app-text-primary)]">Publicar en el catálogo</span>
                  <span className="block text-xs text-[var(--app-text-secondary)]">Los clientes podrán ver este producto en el portal.</span>
                </span>
              </label>

              {/* Photos section - only for existing products */}
              {editor?.product_id && (
                <div>
                  <span className="text-sm font-medium text-[var(--app-text-primary)]">Fotos del producto</span>
                  <div className="flex items-start gap-2 mt-1 mb-3 p-2.5 rounded-lg bg-[var(--app-primary-soft,rgba(10,132,255,0.08))] border border-[var(--app-border)]">
                    <Info size={14} className="text-[var(--app-primary)] mt-0.5 shrink-0" />
                    <span className="text-xs text-[var(--app-text-secondary)]">
                      Hasta <strong>4 fotos</strong>. Formatos aceptados: <strong>JPG, PNG o WEBP</strong> · Máximo <strong>5 MB</strong> por foto.
                      Se optimizan automáticamente a 1200×1200 px en WebP para que carguen rápido en el portal — no necesitas editarlas antes.
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {(editor.photos || []).map((photo, i) => (
                      <div key={i} className="relative group">
                        <img src={photo} alt={`Foto ${i + 1}`} className="w-full aspect-square rounded-xl object-cover border border-[var(--app-border)]" onError={e => { e.currentTarget.src = ''; e.currentTarget.style.background = 'var(--app-surface)'; }} />
                        <button onClick={() => deletePhoto(editor.product_id, i)} className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={12} className="text-white" />
                        </button>
                      </div>
                    ))}
                    {(editor.photos || []).length < 4 && !pendingPhoto && (
                      <label className="w-full aspect-square rounded-xl border-2 border-dashed border-[var(--app-border)] flex flex-col items-center justify-center cursor-pointer hover:border-[var(--app-primary)] transition-colors">
                        <Upload size={20} className="text-[var(--app-text-secondary)]" />
                        <span className="text-xs text-[var(--app-text-secondary)] mt-1">Subir</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { selectPhoto(e.target.files[0]); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>

                  {/* Pending photo: local preview before it's actually sent to the server */}
                  {pendingPhoto && (
                    <div className="mb-3 p-3 rounded-xl border border-[var(--app-primary)]/40 bg-[var(--app-primary)]/5 flex items-center gap-3">
                      <img src={pendingPhoto.previewUrl} alt="Vista previa" className="w-16 h-16 rounded-lg object-cover border border-[var(--app-border)]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[var(--app-text-primary)] font-medium truncate">{pendingPhoto.file.name}</div>
                        <div className="text-xs text-[var(--app-text-secondary)]">
                          {(pendingPhoto.file.size / 1024 / 1024).toFixed(1)} MB · Vista previa local — así se ve, aún no se ha subido
                        </div>
                      </div>
                      <button onClick={() => confirmUploadPhoto(editor.product_id)} disabled={uploadingPhoto} className="p-2 rounded-lg bg-[var(--app-primary)] text-white disabled:opacity-50" title="Confirmar y subir">
                        {uploadingPhoto ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      </button>
                      <button onClick={cancelPendingPhoto} disabled={uploadingPhoto} className="p-2 rounded-lg border border-[var(--app-border)] disabled:opacity-50" title="Cancelar">
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {(editor.photos || []).length < 4 && (
                    <div className="flex gap-2">
                      <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://... (URL de imagen ya subida a internet)" className="flex-1 p-2 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-sm" />
                      <button onClick={() => photoUrl.trim() && addUrl(editor.product_id, photoUrl.trim())} disabled={!photoUrl.trim()} className="px-3 py-2 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] flex gap-1 items-center text-sm disabled:opacity-40">
                        <Link2 size={14} />Agregar URL
                      </button>
                    </div>
                  )}
                  <span className="block text-xs text-[var(--app-text-secondary)] mt-1">Nota: una foto agregada por URL se muestra tal cual está en esa dirección — no pasa por la optimización automática.</span>
                </div>
              )}

              <button onClick={save} className="w-full p-3 bg-[var(--app-primary)] text-white rounded-xl font-medium">
                {editor?.product_id ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Stock adjustment dialog */}
        <Dialog open={!!stockDialog} onOpenChange={o => !o && setStockDialog(null)}>
          <DialogContent className="bg-[var(--app-surface-elevated)]">
            <DialogHeader>
              <DialogTitle>Ajustar stock · {stockDialog?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <label>
                <FieldGuide label="Nueva cantidad" hint="Ajusta la cantidad total disponible." required />
                <input type="number" min="0" step="1" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
              </label>
              <label>
                <FieldGuide label="Motivo" hint="Razón del ajuste." example="Recepción de mercancía" optional />
                <input value={stockForm.reason} onChange={e => setStockForm({ ...stockForm, reason: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]" />
              </label>
              <button onClick={saveStock} className="w-full p-3 bg-[var(--app-primary)] text-white rounded-xl">Guardar</button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
