import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, Users, Scissors } from 'lucide-react';
import { api } from '../api';

const COLORS = ['#0A84FF', '#32D74B', '#FF453A', '#FF9F0A', '#BF5AF2', '#00C7BE'];

const DashboardStats = ({ organizationId }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadStats();
  }, [dateRange, organizationId]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const params = { 
        start_date: dateRange.start, 
        end_date: dateRange.end
      };
      if (organizationId) {
        params.organization_id = organizationId;
      }
      const response = await api.get('/statistics', { params });
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-secondary">Cargando estadísticas...</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Date Range Selector */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Calendar size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
            <h3 className="text-lg font-medium text-primary">Rango de Fechas</h3>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-secondary mb-1 block">Desde</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="px-3 py-2 bg-secondary/50 border border-primary/20 rounded-lg text-primary text-sm focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Hasta</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="px-3 py-2 bg-secondary/50 border border-primary/20 rounded-lg text-primary text-sm focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="bg-secondary/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#0A84FF]/20 flex items-center justify-center">
                <TrendingUp size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
              </div>
              <div>
                <p className="text-xs text-secondary">Ingresos Totales</p>
                <p className="text-2xl font-semibold text-primary">${stats.total_revenue.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-secondary/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#32D74B]/20 flex items-center justify-center">
                <Scissors size={20} strokeWidth={1.5} className="text-[#32D74B]" />
              </div>
              <div>
                <p className="text-xs text-secondary">Citas Totales</p>
                <p className="text-2xl font-semibold text-primary">{stats.total_appointments}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      {stats.daily_stats.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-medium text-primary mb-6 flex items-center gap-2">
            <TrendingUp size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
            Ingresos Diarios
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.daily_stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
              <XAxis 
                dataKey="date" 
                stroke="var(--text-secondary)"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="var(--text-secondary)"
                style={{ fontSize: '12px' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                name="Ingresos ($)"
                stroke="#0A84FF" 
                strokeWidth={2}
                dot={{ fill: '#0A84FF', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Services Distribution */}
        {stats.service_stats.length > 0 && (
          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-lg font-medium text-primary mb-6 flex items-center gap-2">
              <Scissors size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
              Servicios Más Populares
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.service_stats}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `${entry.name}: ${entry.count}`}
                  labelStyle={{ fontSize: '12px', fill: 'var(--text-primary)' }}
                >
                  {stats.service_stats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Barbers Performance */}
        {stats.barber_stats.length > 0 && (
          <div className="glass-panel p-6 rounded-2xl">
            <h3 className="text-lg font-medium text-primary mb-6 flex items-center gap-2">
              <Users size={20} strokeWidth={1.5} className="text-[#0A84FF]" />
              Barberos Más Activos
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.barber_stats}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--text-secondary)"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="var(--text-secondary)"
                  style={{ fontSize: '12px' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="count" 
                  name="Citas Atendidas"
                  fill="#0A84FF"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardStats;
