import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { publicAPI } from '../api';
import { useOrganization } from '../context/OrganizationContext';
import { useCart } from '../lib/cart';

const weekday = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
};

const works = (barber, value) => (barber?.available_days || [1, 2, 3, 4, 5]).includes(weekday(value));

const localDateInZone = (timezoneName) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneName || 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toLocaleDateString('en-CA');
  }
};

export const BOOKING_DAYS = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
export const BOOKING_STEPS = ['Servicio', 'Profesional', 'Fecha y hora', 'Tus datos'];

/** Business state and requests for the public appointment/class booking flow. */
export function useBookingFlow() {
  const { orgId } = useParams();
  const { organization, loadOrganization } = useOrganization();
  const cart = useCart(orgId);

  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots] = useState([]);
  const [classSessions, setClassSessions] = useState([]);
  const [selectedClassSession, setSelectedClassSession] = useState(null);
  const [availabilityMeta, setAvailabilityMeta] = useState({ timezone: 'America/Bogota', local_date: '' });
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [remember, setRemember] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState('');
  const [client, setClient] = useState({ name: '', phone: '', email: '' });

  const eligible = useMemo(() => (
    selectedService
      ? barbers.filter((item) => {
        const ids = item.service_ids || [];
        return !ids.length || ids.includes(selectedService.service_id);
      })
      : barbers
  ), [barbers, selectedService]);
  const isGroupService = selectedService?.service_type === 'group';
  const groupSessionById = (id) => classSessions.find((session) => session.class_session_id === id);

  const selectService = useCallback((service) => {
    setSelectedService(service);
    setSelectedBarber(null);
    setSelectedDate('');
    setSelectedClassSession(null);
  }, []);

  const selectBarber = useCallback((barber) => {
    setSelectedBarber(barber);
    setSelectedDate('');
    setSelectedClassSession(null);
  }, []);

  const selectDate = useCallback((value) => {
    setError('');
    setSelectedTime('');
    setSelectedClassSession(null);
    if (value && selectedBarber && !isGroupService && !works(selectedBarber, value)) {
      setSelectedDate('');
      setSlots([]);
      setError('El profesional no trabaja en la fecha seleccionada.');
      return;
    }
    setSelectedDate(value);
  }, [selectedBarber, isGroupService]);

  const selectSlot = useCallback((slot) => {
    setSelectedTime(slot);
    if (isGroupService) {
      setSelectedClassSession(classSessions.find((session) => session.class_session_id === slot) || null);
    }
  }, [isGroupService, classSessions]);

  const goToStep = useCallback((targetStep) => {
    if (targetStep < step) setStep(targetStep);
  }, [step]);

  const goBack = useCallback(() => {
    setStep((value) => Math.max(1, value - 1));
  }, []);

  const updateClientField = useCallback((field, value) => {
    setClient((current) => ({ ...current, [field]: value }));
  }, []);

  const setRememberClientData = useCallback((value) => setRemember(value), []);
  const setMarketingConsentChoice = useCallback((value) => setMarketingConsent(value), []);

  const loadServices = useCallback(async () => {
    const response = await publicAPI.getServices(orgId);
    setServices(response.data || []);
  }, [orgId]);

  const loadBarbers = useCallback(async () => {
    const response = await publicAPI.getBarbers(orgId);
    setBarbers(response.data || []);
  }, [orgId]);

  const loadAvailability = useCallback(async () => {
    if (!selectedBarber || !selectedService || !selectedDate) return [];
    setLoadingSlots(true);
    setError('');
    try {
      if (selectedService.service_type === 'group') {
        const response = await publicAPI.getClassSessions(orgId, {
          service_id: selectedService.service_id,
          date_from: selectedDate,
          date_to: selectedDate,
        });
        const nextSessions = (response.data || []).filter(
          (session) => session.barber_id === selectedBarber.barber_id && session.spots_available > 0,
        );
        const nextSlots = nextSessions.map((session) => session.class_session_id);
        setClassSessions(nextSessions);
        setSlots(nextSlots);
        setSelectedClassSession((current) => (
          nextSessions.find((session) => session.class_session_id === current?.class_session_id) || null
        ));
        setSelectedTime((current) => (current && nextSlots.includes(current) ? current : ''));
        return nextSlots;
      }

      const response = await publicAPI.getAvailability(
        orgId,
        selectedBarber.barber_id,
        selectedDate,
        selectedService.service_id,
      );
      const nextSlots = response.data.available_slots || [];
      setClassSessions([]);
      setSelectedClassSession(null);
      setSlots(nextSlots);
      setAvailabilityMeta({
        timezone: response.data.timezone || organization?.timezone || 'America/Bogota',
        local_date: response.data.local_date || '',
      });
      setSelectedTime((current) => (current && nextSlots.includes(current) ? current : ''));
      return nextSlots;
    } catch (err) {
      setClassSessions([]);
      setSelectedClassSession(null);
      setSlots([]);
      setSelectedTime('');
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'object' ? detail?.message : detail;
      setError(err.response?.status === 409
        ? 'El profesional no está disponible en esta fecha.'
        : message || 'No fue posible consultar la disponibilidad.');
      return [];
    } finally {
      setLoadingSlots(false);
    }
  }, [orgId, selectedBarber, selectedService, selectedDate, organization?.timezone]);

  useEffect(() => {
    loadOrganization(orgId);
    Promise.all([loadServices(), loadBarbers()]).catch(() => toast.error('No fue posible cargar la información del negocio'));
    const saved = localStorage.getItem('nexus_client_data');
    if (saved) {
      try {
        setClient(JSON.parse(saved));
        setRemember(true);
      } catch {
        // Ignore malformed locally remembered client data, as before.
      }
    }
  }, [orgId, loadOrganization, loadServices, loadBarbers]);

  useEffect(() => {
    setSelectedTime('');
    setSlots([]);
    setClassSessions([]);
    setSelectedClassSession(null);
    if (selectedBarber && selectedService && selectedDate) {
      if (selectedService.service_type !== 'group' && !works(selectedBarber, selectedDate)) {
        setError('El profesional no trabaja en la fecha seleccionada.');
        return;
      }
      loadAvailability();
    }
  }, [selectedBarber, selectedService, selectedDate, loadAvailability]);

  useEffect(() => {
    if (selectedBarber && selectedService) {
      const ids = selectedBarber.service_ids || [];
      if (ids.length && !ids.includes(selectedService.service_id)) {
        setSelectedBarber(null);
        setSelectedDate('');
        setSelectedTime('');
      }
    }
  }, [selectedService, selectedBarber]);

  const next = () => {
    if (step === 1 && !selectedService) return toast.error('Selecciona un servicio');
    if (step === 2 && !selectedBarber) return toast.error('Selecciona un profesional');
    if (step === 3 && (!selectedDate || !selectedTime || (isGroupService && !selectedClassSession))) {
      return toast.error('Selecciona fecha y hora');
    }
    setStep((value) => Math.min(4, value + 1));
  };

  const submit = async () => {
    if (!client.name || !client.phone || !client.email) return toast.error('Completa todos los campos');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) return toast.error('Ingresa un correo válido');
    setSubmitting(true);
    setError('');
    try {
      const refreshedSlots = await loadAvailability();
      if (!refreshedSlots.includes(selectedTime) || (isGroupService && !selectedClassSession)) {
        setError('Este horario ya no está disponible. Selecciona uno posterior.');
        setStep(3);
        return;
      }
      const payload = {
        client_name: client.name,
        client_phone: client.phone,
        client_email: client.email,
        marketing_consent: marketingConsent,
      };
      const response = isGroupService
        ? await publicAPI.bookClassSession(orgId, selectedClassSession.class_session_id, payload)
        : await publicAPI.createAppointment(orgId, {
          ...payload,
          service_id: selectedService.service_id,
          barber_id: selectedBarber.barber_id,
          date: selectedDate,
          time: selectedTime,
          cart_items: cart.items.length
            ? cart.items.map((item) => ({ product_id: item.product_id, quantity: item.quantity }))
            : undefined,
        });
      const result = response.data;
      if (result?.appointment_id && result?.management_token) {
        sessionStorage.setItem(
          'nexus_last_appointment_link',
          `/cancel/${result.appointment_id}?token=${encodeURIComponent(result.management_token)}`,
        );
      }
      if (remember) localStorage.setItem('nexus_client_data', JSON.stringify(client));
      else localStorage.removeItem('nexus_client_data');
      cart.clear();
      setSuccess(result);
      toast.success(isGroupService ? 'Cupo reservado' : 'Cita reservada');
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      const code = typeof detail === 'object' ? detail?.code : null;
      const message = typeof detail === 'object' ? detail?.message : detail;
      if (status === 409) {
        setError(code === 'APPOINTMENT_TIME_IN_PAST'
          ? 'Este horario ya pasó. Selecciona uno posterior.'
          : message || 'El horario acaba de cambiar o ya fue reservado. Selecciona otro.');
        setStep(3);
        await loadAvailability();
      } else {
        setError(message || 'No fue posible crear la cita.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = availabilityMeta.local_date
    || localDateInZone(availabilityMeta.timezone || organization?.timezone || 'America/Bogota');

  return {
    orgId,
    organization,
    cart,
    step,
    services,
    barbers,
    selectedService,
    selectedBarber,
    selectedDate,
    selectedTime,
    slots,
    classSessions,
    selectedClassSession,
    availabilityMeta,
    loadingSlots,
    submitting,
    success,
    remember,
    marketingConsent,
    error,
    client,
    eligible,
    isGroupService,
    groupSessionById,
    selectService,
    selectBarber,
    selectDate,
    selectSlot,
    goToStep,
    goBack,
    updateClientField,
    setRememberClientData,
    setMarketingConsentChoice,
    loadAvailability,
    next,
    submit,
    minDate,
    days: BOOKING_DAYS,
    steps: BOOKING_STEPS,
  };
}
