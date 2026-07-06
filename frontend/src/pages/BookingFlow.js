import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { publicAPI } from '../api';
import { useOrganization } from '../context/OrganizationContext';
import { ArrowRight, ArrowLeft, Check, Calendar as CalendarIcon, Clock, User, Mail, Phone, Sparkles, MapPin } from 'lucide-react';
import { BOOKING } from '../constants/testIds';
import { toast } from 'sonner';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

const BookingFlow = () => {
  const { orgId } = useParams();
  const { organization, loadOrganization } = useOrganization();
  const [step, setStep] = useState(1);
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [rememberData, setRememberData] = useState(false);
  const [clientData, setClientData] = useState({
    name: '',
    phone: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // CORRECCIÓN: Cargar organización desde Context (siempre datos frescos)
    loadOrganization(orgId);
    loadServices();
    loadBarbers();
    
    // Load saved client data from localStorage
    const savedData = localStorage.getItem('nexus_client_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setClientData(parsed);
        setRememberData(true);
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
  }, [orgId]);

  useEffect(() => {
    if (selectedBarber && selectedDate && selectedService) {
      loadAvailability();
    }
  }, [selectedBarber, selectedDate, selectedService]);

  const loadServices = async () => {
    try {
      const response = await publicAPI.getServices(orgId);
      setServices(response.data);
    } catch (error) {
      console.error('Error loading services:', error);
    }
  };

  const loadBarbers = async () => {
    try {
      const response = await publicAPI.getBarbers(orgId);
      setBarbers(response.data);
    } catch (error) {
      console.error('Error loading barbers:', error);
    }
  };

  const loadAvailability = async () => {
    try {
      const response = await publicAPI.getAvailability(orgId, selectedBarber.barber_id, selectedDate, selectedService.service_id);
      setAvailableSlots(response.data.available_slots);
    } catch (error) {
      console.error('Error loading availability:', error);
      toast.error('Error al cargar disponibilidad');
    }
  };

  const handleNext = () => {
    if (step === 1 && !selectedService) {
      toast.error('Selecciona un servicio');
      return;
    }
    if (step === 2 && !selectedBarber) {
      toast.error('Selecciona un barbero');
      return;
    }
    if (step === 3 && (!selectedDate || !selectedTime)) {
      toast.error('Selecciona fecha y hora');
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!clientData.name || !clientData.phone || !clientData.email) {
      toast.error('Completa todos los campos');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientData.email)) {
      toast.error('Email inválido');
      return;
    }

    setLoading(true);
    try {
      await publicAPI.createAppointment(orgId, {
        service_id: selectedService.service_id,
        barber_id: selectedBarber.barber_id,
        client_name: clientData.name,
        client_phone: clientData.phone,
        client_email: clientData.email,
        date: selectedDate,
        time: selectedTime
      });

      if (rememberData) {
        localStorage.setItem('nexus_client_data', JSON.stringify(clientData));
      } else {
        localStorage.removeItem('nexus_client_data');
      }

      setSuccess(true);
      toast.success('¡Cita reservada!');
    } catch (error) {
      console.error('Error creating appointment:', error);
      if (error.response?.status === 409) {
        toast.error('Este horario ya no está disponible. Por favor selecciona otro.');
        setStep(3); // Go back to calendar
        loadAvailability(); // Refresh availability
      } else if (error.response?.status === 400 && error.response?.data?.detail?.includes('past')) {
        toast.error('No puedes reservar citas en el pasado');
      } else {
        toast.error('Error al crear la cita');
      }
    } finally {
      setLoading(false);
    }
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center relative overflow-hidden p-6">
        <div 
          className="absolute inset-0 opacity-20" 
          style={{
            backgroundImage: 'url(https://images.pexels.com/photos/17027433/pexels-photo-17027433.jpeg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        
        <div className="relative z-10 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-12 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-[#32D74B] rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={40} strokeWidth={2} className="text-white" />
          </div>
          
          <h2 className="text-3xl font-light tracking-tight text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            ¡Reserva Confirmada!
          </h2>
          
          <div className="space-y-3 mb-8 text-left backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <div>
              <p className="text-zinc-400 text-sm">Servicio</p>
              <p className="text-white font-medium">{selectedService?.name}</p>
            </div>
            <div>
              <p className="text-zinc-400 text-sm">Barbero</p>
              <p className="text-white font-medium">{selectedBarber?.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-zinc-400 text-sm">Fecha</p>
                <p className="text-white font-medium">{selectedDate}</p>
              </div>
              <div>
                <p className="text-zinc-400 text-sm">Hora</p>
                <p className="text-white font-medium">{selectedTime}</p>
              </div>
            </div>
          </div>

          <p className="text-zinc-400 text-sm mb-2">
            Hemos enviado la confirmación por WhatsApp al número:
          </p>
          <p className="text-white font-medium mb-6">{clientData.phone}</p>

          <button
            onClick={() => window.location.reload()}
            className="w-full px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all"
          >
            Hacer otra reserva
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] relative overflow-hidden">
      <div 
        className="absolute inset-0 opacity-20" 
        style={{
          backgroundImage: 'url(https://images.pexels.com/photos/17027433/pexels-photo-17027433.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-light tracking-tight text-white mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Reserva tu cita
          </h1>
          <p className="text-zinc-400 text-lg mb-4">Proceso rápido y sencillo</p>
          
          {/* Organization Info - CORRECCIÓN: Usa datos del Context (siempre actualizados) */}
          {organization && (
            <div className="flex items-center justify-center gap-4 text-sm text-gray-400 flex-wrap">
              {organization.name && (
                <span className="font-medium text-white">{organization.name}</span>
              )}
              {organization.phone && (
                <>
                  <span className="text-gray-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <Phone size={14} strokeWidth={1.5} />
                    <span>{organization.phone}</span>
                  </div>
                </>
              )}
              {organization.address && (
                <>
                  <span className="text-gray-600">|</span>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} strokeWidth={1.5} />
                    <span>{organization.address}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((num) => (
              <React.Fragment key={num}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all ${
                  step >= num ? 'bg-[#0A84FF] text-white' : 'bg-white/10 text-zinc-400'
                }`}>
                  {num}
                </div>
                {num < 4 && (
                  <div className={`w-12 h-1 transition-all ${
                    step > num ? 'bg-[#0A84FF]' : 'bg-white/10'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 mb-6">
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-medium text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Selecciona tu servicio
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service) => (
                  <button
                    key={service.service_id}
                    data-testid={BOOKING.serviceCard}
                    onClick={() => setSelectedService(service)}
                    className={`p-6 rounded-2xl border-2 transition-all text-left ${
                      selectedService?.service_id === service.service_id
                        ? 'border-[#0A84FF] bg-[#0A84FF]/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <h3 className="text-white font-medium text-lg mb-2">{service.name}</h3>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-sm">{service.duration} min</span>
                      <span className="text-[#0A84FF] font-medium text-xl">${service.price}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-medium text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Elige tu barbero
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {barbers.map((barber) => (
                  <button
                    key={barber.barber_id}
                    data-testid={BOOKING.barberCard}
                    onClick={() => setSelectedBarber(barber)}
                    className={`p-6 rounded-2xl border-2 transition-all ${
                      selectedBarber?.barber_id === barber.barber_id
                        ? 'border-[#0A84FF] bg-[#0A84FF]/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-[#0A84FF] flex items-center justify-center text-white text-xl font-medium">
                        {barber.name.charAt(0)}
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-white font-medium text-lg">{barber.name}</h3>
                        <p className="text-zinc-400 text-sm">{barber.start_time} - {barber.end_time}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-medium text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Fecha y hora
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block flex items-center gap-2">
                    <CalendarIcon size={16} strokeWidth={1.5} />
                    Selecciona una fecha
                  </label>
                  <input
                    type="date"
                    data-testid={BOOKING.dateInput}
                    min={getMinDate()}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                  />
                </div>
                
                {selectedDate && (
                  <div>
                    <label className="text-sm text-zinc-400 mb-2 block flex items-center gap-2">
                      <Clock size={16} strokeWidth={1.5} />
                      Horarios disponibles
                    </label>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          data-testid={BOOKING.timeSlot}
                          onClick={() => setSelectedTime(slot)}
                          className={`py-3 px-4 rounded-xl font-medium transition-all ${
                            selectedTime === slot
                              ? 'bg-[#0A84FF] text-white'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                          }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                    {availableSlots.length === 0 && (
                      <p className="text-zinc-400 text-center py-6">No hay horarios disponibles para esta fecha</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-2xl font-medium text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Tus datos
              </h2>
              <div className="space-y-4" data-testid={BOOKING.clientForm}>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block flex items-center gap-2">
                    <User size={16} strokeWidth={1.5} />
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={clientData.name}
                    onChange={(e) => setClientData({ ...clientData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    placeholder="Juan Pérez"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block flex items-center gap-2">
                    <Phone size={16} strokeWidth={1.5} />
                    Teléfono
                  </label>
                  <PhoneInput
                    international
                    defaultCountry="CO"
                    value={clientData.phone}
                    onChange={(value) => setClientData({ ...clientData, phone: value || '' })}
                    className="phone-input-custom w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus-within:border-[#0A84FF] focus-within:ring-1 focus-within:ring-[#0A84FF]"
                    placeholder="+57 300 123 4567"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block flex items-center gap-2">
                    <Mail size={16} strokeWidth={1.5} />
                    Email
                  </label>
                  <input
                    type="email"
                    value={clientData.email}
                    onChange={(e) => setClientData({ ...clientData, email: e.target.value })}
                    className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-xl text-white focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
                    placeholder="juan@email.com"
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="remember"
                    data-testid={BOOKING.rememberCheckbox}
                    checked={rememberData}
                    onChange={(e) => setRememberData(e.target.checked)}
                    className="w-5 h-5 rounded border-white/20 bg-transparent checked:bg-[#0A84FF] focus:ring-[#0A84FF]"
                  />
                  <label htmlFor="remember" className="text-white text-sm cursor-pointer">
                    Recordar mis datos para futuras reservas
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
            >
              <ArrowLeft size={20} strokeWidth={1.5} />
              Atrás
            </button>
          )}
          
          {step < 4 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all ml-auto"
            >
              Siguiente
              <ArrowRight size={20} strokeWidth={1.5} />
            </button>
          ) : (
            <button
              data-testid={BOOKING.submitBtn}
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-8 py-4 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all ml-auto disabled:opacity-50"
            >
              {loading ? 'Procesando...' : (
                <>
                  <Sparkles size={20} strokeWidth={1.5} />
                  Confirmar Reserva
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingFlow;
