import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
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

// Lazy load pages for code splitting
const OwnerAccessControl = lazy(() => import('./pages/OwnerAccessControl'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const ManagerServices = lazy(() => import('./pages/ManagerServices'));
const ManagerBarbers = lazy(() => import('./pages/ManagerBarbers'));
const ManagerInventory = lazy(() => import('./pages/ManagerInventory'));
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
const StaffProfile = lazy(() => import('./pages/StaffProfile'));
const StaffIncome = lazy(() => import('./pages/StaffIncome'));
const StaffAppointments = lazy(() => import('./pages/StaffAppointments'));

// Loading fallback
const PageLoader = () => (
  <div className="min-h-screen bg-[#000000] flex items-center justify-center">
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
        
        <Route
          path="/owner/access-control"
          element={
            <ProtectedRoute requiredRole="owner">
              <OwnerAccessControl />
            </ProtectedRoute>
          }
        />
        
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

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/cancel/:appointmentId" element={<CancelAppointment />} />
        </Routes>
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
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
