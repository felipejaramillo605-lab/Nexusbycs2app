import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 15000,
});

export const authAPI = {
  // Google OAuth (Emergent-managed)
  createSession: (sessionId) => api.post('/auth/session', {}, { headers: { 'X-Session-ID': sessionId } }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  deleteAccount: (data) => api.delete('/account/me', { data }),
  
  // Manual Auth
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

export const ownerAPI = {
  getUsers: () => api.get('/owner/users'),
  updateAccess: (userId, status) => api.put(`/owner/users/${userId}/access`, { access_status: status }),
  deleteUser: (userId) => api.delete(`/owner/users/${userId}`),
};

export const teamAPI = {
  getMembers: (organizationId) => api.get('/team/members', { params: { organization_id: organizationId } }),
  updateRole: (userId, role, organizationId) => api.put(`/team/members/${userId}/role`, { role }, { params: { organization_id: organizationId } }),
  deactivateMember: (userId, organizationId) => api.delete(`/team/members/${userId}`, { params: { organization_id: organizationId } }),
  getInvitations: (organizationId) => api.get('/team/invitations', { params: { organization_id: organizationId } }),
  createInvitation: (data) => api.post('/team/invitations', data),
  resendInvitation: (invitationId) => api.post(`/team/invitations/${invitationId}/resend`),
  revokeInvitation: (invitationId) => api.post(`/team/invitations/${invitationId}/revoke`),
};

export const organizationAPI = {
  getAll: () => api.get('/organizations'),
  create: (name) => api.post('/organizations', null, { params: { name } }),
};

export const serviceAPI = {
  getAll: (params = {}) => api.get('/services', { params }),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  delete: (id) => api.delete(`/services/${id}`),
};

export const barberAPI = {
  getMyProfile: () => api.get('/barbers/me/profile'),
  updateMyProfile: (data) => api.put('/barbers/me/profile', data),
  getAll: (params = {}) => api.get('/barbers', { params }),
  create: (data) => api.post('/barbers', data),
  update: (id, data) => api.put(`/barbers/${id}`, data),
  delete: (id) => api.delete(`/barbers/${id}`),
  getBlockedTimes: (id, params = {}) => api.get(`/barbers/${id}/blocked-times`, { params }),
  createBlockedTime: (id, data) => api.post(`/barbers/${id}/blocked-times`, data),
  deleteBlockedTime: (barberId, blockId) => api.delete(`/barbers/${barberId}/blocked-times/${blockId}`),
};

export const appointmentAPI = {
  getAll: (params = {}) => api.get('/appointments', { params }),
  getToday: (params = {}) => {
    const today = new Date().toISOString().split('T')[0];
    return api.get('/appointments', { params: { ...params, date: today } });
  },
  getStats: (params = {}) => api.get('/appointments/stats', { params }),
  // NEXUS_CHECKOUT_BACKEND_V1
  checkout: (appointmentId, data) => api.post(`/appointments/${appointmentId}/checkout`, data),
  getTransaction: (appointmentId) => api.get(`/appointments/${appointmentId}/transaction`),
};

export const clientAPI = {
  getAll: (params = {}) => api.get('/clients', { params }),
  getHistory: (clientId) => api.get(`/clients/${clientId}/history`),
  update: (clientId, data) => api.put(`/clients/${clientId}`, data),
};

export const marketingAPI = {
  sendCampaign: (data) => api.post('/marketing/campaigns', data),
};

export const inventoryAPI = {
  getAll: (params = {}) => api.get('/inventory', { params }),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  generateOrder: () => api.post('/inventory/generate-order', {}, { responseType: 'stream' }),
  getSummary: (params = {}) => api.get('/inventory/summary', { params }),
  getMovements: (params = {}) => api.get('/inventory/movements', { params }),
  createMovement: (id, data) => api.post(`/inventory/${id}/movements`, data),
};

// NEXUS_COMMISSION_FOUNDATION_V1
// NEXUS_TRANSACTION_REVENUE_STATISTICS_V1
// NEXUS_STAFF_SETTLEMENTS_WORKFLOW_V1
export const settlementWorkflowAPI = {
  approve: (settlementId) => api.post(`/settlements/${settlementId}/approve`),
  pay: (settlementId, data) => api.post(`/settlements/${settlementId}/pay`, data),
  cancel: (settlementId, data) => api.post(`/settlements/${settlementId}/cancel`, data),
};

// NEXUS_STAFF_SETTLEMENTS_FOUNDATION_V1
export const settlementAPI = {
  getPending: (params = {}) => api.get('/settlements/pending', { params }),
  create: (data, params = {}) => api.post('/settlements', data, { params }),
  getAll: (params = {}) => api.get('/settlements', { params }),
  getById: (settlementId) => api.get(`/settlements/${settlementId}`),
};

// NEXUS_STAFF_APPOINTMENTS_BACKEND_V1
export const staffAppointmentAPI = {
  getAll: (params = {}) => api.get('/staff/appointments', { params }),
  getSummary: (params = {}) => api.get('/staff/appointments/summary', { params }),
};

// NEXUS_STAFF_INCOME_BACKEND_V1
// NEXUS_STAFF_SETTLEMENTS_COMPLETION_V1
export const staffIncomeAPI = {
  getSummary: (params = {}) => api.get('/staff/income/summary', { params }),
  getTransactions: (params = {}) => api.get('/staff/income/transactions', { params }),
  getSettlementSummary: () => api.get('/staff/settlements/summary'),
  getSettlements: (params = {}) => api.get('/staff/settlements', { params }),
  getSettlementById: (settlementId) => api.get(`/staff/settlements/${settlementId}`),
};

export const transactionAPI = {
  getAll: (params = {}) => api.get('/transactions', { params }),
  getSummary: (params = {}) => api.get('/transactions/summary', { params }),
  getById: (transactionId) => api.get(`/transactions/${transactionId}`),
};

export const commissionAPI = {
  getSettings: (organizationId) => api.get('/commissions/settings', { params: { organization_id: organizationId } }),
  updateSettings: (data, organizationId) => api.put('/commissions/settings', data, { params: { organization_id: organizationId } }),
  getStaff: (organizationId) => api.get('/commissions/staff', { params: { organization_id: organizationId } }),
  updateStaff: (barberId, data, organizationId) => api.put(`/commissions/staff/${barberId}`, data, { params: { organization_id: organizationId } }),
  resetStaff: (barberId, organizationId) => api.delete(`/commissions/staff/${barberId}`, { params: { organization_id: organizationId } }),
};

export const publicAPI = {
  validateInvitation: (token) => axios.get(`${API}/public/invitations/validate`, { params: { token }, timeout: 15000 }),
  acceptInvitation: (data) => axios.post(`${API}/public/invitations/accept`, data, { timeout: 15000 }),
  getOrganization: (orgId) => axios.get(`${API}/public/${orgId}/organization`),
  getServices: (orgId) => axios.get(`${API}/public/${orgId}/services`),
  getBarbers: (orgId) => axios.get(`${API}/public/${orgId}/barbers`),
  getAvailability: (orgId, barberId, date, serviceId) => axios.get(`${API}/public/${orgId}/availability`, { params: { barber_id: barberId, date, service_id: serviceId } }),
  createAppointment: (orgId, data) => axios.post(`${API}/public/${orgId}/appointments`, data),
  getAppointment: (appointmentId, token) => axios.get(`${API}/public/appointments/${appointmentId}`, { params: { token } }),
  cancelAppointment: (appointmentId, token) => axios.post(`${API}/public/appointments/${appointmentId}/cancel`, {}, { params: { token } }),
  // Customer Portal endpoints
  passwordlessAuth: (data) => axios.post(`${API}/public/auth/passwordless`, data),
  getClientHistory: (phone, organizationId) => axios.get(`${API}/public/clients/history`, { params: { phone, organization_id: organizationId } }),
};