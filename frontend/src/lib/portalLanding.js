// Pagina de inicio del portal (plantillas de clases grupales) y guia de imagenes.

export const DEFAULT_EXPERIENCES_LABEL = 'Experiencias';

/** La plantilla activa declara `landing: true` y el manager no la desactivo. */
export const isLandingActive = (organization, theme) => !!theme?.landing && organization?.portal_landing_enabled !== false;

export const experiencesLabel = (organization) => (
  String(organization?.portal_experiences_label || '').trim() || DEFAULT_EXPERIENCES_LABEL
);

/** Medidas recomendadas que se muestran al manager al subir cada imagen. */
export const IMAGE_SPECS = Object.freeze({
  hero: Object.freeze({
    label: 'Imagen de portada',
    size: '1920 × 1080 px',
    ratio: '16:9 horizontal',
    minimum: '1600 × 900 px',
    weight: 'JPG, PNG o WebP, hasta 12 MB (se optimiza sola)',
    tip: 'Deja el sujeto en el centro y la parte baja más oscura o libre: ahí van el título y los botones. Se oscurece un poco para que el texto se lea.',
  }),
  experience: Object.freeze({
    label: 'Imagen de cada experiencia',
    size: '800 × 1000 px',
    ratio: '4:5 vertical',
    minimum: '600 × 750 px',
    weight: 'JPG, PNG o WebP',
    tip: 'Se muestra con la parte de arriba redondeada. Se configura en Servicios → Clases (portada de cada clase).',
  }),
  logo: Object.freeze({
    label: 'Logo',
    size: '400 × 160 px',
    ratio: 'horizontal, fondo transparente',
    minimum: '200 × 80 px',
    weight: 'PNG o WebP con transparencia',
    tip: 'Va arriba a la izquierda del menú. Usa una versión que se lea sobre fondo oscuro y claro.',
  }),
});

/** Anclas del menu de la pagina de inicio, segun lo que realmente hay para mostrar. */
export const landingMenu = ({ hasExperiences, hasPlans, label }) => [
  hasExperiences && { id: 'experiencias', label },
  hasPlans && { id: 'planes', label: 'Planes' },
  { id: 'contacto', label: 'Contacto' },
].filter(Boolean);

export const formatCycle = (days) => {
  const value = Number(days) || 30;
  if (value === 30) return '1 mes';
  if (value % 30 === 0) return `${value / 30} meses`;
  if (value === 7) return '1 semana';
  return `${value} días`;
};
