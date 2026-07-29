import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, User, Clock, DollarSign } from 'lucide-react';
import { appointmentAPI, barberAPI } from '../api';
import { toast } from 'sonner';

const WeeklyCalendar = ({ organizationId }) => {
  const [currentWeekStart, setCurrentWeekStart] = useState(getMonday(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [blockedTimes, setBlockedTimes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Generate stable week dates
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + i);
    return date;
  }), [currentWeekStart]);

  // Generate time slots (8 AM to 8 PM)
  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour = i + 8;
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const params = { organization_id: organizationId };
      
      // Get barbers and all appointments for the week in parallel
      const appointmentPromises = weekDates.map(date => {
        const dateStr = formatDate(date);
        return appointmentAPI.getAll({ ...params, date: dateStr });
      });
      
      const [barbersRes, ...appointmentsResponses] = await Promise.all([
        barberAPI.getAll(params),
        ...appointmentPromises
      ]);
      
      setBarbers(barbersRes.data);

      // Flatten all appointments from all days
      const allAppointments = appointmentsResponses.flatMap(res => res.data);
      setAppointments(allAppointments);

      // Load blocked times if a specific barber is selected
      if (selectedBarber !== 'all') {
        try {
          const blockedRes = await barberAPI.getBlockedTimes(selectedBarber);
          setBlockedTimes(blockedRes.data);
        } catch (error) {
          console.error('Error loading blocked times:', error);
          setBlockedTimes([]);
        }
      } else {
        setBlockedTimes([]);
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
      toast.error('Error al cargar calendario');
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedBarber, weekDates]);

  useEffect(() => { loadData(); }, [loadData]);

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const goToToday = () => {
    setCurrentWeekStart(getMonday(new Date()));
  };

  const getAppointmentForSlot = (date, time) => {
    const dateStr = formatDate(date);
    return appointments.filter(apt => {
      if (selectedBarber !== 'all' && apt.barber_id !== selectedBarber) {
        return false;
      }
      return apt.date === dateStr && apt.time === time;
    });
  };

  const getBlockedTimeForSlot = (date, time) => {
    const dateStr = formatDate(date);
    return blockedTimes.filter(block => {
      if (block.date !== dateStr) return false;
      
      // Check if the time slot falls within the blocked range
      const [slotHour, slotMin] = time.split(':').map(Number);
      const slotMinutes = slotHour * 60 + slotMin;
      
      const [startHour, startMin] = block.start_time.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      
      const [endHour, endMin] = block.end_time.split(':').map(Number);
      const endMinutes = endHour * 60 + endMin;
      
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isPast = (date, time) => {
    const now = new Date();
    const slotDateTime = new Date(date);
    const [hours, minutes] = time.split(':');
    slotDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
    return slotDateTime < now;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-secondary">Cargando calendario...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Calendar size={24} strokeWidth={1.5} className="text-[#0A84FF]" />
            <div>
              <h3 className="text-xl font-medium text-primary">Calendario Semanal</h3>
              <p className="text-sm text-secondary">
                {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Barber Filter */}
            <select
              value={selectedBarber}
              onChange={(e) => setSelectedBarber(e.target.value)}
              className="min-h-[44px] px-4 py-2 bg-secondary/30 border border-primary/20 rounded-xl text-primary text-sm focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF] outline-none"
            >
              <option value="all">Todos los barberos</option>
              {barbers.map((barber) => (
                <option key={barber.barber_id} value={barber.barber_id}>
                  {barber.name}
                </option>
              ))}
            </select>

            {/* Week Navigation */}
            <button
              onClick={goToPreviousWeek}
              className="min-h-[44px] min-w-[44px] p-2 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all"
              title="Semana anterior"
            >
              <ChevronLeft size={20} strokeWidth={1.5} className="text-primary" />
            </button>
            
            <button
              onClick={goToToday}
              className="min-h-[44px] px-4 py-2 bg-[#0A84FF] hover:bg-[#0071E3] text-white rounded-xl font-medium transition-all text-sm"
            >
              Hoy
            </button>
            
            <button
              onClick={goToNextWeek}
              className="min-h-[44px] min-w-[44px] p-2 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all"
              title="Semana siguiente"
            >
              <ChevronRight size={20} strokeWidth={1.5} className="text-primary" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* Day Headers */}
            <div className="grid grid-cols-8 border-b border-primary/10 bg-secondary/30">
              <div className="p-4 text-sm font-medium text-secondary">Hora</div>
              {weekDates.map((date) => (
                <div
                  key={`day-${date.toISOString()}`}
                  className={`p-4 text-center ${isToday(date) ? 'bg-[#0A84FF]/20' : ''}`}
                >
                  <div className={`text-sm font-medium ${isToday(date) ? 'text-[#0A84FF]' : 'text-primary'}`}>
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][date.getDay() === 0 ? 6 : date.getDay() - 1]}
                  </div>
                  <div className={`text-xs ${isToday(date) ? 'text-[#0A84FF]' : 'text-secondary'}`}>
                    {date.getDate()}/{date.getMonth() + 1}
                  </div>
                </div>
              ))}
            </div>

            {/* Time Slots */}
            <div className="divide-y divide-primary/5">
              {timeSlots.map((time) => (
                <div key={time} className="grid grid-cols-8 hover:bg-secondary/20 transition-colors">
                  {/* Time Label */}
                  <div className="p-4 text-sm text-secondary font-medium border-r border-primary/5">
                    {time}
                  </div>

                  {/* Day Cells */}
                  {weekDates.map((date) => {
                    const aptsInSlot = getAppointmentForSlot(date, time);
                    const blocksInSlot = getBlockedTimeForSlot(date, time);
                    const isSlotPast = isPast(date, time);
                    const cellKey = `${formatDate(date)}-${time}`;

                    return (
                      <div
                        key={cellKey}
                        className={`p-2 min-h-[80px] border-r border-primary/5 ${
                          isSlotPast ? 'bg-secondary/10' : ''
                        } ${isToday(date) ? 'bg-[#0A84FF]/5' : ''}`}
                      >
                        {/* Show appointments */}
                        {aptsInSlot.length > 0 && (
                          <div className="space-y-1">
                            {aptsInSlot.map((apt) => (
                              <div
                                key={apt.appointment_id}
                                className="p-2 rounded-lg bg-[#0A84FF]/20 border border-[#0A84FF]/30 hover:bg-[#0A84FF]/30 transition-all cursor-pointer group"
                                title={`${apt.client_name} - ${apt.service_name}`}
                              >
                                <div className="flex items-start gap-2">
                                  <User size={12} strokeWidth={1.5} className="text-[#0A84FF] mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-primary truncate">
                                      {apt.client_name}
                                    </p>
                                    <p className="text-xs text-secondary truncate">
                                      {apt.service_name}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <p className="text-xs text-secondary truncate flex items-center gap-1">
                                        <User size={10} strokeWidth={1.5} />
                                        {apt.barber_name}
                                      </p>
                                      <p className="text-xs font-medium text-[#0A84FF]">
                                        ${apt.service_price}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Show blocked times */}
                        {blocksInSlot.length > 0 && aptsInSlot.length === 0 && (
                          <div className="space-y-1">
                            {blocksInSlot.map((block) => (
                              <div
                                key={block.block_id}
                                className="p-2 rounded-lg bg-[#FF9F0A]/20 border border-[#FF9F0A]/30 hover:bg-[#FF9F0A]/30 transition-all cursor-pointer"
                                title={`Bloqueado: ${block.reason}`}
                              >
                                <div className="flex items-start gap-2">
                                  <Clock size={12} strokeWidth={1.5} className="text-[#FF9F0A] mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-[#FF9F0A]">
                                      Bloqueado
                                    </p>
                                    <p className="text-xs text-secondary truncate">
                                      {block.reason}
                                    </p>
                                    <p className="text-xs text-secondary mt-1">
                                      {block.start_time} - {block.end_time}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Show available slot */}
                        {aptsInSlot.length === 0 && blocksInSlot.length === 0 && !isSlotPast && (
                          <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs text-tertiary">Disponible</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="glass-panel p-4 rounded-2xl">
        <div className="flex items-center gap-6 flex-wrap text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#0A84FF]/20 border border-[#0A84FF]/30"></div>
            <span className="text-secondary">Cita reservada</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#FF9F0A]/20 border border-[#FF9F0A]/30"></div>
            <span className="text-secondary">Horario bloqueado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-[#0A84FF]/5"></div>
            <span className="text-secondary">Hoy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-secondary/10"></div>
            <span className="text-secondary">Horario pasado</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper functions
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default WeeklyCalendar;
