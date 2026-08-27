import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Check, ChevronDown, X, Megaphone, AlertTriangle, Info, Clock } from 'lucide-react';
import { billingAPI } from '../api';

const SOUND_OPTIONS = [
  { id: 'default', label: 'Clásico', frequency: [520, 680], duration: 120 },
  { id: 'soft', label: 'Suave', frequency: [440, 550], duration: 180 },
  { id: 'alert', label: 'Alerta', frequency: [600, 800, 600], duration: 80 },
];

function playTone(option) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = option.frequency;
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * (option.duration / 1000));
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (i + 1) * (option.duration / 1000));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * (option.duration / 1000));
      osc.stop(ctx.currentTime + (i + 1) * (option.duration / 1000));
    });
  } catch (e) {
    // Web Audio not available
  }
}

function getSoundPref() {
  try {
    return JSON.parse(localStorage.getItem('nexus_notif_sound') || '{}');
  } catch { return {}; }
}
function saveSoundPref(pref) {
  try { localStorage.setItem('nexus_notif_sound', JSON.stringify(pref)); } catch {}
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  low_rating_alert: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  owner_announcement: { icon: Megaphone, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
};

function getNotifStyle(n) {
  return SEVERITY_CONFIG[n.event_type] || SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.info;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

export default function NotificationBellEnhanced() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundPref, setSoundPref] = useState(() => getSoundPref());
  const [prevCount, setPrevCount] = useState(0);
  const dropdownRef = useRef(null);
  const bellRef = useRef(null);

  const soundId = soundPref.sound || 'default';
  const muted = soundPref.muted || false;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await billingAPI.getNotifications({ unread_only: false, limit: 30 });
      const items = res.data?.notifications || res.data || [];
      setNotifications(items);
      return items;
    } catch { return []; }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (unreadCount > prevCount && prevCount > 0 && !muted) {
      const opt = SOUND_OPTIONS.find(s => s.id === soundId) || SOUND_OPTIONS[0];
      playTone(opt);
    }
    setPrevCount(unreadCount);
  }, [unreadCount, prevCount, muted, soundId]);

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          bellRef.current && !bellRef.current.contains(e.target)) {
        setOpen(false);
        setSoundOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const markRead = async (notifId) => {
    try {
      await billingAPI.markNotificationRead(notifId);
      setNotifications(prev => prev.map(n =>
        n.notification_id === notifId ? { ...n, is_read: true } : n
      ));
    } catch {}
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.allSettled(unread.map(n => billingAPI.markNotificationRead(n.notification_id)));
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const updateSound = (key, value) => {
    const next = { ...soundPref, [key]: value };
    setSoundPref(next);
    saveSoundPref(next);
  };

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => { setOpen(o => !o); setSoundOpen(false); }}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Notificaciones"
      >
        {muted ? <BellOff size={20} /> : <Bell size={20} />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-black text-[10px] font-bold px-1 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div ref={dropdownRef} className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-14 sm:top-full sm:mt-2 sm:w-[360px] max-h-[480px] bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSoundOpen(s => !s)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Configurar sonido"
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                  title="Marcar todas como leídas"
                >
                  <Check size={15} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {soundOpen && (
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
              <p className="text-xs text-zinc-400 mb-2">Sonido de notificación</p>
              <div className="space-y-1">
                {SOUND_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => { updateSound('sound', opt.id); updateSound('muted', false); playTone(opt); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      soundId === opt.id && !muted ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Volume2 size={14} />
                      {opt.label}
                    </span>
                    {soundId === opt.id && !muted && <Check size={14} />}
                  </button>
                ))}
                <button
                  onClick={() => updateSound('muted', true)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    muted ? 'bg-zinc-700/50 text-zinc-300' : 'text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <VolumeX size={14} />
                    Silenciar
                  </span>
                  {muted && <Check size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                <Bell size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map(n => {
                const style = getNotifStyle(n);
                const Icon = style.icon;
                return (
                  <button
                    key={n.notification_id}
                    onClick={() => markRead(n.notification_id)}
                    className={`w-full text-left px-4 py-3 border-b border-zinc-800/50 hover:bg-white/[0.03] transition-colors ${
                      !n.is_read ? 'bg-white/[0.02]' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`mt-0.5 p-1.5 rounded-lg ${style.bg} ${style.border} border shrink-0`}>
                        <Icon size={14} className={style.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!n.is_read ? 'text-white' : 'text-zinc-400'}`}>
                            {n.title}
                          </p>
                          {!n.is_read && (
                            <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Clock size={10} className="text-zinc-600" />
                          <span className="text-[10px] text-zinc-600">{timeAgo(n.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
