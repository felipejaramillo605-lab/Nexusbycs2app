// frontend/src/guide/GuideModule.jsx
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, SegmentedControl, EmptyState, MotionPage } from '../components/design';
import { useAuth } from '../context/AuthContext';
import { resolveView } from './resolveView';
import { getModulesForView, checklistCount } from './guideRegistry';
import { globalProgress, moduleProgress } from './guideProgress';
import GuideArticle from './GuideArticle';
import './guide.css';

const VIEW_LABELS = {
  owner: 'Guía del Owner',
  manager: 'Guía del Manager',
  staff: 'Guía del Staff',
};

export default function GuideModule() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, setProgressTick] = useState(0);
  const bumpProgress = () => setProgressTick((t) => t + 1);

  const role = user?.role;
  const requestedView = searchParams.get('view');
  const { views, activeView } = resolveView(role, requestedView);

  const modules = getModulesForView(activeView);

  if (modules.length === 0) {
    return (
      <MotionPage className="nexus-guide-page">
        <PageHeader title="Guía de Nexus" />
        <EmptyState
          title="Guía en construcción"
          description="La guía aún no tiene contenido para esta vista."
        />
      </MotionPage>
    );
  }

  const requestedModuleId = searchParams.get('m');
  const activeModule =
    modules.find((m) => m.id === requestedModuleId) || modules[0];

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const handleViewChange = (nextView) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', nextView);
    next.delete('m');
    setSearchParams(next, { replace: true });
  };

  const progressModules = modules.map((m) => ({
    id: m.id,
    checklistCount: checklistCount(m.id, activeView),
  }));
  const gp = globalProgress(activeView, progressModules);

  return (
    <MotionPage className="nexus-guide-page">
      <PageHeader title="Guía de Nexus" />

      <div className="nexus-guide-progresshead">
        <div className="nexus-guide-progressbar">
          <i style={{ width: `${gp.pct}%` }} />
        </div>
        <span className="nexus-guide-progresstext">
          Has completado {gp.done}/{gp.total} pasos · {gp.pct}%
        </span>
      </div>

      {views.length > 1 ? (
        <div className="nexus-guide-selector">
          <SegmentedControl
            value={activeView}
            onChange={handleViewChange}
            options={views.map((v) => ({ value: v, label: VIEW_LABELS[v] || v }))}
          />
        </div>
      ) : null}

      <div className="nexus-guide-index-mobile">
        <select
          value={activeModule.id}
          onChange={(e) => updateParam('m', e.target.value)}
          aria-label="Elegir módulo de la guía"
        >
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </div>

      <div className="nexus-guide-layout">
        <nav className="nexus-guide-index" aria-label="Índice de la guía">
          {modules.map((m) => {
            const Icon = m.icon;
            const mp = moduleProgress(
              activeView,
              m.id,
              checklistCount(m.id, activeView),
            );
            return (
              <button
                key={m.id}
                type="button"
                className={m.id === activeModule.id ? 'is-active' : ''}
                aria-current={m.id === activeModule.id ? 'true' : undefined}
                onClick={() => updateParam('m', m.id)}
              >
                {Icon ? <Icon size={16} aria-hidden="true" /> : <span />}
                <span>{m.title}</span>
                <span className="nexus-guide-minibar">
                  <i style={{ width: `${mp.pct}%` }} />
                </span>
              </button>
            );
          })}
        </nav>

        <GuideArticle
          module={activeModule}
          view={activeView}
          onProgressChange={bumpProgress}
        />
      </div>
    </MotionPage>
  );
}
