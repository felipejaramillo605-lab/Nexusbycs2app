import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from './components/ui/sonner';
import AuthCallback from './components/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import PendingApproval from './pages/PendingApproval';
import OwnerAccessControl from './pages/OwnerAccessControl';
import ManagerDashboard from './pages/ManagerDashboard';
import ManagerServices from './pages/ManagerServices';
import ManagerBarbers from './pages/ManagerBarbers';
import ManagerInventory from './pages/ManagerInventory';
import ManagerClients from './pages/ManagerClients';
import BookingFlow from './pages/BookingFlow';
import './App.css';

function AppRouter() {
  const location = useLocation();
  
  // Check URL fragment (not query params) for session_id
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/pending-approval" element={<PendingApproval />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/book/:orgId" element={<BookingFlow />} />
      
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
      
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <div className="App">
            <AppRouter />
            <Toaster position="top-right" />
          </div>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;