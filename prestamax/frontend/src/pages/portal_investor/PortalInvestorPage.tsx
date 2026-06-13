import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Briefcase, Wallet, TrendingUp, History, DollarSign } from 'lucide-react'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageLoadingState } from '@/components/ui/Loading'
import Card from '@/components/ui/Card'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

type Tab = 'dashboard' | 'loans' | 'payouts'

const PortalInvestorPage: React.FC = () => {
  const t = useT()
  const { state, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [me, setMe] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [meR, sumR, loansR, payR] = await Promise.all([
        api.get('/portal/investor/me'),
        api.get('/portal/investor/summary'),
        api.get('/portal/investor/loans'),
        api.get('/portal/investor/payouts'),
      ])
      setMe(meR.data)
      setSummary(sumR.data)
      setLoans(Array.isArray(loansR.data) ? loansR.data : [])
      setPayouts(Array.isArray(payR.data) ? payR.data : [])
    } catch (err: any) {
      if (!isAccessDenied(err) && !isSubscriptionExpired(err)) toast.error(err?.response?.data?.error || t('pinv.load_error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  if (loading) return <PageLoadingState />
  if (!me) return null

  const fullName = me.fullName || (state.user as any)?.fullName || t('pinv.investor')
  const cap   = summary?.capital   || {}
  const life  = summary?.lifetime  || {}
  const rcvd  = summary?.received  || {}

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-[#f59e0b]">Presta</span>Max <span className="text-white/70 font-normal text-sm ml-2">· {t('pinv.portal')}</span>
            </h1>
            <p className="text-xs text-white/70 mt-1">{fullName}{me.email ? ` · ${me.email}` : ''}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <LogOut className="w-4 h-4" />{t('pinv.logout')}
          </button>
        </div>
        {/* Tabs */}
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {([
            { key: 'dashboard', label: t('pinv.tab_summary'), icon: TrendingUp },
            { key: 'loans',     label: t('pinv.tab_loans'), icon: Briefcase },
            { key: 'payouts',   label: t('pinv.tab_payouts'), icon: History },
          ] as { key: Tab; label: string; icon: any }[]).map(tabItem => {
            const Icon = tabItem.icon
            const active = tab === tabItem.key
            return (
              <button
                key={tabItem.key}
                onClick={() => setTab(tabItem.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active ? 'border-[#f59e0b] text-[#f59e0b]' : 'border-transparent text-white/70 hover:text-white'}`}
              >
                <Icon className="w-4 h-4" />{tabItem.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {tab === 'dashboard' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600"><Wallet className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">{t('pinv.placed_capital')}</p>
                    <p className="text-2xl font-bold text-slate-800">{formatCurrency(Number(cap.activeBalance) || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{t('pinv.active_loans').replace('{n}', String(cap.activeLoans || 0))}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">{t('pinv.accrued_earnings')}</p>
                    <p className="text-2xl font-bold text-emerald-700">{formatCurrency(Number(life.netEarned) || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{t('pinv.payments_received').replace('{n}', String(life.paymentsCount || 0))}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600"><DollarSign className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase">{t('pinv.total_received')}</p>
                    <p className="text-2xl font-bold text-purple-700">{formatCurrency(Number(rcvd.totalPayoutsAmount) || 0)}</p>
                    <p className="text-xs text-slate-500 mt-1">{t('pinv.payouts_count').replace('{n}', String(rcvd.totalPayoutsCount || 0))}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Modelo + Detalles */}
            <Card>
              <h2 className="section-title mb-3">{t('pinv.agreement')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">{t('pinv.model')}</span> <strong className="ml-2">{me.modelType === 'fixed_rate' ? t('pinv.fixed_rate') : t('pinv.equity')}</strong></div>
                {me.modelType === 'fixed_rate'
                  ? <div><span className="text-slate-500">{t('pinv.monthly_rate')}</span> <strong className="ml-2">{me.fixedRateMonthly}%</strong></div>
                  : <div><span className="text-slate-500">{t('pinv.pct_interest')}</span> <strong className="ml-2">{me.equityPercentInterest}%</strong></div>
                }
                <div><span className="text-slate-500">{t('pinv.admin_commission')}</span> <strong className="ml-2">{me.commissionPercent}%</strong></div>
                <div><span className="text-slate-500">{t('pinv.capital')}</span> <strong className="ml-2">{formatCurrency(Number(me.capitalContributed) || 0)}</strong></div>
              </div>
            </Card>

            {/* Pendiente neto */}
            <Card>
              <h2 className="section-title mb-3">{t('pinv.next_payout')}</h2>
              <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
                <div className="flex justify-between"><span>{t('pinv.interest_life')}</span><strong>{formatCurrency(Number(life.grossInterest) || 0)}</strong></div>
                <div className="flex justify-between"><span>{t('pinv.mora_life')}</span><strong>{formatCurrency(Number(life.grossMora) || 0)}</strong></div>
                <div className="flex justify-between text-slate-600"><span>{t('pinv.minus_commission').replace('{n}', String(me.commissionPercent))}</span><span>−{formatCurrency(Number(life.commissionAmount) || 0)}</span></div>
                <div className="flex justify-between text-slate-600"><span>{t('pinv.minus_received')}</span><span>−{formatCurrency(Number(rcvd.totalPayoutsAmount) || 0)}</span></div>
                <div className="flex justify-between font-bold text-emerald-700 pt-2 border-t border-slate-200">
                  <span>{t('pinv.pending_net')}</span><span>{formatCurrency(Number(rcvd.pending) || 0)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">{t('pinv.next_note')}</p>
            </Card>
          </>
        )}

        {tab === 'loans' && (
          <Card>
            <h2 className="section-title mb-3">{t('pinv.loans_title').replace('{n}', String(loans.length))}</h2>
            {loans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_loan_no')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_client')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_disburse')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_principal')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_mora')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_status')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_disbursed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l: any) => (
                      <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-xs text-blue-700">{l.loanNumber}</td>
                        <td className="py-2 px-3 text-slate-700">{l.clientName}</td>
                        <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(l.disbursedAmount) || 0, l.currency || 'DOP')}</td>
                        <td className="py-2 px-3 text-right font-semibold text-slate-900">{formatCurrency(Number(l.principalBalance) || 0, l.currency || 'DOP')}</td>
                        <td className="py-2 px-3 text-right text-red-700">{formatCurrency(Number(l.moraBalance) || 0, l.currency || 'DOP')}</td>
                        <td className="py-2 px-3"><span className="text-xs text-slate-600">{l.status}</span></td>
                        <td className="py-2 px-3 text-xs text-slate-500">{formatDate(l.disbursementDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500 text-center py-6">{t('pinv.no_loans')}</p>}
            <p className="text-xs text-slate-400 mt-3 italic">{t('pinv.privacy_note')}</p>
          </Card>
        )}

        {tab === 'payouts' && (
          <Card>
            <h2 className="section-title mb-3">{t('pinv.payouts_title').replace('{n}', String(payouts.length))}</h2>
            {payouts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_date')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_period')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_payments')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_gross')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_commission')}</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-700">{t('pinv.h_net')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_method')}</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-700">{t('pinv.h_reference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p: any) => (
                      <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-700">{formatDate(p.paidAt)}</td>
                        <td className="py-2 px-3 text-xs text-slate-600">{formatDate(p.periodFrom)} – {formatDate(p.periodTo)}</td>
                        <td className="py-2 px-3 text-right text-slate-700">{p.paymentsCount}</td>
                        <td className="py-2 px-3 text-right text-slate-700">{formatCurrency(Number(p.grossTotal) || 0)}</td>
                        <td className="py-2 px-3 text-right text-slate-500">−{formatCurrency(Number(p.commissionAmount) || 0)}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">{formatCurrency(Number(p.netAmount) || 0)}</td>
                        <td className="py-2 px-3 text-xs text-slate-600">{p.paymentMethod || '—'}</td>
                        <td className="py-2 px-3 text-xs text-slate-500">{p.reference || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500 text-center py-6">{t('pinv.no_payouts')}</p>}
          </Card>
        )}

        <footer className="text-center text-xs text-slate-400 pt-4 pb-8">
          PrestaMax · {t('pinv.portal')}
        </footer>
      </main>
    </div>
  )
}

export default PortalInvestorPage
