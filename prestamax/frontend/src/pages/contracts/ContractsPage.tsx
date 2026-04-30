import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PageLoadingState } from '@/components/ui/Loading'
import EmptyState from '@/components/ui/EmptyState'
import { FileCheck, Eye, PenLine, Plus, CheckCircle, Clock, Printer, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface Contract {
  id: string
  contractNumber: string
  generatedAt: string
  clientName: string
  loanNumber: string
  loanId: string
  signatureMode: string
  status: string
  signedAt: string | null
  signedBy: string | null
  content: string
}

interface Loan {
  id: string
  loanNumber: string
  clientName: string
  status: string
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  generated: { label: 'Generado', cls: 'bg-amber-100 text-amber-700' },
  signed: { label: 'Firmado', cls: 'bg-emerald-100 text-emerald-700' },
  voided: { label: 'Anulado', cls: 'bg-slate-100 text-slate-500' },
}

const ContractsPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermission()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [signatureFilter, setSignatureFilter] = useState('')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showContentModal, setShowContentModal] = useState<Contract | null>(null)
  const [selectedLoanId, setSelectedLoanId] = useState(searchParams.get('loanId') || '')
  const [isGenerating, setIsGenerating] = useState(false)

  const fetchContracts = async () => {
    try {
      const res = await api.get('/contracts')
      setContracts(res.data || [])
    } catch (err) {
      if (!isAccessDenied(err)) toast.error('Error al cargar contratos')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchContracts()
    api.get('/loans?limit=100&status=active').then((res) => {
      setLoans(res.data.data || [])
    }).catch(() => {})
  }, [])

  if (isLoading) return <PageLoadingState />

  const filtered = contracts.filter((c) => {
    const matchSearch =
      (c.contractNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.loanNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = !statusFilter || c.status === statusFilter
    const matchSig = !signatureFilter || c.signatureMode === signatureFilter
    return matchSearch && matchStatus && matchSig
  })

  const handleGenerate = async () => {
    if (!selectedLoanId) {
      toast.error('Selecciona un préstamo')
      return
    }
    try {
      setIsGenerating(true)
      await api.post('/contracts', { loanId: selectedLoanId })
      toast.success('Contrato generado exitosamente')
      setShowGenerateModal(false)
      setSelectedLoanId('')
      fetchContracts()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al generar contrato')
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrintContract = (contract: Contract) => {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      toast.error('Por favor permite las ventanas emergentes para imprimir')
      return
    }

    // Use the embedded content if it has @page rules already (e.g., Pagaré Notarial template)
    // Otherwise wrap with a generic legal-paper shell
    const hasPageRule = contract.content.includes('@page')
    const html = hasPageRule
      ? `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${contract.contractNumber}</title></head><body>${contract.content}</body></html>`
      : `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>${contract.contractNumber}</title>
<style>
  @page { size: legal portrait; margin: 2cm 2.5cm 2.5cm 2.5cm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.5; color: #000; background: #fff; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 4px 8px; }
  @media screen { body { padding: 2rem; max-width: 900px; margin: auto; } }
</style>
</head><body>${contract.content}</body></html>`

    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    // Small delay so styles load before print dialog
    setTimeout(() => { win.print() }, 400)
  }

  const handleDelete = async (contract: Contract) => {
    if (!confirm(`¿Eliminar contrato ${contract.contractNumber}? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/contracts/${contract.id}`)
      toast.success('Contrato eliminado')
      fetchContracts()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al eliminar contrato')
    }
  }

  const handleSign = async (contract: Contract) => {
    const signedBy = prompt('Nombre del firmante (o deja vacío para firma digital):')
    if (signedBy === null) return
    try {
      await api.post(`/contracts/${contract.id}/sign`, {
        signedBy: signedBy || 'Firma digital',
        signatureEvidenceUrl: null,
      })
      toast.success('Contrato firmado')
      fetchContracts()
    } catch (err) {
      toast.error('Error al firmar contrato')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Contratos</h1>
          <p className="text-slate-600 text-sm mt-1">Gestión de contratos de préstamos</p>
        </div>
        {can('contracts.create') && (
          <Button onClick={() => setShowGenerateModal(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Generar Contrato
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            type="text"
            placeholder="Buscar por número, cliente o préstamo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="generated">Generados</option>
            <option value="signed">Firmados</option>
            <option value="voided">Anulados</option>
          </select>
          <select
            value={signatureFilter}
            onChange={(e) => setSignatureFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las firmas</option>
            <option value="physical">Física</option>
            <option value="digital">Digital</option>
          </select>
        </div>
      </Card>

      {/* Contracts Table */}
      {filtered.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Número</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Fecha</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Cliente</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Préstamo</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Firma</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Estado</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contract) => {
                  const statusInfo = STATUS_LABELS[contract.status] || STATUS_LABELS.generated
                  return (
                    <tr key={contract.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-medium text-blue-700">{contract.contractNumber}</td>
                      <td className="py-3 px-4 text-slate-600">{formatDate(contract.generatedAt)}</td>
                      <td className="py-3 px-4 font-medium">{contract.clientName}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/loans/${contract.loanId}`)}
                          className="text-blue-600 hover:underline"
                        >
                          {contract.loanNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-xs capitalize">{contract.signatureMode === 'physical' ? 'Física' : 'Digital'}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {contract.content && (
                            <>
                              <button
                                onClick={() => setShowContentModal(contract)}
                                className="p-1 hover:bg-blue-100 rounded text-blue-600 transition-colors"
                                title="Ver contrato"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handlePrintContract(contract)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                                title="Imprimir / Guardar PDF"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {contract.status === 'generated' && (
                            <>
                              {can('contracts.sign') && (
                                <button
                                  onClick={() => handleSign(contract)}
                                  className="p-1 hover:bg-green-100 rounded text-green-600 transition-colors"
                                  title="Firmar"
                                >
                                  <PenLine className="w-4 h-4" />
                                </button>
                              )}
                              {can('contracts.delete') && (
                                <button
                                  onClick={() => handleDelete(contract)}
                                  className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors"
                                  title="Eliminar contrato"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                          {contract.status === 'signed' && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle className="w-3 h-3" />
                              {contract.signedAt ? formatDate(contract.signedAt) : 'Firmado'}
                            </span>
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
          icon={FileCheck}
          title="Sin contratos"
          description={searchTerm || statusFilter ? 'No hay contratos que coincidan' : 'Los contratos generados aparecerán aquí'}
          action={can('contracts.create') ? { label: 'Generar Contrato', onClick: () => setShowGenerateModal(true) } : undefined}
        />
      )}

      {/* Generate Contract Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Generar Contrato</h2>
              <button onClick={() => setShowGenerateModal(false)} className="p-1 hover:bg-slate-100 rounded">
                ✕
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Seleccionar Préstamo</label>
              <select
                value={selectedLoanId}
                onChange={(e) => setSelectedLoanId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Selecciona un préstamo activo --</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.loanNumber} – {l.clientName}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Solo se muestran préstamos activos</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowGenerateModal(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-blue-600"
                onClick={handleGenerate}
                disabled={isGenerating || !selectedLoanId}
              >
                {isGenerating ? 'Generando...' : 'Generar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Contract Content Modal */}
      {showContentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h2 className="section-title">{showContentModal.contractNumber}</h2>
                <p className="text-sm text-slate-500">{showContentModal.clientName} · {showContentModal.loanNumber}</p>
              </div>
              <button onClick={() => setShowContentModal(null)} className="p-1 hover:bg-slate-100 rounded">
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {showContentModal.content ? (
                <div
                  className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap font-mono text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: showContentModal.content.replace(/\n/g, '<br/>') }}
                />
              ) : (
                <div className="flex items-center justify-center h-32 text-slate-400">
                  <div className="text-center">
                    <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Contrato sin contenido (plantilla no configurada)</p>
                    <p className="text-xs mt-1">Ve a Configuración → Plantillas para configurar el contenido</p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center flex-shrink-0">
              <div className="text-sm text-slate-500">
                {showContentModal.signedAt && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    Firmado {formatDate(showContentModal.signedAt)} por {showContentModal.signedBy}
                  </span>
                )}
                {!showContentModal.signedAt && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock className="w-4 h-4" />
                    Pendiente de firma
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {showContentModal.content && (
                  <Button
                    variant="outline"
                    className="flex items-center gap-1.5"
                    onClick={() => handlePrintContract(showContentModal)}
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir / PDF
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShowContentModal(null)}>Cerrar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default ContractsPage
