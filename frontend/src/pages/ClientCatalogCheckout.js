// NEXUS_PRODUCT_CATALOG_V11_CHECKOUT_V1
import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Package, Store } from 'lucide-react';
import { toast } from 'sonner';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { publicCatalogAPI } from '../api';
import { useOrganization } from '../context/OrganizationContext';
import { useClientPortalTheme } from '../hooks/useClientPortalTheme';
import { useCart } from '../lib/cart';
import ClientPortalNav from '../components/ClientPortalNav';

const money = v => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0));

export default function ClientCatalogCheckout() {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  useClientPortalTheme(organization);
  const cart = useCart(orgId);

  const [form, setForm] = useState({ client_name: '', client_phone: '', client_email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState(null);

  const submit = async () => {
    if (!form.client_name.trim() || !form.client_phone) return toast.error('Completa tu nombre y teléfono');
    if (!cart.items.length) return toast.error('Tu carrito está vacío');
    setSubmitting(true);
    try {
      const res = await publicCatalogAPI.checkout(orgId, {
        client_name: form.client_name.trim(),
        client_phone: form.client_phone,
        client_email: form.client_email.trim() || null,
        notes: form.notes.trim() || null,
        items: cart.items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
      });
      setOrder(res.data);
      cart.clear();
      toast.success('Pedido registrado');
    } catch (e) {
      const detail = e.response?.data?.detail;
      toast.error((typeof detail === 'object' ? detail?.message : detail) || 'No fue posible registrar el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  if (order) {
    return (
      <div className="min-h-screen pb-24 md:pb-8 md:pt-20" style={{ background: 'var(--app-background, #0a0a0a)' }}>
        <ClientPortalNav orgId={orgId} />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
          <h1 className="text-2xl font-semibold text-[var(--app-text-primary)] mb-2">¡Pedido registrado!</h1>
          <p className="text-[var(--app-text-secondary)] mb-6">
            {organization?.name || 'El negocio'} se pondrá en contacto contigo para coordinar la entrega o el retiro. Pagas al recibir tus productos.
          </p>
          <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] text-left mb-6">
            {order.items.map(item => (
              <div key={item.product_id} className="flex justify-between text-sm py-1 text-[var(--app-text-primary)]">
                <span>{item.quantity}× {item.name}</span>
                <span>{money(item.subtotal)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2 mt-2 border-t border-[var(--app-border)] text-[var(--app-text-primary)]">
              <span>Total</span><span>{money(order.total)}</span>
            </div>
          </div>
          <Link to={`/portal/${orgId}/catalog`} className="inline-block px-4 py-2 rounded-xl bg-[var(--app-primary)] text-white text-sm font-medium">
            Seguir comprando
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8 md:pt-20" style={{ background: 'var(--app-background, #0a0a0a)' }}>
      <ClientPortalNav orgId={orgId} />
      <div className="max-w-md mx-auto px-4 py-8">
        <button onClick={() => navigate(`/portal/${orgId}/cart`)} className="flex items-center gap-2 text-sm text-[var(--app-text-secondary)] mb-4">
          <ArrowLeft size={16} />Volver al carrito
        </button>

        <h1 className="text-2xl font-semibold text-[var(--app-text-primary)] mb-1 flex items-center gap-2">
          <Package size={22} />Datos de contacto
        </h1>
        <p className="text-sm text-[var(--app-text-secondary)] mb-6">Los usaremos para coordinar la entrega o el retiro de tu pedido.</p>

        {!cart.items.length ? (
          <div className="text-center py-16 text-[var(--app-text-secondary)]">Tu carrito está vacío.</div>
        ) : (
          <>
            <div className="p-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] mb-6">
              {cart.items.map(item => (
                <div key={item.product_id} className="flex justify-between text-sm py-1 text-[var(--app-text-primary)]">
                  <span>{item.quantity}× {item.name}</span>
                  <span>{money(item.sale_price * item.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold pt-2 mt-2 border-t border-[var(--app-border)] text-[var(--app-text-primary)]">
                <span>Total</span><span>{money(cart.total)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm text-[var(--app-text-secondary)]">Nombre completo</span>
                <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-primary)]" placeholder="Tu nombre" />
              </label>
              <label className="block">
                <span className="text-sm text-[var(--app-text-secondary)]">Teléfono</span>
                <PhoneInput international defaultCountry="CO" value={form.client_phone} onChange={value => setForm({ ...form, client_phone: value || '' })} />
              </label>
              <label className="block">
                <span className="text-sm text-[var(--app-text-secondary)]">Correo electrónico (opcional)</span>
                <input type="email" value={form.client_email} onChange={e => setForm({ ...form, client_email: e.target.value })} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-primary)]" placeholder="nombre@correo.com" />
              </label>
              <label className="block">
                <span className="text-sm text-[var(--app-text-secondary)]">Notas (opcional)</span>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value.slice(0, 500) })} rows={2} className="w-full mt-1 p-3 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)] text-[var(--app-text-primary)] resize-none" placeholder="Ej: prefiero recogerlo en la tarde" />
              </label>

              <button onClick={submit} disabled={submitting} className="w-full py-3 rounded-xl bg-[var(--app-primary)] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                <Store size={18} />{submitting ? 'Enviando...' : 'Confirmar pedido'}
              </button>
              <p className="text-xs text-[var(--app-text-secondary)] text-center">
                No se realiza ningún cobro en línea. Pagas al retirar o recibir tu pedido.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
