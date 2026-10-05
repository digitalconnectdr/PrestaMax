import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { Users, Search, Plus, Eye, Edit, Trash2, Download } from 'lucide-react'
import { Client } from '@/types'
import { formatDate } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import { downloadServerExport } from '@/lib/exportUtils'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

// Paginación en el servidor: la pantalla nunca carga todos los clientes, solo la página actual (tabla y tarjetas comparten estos datos).
const PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 350

const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([])
  const [searchInput, setSearchInput] = useState('')   // lo que se escribe
  const [searchTerm, setSearchTerm] = useState('')     // lo que se consulta (con debounce)
  const [scoreFilter, setScoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)     // solo la primera carga bloquea la pantalla
  const [isFetching, setIsFetching] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const requestId = useRef(0)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const navigate = useNavigate()
  const { can } = usePermission()
  const t = useT()

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      const is_active = statusFilter === 'active' ? 'true' : statusFilter === 'inactive' ? 'false' : undefined
      await downloadServerExport('/clients/export', { search: searchTerm, is_active }, format, 'clientes')
      toast.success(t('export.success'))
    } catch {
      toast.error(t('export.error'))
    } finally {
      setExporting(null)
    }
  }

  // Búsqueda con debounce: al cambiar el término se vuelve a la página 1 (un solo cambio de estado → un solo fetch)
  useEffect(() => {
    if (searchInput === searchTerm) return
    const h = setTimeout(() => { setSearchTerm(searchInput.trim()); setPage(1) }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(h)
  }, [searchInput, searchTerm])

  // Un único efecto consulta el servidor (página + búsqueda + filtros). Una respuesta vieja nunca pisa a una más reciente.
  useEffect(() => {
    const id = ++requestId.current
    setIsFetching(true)
    setLoadError(false)
    const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE }
    if (searchTerm) params.search = searchTerm
    if (statusFilter) params.is_active = statusFilter === 'active' ? 'true' : 'false'
    if (scoreFilter) params.score_band = scoreFilter
    api.get('/clients', { params })
      .then((res) => {
        if (id !== requestId.current) return
        const d = res.data || {}
        setClients(d.items || d.data || [])
        setTotal(d.total || 0)
        setTotalPages(d.totalPages || 1)
        // el servidor acota páginas fuera de rango (p. ej. tras borrar clientes): se vuelve a la última válida
        if (d.page && d.page !== page) setPage(d.page)
      })
      .catch((error) => {
        if (id !== requestId.current) return
        setLoadError(true)
        if (!isAccessDenied(error) && !isSubscriptionExpired(error)) toast.error(t('cli.load_error'))
      })
      .finally(() => {
        if (id !== requestId.current) return
        setIsFetching(false)
        setIsLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, statusFilter, scoreFilter, reloadKey])

  if (isLoading) {
    return <PageLoadingState />
  }

  const filteredClients = clients   // el filtrado (búsqueda, score, estado) ya lo hizo el servidor

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">{t('nav.clients')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('cli.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => handleExport('xlsx')} isLoading={exporting === 'xlsx'} className="flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {t('export.excel')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} isLoading={exporting === 'pdf'} className="flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {t('export.pdf')}
          </Button>
          {can('clients.create') && (
            <Button data-tour="new-client-btn" onClick={() => navigate('/clients/new')} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('dash.quick.new_client')}
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            type="text"
            placeholder={t('cli.search_ph')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="md:col-span-1"
          />
          <select
            value={scoreFilter}
            onChange={(e) => { setScoreFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('cli.all_scores')}</option>
            <option value="excelente">{t('cli.score.excelente')}</option>
            <option value="muy_bueno">{t('cli.score.muy_bueno')}</option>
            <option value="bueno">{t('cli.score.bueno')}</option>
            <option value="regular">{t('cli.score.regular')}</option>
            <option value="deficiente">{t('cli.score.deficiente')}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('cli.all_status')}</option>
            <option value="active">{t('cli.status_active')}</option>
            <option value="inactive">{t('cli.status_inactive')}</option>
          </select>
        </div>
      </Card>

      {/* Clients Table */}
      {loadError && filteredClients.length === 0 ? (
        <Card>
          <div className="text-center py-8" role="alert" data-testid="clients-error">
            <p className="text-slate-700 font-medium">{t('cli.load_error')}</p>
            <Button className="mt-3" variant="outline" onClick={() => setReloadKey(k => k + 1)}>{t('cli.retry')}</Button>
          </div>
        </Card>
      ) : filteredClients.length === 0 && isFetching ? (
        <Card><p className="text-center text-slate-500 py-8" aria-live="polite">{t('common.loading')}</p></Card>
      ) : filteredClients.length > 0 ? (
        <Card className={isFetching ? 'opacity-60 transition-opacity' : ''} aria-busy={isFetching}>
          {/* Móvil: tarjetas (la tabla de 7 columnas partía nombres y cédulas en varias líneas) */}
          <ul className="md:hidden -mx-2 divide-y divide-slate-100" data-testid="clients-mobile-list">
            {filteredClients.map((client) => {
              const c = client as any
              const name = c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim()
              const idNum = c.idNumber || c.documentNumber || '—'
              const phone = c.phonePersonal || c.phone || '—'
              const isActive = c.isActive !== 0
              return (
                <li key={client.id} className="flex items-center gap-1 px-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="flex-1 min-w-0 text-left py-3 hover:bg-slate-50 active:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-900 truncate">{name}</p>
                      <ScoreBadge score={c.score ?? 0} compact />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{idNum} · {phone}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {isActive ? t('common.active') : t('common.inactive')}
                    </span>
                  </button>
                  {can('clients.edit') && (
                    <button
                      type="button"
                      onClick={() => navigate(`/clients/${client.id}/edit`)}
                      className="tap-target p-1 hover:bg-amber-100 rounded transition-colors text-amber-600 flex-shrink-0"
                      title={t('cli.edit_title')}
                      aria-label={t('cli.edit_title')}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.name')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.id_number')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.phone')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.score')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.status')}</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">{t('col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client, idx) => {
                  const c = client as any
                  const name = c.fullName || `${c.firstName || ''} ${c.lastName || ''}`.trim()
                  const idNum = c.idNumber || c.documentNumber || '—'
                  const phone = c.phonePersonal || c.phone || '—'
                  const score = c.score ?? 0
                  const isActive = c.isActive !== 0
                  return (
                  <tr key={client.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-500">#{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="py-3 px-4 font-medium text-slate-900">{name}</td>
                    <td className="py-3 px-4">{idNum}</td>
                    <td className="py-3 px-4">{phone}</td>
                    <td className="py-3 px-4">
                      <ScoreBadge score={score} compact />
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {isActive ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="tap-target p-1 hover:bg-blue-100 rounded transition-colors text-blue-600"
                          title={t('cli.view_detail')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {can('clients.edit') && (
                          <button
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="tap-target p-1 hover:bg-amber-100 rounded transition-colors text-amber-600"
                            title={t('cli.edit_title')}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={isFetching} />
        </Card>
      ) : (
        <EmptyState
          icon={Users}
          title={t('cli.empty_title')}
          description={searchTerm || scoreFilter || statusFilter ? t('cli.empty_filtered') : t('cli.empty_start')}
          action={{ label: t('dash.quick.new_client'), onClick: () => navigate('/clients/new') }}
        />
      )}
    </div>
  )
}

export default ClientsPage
