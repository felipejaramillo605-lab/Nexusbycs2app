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
import Login from './pages/Login';
import Register from './pages/Register';
import PendingApproval from './pages/PendingApproval';
import { Loader2 } from 'lucide-react';
import './App.css';

// Lazy load pages for code splitting
const OwnerAccessControl = lazy(() => import('./pages/OwnerAccessControl'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));
const ManagerServices = lazy(() => import('./pages/ManagerServices'));
const ManagerBarbers = lazy(() => import('./pages/ManagerBarbers'));
const ManagerInventory = lazy(() => import('./pages/ManagerInventory'));
const ManagerClients = lazy(() => import('./pages/ManagerClients'));
const AppointmentsHistory = lazy(() => import('./pages/AppointmentsHistory'));
const BusinessProfile = lazy(() => import('./pages/BusinessProfile'));
const BookingFlow = lazy(() => import('./pages/BookingFlow'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const MarketingCampaigns = lazy(() => import('./pages/MarketingCampaigns'));
const Settings = lazy(() => import('./pages/Settings'));

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
            <ProtectedRoute>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/services"
          element={
            <ProtectedRoute>
              <ManagerServices />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/barbers"
          element={
            <ProtectedRoute>
              <ManagerBarbers />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/inventory"
          element={
            <ProtectedRoute>
              <ManagerInventory />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/clients"
          element={
            <ProtectedRoute>
              <ManagerClients />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/appointments"
          element={
            <ProtectedRoute>
              <AppointmentsHistory />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/business-profile"
          element={
            <ProtectedRoute>
              <BusinessProfile />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/marketing"
          element={
            <ProtectedRoute>
              <MarketingCampaigns />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/manager/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        
        <Route path="/" element={<Navigate to="/login" replace />} />
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
              <div className="App">
                <AppRouter />
                <Toaster position="top-right" />
              </div>
            </OrganizationProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
