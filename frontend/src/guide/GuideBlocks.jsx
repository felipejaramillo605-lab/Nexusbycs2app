// frontend/src/guide/GuideBlocks.jsx
import React from 'react';
import { SurfaceCard } from '../components/design';
import Screenshot from './Screenshot';

export function Summary({ what, forWhat, whoUses }) {
  return (
    <SurfaceCard className="nexus-guide-summary">
      <dl className="nexus-guide-summary-list">
        <div>
          <dt>Qué es</dt>
          <dd>{what}</dd>
        </div>
        <div>
          <dt>Para qué sirve</dt>
          <dd>{forWhat}</dd>
        </div>
        <div>
          <dt>Quién lo usa</dt>
          <dd>{whoUses}</dd>
        </div>
      </dl>
    </SurfaceCard>
  );
}

export function ScreenWalkthrough({ title, screenshot = {}, zones = [] }) {
  return (
    <div className="nexus-guide-walkthrough">
      {title ? <h3>{title}</h3> : null}
      <Screenshot src={screenshot.src} alt={screenshot.alt} zones={zones} />
      {zones.length > 0 ? (
        <ol className="nexus-guide-walkthrough-zones">
          {zones.map((z) => (
            <li key={z.n}>
              <strong>{z.n}.</strong> {z.label}
              {z.desc ? ` — ${z.desc}` : ''}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function Step({ n, title, substeps = [], screenshot, expected }) {
  return (
    <div className="nexus-guide-step">
      <h3>
        <span className="nexus-guide-step-n">{n}</span>
        {title}
      </h3>
      {substeps.length > 0 ? (
        <ol className="nexus-guide-substeps">
          {substeps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}
      {screenshot && screenshot.src ? (
        <Screenshot src={screenshot.src} alt={screenshot.alt} zones={screenshot.zones || []} />
      ) : null}
      {expected ? (
        <p className="nexus-guide-expected">
          <strong>Resultado esperado:</strong> {expected}
        </p>
      ) : null}
    </div>
  );
}

export function ButtonRef({ rows = [] }) {
  if (!rows.length) return null;
  return (
    <div className="nexus-guide-table-wrap">
      <table className="nexus-guide-table">
        <thead>
          <tr>
            <th>Botón</th>
            <th>Qué hace</th>
            <th>Cuándo usarlo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <tr key={i}>
                <td>
                  {typeof r.icon === 'string' ? (
                    <span aria-hidden="true">{r.icon}</span>
                  ) : Icon ? (
                    <Icon size={16} aria-hidden="true" />
                  ) : null}{' '}
                  {r.name}
                </td>
                <td>{r.does}</td>
                <td>{r.when}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Example({ scenario, walkthrough = [] }) {
  return (
    <div className="nexus-guide-example">
      <p><strong>{scenario}</strong></p>
      {walkthrough.length > 0 ? (
        <ol className="nexus-guide-example-steps">
          {walkthrough.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function Pitfalls({ items = [] }) {
  if (!items.length) return null;
  return (
    <ul className="nexus-guide-pitfall">
      {items.map((it, i) => (
        <li key={i}>
          <strong>{it.problem}</strong>
          <br />
          {it.fix}
        </li>
      ))}
    </ul>
  );
}
