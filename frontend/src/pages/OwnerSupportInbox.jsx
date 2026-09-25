import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LifeBuoy, RefreshCw, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { organizationAPI, supportAPI } from '../api';
import {
  ActionButton,
  DetailDrawer,
  EmptyState,
  LoadingState,
  MotionPage,
  PageHeader,
  ResponsiveDataView,
  SegmentedControl,
  StatusBadge,
} from '../components/design';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'waiting_owner', label: 'Esperando Nexus' },
  { value: 'waiting_organization', label: 'Esperando organización' },
  { value: 'in_progress', label: 'En progreso' },
  { value: 'resolved', label: 'Resueltas' },
  { value: 'closed', label: 'Cerradas' },
];

const STATUS_LABELS = {
  open: 'Abierta',
  waiting_owner: 'Esperando Nexus',
  waiting_organization: 'Esperando organización',
  in_progress: 'En progreso',
  resolved: 'Resuelta',
  closed: 'Cerrada',
};

const STATUS_TONES = {
  open: 'info',
  waiting_owner: 'warning',
  waiting_organization: 'neutral',
  in_progress: 'info',
  resolved: 'success',
  closed: 'neutral',
};

const PRIORITY_LABELS = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

const safeDetail = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail.message === 'string') return detail.message;
  return fallback;
};

const formatWhen = (value) => {
  if (!value) return 'Sin actividad';
  try {
    return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return value;
  }
};

