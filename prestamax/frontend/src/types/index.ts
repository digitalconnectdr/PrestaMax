// User & Auth
export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  avatar?: string
  tenantId: string
  createdAt: string
  updatedAt: string
}

export type UserRole = 'super_admin' | 'tenant_admin' | 'manager' | 'officer' | 'collector' | 'viewer'

// Tenant
export interface Tenant {
  id: string
  name: string
  logo?: string
  website?: string
  currency: string
  country: string
  documentType: string
  createdAt: string
  updatedAt: string
}

export interface TenantMembership {
  id: string
  userId: string
  tenantId: string
  tenant: Tenant
  role: UserRole
  permissions: string[]
  createdAt: string
}

// Client
export interface Client {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  secondaryPhone?: string
  documentType: string
  documentNumber: string
  dateOfBirth: string
  address: string
  city: string
  province: string
  zipCode: string
  nationality: string
  maritalStatus: string
  occupation: string
  employer?: string
  monthlyIncome?: number
  score: number
  status: 'active' | 'inactive' | 'blocked'
  createdAt: string
  updatedAt: string
  tenantId: string
}

// Loan Product
export interface LoanProduct {
  id: string
  name: string
  code: string
  description?: string
  minAmount: number
  maxAmount: number
  minTerm: number
  maxTerm: number
  interestRate: number
  interestType: 'fixed' | 'variable'
  paymentFrequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
  requiresGuarantor: boolean
  requiresCollateral: boolean
  status: 'active' | 'inactive'
  tenantId: string
  createdAt: string
}

// Loan
export interface Loan {
  id: string
  loanNumber: string
  clientId: string
  client?: Client
  productId: string
  product?: LoanProduct
  principal: number
  interestRate: number
  term: number
  paymentFrequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
  disbursementDate: string
  maturityDate: string
  status: LoanStatus
  approvedBy?: string
  approvedAt?: string
  collateralDescription?: string
  guarantor?: Guarantor
  documents?: Document[]
  installments?: Installment[]
  tenantId: string
  createdAt: string
  updatedAt: string
}

export type LoanStatus =
  | 'draft'
  | 'under_review'
  | 'pending_docs'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'active'
  | 'current'
  | 'overdue'
  | 'in_mora'
  | 'restructured'
  | 'liquidated'
  | 'written_off'
  | 'cancelled'

// Installment / Payment schedule
export interface Installment {
  id: string
  loanId: string
  installmentNumber: number
  dueDate: string
  principal: number
  interest: number
  total: number
  paid: number
  mora: number
  status: 'pending' | 'paid' | 'overdue' | 'partial'
  lastPaymentDate?: string
  createdAt: string
}

// Payment
export interface Payment {
  id: string
  loanId: string
  loan?: Loan
  clientId: string
  client?: Client
  amount: number
  principalAmount: number
  interestAmount: number
  moraAmount: number
  paymentDate: string
  paymentMethod: 'cash' | 'check' | 'transfer' | 'card' | 'other'
  reference?: string
  collectorId?: string
  collector?: User
  receiptNumber?: string
  notes?: string
  tenantId: string
  createdAt: string
}

// Receipt
export interface Receipt {
  id: string
  receiptNumber: string
  series: string
  paymentId: string
  payment?: Payment
  loanId: string
  loan?: Loan
  clientId: string
  client?: Client
  amount: number
  breakdown: {
    principal: number
    interest: number
    mora: number
  }
  paymentDate: string
  issuedBy?: string
  branch?: string
  tenantId: string
  createdAt: string
}

// Contract
export interface Contract {
  id: string
  contractNumber: string
  loanId: string
  loan?: Loan
  clientId: string
  client?: Client
  templateId?: string
  contentHtml: string
  status: 'draft' | 'signed' | 'archived'
  signedDate?: string
  signatureImageUrl?: string
  fileUrl?: string
  tenantId: string
  createdAt: string
  updatedAt: string
}

// Guarantor
export interface Guarantor {
  id: string
  loanId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  documentNumber: string
  address: string
  relationship: string
  createdAt: string
}

// Document
export interface Document {
  id: string
  loanId?: string
  clientId?: string
  name: string
  type: string
  fileUrl: string
  uploadedBy: string
  uploadedAt: string
  expiryDate?: string
}

// Dashboard metrics
export interface DashboardMetrics {
  totalPortfolio: number
  activePortfolio: number
  moraPortfolio: number
  todayCollections: number
  totalClients: number
  totalLoans: number
  activeLoans: number
  overdueLoans: number
  moraLoans: number
  averageScore: number
  totalRevenueMonth: number
  revenueGrowth: number
}

// Reports
export interface PortfolioReport {
  total: number
  active: number
  overdue: number
  mora: number
  activePercentage: number
  overduePercentage: number
  moraPercentage: number
}

export interface MoraReport {
  days_1_7: number
  days_8_15: number
  days_16_30: number
  days_plus_30: number
  total: number
}

export interface CollectionsReport {
  date: string
  amount: number
  collectorId?: string
  collectorName?: string
}
