import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';
import { NotificationProvider } from './contexts/NotificationContext.tsx';
import { ProtectedRoute } from './components/auth/ProtectedRoute.tsx';
import { AuthRoute } from './components/auth/AuthRoute.tsx';
import { AppLayout } from './components/layout/AppLayout.tsx';
import { LoginPage } from './pages/auth/LoginPage.tsx';
import { SignupPage } from './pages/auth/SignupPage.tsx';
import { DashboardPage } from './pages/dashboard/DashboardPage.tsx';
import { ProjectBoardPage } from './pages/project/ProjectBoardPage.tsx';
import { MyTasksPage } from './pages/tasks/MyTasksPage.tsx';

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <NotificationProvider>
            <Routes>
            {/* Public Auth Routes (redirects logged-in users to /) */}
            <Route
              path="/login"
              element={
                <AuthRoute>
                  <LoginPage />
                </AuthRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <AuthRoute>
                  <SignupPage />
                </AuthRoute>
              }
            />

            {/* Protected Routes (redirects unauthenticated users to /login) */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/p/:projectId" element={<ProjectBoardPage />} />
              <Route path="/my-tasks" element={<MyTasksPage />} />
            </Route>

            {/* Fallback to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </ToastProvider>
    </HashRouter>
  );
}