export default function OwnerSupportInbox() {
  const [orgsById, setOrgsById] = useState({});
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  // NEXUS_OWNER_SUPPORT_REPLY_IDEMPOTENCY_V1: one key per intended send, not per
  // conversation -- a retry of a failed send must reuse the same key (so the
  // backend's idempotency check collapses it into the original attempt instead
  // of double-posting), but the NEXT reply in the same open conversation needs a
  // fresh one, or the backend would treat it as a replay of the first message
  // and silently return that one instead of saving the new text.
  const replyKeyRef = useRef({ conversationId: null, key: null });
  const currentReplyKey = (conversationId) => {
    if (replyKeyRef.current.conversationId !== conversationId) {
      replyKeyRef.current = { conversationId, key: `owner-support-reply-${conversationId}-${globalThis.crypto?.randomUUID?.() || Date.now()}` };
    }
    return replyKeyRef.current.key;
  };

  useEffect(() => {
    organizationAPI
      .getAll()
      .then((res) => {
        const map = {};
        (res.data || []).forEach((org) => {
          map[org.organization_id] = org.name || org.organization_id;
        });
        setOrgsById(map);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supportAPI.ownerList({ page, page_size: 25, status: status === 'all' ? undefined : status });
      setItems(res.data.items || []);
      setMeta(res.data);
    } catch (err) {
      toast.error(safeDetail(err, 'No fue posible cargar la bandeja de soporte'));
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = (value) => {
    setStatus(value);
    setPage(1);
  };

  const openConversation = async (item) => {
    setDetailLoading(true);
    setSelected({ conversation: item, messages: [], loading: true });
    setReply('');
    try {
      const res = await supportAPI.ownerGet(item.conversation_id);
      setSelected({ ...res.data, loading: false });
    } catch (err) {
      setSelected(null);
      toast.error(safeDetail(err, 'No fue posible cargar la conversación'));
    } finally {
      setDetailLoading(false);
    }
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || !selected?.conversation) return;
    const conversationId = selected.conversation.conversation_id;
    setSending(true);
    try {
      const res = await supportAPI.ownerSendMessage(conversationId, {
        body,
        idempotency_key: currentReplyKey(conversationId),
      });
      setSelected((current) => ({
        conversation: res.data.conversation,
        messages: [...(current?.messages || []), res.data.message],
        loading: false,
      }));
      setReply('');
      // A future reply in this same conversation is a new intention, not a retry.
      replyKeyRef.current = { conversationId: null, key: null };
      load();
    } catch (err) {
      toast.error(safeDetail(err, 'No fue posible enviar la respuesta'));
    } finally {
      setSending(false);
    }
  };

  const columns = [
    {
      key: 'organization',
      label: 'Organización',
      render: (item) => (
        <button type="button" className="nexus-owner-user" onClick={() => openConversation(item)}>
          <span>{(orgsById[item.organization_id] || item.organization_id || '?').charAt(0).toUpperCase()}</span>
          <div>
            <strong>{orgsById[item.organization_id] || item.organization_id}</strong>
            <small>{item.subject}</small>
          </div>
        </button>
      ),
    },
    { key: 'status', label: 'Estado', render: (item) => <StatusBadge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status] || item.status}</StatusBadge> },
    { key: 'priority', label: 'Prioridad', render: (item) => PRIORITY_LABELS[item.priority] || item.priority },
    { key: 'updated', label: 'Última actividad', render: (item) => formatWhen(item.last_message_at) },
    {
      key: 'actions',
      label: 'Acción',
      align: 'right',
      render: (item) => (
        <ActionButton variant="ghost" onClick={() => openConversation(item)}>
          Ver conversación
        </ActionButton>
      ),
    },
  ];

  return (
    <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader
        eyebrow="Administración Owner"
        title="Comunicados y PQRS"
        description="Bandeja global de soporte: revisa y responde las conversaciones de todas las organizaciones."
        actions={
          <ActionButton variant="secondary" icon={RefreshCw} onClick={load}>
            Actualizar
          </ActionButton>
        }
      />

      <SegmentedControl value={status} onChange={changeStatus} options={STATUS_OPTIONS} />

      {loading ? (
        <LoadingState />
      ) : (
        <ResponsiveDataView
          columns={columns}
          items={items}
          rowKey={(item) => item.conversation_id}
          renderCard={(item) => (
            <button type="button" className="nexus-mobile-record-body" onClick={() => openConversation(item)}>
              <strong>{orgsById[item.organization_id] || item.organization_id}</strong>
              <span>{item.subject}</span>
              <StatusBadge tone={STATUS_TONES[item.status]}>{STATUS_LABELS[item.status] || item.status}</StatusBadge>
              <small>{formatWhen(item.last_message_at)}</small>
            </button>
          )}
          empty={
            <EmptyState
              icon={LifeBuoy}
              title="Sin conversaciones"
              description={status === 'all' ? 'No hay conversaciones de soporte todavía.' : 'No hay conversaciones con este estado.'}
            />
          }
        />
      )}

      {meta.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-400">
          <ActionButton variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </ActionButton>
          <span>
            Página {meta.page} de {meta.total_pages} · {meta.total} conversaciones
          </span>
          <ActionButton variant="ghost" icon={ChevronRight} disabled={page >= meta.total_pages} onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}>
            Siguiente
          </ActionButton>
        </div>
      )}

      <DetailDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.conversation ? orgsById[selected.conversation.organization_id] || selected.conversation.organization_id : 'Conversación'}
        description={selected?.conversation?.subject}
      >
        {selected && (
          <div className="space-y-4">
            {detailLoading || selected.loading ? (
              <LoadingState rows={3} />
            ) : (
              <>
                <div className="nexus-detail-list">
                  <div>
                    <span>Estado</span>
                    <strong>{STATUS_LABELS[selected.conversation?.status] || selected.conversation?.status}</strong>
                  </div>
                  <div>
                    <span>Prioridad</span>
                    <strong>{PRIORITY_LABELS[selected.conversation?.priority] || selected.conversation?.priority}</strong>
                  </div>
                  <div>
                    <span>Canal</span>
                    <strong>{selected.conversation?.channel === 'ticket' ? 'Ticket' : 'Chat'}</strong>
                  </div>
                </div>

                <div className="nexus-audit-list" aria-label="Historial de mensajes">
                  {(selected.messages || []).map((message) => (
                    <li key={message.message_id}>
                      <strong>{message.sender_role === 'owner' ? 'Nexus (Owner)' : 'Organización'}</strong>
                      <p>{message.body}</p>
                      <small>{formatWhen(message.created_at)}</small>
                    </li>
                  ))}
                  {(selected.messages || []).length === 0 && <p>Sin mensajes todavía.</p>}
                </div>

                {selected.conversation?.status !== 'closed' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300" htmlFor="owner-support-reply">
                      Responder
                    </label>
                    <textarea
                      id="owner-support-reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      placeholder="Escribe tu respuesta a la organización..."
                      className="w-full px-3 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                    />
                    <ActionButton icon={Send} loading={sending} disabled={!reply.trim() || sending} onClick={sendReply}>
                      Enviar respuesta
                    </ActionButton>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Esta conversación está cerrada y no admite nuevas respuestas.</p>
                )}
              </>
            )}
          </div>
        )}
      </DetailDrawer>
    </MotionPage>
  );
}
