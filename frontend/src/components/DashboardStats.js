import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, Users, Scissors, DollarSign, BadgePercent, Banknote, HandCoins, ReceiptText } from 'lucide-react';
import { api, transactionAPI } from '../api';

// NEXUS_FINANCIAL_DASHBOARD_V1
const COLORS = ['#0A84FF', '#32D74B', '#FF453A', '#FF9F0A', '#BF5AF2', '#00C7BE'];
const PAYMENT_LABELS = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', nequi: 'Nequi', daviplata: 'Daviplata', other: 'Otro' };
const money = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(value) || 0);

const DashboardStats = ({ organizationId }) => {
  const [stats, setStats] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: new Date(Date.now() - 2592000000).toISOString().split('T')[0], end: new Date().toISOString().split('T')[0] });

  const loadStats = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const params = { start_date: dateRange.start, end_date: dateRange.end, organization_id: organizationId };
      const [operational, revenue] = await Promise.all([api.get('/statistics', { params }), transactionAPI.getSummary(params)]);
      setStats(operational.data);
      setFinancial(revenue.data);
    } catch (error) { console.error('Error loading dashboard statistics:', error); setStats(null); setFinancial(null); }
    finally { setLoading(false); }
  }, [organizationId, dateRange.start, dateRange.end]);

  useEffect(() => { loadStats(); }, [loadStats]);
  if (loading) return <div className="flex justify-center py-12 text-secondary">Cargando estadísticas...</div>;
  if (!stats || !financial) return null;

  const cards = [
    ['Total recibido', money(financial.total_received), DollarSign, '#0A84FF'],
    ['Servicios netos', money(financial.total_net_service_amount), ReceiptText, '#32D74B'],
    ['Participación negocio', money(financial.total_business_amount), TrendingUp, '#BF5AF2'],
    ['Comisiones Staff', money(financial.total_staff_commission), Users, '#FF9F0A'],
    ['Propinas', money(financial.total_tips), HandCoins, '#00C7BE'],
    ['Descuentos', money(financial.total_discount), BadgePercent, '#FF453A'],
    ['Total para Staff', money(financial.total_staff_amount), Banknote, '#32D74B'],
    ['Ticket promedio', money(financial.average_ticket), ReceiptText, '#0A84FF'],
    ['Transacciones', financial.transaction_count, Scissors, '#BF5AF2'],
    ['Citas del periodo', stats.total_appointments, Calendar, '#FF9F0A']
  ];

  return <div className="space-y-8">
    <div className="glass-panel p-6 rounded-2xl">
      <div className="flex items-center justify-between flex-wrap gap-4"><div className="flex items-center gap-3"><Calendar size={20} className="text-[#0A84FF]" /><div><h3 className="text-lg font-medium text-primary">Ingresos y operación</h3><p className="text-xs text-secondary">Finanzas basadas en cobros confirmados</p></div></div><div className="flex gap-4"><label className="text-xs text-secondary">Desde<input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} className="block mt-1 px-3 py-2 bg-secondary/50 border border-primary/20 rounded-lg text-primary" /></label><label className="text-xs text-secondary">Hasta<input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} className="block mt-1 px-3 py-2 bg-secondary/50 border border-primary/20 rounded-lg text-primary" /></label></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mt-6">{cards.map(([label, value, Icon, color]) => <div key={label} className="bg-secondary/30 rounded-xl p-4"><div className="flex items-center gap-3"><Icon size={20} style={{ color }} /><div className="min-w-0"><p className="text-xs text-secondary">{label}</p><p className="text-xl font-semibold text-primary truncate">{value}</p></div></div></div>)}</div>
    </div>
    {financial.daily_totals.length > 0 && <div className="glass-panel p-6 rounded-2xl"><h3 className="text-lg font-medium text-primary mb-6">Ingresos cobrados por día</h3><ResponsiveContainer width="100%" height={300}><LineChart data={financial.daily_totals}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(value) => money(value)} /><Legend /><Line dataKey="total_received" name="Total recibido" stroke="#0A84FF" strokeWidth={2} /><Line dataKey="net_service_amount" name="Servicios netos" stroke="#32D74B" strokeWidth={2} /></LineChart></ResponsiveContainer></div>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {financial.payment_methods.length > 0 && <div className="glass-panel p-6 rounded-2xl"><h3 className="text-lg font-medium text-primary mb-6">Medios de pago</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={financial.payment_methods.map((x) => ({ ...x, label: PAYMENT_LABELS[x.method] || x.method }))} dataKey="total_received" nameKey="label" outerRadius={100} label>{financial.payment_methods.map((x, i) => <Cell key={x.method} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => money(value)} /></PieChart></ResponsiveContainer></div>}
      {stats.service_stats.length > 0 && <div className="glass-panel p-6 rounded-2xl"><h3 className="text-lg font-medium text-primary mb-6">Servicios más populares</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={stats.service_stats} dataKey="count" nameKey="name" outerRadius={100} label>{stats.service_stats.map((x, i) => <Cell key={x.name} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>}
      {stats.barber_stats.length > 0 && <div className="glass-panel p-6 rounded-2xl lg:col-span-2"><h3 className="text-lg font-medium text-primary mb-6">Profesionales más activos</h3><ResponsiveContainer width="100%" height={300}><BarChart data={stats.barber_stats}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="count" name="Citas atendidas" fill="#0A84FF" /></BarChart></ResponsiveContainer></div>}
    </div>
  </div>;
};
export default DashboardStats;
