// NEXUS_INTERNAL_REVIEWS_V1
import React, { useState } from 'react';
import { Star, X, MessageSquare, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';

export default function ReviewModal({ appointment, googleReview, onSubmitted, onSkip }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!appointment) return null;

  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error('Selecciona una calificación de 1 a 5 estrellas');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/public/clients/reviews', {
        appointment_id: appointment.appointment_id,
        professional_rating: rating,
        comment: comment.trim() || undefined,
      });
      toast.success('¡Gracias por tu calificación!');
      setSubmitted(true);
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error('Ya habías calificado esta cita');
        if (onSubmitted) onSubmitted(appointment.appointment_id);
      } else {
        toast.error(error.response?.data?.detail || 'No fue posible enviar tu calificación');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitted && onSubmitted) {
      onSubmitted(appointment.appointment_id);
    } else if (onSkip) {
      onSkip();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-zinc-900 border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>

        {!submitted ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare size={18} className="text-blue-400" />
              <h2 className="text-lg font-semibold text-white">¿Cómo estuvo tu cita?</h2>
            </div>
            <div className="flex flex-col items-center mb-4" data-marker="barber_avatar_display">
              {appointment.barber_avatar ? (
                <img src={appointment.barber_avatar} alt={appointment.barber_name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-zinc-700 mb-2"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center border-2 border-zinc-700 mb-2">
                  <span className="text-xl text-zinc-400">{(appointment.barber_name || "?")[0]}</span>
                </div>
              )}
              <p className="text-sm text-zinc-400">
                Con {appointment.barber_name} · {appointment.service_name}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 mb-5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                  aria-label={`${value} estrellas`}
                >
                  <Star
                    size={32}
                    className={(hoverRating || rating) >= value ? 'text-amber-400' : 'text-zinc-700'}
                    fill={(hoverRating || rating) >= value ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder="Cuéntanos algo más sobre tu experiencia (opcional)"
              className="w-full min-h-[88px] p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 resize-none mb-4"
              maxLength={500}
            />

            <button
              onClick={handleSubmit}
              disabled={submitting || rating < 1}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
            >
              {submitting ? 'Enviando...' : 'Enviar calificación'}
            </button>
            <button
              onClick={handleClose}
              className="w-full py-2 mt-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Ahora no
            </button>
          </>
        ) : (
          <div className="text-center py-2">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-green-500/15 flex items-center justify-center">
              <Star size={26} className="text-green-400" fill="currentColor" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">¡Gracias por tu calificación!</h2>
            <p className="text-sm text-zinc-400 mb-5">Tu opinión nos ayuda a mejorar.</p>

            {googleReview?.enabled && googleReview?.link && (
              <>
                <p className="text-sm text-zinc-300 mb-3">
                  ¿Quieres compartir también tu experiencia en Google?
                </p>
                <a
                  href={googleReview.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-colors mb-2"
                >
                  <ExternalLink size={16} />
                  Dejar reseña en Google
                </a>
              </>
            )}
            <button
              onClick={handleClose}
              className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
