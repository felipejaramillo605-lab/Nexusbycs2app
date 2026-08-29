// NEXUS_PRODUCT_CATALOG_V11_CART_V1
// Lightweight per-organization shopping cart, persisted in localStorage.
// No context/provider needed: components call these helpers directly and
// subscribe via useCart() for same-tab reactivity (localStorage's own
// 'storage' event only fires across tabs, so we dispatch a custom one too).

import { useEffect, useState, useCallback } from 'react';

const CART_EVENT = 'nexus-cart-updated';
const key = (orgId) => `nexus_cart_${orgId}`;

export function getCart(orgId) {
  if (!orgId) return [];
  try {
    const raw = localStorage.getItem(key(orgId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(orgId, items) {
  try {
    localStorage.setItem(key(orgId), JSON.stringify(items));
  } catch {
    // localStorage unavailable (private mode, quota) — cart just won't persist
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { orgId } }));
}

export function addToCart(orgId, product, quantity = 1) {
  const items = getCart(orgId);
  const existing = items.find((i) => i.product_id === product.product_id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, product.quantity ?? 9999);
  } else {
    items.push({
      product_id: product.product_id,
      name: product.name,
      sale_price: product.sale_price,
      photo: product.photos?.[0] || null,
      quantity: Math.max(1, quantity),
      max_quantity: product.quantity ?? 9999,
    });
  }
  persist(orgId, items);
  return items;
}

export function updateCartQuantity(orgId, productId, quantity) {
  let items = getCart(orgId);
  if (quantity <= 0) {
    items = items.filter((i) => i.product_id !== productId);
  } else {
    items = items.map((i) => (i.product_id === productId ? { ...i, quantity: Math.min(quantity, i.max_quantity ?? 9999) } : i));
  }
  persist(orgId, items);
  return items;
}

export function removeFromCart(orgId, productId) {
  const items = getCart(orgId).filter((i) => i.product_id !== productId);
  persist(orgId, items);
  return items;
}

export function clearCart(orgId) {
  persist(orgId, []);
}

export function cartTotal(items) {
  return items.reduce((sum, i) => sum + (i.sale_price || 0) * (i.quantity || 0), 0);
}

export function cartCount(items) {
  return items.reduce((sum, i) => sum + (i.quantity || 0), 0);
}

export function useCart(orgId) {
  const [items, setItems] = useState(() => getCart(orgId));

  const refresh = useCallback(() => setItems(getCart(orgId)), [orgId]);

  useEffect(() => {
    refresh();
    const onUpdate = (e) => { if (!e.detail || e.detail.orgId === orgId) refresh(); };
    window.addEventListener(CART_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(CART_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, [orgId, refresh]);

  return {
    items,
    total: cartTotal(items),
    count: cartCount(items),
    add: (product, qty) => addToCart(orgId, product, qty),
    updateQuantity: (productId, qty) => updateCartQuantity(orgId, productId, qty),
    remove: (productId) => removeFromCart(orgId, productId),
    clear: () => clearCart(orgId),
  };
}
