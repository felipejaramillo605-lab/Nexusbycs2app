import React, { useCallback, useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ownerViewAPI } from '../../api';
import { clearViewSession, getViewSession } from '../../lib/viewMode';

const format = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function ViewModeBanner() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => getViewSession());
  const [now, setNow] = useState(() => Date.now());

  const leave = useCallback((message) => {
    clearViewSession();
    setSession(null);
    if (message) toast.info(message);
    navigate('/owner', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const blocked = (event) => toast.info(event.detail?.message || 'Modo visualización: acción bloqueada');
    const ended = () => leave('El modo visualización terminó');
    window.addEventListener('nexus:view-mode-blocked', blocked);
    window.addEventListener('nexus:view-mode-ended', ended);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('nexus:view-mode-blocked', blocked);
      window.removeEventListener('nexus:view-mode-ended', ended);
    };
  }, [session, leave]);

  const remaining = session ? new Date(session.expires_at).getTime() - now : 0;
  useEffect(() => {
    if (session && remaining <= 0) leave('El modo visualización expiró');
  }, [session, remaining, leave]);

  if (!session) return null;

  const exit = async () => {
    try {
      await ownerViewAPI.end(session.view_id);
    } catch {
      // the session also expires on its own; leaving locally is still correct
    }
    leave();
  };

  return (
    <div
      role="status"
      data-testid="view-mode-banner"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black"
    >
      <span className="flex items-center gap-2">
        <Eye size={16} aria-hidden="true" />
        Modo visualización · {session.organization_name || session.organization_id} · solo lectura · expira en {format(remaining)}
      </span>
      <button type="button" onClick={exit} className="rounded-lg bg-black/80 px-3 py-1 text-amber-100 hover:bg-black">
        Salir
      </button>
    </div>
  );
}
