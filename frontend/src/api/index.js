import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export const authAPI = {
  // Google OAuth (Emergent-managed)
  createSession: (sessionId) => api.post('/auth/session', {}, { headers: { 'X-Session-ID': sessionId } }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  
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
};

export const publicAPI = {
  getOrganization: (orgId) => axios.get(`${API}/public/${orgId}/organization`),
  getServices: (orgId) => axios.get(`${API}/public/${orgId}/services`),
  getBarbers: (orgId) => axios.get(`${API}/public/${orgId}/barbers`),
  getAvailability: (orgId, barberId, date, serviceId) => axios.get(`${API}/public/${orgId}/availability`, { params: { barber_id: barberId, date, service_id: serviceId } }),
  createAppointment: (orgId, data) => axios.post(`${API}/public/${orgId}/appointments`, data),
  getAppointment: (appointmentId) => axios.get(`${API}/public/appointments/${appointmentId}`),
  cancelAppointment: (appointmentId) => axios.post(`${API}/public/appointments/${appointmentId}/cancel`),
  // Customer Portal endpoints
  passwordlessAuth: (data) => axios.post(`${API}/public/auth/passwordless`, data),
  getClientHistory: (phone, organizationId) => axios.get(`${API}/public/clients/history`, { params: { phone, organization_id: organizationId } }),
};