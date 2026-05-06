import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { PageLoadingState } from '@/components/ui/Loading'
import { ArrowLeft } from 'lucide-react'
import api, { isAccessDenied } from '@/lib/api'
import toast from 'react-hot-toast'

interface FormData {
  firstName: string
  lastName: string
  documentType: string
  documentNumber: string
  dateOfBirth: string
  gender: string
  maritalStatus: string
  workAddress: string
  nationality: string
  phonePersonal: string
  phoneWork: string
  phoneFamily: string
  familyContactName: string
  familyRelationship: string
  whatsapp: string
  email: string
  address: string
  city: string
  province: string
  occupation: string
  employer: string
  monthlyIncome: string
  economicActivity: string
  consentDataProcessing: boolean
  consentWhatsapp: boolean
  notes: string
}

const ClientFormPage: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  // isLoading only when editing an existing client (id is a real UUID, not undefined or 'new')
  const isEditMode = !!id && id !== 'new'
  const [isLoading, setIsLoading] = useState(isEditMode)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    documentType: 'cedula',
    documentNumber: '',
    dateOfBirth: '',
    gender: '',
    maritalStatus: '',
    nationality: 'Dominicana',
    phonePersonal: '',
    phoneWork: '',
    phoneFamily: '',
    familyContactName: '',
    familyRelationship: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    province: '',
    occupation: '',
    employer: '',
    workAddress: '',
    monthlyIncome: '',
    economicActivity: '',
    consentDataProcessing: false,
    consentWhatsapp: false,
    notes: '',
  })

  useEffect(() => {
    if (isEditMode) {
      const fetchClient = async () => {
        try {
          const response = await api.get(`/clients/${id}`)
          // Backend returns the client object directly (not wrapped in { data: ... })
          const client = response.data
          setFormData({
            firstName: client.firstName || '',
            lastName: client.lastName || '',
            // Backend uses id_type/id_number → camelized to idType/idNumber
            documentType: client.idType || client.documentType || 'cedula',
            documentNumber: client.idNumber || client.documentNumber || '',
            dateOfBirth: client.birthDate || client.dateOfBirth || '',
            gender: client.gender || '',
            maritalStatus: client.maritalStatus || '',
            workAddress: client.workAddress || '',
            nationality: client.nationality || 'Dominicana',
            phonePersonal: client.phonePersonal || '',
            phoneWork: client.phoneWork || '',
            phoneFamily: client.phoneFamily || '',
            familyContactName: client.familyContactName || '',
            familyRelationship: client.familyRelationship || '',
            whatsapp: client.whatsapp || '',
            email: client.email || '',
            address: client.address || '',
            city: client.city || '',
            province: client.province || '',
            occupation: client.occupation || '',
            employer: client.employer || '',
            monthlyIncome: client.monthlyIncome ? client.monthlyIncome.toString() : '',
            economicActivity: client.economicActivity || '',
            consentDataProcessing: !!client.consentDataProcessing,
            consentWhatsapp: !!client.consentWhatsapp,
            notes: client.notes || '',
          })
        } catch (error) {
          if (!isAccessDenied(error)) toast.error('Error al cargar los datos del cliente')
          navigate('/clients')
        } finally {
          setIsLoading(false)
        }
      }
      fetchClient()
    }
  }, [id, isEditMode, navigate])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.firstName.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    if (!formData.lastName.trim()) {
      toast.error('El apellido es requerido')
      return
    }
    if (!formData.documentNumber.trim()) {
      toast.error('El número de documento es requerido')
      return
    }
    if (!formData.phonePersonal.trim()) {
      toast.error('El teléfono personal es requerido')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        idType: formData.documentType,      // backend uses id_type
        idNumber: formData.documentNumber.trim(), // backend uses id_number
        dateOfBirth: formData.dateOfBirth || null,
        gender: formData.gender || null,
        maritalStatus: formData.maritalStatus || null,
        workAddress: formData.workAddress || null,
        nationality: formData.nationality,
        phonePersonal: formData.phonePersonal.trim(),
        phoneWork: formData.phoneWork.trim() || null,
        phoneFamily: formData.phoneFamily.trim() || null,
        familyContactName: formData.familyContactName.trim() || null,
        familyRelationship: formData.familyRelationship.trim() || null,
        whatsapp: formData.whatsapp.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        province: formData.province.trim() || null,
        occupation: formData.occupation.trim() || null,
        employer: formData.employer.trim() || null,
        monthlyIncome: formData.monthlyIncome ? parseFloat(formData.monthlyIncome) : null,
        economicActivity: formData.economicActivity.trim() || null,
        consentDataProcessing: formData.consentDataProcessing,
        consentWhatsapp: formData.consentWhatsapp,
        notes: formData.notes.trim() || null,
      }

      if (!isEditMode) {
        await api.post('/clients', payload)
        toast.success('Cliente creado exitosamente')
      } else {
        await api.put(`/clients/${id}`, payload)
        toast.success('Cliente actualizado exitosamente')
      }

      navigate('/clients')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Error al guardar el cliente'
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <PageLoadingState />
  }

  const isEditing = isEditMode
  const pageTitle = isEditing ? 'Editar Cliente' : 'Nuevo Cliente'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate('/clients')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <p className="text-slate-600 text-sm mt-1">
            {isEditing ? 'Actualiza los datos del cliente' : 'Completa la información del cliente'}
          </p>
        </div>
      </div>

      {/* Datos Personales */}
      <Card>
        <h3 className="section-title mb-6">Datos Personales</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            placeholder="Juan"
            required
          />
          <Input
            label="Apellido"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            placeholder="Pérez"
            required
          />
          <Select
            label="Tipo de Documento"
            name="documentType"
            value={formData.documentType}
            onChange={handleChange}
            options={[
              { value: 'cedula', label: 'Cédula' },
              { value: 'passport', label: 'Pasaporte' },
              { value: 'rnc', label: 'RNC' },
            ]}
            required
          />
          <Input
            label="Número de Documento"
            name="documentNumber"
            value={formData.documentNumber}
            onChange={handleChange}
            placeholder="001-1234567-8"
            required
          />
          <Input
            label="Fecha de Nacimiento"
            name="dateOfBirth"
            type="date"
            value={formData.dateOfBirth}
            onChange={handleChange}
          />
          <Select
            label="Género"
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            placeholder="-- Selecciona --"
            options={[
              { value: 'male', label: 'Masculino' },
              { value: 'female', label: 'Femenino' },
              { value: 'other', label: 'Otro' },
            ]}
          />
          <Select
            label="Estado Civil"
            name="maritalStatus"
            value={formData.maritalStatus}
            onChange={handleChange}
            placeholder="-- Selecciona --"
            options={[
              { value: 'single', label: 'Soltero' },
              { value: 'married', label: 'Casado' },
              { value: 'divorced', label: 'Divorciado' },
              { value: 'widowed', label: 'Viudo' },
              { value: 'common_law', label: 'Unión Libre' },
            ]}
          />
          <Input
            label="Nacionalidad"
            name="nationality"
            value={formData.nationality}
            onChange={handleChange}
            placeholder="Dominicana"
          />
        </div>
      </Card>

      {/* Contacto */}
      <Card>
        <h3 className="section-title mb-6">Contacto</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Teléfono Personal"
            name="phonePersonal"
            type="tel"
            value={formData.phonePersonal}
            onChange={handleChange}
            placeholder="809-555-0001"
            required
          />
          <Input
            label="Teléfono Laboral"
            name="phoneWork"
            type="tel"
            value={formData.phoneWork}
            onChange={handleChange}
            placeholder="809-555-0002"
          />
          <Input
            label="Teléfono Familiar"
            name="phoneFamily"
            type="tel"
            value={formData.phoneFamily}
            onChange={handleChange}
            placeholder="809-555-0003"
          />
          <Input
            label="WhatsApp"
            name="whatsapp"
            type="tel"
            value={formData.whatsapp}
            onChange={handleChange}
            placeholder="809-555-0001"
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="cliente@example.com"
            className="md:col-span-2"
          />
          <Input
            label="Nombre del Contacto Familiar"
            name="familyContactName"
            value={formData.familyContactName}
            onChange={handleChange}
            placeholder="María García"
          />
          <Input
            label="Relación Familiar"
            name="familyRelationship"
            value={formData.familyRelationship}
            onChange={handleChange}
            placeholder="Hermana"
          />
        </div>
      </Card>

      {/* Dirección */}
      <Card>
        <h3 className="section-title mb-6">Dirección</h3>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Calle Principal 123, Apartamento 5"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              rows={3}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Input
            label="Ciudad"
            name="city"
            value={formData.city}
            onChange={handleChange}
            placeholder="Santo Domingo"
          />
          <Input
            label="Provincia"
            name="province"
            value={formData.province}
            onChange={handleChange}
            placeholder="Santo Domingo"
          />
        </div>
      </Card>

      {/* Información Económica */}
      <Card>
        <h3 className="section-title mb-6">Información Económica</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Ocupación"
            name="occupation"
            value={formData.occupation}
            onChange={handleChange}
            placeholder="Ingeniero"
          />
          <Input
            label="Empleador"
            name="employer"
            value={formData.employer}
            onChange={handleChange}
            placeholder="Empresa XYZ"
          />
          <Input
            label="Dirección de la Empresa"
            name="workAddress"
            value={formData.workAddress}
            onChange={handleChange}
            placeholder="Av. Winston Churchill 123, Piantini"
            className="md:col-span-2"
          />
          <Input
            label="Ingresos Mensuales"
            name="monthlyIncome"
            type="number"
            value={formData.monthlyIncome}
            onChange={handleChange}
            placeholder="25000"
          />
          <Input
            label="Actividad Económica"
            name="economicActivity"
            value={formData.economicActivity}
            onChange={handleChange}
            placeholder="Profesional independiente"
          />
        </div>
      </Card>

      {/* Opciones */}
      <Card>
        <h3 className="section-title mb-6">Opciones</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="consentDataProcessing"
              checked={formData.consentDataProcessing}
              onChange={handleChange}
              className="w-4 h-4 rounded border-slate-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
            />
            <span className="text-sm font-medium text-slate-700">
              Autoriza procesamiento de datos
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="consentWhatsapp"
              checked={formData.consentWhatsapp}
              onChange={handleChange}
              className="w-4 h-4 rounded border-slate-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
            />
            <span className="text-sm font-medium text-slate-700">
              Autoriza notificaciones por WhatsApp
            </span>
          </label>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Notas adicionales sobre el cliente..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-base transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
              rows={3}
            />
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate('/clients')}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          isLoading={isSaving}
          disabled={isSaving}
        >
          {isEditing ? 'Actualizar Cliente' : 'Crear Cliente'}
        </Button>
      </div>
    </form>
  )
}

export default ClientFormPage
