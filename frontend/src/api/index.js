import axios from 'axios';

const configuredBackendUrl =
  process.env.REACT_APP_BACKEND_URL;

const currentOrigin =
  window.location.origin;

const BACKEND_URL = (() => {
  if (!configuredBackendUrl) {
    return currentOrigin;
  }

  try {
    const configuredOrigin =
      new URL(configuredBackendUrl).origin;

    return configuredOrigin === currentOrigin
      ? configuredOrigin
      : currentOrigin;
  } catch {
    return currentOrigin;
  }
})();

export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 15000,
});

// NEXUS_7J_SUBSCRIPTION_SUSPENDED_EXPERIENCE
api.interceptors.response.use(
  response => response,
  error => {
    const detail = error?.response?.data?.detail;
    const code = typeof detail === 'object' ? detail?.code : null;
    if (error?.response?.status === 402 && code === 'SUBSCRIPTION_ACCESS_SUSPENDED') {
      window.dispatchEvent(new CustomEvent('nexus:subscription-suspended',{detail:{code}}));
    }
    return Promise.reject(error);
  }
);

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
  recoverOrganizationRole: (userId, data) => api.post(`/owner/users/${userId}/organization-role`, data),
  deleteUser: (userId) => api.delete(`/owner/users/${userId}`),
};

export const subscriptionAPI = {
  get: (organizationId) => api.get(`/owner/subscriptions/${organizationId}`),
  save: (organizationId, data) => api.put(`/owner/subscriptions/${organizationId}`, data),
  createInvoice: (organizationId, data) => api.post(`/owner/subscriptions/${organizationId}/invoices`, data),
  getInvoices: (organizationId, params = {}) => api.get(`/owner/subscriptions/${organizationId}/invoices`, { params }),
  confirmManualPayment: (organizationId, invoiceId, data) => api.post(`/owner/subscriptions/${organizationId}/invoices/${invoiceId}/manual-payment`, data),
  changeInvoiceState: (organizationId, invoiceId, data) => api.post(`/owner/subscriptions/${organizationId}/invoices/${invoiceId}/state`, data),
  getAudit: (organizationId, params = {}) => api.get(`/owner/subscriptions/${organizationId}/audit`, { params }),
  blockOrganization: (organizationId, data) => api.post(`/owner/subscription-lifecycle/organizations/${organizationId}/block`, data),
  reactivateOrganization: (organizationId, data) => api.post(`/owner/subscription-lifecycle/organizations/${organizationId}/reactivate`, data),
};

export const teamAPI = {
  getMembers: (organizationId) => api.get('/team/members', { params: { organization_id: organizationId } }),
  updateRole: (userId, role, organizationId) => api.put(`/team/members/${userId}/role`, { role }, { params: { organization_id: organizationId } }),
  deactivateMember: (userId, organizationId) => api.delete(`/team/members/${userId}`, { params: { organization_id: organizationId } }),
  getInvitations: (organizationId) => api.get('/team/invitations', { params: { organization_id: organizationId } }),
  createInvitation: (data) => api.post('/team/invitations', data),
  resendInvitation: (invitationId) => api.post(`/team/invitations/${invitationId}/resend`),
  revokeInvitation: (invitationId, data) => api.post(`/team/invitations/${invitationId}/revoke`, data),
};

export const organizationAPI = {
  getAll: () => api.get('/organizations'),
  create: (data) => api.post('/organizations', data),
};

export const serviceAPI = {
  getAll: (params = {}) => api.get('/services', { params }),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  delete: (id) => api.delete(`/services/${id}`),
  getRecipe: (id, params = {}) => api.get(`/service-recipes/${id}`, { params }),
  saveRecipe: (id, data) => api.put(`/service-recipes/${id}`, data),
  getRecipeVersions: (id, params = {}) => api.get(`/service-recipes/${id}/versions`, { params }),
  getInventoryPolicy: (params = {}) => api.get('/service-recipes/policy', { params }),
  updateInventoryPolicy: (data) => api.put('/service-recipes/policy', data),
};

