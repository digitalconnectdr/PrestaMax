import React, { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/contexts/AuthContext'
import { TenantProvider } from '@/contexts/TenantContext'
import { useAuth } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'
import type { PermKey } from '@/lib/permissions'
import { initAnalytics, trackPageView } from '@/lib/analytics'
import { applyRouteSeo } from '@/lib/seo'
import { setLocale, type Locale } from '@/lib/i18n'
import { PageLoadingState } from '@/components/ui/Loading'

// ── Efectos por ruta: SEO (index/noindex) + Google Analytics pageview ─────────
const RouteEffects: React.FC = () => {
  const location = useLocation()
  useEffect(() => {
    applyRouteSeo(location.pathname)
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])
  return null
}

// Entrada pública: estáticas para pintar rápido sin un chunk extra.
import LandingPage from '@/pages/public/LandingPage'
import LoginPage from '@/pages/auth/LoginPage'

// Resto de páginas: lazy-loaded → no entran en el bundle inicial del landing.
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ClientsPage = lazy(() => import('@/pages/clients/ClientsPage'))
const ClientDetailPage = lazy(() => import('@/pages/clients/ClientDetailPage'))
const ClientFormPage = lazy(() => import('@/pages/clients/ClientFormPage'))
const LoansPage = lazy(() => import('@/pages/loans/LoansPage'))
const LoanDetailPage = lazy(() => import('@/pages/loans/LoanDetailPage'))
const LoanCreatePage = lazy(() => import('@/pages/loans/LoanCreatePage'))
const PaymentsPage = lazy(() => import('@/pages/payments/PaymentsPage'))
const ReceiptsPage = lazy(() => import('@/pages/receipts/ReceiptsPage'))
const ContractsPage = lazy(() => import('@/pages/contracts/ContractsPage'))
const CollectionsPage = lazy(() => import('@/pages/collections/CollectionsPage'))
const PaymentPromisesPage = lazy(() => import('@/pages/collections/PaymentPromisesPage'))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))
const ProjectionPage = lazy(() => import('@/pages/reports/ProjectionPage'))
const AccountingExportPage = lazy(() => import('@/pages/reports/AccountingExportPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const WhatsAppPage = lazy(() => import('@/pages/whatsapp/WhatsAppPage'))
const IncomePage = lazy(() => import('@/pages/income/IncomePage'))
const PlatformAdminPage = lazy(() => import('@/pages/admin/PlatformAdminPage'))
const LoanRequestPublicPage = lazy(() => import('@/pages/public/LoanRequestPublicPage'))
const TermsPage = lazy(() => import('@/pages/public/TermsPage'))
const PrivacyPage = lazy(() => import('@/pages/public/PrivacyPage'))
const ContactPage = lazy(() => import('@/pages/public/ContactPage'))
const HelpPage = lazy(() => import('@/pages/help/HelpPage'))
const LoanRequestsPage = lazy(() => import('@/pages/requests/LoanRequestsPage'))
const LoanCalculatorPage = lazy(() => import('@/pages/calculator/LoanCalculatorPage'))
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'))
const InvestorsPage = lazy(() => import('@/pages/investors/InvestorsPage'))
const InvestorDetailPage = lazy(() => import('@/pages/investors/InvestorDetailPage'))
const PortalInvestorPage = lazy(() => import('@/pages/portal_investor/PortalInvestorPage'))

const AppLayout = lazy(() => import('@/components/layout/AppLayout'))

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

// Acceso al panel de plataforma (/admin): SOLO owner/staff de plataforma.
// El backend marca user.isPlatformAdmin; cualquier otro usuario va a /dashboard.
const PlatformRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state } = useAuth()
  if (!(state.user as any)?.isPlatformAdmin) return <Navigate to="/dashboard" replace />
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

          <Route path="/admin" element={<PlatformRoute><PlatformAdminPage /></PlatformRoute>} />

          <Route path="/investors" element={<PermissionRoute perm="investors.view"><InvestorsPage /></PermissionRoute>} />
          <Route path="/investors/:id" element={<PermissionRoute perm="investors.view"><InvestorDetailPage /></PermissionRoute>} />
        </Route>
      )}

      <Route path="/contact" element={<ContactPage />} />
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
          <Toaster position="top-right" />
          <Suspense fallback={<PageLoadingState />}>
            <AppRoutes />
          </Suspense>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
