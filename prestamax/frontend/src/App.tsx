import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { TenantProvider } from '@/contexts/TenantContext'
import { useAuth } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'
import type { PermKey } from '@/lib/permissions'
import { initAnalytics, trackPageView } from '@/lib/analytics'
import { applyRouteSeo } from '@/lib/seo'
import { setLocale, type Locale } from '@/lib/i18n'

// ── Efectos por ruta: SEO (index/noindex) + Google Analytics pageview ─────────
const RouteEffects: React.FC = () => {
  const location = useLocation()
  useEffect(() => {
    applyRouteSeo(location.pathname)
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])
  return null
}

import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ClientsPage from '@/pages/clients/ClientsPage'
import ClientDetailPage from '@/pages/clients/ClientDetailPage'
import ClientFormPage from '@/pages/clients/ClientFormPage'
import LoansPage from '@/pages/loans/LoansPage'
import LoanDetailPage from '@/pages/loans/LoanDetailPage'
import LoanCreatePage from '@/pages/loans/LoanCreatePage'
import PaymentsPage from '@/pages/payments/PaymentsPage'
import ReceiptsPage from '@/pages/receipts/ReceiptsPage'
import ContractsPage from '@/pages/contracts/ContractsPage'
import CollectionsPage from '@/pages/collections/CollectionsPage'
import PaymentPromisesPage from '@/pages/collections/PaymentPromisesPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import ProjectionPage from '@/pages/reports/ProjectionPage'
import AccountingExportPage from '@/pages/reports/AccountingExportPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import WhatsAppPage from '@/pages/whatsapp/WhatsAppPage'
import IncomePage from '@/pages/income/IncomePage'
import PlatformAdminPage from '@/pages/admin/PlatformAdminPage'
import LoanRequestPublicPage from '@/pages/public/LoanRequestPublicPage'
import TermsPage from '@/pages/public/TermsPage'
import PrivacyPage from '@/pages/public/PrivacyPage'
import LandingPage from '@/pages/public/LandingPage'
import HelpPage from '@/pages/help/HelpPage'
import LoanRequestsPage from '@/pages/requests/LoanRequestsPage'
import LoanCalculatorPage from '@/pages/calculator/LoanCalculatorPage'
import BillingPage from '@/pages/billing/BillingPage'
import InvestorsPage from '@/pages/investors/InvestorsPage'
import InvestorDetailPage from '@/pages/investors/InvestorDetailPage'
import PortalInvestorPage from '@/pages/portal_investor/PortalInvestorPage'