export const barberAPI = {
  getMyProfile: () => api.get('/barbers/me/profile'),
  getMyServices: () => api.get('/staff/services'),
  updateMyProfile: (data) => api.put('/barbers/me/profile', data),
  uploadMyAvatar: (file, onUploadProgress) => { const data = new FormData(); data.append('file', file); return api.post('/barbers/me/avatar', data, { onUploadProgress }); },
  deleteMyAvatar: () => api.delete('/barbers/me/avatar'),
  getAll: (params = {}) => api.get('/barbers', { params }),
  create: (data) => api.post('/barbers', data),
  update: (id, data) => api.put(`/barbers/${id}`, data),
  uploadAvatar: (id, file, organizationId, onUploadProgress) => { const data = new FormData(); data.append('file', file); return api.post(`/barbers/${id}/avatar`, data, { params: organizationId ? { organization_id: organizationId } : {}, onUploadProgress }); },
  deleteAvatar: (id, organizationId) => api.delete(`/barbers/${id}/avatar`, { params: organizationId ? { organization_id: organizationId } : {} }),
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
  listAudits: (params = {}) => api.get('/inventory/audits', { params }),
  createAudit: (data) => api.post('/inventory/audits', data),
  getAudit: (id) => api.get(`/inventory/audits/${id}`),
  updateAuditLine: (auditId, lineId, data) => api.put(`/inventory/audits/${auditId}/lines/${lineId}`, data),
  getAuditReport: (id) => api.get(`/inventory/audits/${id}/report`),
  applyAuditAdjustments: (id, data = {}) => api.post(`/inventory/audits/${id}/apply-adjustments`, data),
  downloadCountSheet: (id) => api.get(`/inventory/audits/${id}/count-sheet.xlsx`, { responseType: 'blob' }),
  downloadAuditCsv: (id) => api.get(`/inventory/audits/${id}/report.csv`, { responseType: 'blob' }),
  getCatalog: (params = {}) => api.get('/inventory/catalog/items', { params }),
  createCatalogItem: (data) => api.post('/inventory/catalog/items', data),
  updateCatalogItem: (id, data) => api.put(`/inventory/catalog/items/${id}`, data),
  archiveCatalogItem: (id, params = {}) => api.delete(`/inventory/catalog/items/${id}`, { params }),
  migrateSkus: (params = {}) => api.post('/inventory/catalog/migrate-skus', {}, { params }),
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

export const purchaseOrderAPI = {getAll:(params={})=>api.get('/purchase-orders',{params}),create:(data,params={})=>api.post('/purchase-orders',data,{params}),getById:id=>api.get(`/purchase-orders/${id}`),update:(id,data)=>api.put(`/purchase-orders/${id}`,data),submit:id=>api.post(`/purchase-orders/${id}/submit`),approve:id=>api.post(`/purchase-orders/${id}/approve`),cancel:(id,reason)=>api.post(`/purchase-orders/${id}/cancel`,{reason}),receive:(id,data,params={})=>api.post(`/purchase-orders/${id}/receipts`,data,{params}),getReceipts:(id,params={})=>api.get(`/purchase-orders/${id}/receipts`,{params}),getReceipt:(id,receiptId,params={})=>api.get(`/purchase-orders/${id}/receipts/${receiptId}`,{params}),getReceiptEvidence:(id,receiptId,params={})=>api.get(`/purchase-orders/${id}/receipts/${receiptId}/evidence`,{params}),reverseReceipt:(id,receiptId,data,params={})=>api.post(`/purchase-orders/${id}/receipts/${receiptId}/reverse`,data,{params})};

export const supplierAPI = {
  getAll: (params = {}) => api.get('/suppliers', { params }),
  create: (data, params = {}) => api.post('/suppliers', data, { params }),
  getById: (id) => api.get(`/suppliers/${id}`),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  archive: (id) => api.post(`/suppliers/${id}/archive`),
  reactivate: (id) => api.post(`/suppliers/${id}/reactivate`),
  linkProduct: (id, data) => api.post(`/suppliers/${id}/products`, data),
  unlinkProduct: (id, itemId) => api.delete(`/suppliers/${id}/products/${itemId}`),
};

export const transactionAPI = {
  getAll: (params = {}) => api.get('/transactions', { params }),
  getSummary: (params = {}) => api.get('/transactions/summary', { params }),
  getById: (transactionId) => api.get(`/transactions/${transactionId}`),
  void: (transactionId, data) => api.post(`/transactions/${transactionId}/void`, data),
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

export const billingAPI = {
  getProfile: (params={}) => api.get('/billing/profile',{params}),
  saveProfile: (data,params={}) => api.put('/billing/profile',data,{params}),
  getInvoices: (params={}) => api.get('/billing/invoices',{params}),
  downloadPdf: (invoiceId,params={}) => api.get(`/billing/invoices/${invoiceId}/pdf`,{params,responseType:'blob'}),
  getNotifications: (params={}) => api.get('/billing/notifications',{params}),
  markNotificationRead: id => api.post(`/billing/notifications/${id}/read`),
  announce: data => api.post('/billing/owner/announcements',data),
};

export const thirdPartyMatrixAPI = {list:(params={})=>api.get('/owner/third-party-matrix',{params}),detail:id=>api.get(`/owner/third-party-matrix/${id}`)};

export const deliveryOperationsAPI = {backfill:(data)=>api.post('/owner/delivery-operations/backfill',data),getDeliveries:(params={})=>api.get('/owner/delivery-operations/deliveries',{params}),testDelivery:(data)=>api.post('/owner/delivery-operations/deliveries/test',data),retry:(id,data={})=>api.post(`/owner/delivery-operations/deliveries/${id}/retry`,data),runScheduler:(data={})=>api.post('/owner/delivery-operations/scheduler/run',data)};

// NEXUS_7J_B_BILLING_OPERATIONS
export const platformBillingAPI = {getSellerProfile:()=>api.get('/owner/platform-billing/seller-profile'),saveSellerProfile:data=>api.put('/owner/platform-billing/seller-profile',data),getOperationalHealth:()=>api.get('/owner/platform-billing/operational-health')};
