/* NEXUS_AI_V1 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bot, Lock, Loader2, Plus, Send, Sparkles, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { API, nexusAiAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { ActionButton, EmptyState, MotionPage, PageHeader, SurfaceCard } from '../components/design';

const SUGGESTED_QUESTIONS = [
  '¿Cómo está mi negocio esta semana?',
  '¿Qué clientes están en riesgo de no volver?',
  '¿Cuáles son mis servicios más solicitados?',
  '¿Qué debería comprar pronto?',
  '¿Cómo puedo conseguir más clientes?',
  '¿Cómo creo un profesional?',
];

export default function NexusAI() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const organizationId = user?.organization_id;
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [toolStatus, setToolStatus] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    nexusAiAPI.getStatus({ organization_id: organizationId }).then(r => setStatus(r.data)).catch(() => setStatus({ contracted: false, enabled: false })).finally(() => setLoadingStatus(false));
  }, [organizationId]);

  const loadConversations = useCallback(async () => {
    try {
      const r = await nexusAiAPI.getConversations({ organization_id: organizationId });
      setConversations(r.data || []);
      return r.data || [];
    } catch (e) { return []; }
  }, [organizationId]);

  useEffect(() => {
    if (status?.contracted && status?.enabled) loadConversations();
  }, [status, organizationId, loadConversations]);

  const openConversation = async (conv) => {
    setActiveId(conv.conversation_id);
    try {
      const r = await nexusAiAPI.getMessages(conv.conversation_id, { organization_id: organizationId });
      setMessages(r.data || []);
    } catch (e) { toast.error('No fue posible cargar la conversación'); }
  };

  const startNewConversation = async () => {
    try {
      const r = await nexusAiAPI.createConversation({ organization_id: organizationId });
      setConversations(prev => [r.data, ...prev]);
      setActiveId(r.data.conversation_id);
      setMessages([]);
    } catch (e) { toast.error('No fue posible iniciar una conversación'); }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    let conversationId = activeId;
    if (!conversationId) {
      try {
        const r = await nexusAiAPI.createConversation({ organization_id: organizationId });
        setConversations(prev => [r.data, ...prev]);
        conversationId = r.data.conversation_id;
        setActiveId(conversationId);
      } catch (e) { toast.error('No fue posible iniciar la conversación'); return; }
    }
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content }]);
    setSending(true);
    setToolStatus('');
    let assistantText = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    try {
      const response = await fetch(`${API}/nexus-ai/conversations/${conversationId}/messages?organization_id=${organizationId || ''}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      });
      if (!response.ok || !response.body) throw new Error('stream_failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.delta) {
            assistantText += payload.delta;
            setMessages(prev => { const next = [...prev]; next[next.length - 1] = { role: 'assistant', content: assistantText }; return next; });
          } else if (payload.tool_call) {
            setToolStatus(`Consultando: ${payload.tool_call}...`);
          } else if (payload.error) {
            toast.error(payload.error);
          }
        }
      }
      await loadConversations();
    } catch (e) {
      toast.error('Nexus AI no pudo responder. Intenta de nuevo.');
    } finally {
      setSending(false);
      setToolStatus('');
    }
  };

  if (loadingStatus) return <div className="nexus-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;

  if (!status?.contracted || !status?.enabled) {
    return <MotionPage className="nexus-owner-page space-y-6">
      <PageHeader eyebrow="Copiloto de negocio" title="Nexus AI" description="Tu copiloto inteligente para entender y hacer crecer tu negocio." />
      <SurfaceCard className="text-center max-w-xl mx-auto py-10" data-testid="nexus-ai-locked-state">
        <div className="w-16 h-16 rounded-2xl bg-[var(--app-primary)]/15 grid place-items-center mx-auto mb-4"><Lock size={28} className="text-[var(--app-primary)]" /></div>
        <h2 className="text-xl font-medium mb-2">Nexus AI no contratado</h2>
        <p className="text-[var(--app-text-secondary)] mb-6">Analiza clientes, ventas, inventario, servicios, marketing y más — todo con datos reales de tu organización, nunca inventados.</p>
        <ActionButton data-testid="nexus-ai-contact-cta" onClick={() => user?.role === 'owner' ? navigate('/owner/organizations') : toast.info('Contacta al Owner de Nexus para contratar este servicio.')}>
          Conocer Nexus AI
        </ActionButton>
      </SurfaceCard>
    </MotionPage>;
  }

  return <MotionPage className="nexus-owner-page space-y-6">
    <PageHeader eyebrow="Copiloto de negocio" title="Nexus AI" description="Pregúntale a Nexus AI sobre clientes, ventas, inventario y marketing." />
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4" style={{ minHeight: '60vh' }}>
      <SurfaceCard className="flex flex-col gap-2">
        <ActionButton icon={Plus} data-testid="nexus-ai-new-conversation" onClick={startNewConversation}>Nueva conversación</ActionButton>
        <div className="mt-2 space-y-1 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          {conversations.map(c => (
            <button key={c.conversation_id} data-testid="nexus-ai-conversation-item" onClick={() => openConversation(c)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm truncate transition-all ${activeId === c.conversation_id ? 'bg-[var(--app-primary)]/15 text-[var(--app-text-primary)]' : 'text-[var(--app-text-secondary)] hover:bg-white/5'}`}>
              {c.title || 'Nueva conversación'}
            </button>
          ))}
        </div>
      </SurfaceCard>

      <SurfaceCard className="flex flex-col" style={{ minHeight: '55vh' }}>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1" data-testid="nexus-ai-message-list">
          {messages.length === 0 && (
            <EmptyState icon={Sparkles} title="Nexus AI — tu copiloto de negocio" description="Elige una pregunta o escribe la tuya." action={
              <div className="grid sm:grid-cols-2 gap-2 mt-4">
                {SUGGESTED_QUESTIONS.map(q => (
                  <button key={q} data-testid="nexus-ai-suggested-question" onClick={() => send(q)} className="text-left text-sm px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-[var(--app-border)] transition-all">{q}</button>
                ))}
              </div>
            } />
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-[var(--app-primary)]/20 grid place-items-center shrink-0"><Bot size={16} className="text-[var(--app-primary)]" /></div>}
              <div data-testid={`nexus-ai-bubble-${m.role}`} className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[var(--app-primary)] text-white' : 'bg-white/5 border border-[var(--app-border)] text-[var(--app-text-primary)]'}`}>
                {m.content || (sending && i === messages.length - 1 ? (toolStatus || 'Pensando...') : '')}
              </div>
              {m.role === 'user' && <div className="w-8 h-8 rounded-full bg-white/10 grid place-items-center shrink-0"><UserIcon size={16} /></div>}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 mt-4 pt-4 border-t border-[var(--app-border)]">
          <input
            data-testid="nexus-ai-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregúntale algo a Nexus AI..."
            className="flex-1 px-4 py-3 bg-white/5 border border-[var(--app-border)] rounded-xl text-[var(--app-text-primary)] focus:border-[var(--app-primary)] outline-none"
            disabled={sending}
          />
          <ActionButton type="submit" icon={sending ? Loader2 : Send} data-testid="nexus-ai-send-btn" disabled={sending || !input.trim()}>Enviar</ActionButton>
        </form>
      </SurfaceCard>
    </div>
  </MotionPage>;
}
