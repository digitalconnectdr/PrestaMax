import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { Users, Search, Plus, Eye, Edit, Trash2 } from 'lucide-react'
import { Client } from '@/types'
import { formatDate } from '@/lib/utils'
import api, { isAccessDenied, isSubscriptionExpired } from '@/lib/api'
import toast from 'react-hot-toast'
import { useT } from '@/lib/i18n'

const ClientsPage: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [scoreFilter, setScoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const { can } = usePermission()
  const t = useT()

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await api.get('/clients?limit=200')
        setClients(response.data.data || [])
      } catch (error) {
        if (!isAccessDenied(error) && !isSubscriptionExpired(error)) toast.error(t('cli.load_error'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchClients()
  }, [])

  if (isLoading) {
    return <PageLoadingState />
  }

  const filteredClients = clients.filter((c) => {
    const name = c.firstName && c.lastName ? `${c.firstName} ${c.lastName}` : (c as any).fullName || ''
    const matchSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ((c as any).idNumber || c.documentNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      ((c as any).phonePersonal || c.phone || '').includes(searchTerm)
    const matchScore = !scoreFilter || (() => {
      const sc = Number((c as any).score ?? c.score ?? 0)
      if (scoreFilter === 'excelente') return sc >= 85
      if (scoreFilter === 'muy_bueno') return sc >= 70 && sc < 85
      if (scoreFilter === 'bueno')     return sc >= 50 && sc < 70
      if (scoreFilter === 'regular')   return sc >= 30 && sc < 50
      if (scoreFilter === 'deficiente') return sc < 30
      return true
    })()
    const matchStatus = !statusFilter || (statusFilter === 'active' ? (c as any).isActive !== 0 : (c as any).isActive === 0)
    return matchSearch && matchScore && matchStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">{t('nav.clients')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('cli.subtitle')}</p>
        </div>
        {can('clients.create') && (
          <Button onClick={() => navigate('/clients/new')} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('dash.quick.new_client')}
          </Button>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            type="text"
            placeholder={t('cli.search_ph')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="md:col-span-1"
          />
          <select
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value)}
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('cli.all_status')}</option>
            <option value="active">{t('cli.status_active')}</option>
            <option value="inactive">{t('cli.status_inactive')}</option>
          </select>
        </div>
      </Card>

      {/* Clients Table */}
      {filteredClients.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
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
                    <td className="py-3 px-4 text-slate-500">#{idx + 1}</td>
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
                          className="p-1 hover:bg-blue-100 rounded transition-colors text-blue-600"
                          title={t('cli.view_detail')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {can('clients.edit') && (
                          <button
                            onClick={() => navigate(`/clients/${client.id}/edit`)}
                            className="p-1 hover:bg-amber-100 rounded transition-colors text-amber-600"
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
