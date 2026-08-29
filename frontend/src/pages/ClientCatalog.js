// NEXUS_PRODUCT_CATALOG_V11_CLIENT_CATALOG_V1
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingBag, ShoppingCart, Plus, Minus, X, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { publicCatalogAPI } from '../api';
import { useOrganization } from '../context/OrganizationContext';
import { useClientPortalTheme } from '../hooks/useClientPortalTheme';
import { useCart } from '../lib/cart';
import ClientPortalNav from '../components/ClientPortalNav';

const money = v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0));

export default function ClientCatalog() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { organization, loadOrganization } = useOrganization();
  useClientPortalTheme(organization);
  const cart = useCart(orgId);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [notAvailable, setNotAvailable] = useState(false);

  useEffect(() => {
    loadOrganization(orgId);
  }, [orgId, loadOrganization]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    publicCatalogAPI.list(orgId)
      .then(res => { if (active) setProducts(res.data || []); })
      .catch(err => { if (active && err.response?.status === 404) setNotAvailable(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orgId]);

  const openProduct = (p) => { setSelected(p); setQty(1); };

  const handleAdd = () => {
    if (!selected) return;
    cart.add(selected, qty);
    toast.success(`${selected.name} agregado al carrito`);
    setSelected(null);
  };

  if (notAvailable) {
    return (
      <div className="nexus-client-theme min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ background: 'var(--app-background, #0a0a0a)' }}>
        <ShoppingBag size={40} className="text-[var(--app-text-secondary)]" />
        <h1 className="text-xl font-semibold text-[var(--app-text-primary)]">Catálogo no disponible</h1>
        <p className="text-[var(--app-text-secondary)] max-w-sm">Este negocio no tiene un catálogo de productos activo en este momento.</p>
        <ClientPortalNav orgId={orgId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20" style={{ background: 'var(--app-background, #0a0a0a)' }}>
      <ClientPortalNav orgId={orgId} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <ShoppingBag size={32} className="mx-auto mb-2 text-[var(--app-primary)]" />
          <h1 className="text-3xl font-semibold text-[var(--app-text-primary)]">Catálogo de {organization?.name || 'productos'}</h1>
          <p className="text-[var(--app-text-secondary)] mt-1">Agrega productos a tu carrito y llévalos a tu próxima cita, o compra directo.</p>
        </header>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-white/5 animate-pulse" />)}
          </div>
        ) : !products.length ? (
          <div className="text-center py-20">
            <ShoppingBag size={40} className="mx-auto mb-3 text-[var(--app-text-secondary)]" />
            <p className="text-[var(--app-text-secondary)]">Aún no hay productos publicados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(p => (
              <button
                key={p.product_id}
                onClick={() => openProduct(p)}
                className="text-left rounded-2xl overflow-hidden border border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-primary)]/50 transition-colors group"
              >
                <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden relative">
                  {p.photos?.[0] ? (
                    <img src={p.photos[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <ImageOff size={28} className="text-[var(--app-text-secondary)]" />
                  )}
                  {!p.in_stock && (
                    <span className="absolute top-2 right-2 px-2 py-1 rounded-full text-[10px] font-medium bg-black/70 text-white">Agotado</span>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-[var(--app-text-primary)] text-sm line-clamp-1">{p.name}</div>
                  <div className="text-[var(--app-primary)] font-semibold mt-1">{money(p.sale_price)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product detail modal */}
      {selected && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={() => setSelected(null)}>
          <div className="w-full md:max-w-lg bg-[var(--app-surface-elevated,#18181b)] rounded-t-3xl md:rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="relative aspect-square bg-white/5 flex items-center justify-center">
              {selected.photos?.[0] ? (
                <img src={selected.photos[0]} alt={selected.name} className="w-full h-full object-cover" />
              ) : (
                <ImageOff size={40} className="text-[var(--app-text-secondary)]" />
              )}
              <button onClick={() => setSelected(null)} className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white">
                <X size={18} />
              </button>
            </div>
            {selected.photos?.length > 1 && (
              <div className="flex gap-2 p-3 overflow-x-auto">
                {selected.photos.map((photo, i) => (
                  <img key={i} src={photo} alt={`${selected.name} ${i + 1}`} className="w-14 h-14 rounded-lg object-cover border border-[var(--app-border)] shrink-0" />
                ))}
              </div>
            )}
            <div className="p-5 space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-[var(--app-text-primary)]">{selected.name}</h2>
                {selected.description && <p className="text-sm text-[var(--app-text-secondary)] mt-1">{selected.description}</p>}
              </div>
              <div className="text-2xl font-bold text-[var(--app-primary)]">{money(selected.sale_price)}</div>

              {selected.in_stock ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--app-text-secondary)]">Cantidad</span>
                    <div className="flex items-center gap-2 border border-[var(--app-border)] rounded-xl">
                      <button onClick={() => setQty(q => Math.max(1, q - 1))} className="p-2"><Minus size={16} /></button>
                      <span className="w-8 text-center text-[var(--app-text-primary)]">{qty}</span>
                      <button onClick={() => setQty(q => Math.min(q + 1, selected.quantity || 99))} className="p-2"><Plus size={16} /></button>
                    </div>
                  </div>
                  <button onClick={handleAdd} className="w-full py-3 rounded-xl bg-[var(--app-primary)] text-white font-medium flex items-center justify-center gap-2">
                    <ShoppingCart size={18} />Agregar al carrito
                  </button>
                </>
              ) : (
                <div className="w-full py-3 rounded-xl bg-white/5 text-center text-[var(--app-text-secondary)]">Producto agotado por ahora</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
