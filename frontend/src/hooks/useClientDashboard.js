import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';

/** Profile, history, membership, class and account mutations for the dashboard. */
export function useClientDashboard() {
  const { orgId } = useParams();
  const navigate = useNavigate();

  const [clientData, setClientData] = useState(null);
  const [loyalty, setLoyalty] = useState(null);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [googleReview, setGoogleReview] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePin, setDeletePin] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [classSessions, setClassSessions] = useState([]);
  const [membership, setMembership] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [bookingSessionId, setBookingSessionId] = useState(null);
  const [pickingSpotFor, setPickingSpotFor] = useState(null);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const [sessionsRes, membershipRes] = await Promise.all([
        api.get('/public/clients/class-sessions'),
        api.get('/public/clients/memberships/me'),
      ]);
      setClassSessions(sessionsRes.data || []);
      setMembership(membershipRes.data || null);
    } catch (error) {
      // Class and membership data are optional for the rest of the portal.
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const handleBookClass = async (classSessionId, spotLabel) => {
    setBookingSessionId(classSessionId);
    try {
      await api.post(`/public/clients/class-sessions/${classSessionId}/book`, { spot_label: spotLabel || null });
      toast.success('Cupo reservado');
      setPickingSpotFor(null);
      await loadClasses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible reservar el cupo');
    } finally {
      setBookingSessionId(null);
    }
  };

  const handleCancelClassBooking = async (classBookingId) => {
    if (!window.confirm('¿Cancelar tu cupo en esta clase?')) return;
    try {
      await api.post(`/public/clients/class-bookings/${classBookingId}/cancel`, {});
      toast.success('Cupo cancelado');
      await loadClasses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible cancelar el cupo');
    }
  };

  const handleJoinWaitlist = async (classSessionId) => {
    setBookingSessionId(classSessionId);
    try {
      await api.post(`/public/clients/class-sessions/${classSessionId}/waitlist`, {});
      toast.success('Te uniste a la lista de espera');
      await loadClasses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible unirte a la lista de espera');
    } finally {
      setBookingSessionId(null);
    }
  };

  const handleLeaveWaitlist = async (waitlistId) => {
    try {
      await api.post(`/public/clients/waitlist/${waitlistId}/leave`, {});
      toast.success('Saliste de la lista de espera');
      await loadClasses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No fue posible salir de la lista de espera');
    }
  };

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const meResponse = await api.get('/public/clients/me');
      const clientPayload = meResponse.data?.client || meResponse.data;
      setClientData(clientPayload);
      setLoyalty(meResponse.data?.loyalty || null);
      setGoogleReview(meResponse.data?.google_review || null);
      try {
        const pendingResponse = await api.get('/public/clients/reviews/pending');
        setPendingReviews(pendingResponse.data?.pending || []);
      } catch (pendingError) {
        setPendingReviews([]);
      }

      const historyResponse = await api.get('/public/clients/history', {
        params: { phone: clientPayload.phone, organization_id: orgId },
      });
      setAppointments(historyResponse.data.appointments || []);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('Sesión expirada. Inicia sesión nuevamente.');
        navigate(`/portal/${orgId}/auth`);
      } else {
        toast.error('Error al cargar tus datos');
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, navigate]);

  useEffect(() => {
    loadDashboardData();
    loadClasses();
  }, [loadDashboardData, loadClasses]);

  const handleLogout = async () => {
    try {
      await api.post('/public/clients/logout', {});
      toast.success('Sesión cerrada');
      navigate(`/portal/${orgId}/auth`);
    } catch (error) {
      toast.error('Error al cerrar sesión');
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('¿Estás seguro de cancelar esta cita?')) return;
    try {
      await api.post(`/public/clients/appointments/${appointmentId}/cancel`, {});
      toast.success('Cita cancelada exitosamente');
      loadDashboardData();
    } catch (error) {
      if (error.response?.status === 404) {
        toast.error('Esta cita ya no existe o fue cancelada');
      } else if (error.response?.status === 400) {
        toast.error(error.response.data.detail || 'No se puede cancelar esta cita');
      } else {
        toast.error('Error al cancelar la cita');
      }
      loadDashboardData();
    }
  };

  const handleChangePin = async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(currentPin)) {
      toast.error('El PIN actual debe ser de 4 dígitos');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      toast.error('El nuevo PIN debe ser de 4 dígitos');
      return;
    }
    if (newPin !== confirmNewPin) {
      toast.error('Los PINs nuevos no coinciden');
      return;
    }
    if (currentPin === newPin) {
      toast.error('El nuevo PIN debe ser diferente al actual');
      return;
    }

    setChangingPin(true);
    try {
      await api.post('/public/clients/change-pin', { current_pin: currentPin, new_pin: newPin });
      toast.success('PIN actualizado exitosamente');
      setShowChangePinModal(false);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('PIN actual incorrecto');
      } else {
        toast.error(error.response?.data?.detail || 'Error al cambiar el PIN');
      }
    } finally {
      setChangingPin(false);
    }
  };

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    if (deleteConfirmText !== 'ELIMINAR') {
      toast.error('Debes escribir ELIMINAR en mayúsculas para confirmar');
      return;
    }
    if (!/^\d{4}$/.test(deletePin)) {
      toast.error('Ingresa tu PIN actual (4 dígitos)');
      return;
    }

    setDeleting(true);
    try {
      await api.delete('/public/clients/me', {
        data: { current_pin: deletePin },
        params: { organization_id: orgId },
      });
      toast.success('Cuenta eliminada exitosamente');
      navigate(`/book/${orgId}`);
    } catch (error) {
      if (error.response?.status === 401) {
        toast.error('PIN incorrecto');
      } else {
        toast.error(error.response?.data?.detail || 'Error al eliminar la cuenta');
      }
    } finally {
      setDeleting(false);
    }
  };

  return {
    orgId,
    clientData,
    loyalty,
    pendingReviews,
    setPendingReviews,
    googleReview,
    appointments,
    loading,
    showChangePinModal,
    setShowChangePinModal,
    showDeleteModal,
    setShowDeleteModal,
    currentPin,
    setCurrentPin,
    newPin,
    setNewPin,
    confirmNewPin,
    setConfirmNewPin,
    changingPin,
    deleteConfirmText,
    setDeleteConfirmText,
    deletePin,
    setDeletePin,
    deleting,
    classSessions,
    membership,
    loadingClasses,
    bookingSessionId,
    pickingSpotFor,
    setPickingSpotFor,
    loadClasses,
    loadDashboardData,
    handleBookClass,
    handleCancelClassBooking,
    handleJoinWaitlist,
    handleLeaveWaitlist,
    handleLogout,
    handleCancelAppointment,
    handleChangePin,
    handleDeleteAccount,
  };
}
