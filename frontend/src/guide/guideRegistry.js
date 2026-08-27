// frontend/src/guide/guideRegistry.js
import { LayoutDashboard, CalendarDays, Users, Scissors, BriefcaseBusiness, ChartNoAxesCombined } from 'lucide-react';
import dashboard from './guideContent/dashboard';
import agenda from './guideContent/agenda';
import clientes from './guideContent/clientes';
import servicios from './guideContent/servicios';
import equipo from './guideContent/equipo';
import ingresos from './guideContent/ingresos';

export const GUIDE_MODULES = [
  { id: 'dashboard', title: 'Inicio', icon: LayoutDashboard, visibleTo: ['owner', 'manager', 'staff'], content: dashboard },
  { id: 'agenda', title: 'Agenda y citas', icon: CalendarDays, visibleTo: ['owner', 'manager', 'staff'], content: agenda },
  { id: 'clientes', title: 'Clientes', icon: Users, visibleTo: ['owner', 'manager', 'staff'], content: clientes },
  { id: 'servicios', title: 'Servicios', icon: Scissors, visibleTo: ['owner', 'manager'], content: servicios },
  { id: 'equipo', title: 'Equipo', icon: BriefcaseBusiness, visibleTo: ['owner', 'manager'], content: equipo },
  { id: 'ingresos', title: 'Ingresos', icon: ChartNoAxesCombined, visibleTo: ['owner', 'manager', 'staff'], content: ingresos },
];

export function getModulesForView(view) {
  return GUIDE_MODULES.filter(
    (m) => m.visibleTo.includes(view) && m.content.perRole[view],
  );
}

export function checklistCount(moduleId, view) {
  const m = GUIDE_MODULES.find((x) => x.id === moduleId);
  return m?.content?.perRole?.[view]?.checklist?.length || 0;
}
