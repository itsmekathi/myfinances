import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ApiError } from '@myfinances/api-client';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ExpenseEditorPage } from './pages/ExpenseEditorPage';
import { EntriesPage } from './pages/EntriesPage';
import { EntryEditorPage } from './pages/EntryEditorPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { AccountPage } from './pages/AccountPage';
import { WelcomePage } from './pages/WelcomePage';
import { HouseholdPage } from './pages/HouseholdPage';
import { AdminPage } from './pages/AdminPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors like 401/404.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { pathname } = useLocation();
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  // Signed-out visitors get the public landing page at "/" (it's also the Google OAuth homepage).
  if (status === 'signedOut') return pathname === '/' ? <HomePage /> : <Navigate to="/login" replace />;
  return children;
}

/** Pages that work on a workspace. Without one, the user picks "create" or "join" first. */
function RequireWorkspace() {
  const { workspace } = useAuth();
  return workspace ? <Outlet /> : <Navigate to="/welcome" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="welcome" element={<WelcomePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route element={<RequireWorkspace />}>
          <Route index element={<DashboardPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="expenses/new" element={<ExpenseEditorPage />} />
          <Route path="expenses/:id" element={<ExpenseEditorPage />} />
          <Route path="income" element={<EntriesPage kind="income" />} />
          <Route path="income/new" element={<EntryEditorPage kind="income" />} />
          <Route path="income/:id" element={<EntryEditorPage kind="income" />} />
          <Route path="investments" element={<EntriesPage kind="investment" />} />
          <Route path="investments/new" element={<EntryEditorPage kind="investment" />} />
          <Route path="investments/:id" element={<EntryEditorPage kind="investment" />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="household" element={<HouseholdPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
);
