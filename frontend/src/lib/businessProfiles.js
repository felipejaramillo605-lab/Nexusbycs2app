import {
  BriefcaseBusiness,
  Dumbbell,
  Hand,
  HeartPulse,
  PawPrint,
  Scissors,
  Sparkles,
  Stethoscope,
  Waves,
} from 'lucide-react';

// This is presentation metadata only. It does not alter bookings, services,
// staff, or tenant entitlements. New verticals can reuse the same booking
// contract while presenting a relevant starting point to each manager.
export const BUSINESS_PROFILES = Object.freeze({
  barbershop: Object.freeze({ label: 'Barbería', serviceIcon: Scissors, recommendedThemes: ['classic', 'underground'], examples: ['Corte clásico', 'Arreglo de barba'] }),
  hair_salon: Object.freeze({ label: 'Peluquería', serviceIcon: Scissors, recommendedThemes: ['feminine', 'minimalist_purple'], examples: ['Corte y peinado', 'Coloración'] }),
  nail_spa: Object.freeze({ label: 'Spa de uñas', serviceIcon: Hand, recommendedThemes: ['nail-studio', 'feminine'], examples: ['Manicura', 'Esmaltado semipermanente'] }),
  lash_spa: Object.freeze({ label: 'Spa de pestañas', serviceIcon: Sparkles, recommendedThemes: ['feminine', 'minimalist_purple'], examples: ['Lifting de pestañas', 'Diseño de cejas'] }),
  beauty_salon: Object.freeze({ label: 'Salón de belleza', serviceIcon: Sparkles, recommendedThemes: ['bloom-garden', 'feminine'], examples: ['Maquillaje social', 'Tratamiento facial'] }),
  wellness_spa: Object.freeze({ label: 'Spa y bienestar', serviceIcon: Waves, recommendedThemes: ['wellness', 'neutral'], examples: ['Masaje relajante', 'Ritual de bienestar'] }),
  pilates_studio: Object.freeze({ label: 'Estudio de pilates', serviceIcon: Dumbbell, recommendedThemes: ['estudio', 'movement', 'professional'], examples: ['Pilates reformer', 'Clase de movilidad'] }),
  health_clinic: Object.freeze({ label: 'Consultorio', serviceIcon: Stethoscope, recommendedThemes: ['clinical', 'professional'], examples: ['Consulta inicial', 'Sesión de seguimiento'] }),
  professional_services: Object.freeze({ label: 'Servicios profesionales', serviceIcon: BriefcaseBusiness, recommendedThemes: ['professional', 'clinical'], examples: ['Asesoría inicial', 'Sesión de seguimiento'] }),
  pet_grooming: Object.freeze({ label: 'Grooming para mascotas', serviceIcon: PawPrint, recommendedThemes: ['pet-care', 'wellness'], examples: ['Baño y cepillado', 'Corte higiénico'] }),
});

export const BUSINESS_TYPE_OPTIONS = Object.freeze(
  Object.entries(BUSINESS_PROFILES).map(([value, profile]) => Object.freeze({ value, label: profile.label })),
);

export const getBusinessProfile = (businessType) => (
  BUSINESS_PROFILES[businessType] || BUSINESS_PROFILES.barbershop
);

export const shouldApplyRecommendedTheme = (currentTheme, previousBusinessType) => (
  !currentTheme
  || currentTheme === 'classic'
  || getBusinessProfile(previousBusinessType).recommendedThemes.includes(currentTheme)
);
