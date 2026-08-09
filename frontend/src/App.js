import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './context/AuthContext';
import { OrganizationProvider } from './context/OrganizationContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from './components/ui/sonner';
import AuthCallback from './components/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './pages/NotFound';
import Login from './pages/Login';
import Register from './pages/Register';
import PendingApproval from './pages/PendingApproval';
import { Loader2 } from 'lucide-react';
import './App.css';
import CancelAppointment from './pages/CancelAppointment';
import { RouteExperienceFrame } from './components/design';

// NEXUS_FRONTEND_PERFORMANCE_4C1_V1
const ReactQueryDevtools = process.env.NODE_ENV === 'development'
  ? lazy(() => import('@tanstack/react-query-devtools').then(module => ({ default: module.ReactQueryDevtools })))
  : null;

// Lazy load pages for code splitting
const OwnerAccessControl = lazy(() => import('./pages/OwnerAccessControl'));
const OwnerSubscriptions = lazy(() => import('./pages/OwnerSubscriptions'));
const OwnerThirdPartyMatrix = lazy(() => import('./pages/OwnerThirdPartyMatrix'));
const OwnerOrganizationOnboarding = lazy(() => import('./pages/OwnerOrganizationOnboarding'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const ManagerBilling = lazy(() => import('./pages/ManagerBilling'));
const ManagerFiscalProfile = lazy(() => import('./pages/ManagerFiscalProfile'));
const ManagerServices = lazy(() => import('./pages/ManagerServices'));
const ManagerBarbers = lazy(() => import('./pages/ManagerBarbers'));
const ManagerInventory = lazy(() => import('./pages/ManagerInventory'));
const SuppliersDashboard = lazy(() => import('./pages/SuppliersDashboard'));
const PurchaseOrdersDashboard = lazy(() => import('./pages/PurchaseOrdersDashboard'));
const ManagerClients = lazy(() => import('./pages/ManagerClients'));
const RevenueDashboard = lazy(() => import('./pages/RevenueDashboard'));
const SettlementsDashboard = lazy(() => import('./pages/SettlementsDashboard'));
const AppointmentsHistory = lazy(() => import('./pages/AppointmentsHistory'));
const BusinessProfile = lazy(() => import('./pages/BusinessProfile'));
const BookingFlow = lazy(() => import('./pages/BookingFlow'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const MarketingCampaigns = lazy(() => import('./pages/MarketingCampaigns'));
const Settings = lazy(() => import('./pages/Settings'));
const AcceptInvitation = lazy(() => import('./pages/AcceptInvitation'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const StaffProfile = lazy(() => import('./pages/StaffProfile'));
const StaffIncome = lazy(() => import('./pages/StaffIncome'));
const StaffAppointments = lazy(() => import('./pages/StaffAppointments'));
const AccountPrivacy = lazy(() => import('./pages/AccountPrivacy'));
const ClientPortalAuth = lazy(() => import('./pages/ClientPortalAuth'));
const ClientPortalDashboard = lazy(() => import('./pages/ClientPortalDashboard'));
const ForgotPin = lazy(() => import('./pages/ForgotPin'));
const ResetPin = lazy(() => import('./pages/ResetPin'));

// Loading fallback
const PageLoader = () => (
  <div className="min-h-screen nexus-screen flex items-center justify-center">
    <Loader2 size={48} className="text-[#0A84FF] animate-spin" />
  </div>
);

function AppRouter() {
  const location = useLocation();

  // Check URL fragment (not query params) for session_id
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <RouteExperienceFrame>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/accept-invitation" element={<AcceptInvitation />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/book/:orgId" element={<BookingFlow />} />
        <Route path="/portal/:orgId" element={<CustomerPortal />} />
        
        {/* Client Portal with PIN */}
        <Route path="/portal/:orgId/auth" element={<ClientPortalAuth />} />
        <Route path="/portal/:orgId/dashboard" element={<ClientPortalDashboard />} />
        <Route path="/portal/:orgId/forgot-pin" element={<ForgotPin />} />
        <Route path="/portal/:orgId/reset-pin" element={<ResetPin />} />

        <Route
          path="/owner/access-control"
          element={
            <ProtectedRoute requiredRole="owner">
              <OwnerAccessControl />

            </ProtectedRoute>
          }
        />
        <Route path="/owner/subscriptions" element={<ProtectedRoute requiredRole="owner"><OwnerSubscriptions /></ProtectedRoute>} />
        <Route path="/owner/third-party-matrix" element={<ProtectedRoute requiredRole="owner"><OwnerThirdPartyMatrix /></ProtectedRoute>} />
        <Route path="/owner/organizations/new" element={<ProtectedRoute requiredRole="owner"><OwnerOrganizationOnboarding /></ProtectedRoute>} />

        {/* Settings and related redirects */}
        <Route path="/manager/settings" element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}><Settings /></ProtectedRoute>} />
        <Route path="/manager/fiscal-profile" element={<Navigate to="/manager/settings?tab=fiscal" replace />} />
        <Route path="/account/privacy" element={<Navigate to="/manager/settings?tab=privacy" replace />} />
        
        <Route path="/manager/billing" element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}><ManagerBilling /></ProtectedRoute>} />
        <Route path="/manager/fiscal-profile" element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}><ManagerFiscalProfile /></ProtectedRoute>} />

        <Route
          path="/manager/dashboard"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/services"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <ManagerServices />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/barbers"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <ManagerBarbers />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/purchase-orders"
          element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}><PurchaseOrdersDashboard /></ProtectedRoute>}
        />
        <Route
          path="/manager/suppliers"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <SuppliersDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/inventory"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <ManagerInventory />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/clients"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <ManagerClients />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/appointments"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <AppointmentsHistory />
            </ProtectedRoute>
          }
        />

        {/* NEXUS_REVENUE_MODULE_V1 */}
        <Route path="/manager/revenue" element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}><RevenueDashboard /></ProtectedRoute>} />
        {/* NEXUS_STAFF_SETTLEMENTS_UI_V1 */}
        <Route path="/manager/settlements" element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}><SettlementsDashboard /></ProtectedRoute>} />

        <Route
          path="/manager/business-profile"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <BusinessProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/marketing"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <MarketingCampaigns />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manager/settings"
          element={
            <ProtectedRoute allowedRoles={['owner', 'manager', 'admin']}>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff/profile"
          element={
            <ProtectedRoute requiredRole="staff">
              <StaffProfile />
            </ProtectedRoute>
          }
        />

        {/* NEXUS_STAFF_INCOME_UI_V1 */}
        <Route
          path="/staff/income"
          element={
            <ProtectedRoute requiredRole="staff">
              <StaffIncome />
            </ProtectedRoute>
          }
        />

        {/* NEXUS_STAFF_APPOINTMENTS_UI_V1 */}
        <Route
          path="/staff/appointments"
          element={
            <ProtectedRoute requiredRole="staff">
              <StaffAppointments />
            </ProtectedRoute>
          }
        />

        <Route path="/account/privacy" element={<ProtectedRoute allowedRoles={['owner', 'manager', 'admin', 'staff']}><AccountPrivacy /></ProtectedRoute>} />
        
        {/* Public Routes */}
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/cancel/:appointmentId" element={<CancelAppointment />} />
        </Routes>
      </RouteExperienceFrame>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <OrganizationProvider>
              <ErrorBoundary>
                <div className="App">
                  <AppRouter />
                  <Toaster position="top-right" />
                </div>
              </ErrorBoundary>
            </OrganizationProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}

export default App;
