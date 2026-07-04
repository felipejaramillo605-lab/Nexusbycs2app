import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publicAPI } from '../api';
import { Calendar, Clock, User, DollarSign, Phone, MapPin, ExternalLink, LogOut, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

const CustomerPortal = () => {
  const { orgId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState('login'); // 'login' or 'portal'
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [clientData, setClientData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [businessInfo, setBusinessInfo] = useState(null);

  useEffect(() => {
    loadBusinessInfo();
    
    // Check if already logged in (session storage)
    const savedPhone = sessionStorage.getItem(`nexus_customer_phone_${orgId}`);
    if (savedPhone) {
      setPhone(savedPhone);
      handleLogin(savedPhone, true);
    }
  }, [orgId]);

  const loadBusinessInfo = async () => {
    try {
      const response = await publicAPI.getOrganization(orgId);
      setBusinessInfo(response.data);
    } catch (error) {
      console.error('Error loading business info:', error);
      toast.error('Error al cargar información del negocio');
    }
  };

  const handleLogin = async (phoneNum = phone, skipStorage = false) => {
    if (!phoneNum || phoneNum.length < 10) {
      toast.error('Por favor ingresa un número de teléfono válido');
      return;
    }

    setLoading(true);
    try {
      // Try passwordless login
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/public/auth/passwordless`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phoneNum,
            organization_id: orgId,
            name: name || undefined
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.detail === 'name_required') {
          toast.error('Por favor ingresa tu nombre');
          return;
        }
        throw new Error(data.detail || 'Error al iniciar sesión');
      }

      // Save phone to session
      if (!skipStorage) {
        sessionStorage.setItem(`nexus_customer_phone_${orgId}`, phoneNum);
      }

      toast.success(data.message);
      setClientData(data.client);
      setStep('portal');

      // Load appointment history
      loadHistory(phoneNum);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (phoneNum) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/public/clients/history?phone=${encodeURIComponent(phoneNum)}&organization_id=${orgId}`
      );
      const data = await response.json();
      
      if (data.appointments) {
        setAppointments(data.appointments);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(`nexus_customer_phone_${orgId}`);
    setStep('login');
    setClientData(null);
    setAppointments([]);
    setPhone('');
    setName('');
  };

  const openWhatsApp = () => {
    if (businessInfo?.whatsapp_link) {
      window.open(businessInfo.whatsapp_link, '_blank');
    }
  };

  const goToBooking = () => {
    navigate(`/book/${orgId}`);
  };

  if (step === 'login') {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-3xl p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-light text-white mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Portal del Cliente
              </h1>
              <p className="text-zinc-400">
                {businessInfo?.name || 'Bienvenido'}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Número de teléfono
                </label>
                <div className="phone-input-wrapper">
                  <PhoneInput
                    international
                    defaultCountry="CO"
                    value={phone}
                    onChange={setPhone}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    placeholder="+57 300 123 4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Nombre (solo para clientes nuevos)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre completo"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-[#0A84FF] focus:ring-2 focus:ring-[#0A84FF]/20 outline-none transition-all"
                />
              </div>

              <button
                onClick={() => handleLogin()}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>

              <div className="text-center mt-6">
                <button
                  onClick={goToBooking}
                  className="text-[#0A84FF] text-sm hover:underline"
                >
                  ¿Primera vez? Reserva una cita aquí
                </button>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .phone-input-wrapper .PhoneInputInput {
            background: transparent;
            border: none;
            color: white;
            outline: none;
            font-size: 1rem;
          }
          .phone-input-wrapper .PhoneInputInput::placeholder {
            color: #71717a;
          }
          .phone-input-wrapper {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0.75rem;
            padding: 0.75rem 1rem;
            transition: all 0.2s;
          }
          .phone-input-wrapper:focus-within {
            border-color: #0A84FF;
            box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.2);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Navigation Bar */}
      <nav className="backdrop-blur-xl bg-white/3 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-light tracking-tight text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Mi Cuenta
            </h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all text-red-400"
            >
              <LogOut size={18} strokeWidth={1.5} />
              <span className="hidden sm:inline text-sm">Salir</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client Info Card */}
          <div className="lg:col-span-1">
            <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-[#0A84FF] flex items-center justify-center text-white text-2xl font-medium">
                  {clientData?.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-medium text-white">{clientData?.name}</h2>
                  <p className="text-sm text-zinc-400 flex items-center gap-1 mt-1">
                    <Phone size={14} />
                    {clientData?.phone}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-3 border-t border-white/10">
                  <span className="text-zinc-400">Total de Visitas</span>
                  <span className="text-white font-medium text-lg">{clientData?.total_visits || 0}</span>
                </div>
                {clientData?.last_visit && (
                  <div className="flex items-center justify-between py-3 border-t border-white/10">
                    <span className="text-zinc-400">Última Visita</span>
                    <span className="text-white">{clientData.last_visit}</span>
                  </div>
                )}
              </div>

              <button
                onClick={goToBooking}
                className="w-full mt-6 py-3 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white font-medium transition-all"
              >
                Reservar Nueva Cita
              </button>
            </div>

            {/* Business Info Card */}
            {businessInfo && (
              <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6 mt-6">
                <h3 className="text-lg font-medium text-white mb-4">Información del Negocio</h3>
                
                <div className="space-y-3 text-sm">
                  {businessInfo.address && (
                    <div className="flex items-start gap-3 text-zinc-300">
                      <MapPin size={16} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                      <span>{businessInfo.address}</span>
                    </div>
                  )}
                  
                  {businessInfo.phone && (
                    <div className="flex items-center gap-3 text-zinc-300">
                      <Phone size={16} className="text-zinc-500 flex-shrink-0" />
                      <span>{businessInfo.phone}</span>
                    </div>
                  )}
                  
                  {businessInfo.business_hours && (
                    <div className="flex items-start gap-3 text-zinc-300">
                      <Clock size={16} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                      <span className="whitespace-pre-line">{businessInfo.business_hours}</span>
                    </div>
                  )}
                </div>

                {businessInfo.whatsapp_link && (
                  <button
                    onClick={openWhatsApp}
                    className="w-full mt-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 transition-all flex items-center justify-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Contactar por WhatsApp
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Appointments History */}
          <div className="lg:col-span-2">
            <div className="backdrop-blur-xl bg-white/3 border border-white/10 rounded-2xl p-6">
              <h2 className="text-2xl font-light text-white mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Historial de Citas
              </h2>

              {appointments.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar size={48} className="text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400">No tienes citas registradas aún</p>
                  <button
                    onClick={goToBooking}
                    className="mt-4 px-6 py-2 rounded-xl bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white font-medium transition-all"
                  >
                    Reservar Primera Cita
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {appointments.map((apt) => (
                    <div
                      key={apt.appointment_id}
                      className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-white font-medium mb-1">{apt.service_name}</h3>
                          <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <User size={14} />
                            <span>{apt.barber_name}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#0A84FF] font-medium text-lg mb-1">
                            ${apt.service_price}
                          </div>
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                            apt.status === 'confirmed' || apt.status === 'completed'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {apt.status === 'confirmed' || apt.status === 'completed' ? (
                              <><CheckCircle size={12} /> Completada</>
                            ) : (
                              <><XCircle size={12} /> Cancelada</>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-zinc-300">
                        <div className="flex items-center gap-1">
                          <Calendar size={14} className="text-zinc-500" />
                          <span>{apt.date}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-zinc-500" />
                          <span>{apt.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerPortal;
