// NEXUS_INVENTORY_AUDIT_UI_READY_5A_PACKAGE_2_V1
// NEXUS_INVENTORY_PACKAGE_1_5A_V1
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { inventoryAPI, organizationAPI } from '../api';
import { Plus, Trash2, ArrowLeft, Package, AlertCircle, FileText, Edit } from 'lucide-react';
import { MANAGER } from '../constants/testIds';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { confirmAction } from '../components/design';

const ManagerInventory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [orderRecommendation, setOrderRecommendation] = useState('');
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', quantity: 0, min_stock: 0, unit: 'unidades' });
  const [organizationName, setOrganizationName] = useState('');

  // Get org_id from query param (for owner) or user.organization_id (for manager)
  const organizationId = searchParams.get('org_id') || user?.organization_id;

  const loadOrganizationName = useCallback(async () => {
    if (!organizationId) return;
    try {
      const orgsRes = await organizationAPI.getAll();
      const org = orgsRes.data.find(o => o.organization_id === organizationId);
      if (org) setOrganizationName(org.name);
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  }, [organizationId]);

  const loadInventory = useCallback(async () => {
    if (!organizationId) return;
    try {
      const params = { organization_id: organizationId };
      const response = await inventoryAPI.getAll(params);
      setInventory(response.data);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (organizationId) {
      loadInventory();
      loadOrganizationName();
    }
  }, [organizationId, loadInventory, loadOrganizationName]);

  const handleCreate = async () => {
    if (newItem.quantity < 0 || newItem.min_stock < 0) {
      toast.error('Las cantidades no pueden ser negativas');
      return;
    }
    try {
      await inventoryAPI.create(newItem);
      setIsDialogOpen(false);
      setNewItem({ name: '', quantity: 0, min_stock: 0, unit: 'unidades' });
      await loadInventory();
      toast.success('Producto agregado');
    } catch (error) {
      console.error('Error creating item:', error);
      if (error.response?.status === 400) {
        toast.error(error.response.data.detail || 'Datos inválidos');
      } else {
        toast.error('Error al crear producto');
      }
    }
  };

  const handleUpdate = async () => {
    try {
      await inventoryAPI.update(editingItem.item_id, newItem);
      setEditingItem(null);
      setNewItem({ name: '', quantity: 0, min_stock: 0, unit: 'unidades' });
      await loadInventory(); // Reload to get updated is_low_stock
      toast.success('Producto actualizado');
    } catch (error) {
      console.error('Error updating item:', error);
      if (error.response?.status === 400) {
        toast.error(error.response.data.detail || 'Datos inválidos');
      } else {
        toast.error('Error al actualizar producto');
      }
    }
  };

  const handleDelete = async (id) => {
    if (!await confirmAction('¿Eliminar este producto?')) return;
    try {
      await inventoryAPI.delete(id);
      loadInventory();
      toast.success('Producto eliminado');
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Error al eliminar producto');
    }
  };

  const handleGenerateOrder = async () => {
    setLoadingOrder(true);
    setOrderRecommendation('');
    setIsOrderDialogOpen(true);
    
    try {
      const response = await inventoryAPI.generateOrder();
      const reader = response.data.getReader();
      const decoder = new TextDecoder();
      
      let fullText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.error) {
                toast.error(data.error);
                setOrderRecommendation(`❌ Error: ${data.error}`);
                setLoadingOrder(false);
                break;
              }
              if (data.content) {
                fullText += data.content;
                setOrderRecommendation(fullText);
              }
              if (data.done) {
                setLoadingOrder(false);
              }
            } catch (e) {
              console.error('Error parsing SSE:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error generating order:', error);
      toast.error('Error al generar orden');
      setLoadingOrder(false);
      setIsOrderDialogOpen(false);
    }
  };

  const startEdit = (item) => {
    setEditingItem(item);
    setNewItem({
      name: item.name,
      quantity: item.quantity,
      min_stock: item.min_stock,
      unit: item.unit
    });
  };

  const lowStockCount = inventory.filter(item => item.is_low_stock).length;

  if (loading) {
    return (
      <div className="min-h-screen nexus-screen flex items-center justify-center">
        <div className="text-[var(--app-text-primary)] text-lg">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen nexus-screen p-6">
      <div className="max-w-6xl mx-auto">
        {lowStockCount > 0 && (
          <div className="mb-6 backdrop-blur-xl bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-2xl p-4 flex items-center gap-3">
            <AlertCircle size={24} strokeWidth={1.5} className="text-[#FF453A] low-stock-pulse" />
            <div className="flex-1">
              <p className="text-[var(--app-text-primary)] font-medium">
                {lowStockCount} {lowStockCount === 1 ? 'producto' : 'productos'} con stock bajo
              </p>
              <p className="text-sm text-zinc-400">Considera generar una orden de compra</p>
            </div>
            <button
              onClick={handleGenerateOrder}
              className="px-4 py-2 bg-[#FF453A] hover:bg-[#FF3A2D] text-[var(--app-text-primary)] rounded-xl font-medium transition-all"
            >
              Ver recomendación
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(organizationId && user?.role === 'owner' ? `/manager/dashboard?org_id=${organizationId}` : '/manager/dashboard')}
              className="p-2 rounded-xl bg-white/5 border border-[var(--app-border)] hover:bg-white/10 transition-all text-[var(--app-text-primary)]"
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0A84FF] flex items-center justify-center">
                <Package size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-4xl font-light tracking-tight text-[var(--app-text-primary)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  Inventario
                </h1>
                {organizationName ? (
                  <p className="text-zinc-400 text-sm mt-1">{organizationName}</p>
                ) : (
                  <p className="text-zinc-400 text-sm">Gestiona tus productos y stock</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              data-testid={MANAGER.generateOrderBtn}
              onClick={handleGenerateOrder}
              className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-[var(--app-border)] hover:bg-white/10 text-[var(--app-text-primary)] rounded-xl font-medium transition-all"
            >
              <FileText size={20} strokeWidth={1.5} />
              Generar Orden
            </button>
            <Dialog open={isDialogOpen || editingItem !== null} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingItem(null);
                setNewItem({ name: '', quantity: 0, min_stock: 0, unit: 'unidades' });
              }
            }}>
              <DialogTrigger asChild>
                <button
                  data-testid={MANAGER.addInventoryBtn}
                  className="flex items-center gap-2 px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] rounded-xl font-medium transition-all hover:-translate-y-1 active:scale-95"
                >
                  <Plus size={20} strokeWidth={1.5} />
                  Nuevo Producto
                </button>
              </DialogTrigger>
              <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)]">
                <DialogHeader>
                  <DialogTitle className="text-[var(--app-text-primary)]">
                    {editingItem ? 'Editar Producto' : 'Crear Producto'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Nombre</label>
                    <input
                      type="text"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      placeholder="Ej: Gel para cabello"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Cantidad actual</label>
                      <input
                        type="number"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-zinc-400 mb-2 block">Stock mínimo</label>
                      <input
                        type="number"
                        value={newItem.min_stock}
                        onChange={(e) => setNewItem({ ...newItem, min_stock: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Unidad</label>
                    <input
                      type="text"
                      value={newItem.unit}
                      onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      className="w-full px-4 py-3 bg-transparent border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                      placeholder="Ej: unidades, ml, kg"
                    />
                  </div>
                  <button
                    onClick={editingItem ? handleUpdate : handleCreate}
                    className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-[var(--app-text-primary)] rounded-xl font-medium transition-all"
                  >
                    {editingItem ? 'Actualizar Producto' : 'Crear Producto'}
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left p-4 text-sm font-medium text-zinc-400">Producto</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-400">Cantidad</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-400">Stock mínimo</th>
                  <th className="text-left p-4 text-sm font-medium text-zinc-400">Estado</th>
                  <th className="text-right p-4 text-sm font-medium text-zinc-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr
                    key={item.item_id}
                    data-testid={MANAGER.inventoryRow}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {item.is_low_stock && (
                          <div className="w-2 h-2 rounded-full bg-[#FF453A] low-stock-pulse"></div>
                        )}
                        <span className="text-[var(--app-text-primary)] font-medium">{item.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-zinc-400">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="p-4 text-zinc-400">
                      {item.min_stock} {item.unit}
                    </td>
                    <td className="p-4">
                      {item.is_low_stock ? (
                        <span className="px-3 py-1 rounded-lg text-xs font-medium bg-[#FF453A]/20 text-[#FF453A]">
                          Stock Bajo
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-lg text-xs font-medium bg-[#32D74B]/20 text-[#32D74B]">
                          OK
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-[#0A84FF] transition-colors"
                          title="Editar"
                        >
                          <Edit size={18} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.item_id)}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-red-300 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {inventory.length === 0 && (
          <div className="backdrop-blur-xl bg-white/3 border border-[var(--app-border)] rounded-2xl p-12 text-center mt-6">
            <Package size={48} strokeWidth={1.5} className="text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">No hay productos en el inventario</p>
            <p className="text-zinc-500 text-sm">Agrega tu primer producto para comenzar</p>
          </div>
        )}

        <Dialog open={isOrderDialogOpen} onOpenChange={setIsOrderDialogOpen}>
          <DialogContent className="bg-[var(--app-surface-elevated)] border-[var(--app-border)] max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-[var(--app-text-primary)] flex items-center gap-2">
                <FileText size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
                Recomendación de Compra Inteligente
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 max-h-96 overflow-y-auto">
              {loadingOrder ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-zinc-400">Analizando inventario...</div>
                </div>
              ) : (
                <div className="prose prose-invert max-w-none">
                  <div className="text-zinc-300 whitespace-pre-wrap">{orderRecommendation}</div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ManagerInventory;
