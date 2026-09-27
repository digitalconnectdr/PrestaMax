import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Upload, CheckCircle, AlertCircle, Camera, Loader2, Building2,
  CreditCard, User, Phone, Mail, MapPin, FileText, DollarSign, Briefcase, Users
} from 'lucide-react'
import { useT } from '@/lib/i18n'
import LanguageSwitcher from '@/components/shared/LanguageSwitcher'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface TenantInfo { id: string; name: string; email: string; phone: string }

const inputCls = 'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5'

const LoanRequestPublicPage: React.FC = () => {
  const t = useT()
  const { token } = useParams<{ token: string }>()
  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [isLoadingTenant, setIsLoadingTenant] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const frontImageRef = useRef<HTMLInputElement>(null)
  const backImageRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    // Identity
    clientName: '',
    idNumber: '',
    dateOfBirth: '',
    gender: '',
    maritalStatus: '',
    nationality: 'Dominicana',
    // Contact
    clientPhone: '',
    whatsapp: '',
    clientEmail: '',
    phoneWork: '',
    phoneFamily: '',
    // Location
    clientAddress: '',
    city: '',
    province: '',
    // Work & Economy
    occupation: '',
    employer: '',
    workAddress: '',
    monthlyIncome: '',
    economicActivity: '',
    // Family reference
    familyContactName: '',
    familyRelationship: '',
    // Loan
    loanAmount: '',
    loanTerm: '',
    loanPurpose: '',
  })

  const [images, setImages] = useState<{ front: string | null; back: string | null }>({ front: null, back: null })
  const [imagePreviews, setImagePreviews] = useState<{ front: string | null; back: string | null }>({ front: null, back: null })

  useEffect(() => {
    if (!token) { setError(t('pub.apply.invalid_link')); setIsLoadingTenant(false); return }
    fetch(`${API_BASE}/public/apply/${token}`)
      .then(r => r.json())
      .then(data => { if (data.error) setError(data.error); else setTenant(data); })
      .catch(() => setError(t('pub.apply.connect_error')))
      .finally(() => setIsLoadingTenant(false))
  }, [token])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  const handleFileChange = (side: 'front' | 'back') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert(t('pub.apply.err_image_too_large')); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      setImages(prev => ({ ...prev, [side]: base64 }))
      setImagePreviews(prev => ({ ...prev, [side]: base64 }))
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.clientName.trim()) return setError(t('pub.apply.err_name_required'))
    if (!form.clientPhone.trim()) return setError(t('pub.apply.err_phone_required'))
    if (!form.idNumber.trim()) return setError(t('pub.apply.err_id_required'))
    if (!images.front) return setError(t('pub.apply.err_front_required'))
    if (!images.back) return setError(t('pub.apply.err_back_required'))

    setIsSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/public/apply/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: form.clientName,
          clientEmail: form.clientEmail || undefined,
          clientPhone: form.clientPhone,
          clientAddress: form.clientAddress || undefined,
          idNumber: form.idNumber || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          maritalStatus: form.maritalStatus || undefined,
          nationality: form.nationality || undefined,
          whatsapp: form.whatsapp || undefined,
          city: form.city || undefined,
          province: form.province || undefined,
          phoneWork: form.phoneWork || undefined,
          phoneFamily: form.phoneFamily || undefined,
          familyContactName: form.familyContactName || undefined,
          familyRelationship: form.familyRelationship || undefined,
          occupation: form.occupation || undefined,
          employer: form.employer || undefined,
          workAddress: form.workAddress || undefined,
          monthlyIncome: form.monthlyIncome ? parseFloat(form.monthlyIncome) : undefined,
          economicActivity: form.economicActivity || undefined,
          loanAmount: form.loanAmount ? parseFloat(form.loanAmount) : undefined,
          loanPurpose: form.loanPurpose || undefined,
          loanTerm: form.loanTerm ? parseInt(form.loanTerm) : undefined,
          idFrontImage: images.front,
          idBackImage: images.back,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('pub.apply.err_submit'))
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || t('pub.apply.err_unexpected'))
    } finally { setIsSubmitting(false) }
  }

  // ── Loading
  if (isLoadingTenant) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" /><p className="text-slate-500">{t('pub.apply.loading')}</p></div>
    </div>
  )

  // ── Invalid token
  if (error && !tenant) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-md w-full text-center relative">
        <div className="absolute top-3 right-3"><LanguageSwitcher /></div>
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">{t('pub.apply.invalid_link_title')}</h2>
        <p className="text-slate-500">{error}</p>
      </div>
    </div>
  )

  // ── Success
  if (submitted) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-9 h-9 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t('pub.apply.submitted_title')}</h2>
        <p className="text-slate-500 mb-4">{t('pub.apply.submitted_desc').replace('{name}', tenant?.name || '')}</p>
        <div className="bg-slate-50 rounded-xl p-4 text-left text-sm text-slate-600">
          <p className="font-medium mb-1">{t('pub.apply.whats_next')}</p>
          <p>• {t('pub.apply.next_review')}</p>
          <p>• {t('pub.apply.next_contact_phone').replace('{phone}', form.clientPhone)}</p>
          {form.clientEmail && <p>• {t('pub.apply.next_contact_email').replace('{email}', form.clientEmail)}</p>}
        </div>
      </div>
    </div>
  )

  const SectionHeader = ({ icon: Icon, title, color = 'text-blue-600' }: { icon: any; title: string; color?: string }) => (
    <h2 className={`font-semibold text-slate-800 mb-4 flex items-center gap-2`}>
      <Icon className={`w-5 h-5 ${color}`} />{title}
    </h2>
  )

  const photoSlot = (side: 'front' | 'back', label: string) => (
    <div>
      <label className={labelCls}>{label} <span className="text-red-500">*</span></label>
      <div onClick={() => (side === 'front' ? frontImageRef : backImageRef).current?.click()}
        className={`relative border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-all h-44 flex flex-col items-center justify-center
          ${images[side] ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50'}`}>
        {imagePreviews[side] ? (
          <>
            <img src={imagePreviews[side]!} alt={label} className="absolute inset-0 w-full h-full object-cover rounded-xl" />
            <div className="absolute bottom-2 right-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />{t('pub.apply.photo_ready')}
            </div>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-xs text-slate-400 text-center px-2">{t('pub.apply.photo_tap_hint')}<br />{t('pub.apply.photo_or_file')}</p>
          </>
        )}
      </div>
      <input ref={side === 'front' ? frontImageRef : backImageRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileChange(side)} className="hidden" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-[#1e3a5f] rounded-2xl p-6 mb-6 text-white text-center relative">
          <div className="absolute top-3 right-3 [&_button]:text-white [&_button:hover]:bg-white/10">
            <LanguageSwitcher />
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-1">{tenant?.name}</h1>
          <p className="text-blue-200 text-sm">{t('pub.apply.title')}</p>
          <p className="text-white/60 text-xs mt-1">{t('pub.apply.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── 1. Datos de Identificación ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={User} title={t('pub.apply.section_identity')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('pub.apply.full_name')} <span className="text-red-500">*</span></label>
                <input value={form.clientName} onChange={set('clientName')} placeholder={t('pub.apply.full_name_ph')} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{t('pub.apply.id_number')} <span className="text-red-500">*</span></span></label>
                <input value={form.idNumber} onChange={set('idNumber')} placeholder="000-0000000-0" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.dob')}</label>
                <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.gender')}</label>
                <select value={form.gender} onChange={set('gender')} className={inputCls}>
                  <option value="">{t('pub.apply.select_placeholder')}</option>
                  <option value="male">{t('pub.apply.gender_male')}</option>
                  <option value="female">{t('pub.apply.gender_female')}</option>
                  <option value="other">{t('pub.apply.gender_other')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.marital_status')}</label>
                <select value={form.maritalStatus} onChange={set('maritalStatus')} className={inputCls}>
                  <option value="">{t('pub.apply.select_placeholder')}</option>
                  <option value="single">{t('pub.apply.marital_single')}</option>
                  <option value="married">{t('pub.apply.marital_married')}</option>
                  <option value="divorced">{t('pub.apply.marital_divorced')}</option>
                  <option value="widowed">{t('pub.apply.marital_widowed')}</option>
                  <option value="cohabiting">{t('pub.apply.marital_cohabiting')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.nationality')}</label>
                <input value={form.nationality} onChange={set('nationality')} placeholder="Dominicana" className={inputCls} />
              </div>
            </div>
          </div>

          {/* ── 2. Información de Contacto ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={Phone} title={t('pub.apply.section_contact')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{t('pub.apply.phone_personal')} <span className="text-red-500">*</span></span></label>
                <input value={form.clientPhone} onChange={set('clientPhone')} placeholder="809-000-0000" type="tel" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-green-600" />{t('pub.apply.whatsapp')}</span></label>
                <input value={form.whatsapp} onChange={set('whatsapp')} placeholder="809-000-0000" type="tel" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}><span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{t('pub.apply.email')}</span></label>
                <input value={form.clientEmail} onChange={set('clientEmail')} placeholder="correo@ejemplo.com" type="email" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.phone_work')}</label>
                <input value={form.phoneWork} onChange={set('phoneWork')} placeholder="809-000-0000" type="tel" className={inputCls} />
              </div>
            </div>
          </div>

          {/* ── 3. Dirección ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={MapPin} title={t('pub.apply.section_address')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}><span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{t('pub.apply.address')}</span></label>
                <input value={form.clientAddress} onChange={set('clientAddress')} placeholder={t('pub.apply.address_ph')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.city')}</label>
                <input value={form.city} onChange={set('city')} placeholder="Santo Domingo" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.province')}</label>
                <select value={form.province} onChange={set('province')} className={inputCls}>
                  <option value="">{t('pub.apply.select_placeholder')}</option>
                  {['Azua','Bahoruco','Barahona','Dajabón','Distrito Nacional','Duarte','El Seibo','Elías Piña','Espaillat',
                    'Hato Mayor','Hermanas Mirabal','Independencia','La Altagracia','La Romana','La Vega','María Trinidad Sánchez',
                    'Monseñor Nouel','Monte Cristi','Monte Plata','Pedernales','Peravia','Puerto Plata','Samaná','San Cristóbal',
                    'San José de Ocoa','San Juan','San Pedro de Macorís','Sánchez Ramírez','Santiago','Santiago Rodríguez',
                    'Santo Domingo','Valverde'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── 4. Información Laboral ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={Briefcase} title={t('pub.apply.section_work')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('pub.apply.occupation')}</label>
                <input value={form.occupation} onChange={set('occupation')} placeholder={t('pub.apply.occupation_ph')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.employer')}</label>
                <input value={form.employer} onChange={set('employer')} placeholder={t('pub.apply.employer_ph')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.work_address')}</label>
                <input value={form.workAddress} onChange={set('workAddress')} placeholder="Av. Winston Churchill 123, Piantini" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.monthly_income')}</label>
                <input value={form.monthlyIncome} onChange={set('monthlyIncome')} placeholder="Ej: 25000" type="number" min="0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.economic_activity')}</label>
                <select value={form.economicActivity} onChange={set('economicActivity')} className={inputCls}>
                  <option value="">{t('pub.apply.select_placeholder')}</option>
                  <option value="empleado_privado">{t('pub.apply.econ_private')}</option>
                  <option value="empleado_publico">{t('pub.apply.econ_public')}</option>
                  <option value="independiente">{t('pub.apply.econ_independent')}</option>
                  <option value="comerciante">{t('pub.apply.econ_merchant')}</option>
                  <option value="empresario">{t('pub.apply.econ_entrepreneur')}</option>
                  <option value="pensionado">{t('pub.apply.econ_retired')}</option>
                  <option value="ama_de_casa">{t('pub.apply.econ_homemaker')}</option>
                  <option value="otro">{t('pub.apply.econ_other')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── 5. Referencia Familiar ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={Users} title={t('pub.apply.section_family')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('pub.apply.family_name')}</label>
                <input value={form.familyContactName} onChange={set('familyContactName')} placeholder={t('pub.apply.family_name_ph')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.relationship')}</label>
                <select value={form.familyRelationship} onChange={set('familyRelationship')} className={inputCls}>
                  <option value="">{t('pub.apply.select_placeholder')}</option>
                  <option value="padre_madre">{t('pub.apply.rel_parent')}</option>
                  <option value="hijo_hija">{t('pub.apply.rel_child')}</option>
                  <option value="hermano_hermana">{t('pub.apply.rel_sibling')}</option>
                  <option value="conyuge">{t('pub.apply.rel_spouse')}</option>
                  <option value="tio_tia">{t('pub.apply.rel_uncle')}</option>
                  <option value="primo_prima">{t('pub.apply.rel_cousin')}</option>
                  <option value="amigo_amiga">{t('pub.apply.rel_friend')}</option>
                  <option value="otro">{t('pub.apply.rel_other')}</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.family_phone')}</label>
                <input value={form.phoneFamily} onChange={set('phoneFamily')} placeholder="809-000-0000" type="tel" className={inputCls} />
              </div>
            </div>
          </div>

          {/* ── 6. Información del Préstamo ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={DollarSign} title={t('pub.apply.section_loan')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('pub.apply.loan_amount')}</label>
                <input value={form.loanAmount} onChange={set('loanAmount')} placeholder="Ej: 25000" type="number" min="1" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('pub.apply.loan_term')}</label>
                <input value={form.loanTerm} onChange={set('loanTerm')} placeholder="Ej: 12" type="number" min="1" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('pub.apply.loan_purpose')}</label>
                <select value={form.loanPurpose} onChange={set('loanPurpose')} className={inputCls}>
                  <option value="">{t('pub.apply.purpose_select')}</option>
                  <option value="Negocio / Comercio">{t('pub.apply.purpose_business')}</option>
                  <option value="Educación">{t('pub.apply.purpose_education')}</option>
                  <option value="Salud / Médico">{t('pub.apply.purpose_health')}</option>
                  <option value="Hogar / Remodelación">{t('pub.apply.purpose_home')}</option>
                  <option value="Vehículo">{t('pub.apply.purpose_vehicle')}</option>
                  <option value="Deuda / Refinanciamiento">{t('pub.apply.purpose_debt')}</option>
                  <option value="Emergencia personal">{t('pub.apply.purpose_emergency')}</option>
                  <option value="Otro">{t('pub.apply.purpose_other')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── 7. Fotos de la Cédula ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-600" />{t('pub.apply.section_photos')} <span className="text-red-500">*</span>
            </h2>
            <p className="text-xs text-slate-400 mb-4">{t('pub.apply.photos_hint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {photoSlot('front', t('pub.apply.photo_front'))}
              {photoSlot('back', t('pub.apply.photo_back'))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={isSubmitting}
            className="w-full py-4 bg-[#1e3a5f] hover:bg-[#2a4d7a] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-base shadow-sm">
            {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin" />{t('pub.apply.submitting')}</> : <><CreditCard className="w-5 h-5" />{t('pub.apply.submit_button')}</>}
          </button>

          <p className="text-center text-xs text-slate-400 pb-4">
            {t('pub.apply.consent').replace('{name}', tenant?.name || '')}
          </p>
        </form>
      </div>
    </div>
  )
}

export default LoanRequestPublicPage
