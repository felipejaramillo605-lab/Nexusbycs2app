// frontend/src/guide/GuideArticle.jsx
import React from 'react';
import { MotionPage, EmptyState } from '../components/design';
import { Summary, ScreenWalkthrough, Step, ButtonRef, Example, Pitfalls } from './GuideBlocks';
import SectionChecklist from './SectionChecklist';

export default function GuideArticle({ module, view, onProgressChange }) {
  const content = module?.content?.perRole?.[view];

  if (!content) {
    return (
      <MotionPage>
        <EmptyState
          title="Guía no disponible"
          description="Esta guía no aplica para esta vista."
        />
      </MotionPage>
    );
  }

  const screens = content.screens || [];
  const steps = content.steps || [];
  const buttons = content.buttons || [];
  const examples = content.examples || [];
  const pitfalls = content.pitfalls || [];
  const checklist = content.checklist || [];

  return (
    <MotionPage>
      <article className="nexus-guide">
        <header>
          <h2>{module.title}</h2>
          <p className="nexus-guide-viewline">Vista: {view}</p>
        </header>

        {content.summary ? (
          <Summary
            what={content.summary.what}
            forWhat={content.summary.forWhat}
            whoUses={content.summary.whoUses}
          />
        ) : null}

        {screens.length > 0
          ? screens.map((s, i) => (
              <ScreenWalkthrough
                key={i}
                title={s.title}
                screenshot={s.screenshot}
                zones={s.zones}
              />
            ))
          : null}

        {steps.length > 0 ? (
          <section>
            <h2>Paso a paso</h2>
            {steps.map((st, i) => (
              <Step
                key={st.id || i}
                n={i + 1}
                title={st.title}
                substeps={st.substeps}
                screenshot={st.screenshot}
                expected={st.expected}
              />
            ))}
          </section>
        ) : null}

        {buttons.length > 0 ? (
          <section>
            <h2>Todos los botones</h2>
            <ButtonRef rows={buttons} />
          </section>
        ) : null}

        {examples.length > 0 ? (
          <section>
            <h2>Ejemplos</h2>
            {examples.map((ex, i) => (
              <Example key={i} scenario={ex.scenario} walkthrough={ex.walkthrough} />
            ))}
          </section>
        ) : null}

        {pitfalls.length > 0 ? (
          <section>
            <h2>Errores comunes</h2>
            <Pitfalls items={pitfalls} />
          </section>
        ) : null}

        <SectionChecklist
          view={view}
          moduleId={module.id}
          items={checklist}
          onChange={onProgressChange}
        />
      </article>
    </MotionPage>
  );
}
