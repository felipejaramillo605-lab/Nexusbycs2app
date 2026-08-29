// NEXUS_PRODUCT_CATALOG_V11_CLIENT_CART_V1
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, ArrowLeft, Calendar, CreditCard, ImageOff } from 'lucide-react';
import { useOrganization } from '../context/OrganizationContext';
import { useClientPortalTheme } from '../hooks/useClientPortalTheme';
import { useCart } from '../lib/cart';
import ClientPortalNav from '../components/ClientPortalNav';

const money = v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0));

export default function ClientCart() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  useClientPortalTheme(organization);
  const cart = useCart(orgId);

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20" style={{ background: 'var(--app-background, #0a0a0a)' }}>
      <ClientPortalNav orgId={orgId} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate(`/portal/${orgId}/catalog`)} className="flex items-center gap-2 text-sm text-[var(--app-text-secondary)] mb-4">
          <ArrowLeft size={16} />Seguir comprando
        </button>

        <h1 className="text-2xl font-semibold text-[var(--app-text-primary)] mb-6 flex items-center gap-2">
          <ShoppingCart size={24} />Tu carrito
        </h1>

        {!cart.items.length ? (
          <div className="text-center py-16">
            <ShoppingCart size={40} className="mx-auto mb-3 text-[var(--app-text-secondary)]" />
            <p className="text-[var(--app-text-secondary)] mb-4">Tu carrito está vacío</p>
            <button onClick={() => navigate(`/portal/${orgId}/catalog`)} className="px-4 py-2 rounded-xl bg-[var(--app-primary)] text-white text-sm font-medium">
              Ver catálogo
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {cart.items.map(item => (
                <div key={item.product_id} className="flex items-center gap-3 p-3 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)]">
                  <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                    {item.photo ? <img src={item.photo} alt={item.name} className="w-full h-full object-cover" /> : <ImageOff size={20} className="text-[var(--app-text-secondary)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[var(--app-text-primary)] text-sm truncate">{item.name}</div>
                    <div className="text-[var(--app-primary)] font-semibold">{money(item.sale_price)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 border border-[var(--app-border)] rounded-lg">
                    <button onClick={() => cart.updateQuantity(item.product_id, item.quantity - 1)} className="p-1.5"><Minus size={14} /></button>
                    <span className="w-6 text-center text-sm text-[var(--app-text-primary)]">{item.quantity}</span>
                    <button onClick={() => cart.updateQuantity(item.product_id, item.quantity + 1)} className="p-1.5"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => cart.remove(item.product_id)} className="p-2 text-red-400"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] mb-6">
              <div className="flex justify-between text-lg font-semibold text-[var(--app-text-primary)]">
                <span>Total</span>
                <span>{money(cart.total)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <button onClick={() => navigate(`/book/${orgId}`)} className="w-full py-3 rounded-xl bg-[var(--app-primary)] text-white font-medium flex items-center justify-center gap-2">
                <Calendar size={18} />Agendar una cita y llevar estos productos
              </button>
              <button onClick={() => navigate(`/portal/${orgId}/catalog/checkout`)} className="w-full py-3 rounded-xl border border-[var(--app-border)] text-[var(--app-text-primary)] font-medium flex items-center justify-center gap-2">
                <CreditCard size={18} />Solo comprar productos (sin cita)
              </button>
            </div>
            <p className="text-xs text-[var(--app-text-secondary)] text-center mt-4">
              El pago se realiza en el momento de tu cita o al retirar/coordinar la entrega con el negocio.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
