import React, { useEffect, useState } from 'react';
import { CalendarDays, ClipboardList, LogOut, MessageSquareText, MoreHorizontal, ShieldCheck, UserRound, WalletCards, BookOpen } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { inventoryAPI } from '../../api';

// On phones the bar keeps the four daily destinations and folds the rest into "Más"
// (seven ~53px buttons at 375px were too cramped to tap reliably).
export function StaffNav() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(null);

  // El acceso al conteo fisico es temporal: el enlace solo aparece mientras haya una asignacion vigente.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(inventoryAPI?.myCounts?.())
      .then((response) => !cancelled && setActiveCount(response?.data?.items?.[0] || null))
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="nexus-staff-nav" aria-label="Navegación del profesional">
      <NavLink to="/staff/appointments"><CalendarDays size={18} /><span>Citas</span></NavLink>
      <NavLink to="/staff/income"><WalletCards size={18} /><span>Ingresos</span></NavLink>
      <NavLink to="/staff/reviews"><MessageSquareText size={18} /><span>Reseñas</span></NavLink>
      <NavLink to="/staff/profile"><UserRound size={18} /><span>Perfil</span></NavLink>
      {activeCount && <NavLink to={`/inventory/count/${activeCount.count_id}`} className="nexus-staff-secondary"><ClipboardList size={18} /><span>Conteo</span></NavLink>}
      <NavLink to="/staff/guia" className="nexus-staff-secondary"><BookOpen size={18} /><span>Guía</span></NavLink>
      <NavLink to="/account/privacy" className="nexus-staff-secondary"><ShieldCheck size={18} /><span>Cuenta</span></NavLink>
      <button type="button" onClick={signOut} className="nexus-staff-secondary"><LogOut size={18} /><span>Salir</span></button>
      <button
        type="button"
        className="nexus-staff-more"
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((open) => !open)}
      >
        <MoreHorizontal size={18} /><span>Más</span>
      </button>
      {moreOpen && (
        <div className="nexus-staff-more-panel" role="menu" data-testid="staff-more-panel">
          {activeCount && <NavLink to={`/inventory/count/${activeCount.count_id}`} role="menuitem" onClick={() => setMoreOpen(false)}><ClipboardList size={18} /><span>Conteo de inventario</span></NavLink>}
          <NavLink to="/staff/guia" role="menuitem" onClick={() => setMoreOpen(false)}><BookOpen size={18} /><span>Guía</span></NavLink>
          <NavLink to="/account/privacy" role="menuitem" onClick={() => setMoreOpen(false)}><ShieldCheck size={18} /><span>Cuenta</span></NavLink>
          <button type="button" role="menuitem" onClick={signOut}><LogOut size={18} /><span>Salir</span></button>
        </div>
      )}
    </nav>
  );
}