import AppLayout from '@/components/layout/AppLayout'

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state } = useAuth()
  if (!state.isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

const PermissionRoute: React.FC<{ perm: PermKey; children: React.ReactNode }> = ({ perm, children }) => {
  const { can } = usePermission()
  if (!can(perm)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

const AppRoutes: React.FC = () => {
  const { state } = useAuth()

  const currentTenant = (state.user as any)?.currentTenant
  const userRoles: string[] = currentTenant?.roles || []
  const isInvestorOnly = userRoles.length > 0 && userRoles.every(r => r === 'investor')

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/apply/:token" element={<LoanRequestPublicPage />} />

      {state.isAuthenticated && isInvestorOnly && (
        <>
          <Route path="/portal" element={<PortalInvestorPage />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </>
      )}

      {state.isAuthenticated && !isInvestorOnly && (
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/clients" element={<PermissionRoute perm="clients.view"><ClientsPage /></PermissionRoute>} />
          <Route path="/clients/new" element={<PermissionRoute perm="clients.create"><ClientFormPage /></PermissionRoute>} />
          <Route path="/clients/:id" element={<PermissionRoute perm="clients.view"><ClientDetailPage /></PermissionRoute>} />
          <Route path="/clients/:id/edit" element={<PermissionRoute perm="clients.edit"><ClientFormPage /></PermissionRoute>} />

          <Route path="/loans" element={<PermissionRoute perm="loans.view"><LoansPage /></PermissionRoute>} />
          <Route path="/loans/new" element={<PermissionRoute perm="loans.create"><LoanCreatePage /></PermissionRoute>} />
          <Route path="/loans/:id" element={<PermissionRoute perm="loans.view"><LoanDetailPage /></PermissionRoute>} />

          <Route path="/payments" element={<PermissionRoute perm="payments.view"><PaymentsPage /></PermissionRoute>} />
          <Route path="/receipts" element={<PermissionRoute perm="receipts.view"><ReceiptsPage /></PermissionRoute>} />
          <Route path="/contracts" element={<PermissionRoute perm="contracts.view"><ContractsPage /></PermissionRoute>} />

          <Route path="/collections" element={<PermissionRoute perm="collections.view"><CollectionsPage /></PermissionRoute>} />
          <Route path="/collections/promises" element={<PermissionRoute perm="collections.promises"><PaymentPromisesPage /></PermissionRoute>} />

          <Route path="/reports" element={<PermissionRoute perm="reports.dashboard"><ReportsPage /></PermissionRoute>} />
          <Route path="/reports/projection" element={<PermissionRoute perm="reports.projection"><ProjectionPage /></PermissionRoute>} />
          <Route path="/reports/accounting" element={<PermissionRoute perm="reports.dashboard"><AccountingExportPage /></PermissionRoute>} />

          <Route path="/settings" element={<PermissionRoute perm="settings.general"><SettingsPage /></PermissionRoute>} />
          <Route path="/settings/products" element={<PermissionRoute perm="settings.products"><SettingsPage /></PermissionRoute>} />
          <Route path="/settings/users" element={<PermissionRoute perm="settings.users"><SettingsPage /></PermissionRoute>} />
          <Route path="/settings/branches" element={<PermissionRoute perm="settings.branches"><SettingsPage /></PermissionRoute>} />
          <Route path="/templates" element={<PermissionRoute perm="templates.view"><SettingsPage /></PermissionRoute>} />
          <Route path="/settings/bank-accounts" element={<PermissionRoute perm="settings.bank_accounts"><SettingsPage /></PermissionRoute>} />
          <Route path="/settings/subscription" element={<PermissionRoute perm="settings.general"><BillingPage /></PermissionRoute>} />
          <Route path="/billing" element={<PermissionRoute perm="settings.general"><BillingPage /></PermissionRoute>} />

          <Route path="/whatsapp" element={<PermissionRoute perm="whatsapp.view"><WhatsAppPage /></PermissionRoute>} />
          <Route path="/income" element={<PermissionRoute perm="income.view"><IncomePage /></PermissionRoute>} />
          <Route path="/requests" element={<PermissionRoute perm="requests.view"><LoanRequestsPage /></PermissionRoute>} />
          <Route path="/calculator" element={<PermissionRoute perm="calculator.use"><LoanCalculatorPage /></PermissionRoute>} />

          <Route path="/help" element={<HelpPage />} />

          <Route path="/admin" element={<PlatformAdminPage />} />

          <Route path="/investors" element={<PermissionRoute perm="investors.view"><InvestorsPage /></PermissionRoute>} />
          <Route path="/investors/:id" element={<PermissionRoute perm="investors.view"><InvestorDetailPage /></PermissionRoute>} />
        </Route>
      )}

      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />

      <Route path="/" element={state.isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="*" element={<Navigate to={state.isAuthenticated ? '/dashboard' : '/'} replace />} />
    </Routes>
  )
}

const App: React.FC = () => {
  useEffect(() => {
    // ?lang=es|en|pt en la URL fija el idioma (para hreflang/SEO y enlaces compartidos)
    try {
      const p = new URLSearchParams(window.location.search).get('lang')
      if (p && ['es', 'en', 'pt'].includes(p)) setLocale(p as Locale)
    } catch (_) { /* noop */ }
    initAnalytics()
  }, [])
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <RouteEffects />
          <AppRoutes />
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
