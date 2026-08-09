import React from 'react';

export function FieldGuide({ label, hint, example, required=false, optional=false, unit }) {
  return <span className="nexus-field-guide">
    <span className="nexus-field-label">{label}{required&&<b aria-label="obligatorio"> *</b>}{optional&&<em>Opcional</em>}{unit&&<i>{unit}</i>}</span>
    {hint&&<small>{hint}</small>}
    {example&&<small className="nexus-field-example">Ejemplo: {example}</small>}
  </span>;
}
