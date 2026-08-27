import React, { useState, useEffect } from 'react';
import { Megaphone, Send, Users, Building2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { billingAPI, organizationAPI } from '../api';

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Informativo', color: 'bg-blue-500' },
  { value: 'warning', label: 'Importante', color: 'bg-amber-500' },
  { value: 'critical', label: 'Urgente', color: 'bg-red-500' },
];

export default function OwnerAnnouncements() {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgs, setSelectedOrgs] = useState([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('info');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    async function loadOrgs() {
      try {
        const res = await organizationAPI.getAll();
        const raw = res.data || [];
        const orgs = raw.map(o => ({
          id: o.organization_id,
          name: o.name || o.organization_id,
        }));
        setOrganizations(orgs);
      } catch {}
    }
    loadOrgs();
  }, []);

  const toggleOrg = (orgId) => {
    setSelectedOrgs(prev =>
      prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]
    );
    setSelectAll(false);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedOrgs([]);
    } else {
      setSelectedOrgs(organizations.map(o => o.id));
    }
    setSelectAll(!selectAll);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim() || selectedOrgs.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      await billingAPI.announce({
        organization_ids: selectedOrgs,
        title: title.trim(),
        message: message.trim(),
        severity,
      });
      setResult({ ok: true, msg: `Comunicado enviado a ${selectedOrgs.length} sucursal(es)` });
      setTitle('');
      setMessage('');
      setSelectedOrgs([]);
      setSelectAll(false);
      setSeverity('info');
    } catch (err) {
      setResult({ ok: false, msg: err?.response?.data?.detail || 'Error al enviar el comunicado' });
    } finally {
      setSending(false);
    }
  };

  const canSend = title.trim() && message.trim() && selectedOrgs.length > 0 && !sending;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Megaphone size={22} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">Comunicados</h1>
          <p className="text-sm text-zinc-400">Envía notificaciones a los managers de tus sucursales</p>
        </div>
      </div>

      {/* Destination */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Users size={15} />
            Destinatarios
          </label>
          {organizations.length > 1 && (
            <button
              onClick={handleSelectAll}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              {selectAll ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
          )}
        </div>
        {organizations.length === 0 ? (
          <p className="text-sm text-zinc-500">Cargando sucursales...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => toggleOrg(org.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                  selectedOrgs.includes(org.id)
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Building2 size={14} />
                <span className="truncate">{org.name}</span>
                {selectedOrgs.includes(org.id) && <CheckCircle2 size={14} className="ml-auto text-amber-400 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message compose */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
        <div>
          <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Prioridad</label>
          <div className="flex gap-2">
            {SEVERITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSeverity(opt.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all ${
                  severity === opt.value
                    ? 'bg-white/5 border-zinc-600 text-white'
                    : 'border-zinc-700/50 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Título</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ej: Cambio de horario esta semana"
            maxLength={120}
            className="w-full px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Mensaje</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Escribe el comunicado para los managers..."
            rows={4}
            maxLength={1000}
            className="w-full px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
          />
          <p className="text-right text-[10px] text-zinc-600 mt-1">{message.length}/1000</p>
        </div>
      </div>

      {/* Result feedback */}
      {result && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          result.ok ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {result.msg}
        </div>
      )}

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!canSend}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
          canSend
            ? 'bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]'
            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
        }`}
      >
        {sending ? (
          <><Loader2 size={16} className="animate-spin" /> Enviando...</>
        ) : (
          <><Send size={16} /> Enviar comunicado{selectedOrgs.length > 0 ? ` a ${selectedOrgs.length} sucursal(es)` : ''}</>
        )}
      </button>
    </div>
  );
}
