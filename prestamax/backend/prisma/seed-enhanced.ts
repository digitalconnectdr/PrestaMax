import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PestaMax database with enhanced test data...');

  // Plans
  const plans = await Promise.all([
    prisma.plan.upsert({ where: { slug: 'basico' }, update: {}, create: { name: 'Basico', slug: 'basico', price_monthly: 29, max_collectors: 1, max_clients: 50, max_users: 3 } }),
    prisma.plan.upsert({ where: { slug: 'profesional' }, update: {}, create: { name: 'Profesional', slug: 'profesional', price_monthly: 79, max_collectors: 5, max_clients: 500, max_users: 10 } }),
    prisma.plan.upsert({ where: { slug: 'empresarial' }, update: {}, create: { name: 'Empresarial', slug: 'empresarial', price_monthly: 199, max_collectors: 20, max_clients: 5000, max_users: 50 } }),
    prisma.plan.upsert({ where: { slug: 'premium' }, update: {}, create: { name: 'Premium', slug: 'premium', price_monthly: 499, max_collectors: -1, max_clients: -1, max_users: -1 } }),
  ]);
  console.log('✅ Plans created');

  // Platform admin
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@prestamax.com' },
    update: {},
    create: { email: 'admin@prestamax.com', password_hash: adminHash, full_name: 'Administrador PestaMax', platform_role: 'platform_owner', is_active: true }
  });
  console.log('✅ Admin user created: admin@prestamax.com / Admin123!');

  // Tenant 1
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'prestamos-garcia' },
    update: {},
    create: { name: 'Prestamos Garcia & Asociados', slug: 'prestamos-garcia', email: 'info@garcia.com', phone: '809-555-1000', currency: 'DOP', plan_id: plans[1].id, is_active: true }
  });
  await prisma.tenantSettings.upsert({
    where: { tenant_id: tenant1.id },
    update: {},
    create: { tenant_id: tenant1.id, mora_rate_daily: 0.001, mora_grace_days: 3, rebate_enabled: true }
  });

  // Branch for tenant 1
  const branch1 = await prisma.branch.upsert({
    where: { id: 'branch-garcia-principal' },
    update: {},
    create: { id: 'branch-garcia-principal', tenant_id: tenant1.id, name: 'Sucursal Principal', address: 'Calle Principal #123, Santo Domingo', phone: '809-555-1001' }
  });

  // Additional branches
  const branch2 = await prisma.branch.upsert({
    where: { id: 'branch-garcia-santiago' },
    update: {},
    create: { id: 'branch-garcia-santiago', tenant_id: tenant1.id, name: 'Sucursal Santiago', address: 'Av. Independencia #456, Santiago', phone: '809-555-2001' }
  });

  // Add admin to tenant 1
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: admin.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: admin.id, tenant_id: tenant1.id, branch_id: branch1.id, roles: JSON.stringify(['tenant_owner']), permissions: JSON.stringify({ all: true }) }
  });

  // Tenant users
  const userHash = await bcrypt.hash('Demo123!', 12);
  const officer1 = await prisma.user.upsert({
    where: { email: 'oficial@garcia.com' },
    update: {},
    create: { email: 'oficial@garcia.com', password_hash: userHash, full_name: 'Carlos Ramirez', is_active: true }
  });
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: officer1.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: officer1.id, tenant_id: tenant1.id, branch_id: branch1.id, roles: JSON.stringify(['loan_officer', 'cashier']) }
  });

  const officer2 = await prisma.user.upsert({
    where: { email: 'oficial2@garcia.com' },
    update: {},
    create: { email: 'oficial2@garcia.com', password_hash: userHash, full_name: 'Patricia Gonzalez', is_active: true }
  });
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: officer2.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: officer2.id, tenant_id: tenant1.id, branch_id: branch2.id, roles: JSON.stringify(['loan_officer', 'cashier']) }
  });

  // Collectors
  const collector1 = await prisma.user.upsert({
    where: { email: 'cobrador@garcia.com' },
    update: {},
    create: { email: 'cobrador@garcia.com', password_hash: userHash, full_name: 'Miguel Angel Perez', is_active: true }
  });
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: collector1.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: collector1.id, tenant_id: tenant1.id, branch_id: branch1.id, roles: JSON.stringify(['collector']) }
  });

  const collector2 = await prisma.user.upsert({
    where: { email: 'cobrador2@garcia.com' },
    update: {},
    create: { email: 'cobrador2@garcia.com', password_hash: userHash, full_name: 'Rosa Martinez', is_active: true }
  });
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: collector2.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: collector2.id, tenant_id: tenant1.id, branch_id: branch2.id, roles: JSON.stringify(['collector']) }
  });

  console.log('✅ Users and memberships created');

  // Receipt series
  await prisma.receiptSeries.upsert({
    where: { id: 'series-garcia-default' },
    update: {},
    create: { id: 'series-garcia-default', tenant_id: tenant1.id, name: 'Serie Principal', prefix: 'REC', last_number: 0, is_default: true }
  });

  // Loan products for tenant 1
  const productPersonal = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo Personal', type: 'personal', description: 'Préstamo sin garantía para personas naturales', min_amount: 1000, max_amount: 100000, rate: 5, rate_type: 'monthly', min_term: 1, max_term: 36, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'fixed_installment', requires_approval: true, allows_prepayment: true }
  });

  const productSAN = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo SAN (Semanal)', type: 'san', description: 'Préstamo grupal con cuotas semanales', min_amount: 500, max_amount: 20000, rate: 10, rate_type: 'monthly', min_term: 4, max_term: 52, term_unit: 'weeks', payment_frequency: 'weekly', amortization_type: 'fixed_installment', is_san_type: true, requires_approval: false, allows_prepayment: true }
  });

  const productReditos = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo por Reditos', type: 'reditos', description: 'Préstamo con pagos de interés solamente', min_amount: 5000, max_amount: 500000, rate: 3, rate_type: 'monthly', min_term: 6, max_term: 60, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'interest_only', is_reditos: true, requires_approval: true }
  });

  const productGarantia = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo con Garantia', type: 'guaranteed', description: 'Préstamo con garantía prendaria o hipotecaria', min_amount: 10000, max_amount: 1000000, rate: 2.5, rate_type: 'monthly', min_term: 12, max_term: 120, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'fixed_installment', requires_guarantee: true, requires_approval: true }
  });

  const productCommercial = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo Comercial', type: 'commercial', description: 'Préstamo para empresas y negocios', min_amount: 50000, max_amount: 500000, rate: 4, rate_type: 'monthly', min_term: 12, max_term: 60, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'fixed_installment', requires_approval: true, allows_prepayment: true }
  });

  console.log('✅ Loan products created');

  // Contract template
  await prisma.contractTemplate.create({
    data: {
      tenant_id: tenant1.id,
      name: 'Contrato General de Prestamo',
      type: 'general',
      is_default: true,
      body: `CONTRATO DE PRESTAMO PERSONAL

Entre {{client_name}}, portador de la cedula de identidad {{client_id}}, en adelante "EL DEUDOR",
y Prestamos Garcia & Asociados, en adelante "LA PRESTAMISTA".

MONTO: {{amount}}
TASA DE INTERES: {{rate}} mensual
PLAZO: {{term}}
FRECUENCIA DE PAGO: {{frequency}}
FECHA: {{date}}

El deudor se compromete a pagar puntualmente las cuotas establecidas en el plan de pagos adjunto.

En caso de mora, se aplicara un cargo adicional por dia de atraso segun las politicas vigentes.`
    }
  });

  // WhatsApp templates
  await prisma.whatsAppTemplate.createMany({
    data: [
      { tenant_id: tenant1.id, name: 'Confirmacion de Pago', event: 'payment_confirmation', body: 'Estimado {{client_name}}, hemos recibido su pago de RD${{amount}} para el prestamo {{loan_number}}. Gracias por su puntualidad. Saldo pendiente: RD${{balance}}.' },
      { tenant_id: tenant1.id, name: 'Recordatorio de Vencimiento', event: 'due_reminder', body: 'Estimado {{client_name}}, le recordamos que su cuota de RD${{amount}} vence el {{due_date}}. Por favor realice su pago a tiempo.' },
      { tenant_id: tenant1.id, name: 'Aviso de Mora', event: 'mora_alert', body: 'Estimado {{client_name}}, su prestamo tiene {{days}} dias de atraso. Mora acumulada: RD${{mora_amount}}. Por favor comuniquese urgente.' },
      { tenant_id: tenant1.id, name: 'Carta de Saldo', event: 'balance_letter', body: 'Estimado {{client_name}}, adjunto su estado de prestamo {{loan_number}}. Capital: RD${{capital}}. Intereses: RD${{interest}}. Mora: RD${{mora}}. Total: RD${{total}}.' },
    ],
    skipDuplicates: true
  });

  // Guarantee categories
  await prisma.guaranteeCategory.createMany({
    data: [
      { tenant_id: tenant1.id, name: 'Vehiculo' },
      { tenant_id: tenant1.id, name: 'Inmueble' },
      { tenant_id: tenant1.id, name: 'Joya' },
      { tenant_id: tenant1.id, name: 'Electrodomestico' },
      { tenant_id: tenant1.id, name: 'Otro' },
    ],
    skipDuplicates: true
  });

  console.log('✅ Contract templates, WhatsApp templates, guarantee categories created');

  // Create comprehensive client list
  const clientsData = [
    { first_name: 'Juan', last_name: 'Garcia Perez', id_number: '001-1234567-8', phone_personal: '809-555-0101', whatsapp: '8095550101', address: 'Av. 27 de Febrero #456', city: 'Santo Domingo', monthly_income: 35000, occupation: 'Comerciante', score: 4 },
    { first_name: 'Maria', last_name: 'Rodriguez Santos', id_number: '002-2345678-9', phone_personal: '809-555-0202', whatsapp: '8095550202', address: 'Calle Las Mercedes #12', city: 'Santiago', monthly_income: 28000, occupation: 'Empleada', score: 5 },
    { first_name: 'Pedro', last_name: 'Martinez Diaz', id_number: '003-3456789-0', phone_personal: '809-555-0303', whatsapp: '8095550303', address: 'Los Prados #89', city: 'La Romana', monthly_income: 22000, occupation: 'Taxista', score: 3 },
    { first_name: 'Ana', last_name: 'Lopez Fernandez', id_number: '004-4567890-1', phone_personal: '809-555-0404', whatsapp: '8095550404', address: 'Villa Mella Sector 4', city: 'Santo Domingo Norte', monthly_income: 18000, occupation: 'Costurera', score: 2 },
    { first_name: 'Luis', last_name: 'Herrera Castillo', id_number: '005-5678901-2', phone_personal: '809-555-0505', whatsapp: '8095550505', address: 'Ensanche Naco #23', city: 'Santo Domingo', monthly_income: 55000, occupation: 'Empresario', score: 5 },
    // Additional diverse clients
    { first_name: 'Roberto', last_name: 'Sanchezlopez', id_number: '006-6789012-3', phone_personal: '809-555-0606', whatsapp: '8095550606', address: 'Sector San Juan #100', city: 'San Cristobal', monthly_income: 32000, occupation: 'Mecanico', score: 3 },
    { first_name: 'Carolina', last_name: 'Nunez Rivera', id_number: '007-7890123-4', phone_personal: '809-555-0707', whatsapp: '8095550707', address: 'Calle Colon #50', city: 'La Vega', monthly_income: 26000, occupation: 'Enfermera', score: 4 },
    { first_name: 'Miguel', last_name: 'Puello Rosario', id_number: '008-8901234-5', phone_personal: '809-555-0808', whatsapp: '8095550808', address: 'Av. Central #200', city: 'Puerto Plata', monthly_income: 45000, occupation: 'Profesor', score: 5 },
  ];

  const clients = [];
  for (let i = 0; i < clientsData.length; i++) {
    const d = clientsData[i];
    const client = await prisma.client.upsert({
      where: { tenant_id_id_number: { tenant_id: tenant1.id, id_number: d.id_number } },
      update: {},
      create: {
        tenant_id: tenant1.id,
        client_number: `CLI-${String(i + 1).padStart(5, '0')}`,
        full_name: `${d.first_name} ${d.last_name}`,
        ...d,
        id_type: 'cedula',
        is_active: true,
        consent_data_processing: true,
        consent_whatsapp: true,
      }
    });
    clients.push(client);
  }
  console.log(`✅ ${clients.length} clients created`);

  // Create loans in various statuses with proper calculations
  const now = new Date();
  const disbDate = new Date(now);
  disbDate.setDate(disbDate.getDate() - 30);

  const firstPayDate = new Date(disbDate);
  firstPayDate.setMonth(firstPayDate.getMonth() + 1);

  const maturityDate = new Date(firstPayDate);
  maturityDate.setMonth(maturityDate.getMonth() + 11);

  // LOAN 1: Active personal loan - Juan Garcia (principal balance calculation)
  // Disbursed: 50000, Rate: 5% monthly, Term: 12 months
  const monthlyRate = 0.05;
  const loanAmount = 50000;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, 12)) / (Math.pow(1 + monthlyRate, 12) - 1);
  const totalInterest = monthlyPayment * 12 - loanAmount;

  // Assume 1 payment made
  const principalPaid = 3000;
  const interestPaid = 2500;
  const principalBalance = loanAmount - principalPaid;
  const interestBalance = totalInterest - interestPaid;
  const totalBalance = principalBalance + interestBalance;

  const loan1 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      client_id: clients[0].id,
      product_id: productPersonal.id,
      loan_number: 'PRE-2024-00001',
      status: 'active',
      requested_amount: 50000,
      approved_amount: 50000,
      disbursed_amount: 50000,
      rate: 5,
      rate_type: 'monthly',
      term: 12,
      term_unit: 'months',
      payment_frequency: 'monthly',
      amortization_type: 'fixed_installment',
      application_date: new Date(disbDate.getTime() - 5 * 86400000),
      approval_date: new Date(disbDate.getTime() - 2 * 86400000),
      disbursement_date: disbDate,
      first_payment_date: firstPayDate,
      maturity_date: maturityDate,
      principal_balance: principalBalance,
      interest_balance: interestBalance,
      total_balance: totalBalance,
      total_interest: totalInterest,
      total_paid_principal: principalPaid,
      total_paid_interest: interestPaid,
      total_paid: principalPaid + interestPaid,
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      collector_id: collector1.id,
      purpose: 'Capital de trabajo para negocio'
    }
  });

  // Installments for loan1
  let balance = loanAmount;
  for (let i = 1; i <= 12; i++) {
    const interest = balance * monthlyRate;
    const principal = monthlyPayment - interest;
    balance -= principal;
    const dueDate = new Date(firstPayDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    const isPaid = i === 1;
    const paidPrincipal = isPaid ? principalPaid : 0;
    const paidInterest = isPaid ? interestPaid : 0;

    await prisma.installment.create({
      data: {
        loan_id: loan1.id,
        installment_number: i,
        due_date: dueDate,
        principal_amount: Math.round(principal * 100) / 100,
        interest_amount: Math.round(interest * 100) / 100,
        total_amount: Math.round(monthlyPayment * 100) / 100,
        paid_principal: paidPrincipal,
        paid_interest: paidInterest,
        paid_total: paidPrincipal + paidInterest,
        status: isPaid ? 'paid' : (dueDate < now ? 'overdue' : 'pending'),
        paid_at: isPaid ? new Date(disbDate.getTime() + 32 * 86400000) : undefined
      }
    });
  }

  // LOAN 2: SAN weekly loan - Maria Rodriguez
  const loan2 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      client_id: clients[1].id,
      product_id: productSAN.id,
      loan_number: 'PRE-2024-00002',
      status: 'active',
      requested_amount: 10000,
      approved_amount: 10000,
      disbursed_amount: 10000,
      rate: 10,
      rate_type: 'monthly',
      term: 12,
      term_unit: 'weeks',
      payment_frequency: 'weekly',
      amortization_type: 'fixed_installment',
      disbursement_date: new Date(disbDate.getTime() - 14 * 86400000),
      first_payment_date: new Date(disbDate.getTime() - 7 * 86400000),
      principal_balance: 8500,
      interest_balance: 2000,
      total_balance: 10500,
      total_interest: 3000,
      total_paid: 1500,
      total_paid_principal: 1000,
      total_paid_interest: 500,
      mora_rate_daily: 0.001,
      mora_grace_days: 1,
      collector_id: collector1.id,
    }
  });

  // LOAN 3: Mora loan - Ana Lopez (overdue with mora calculation)
  // Principal: 12000, Interest: 1500, Mora: 450 (25 days * 0.001 * 18000)
  const loan3 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      client_id: clients[3].id,
      product_id: productPersonal.id,
      loan_number: 'PRE-2024-00003',
      status: 'in_mora',
      requested_amount: 15000,
      approved_amount: 15000,
      disbursed_amount: 15000,
      rate: 5,
      rate_type: 'monthly',
      term: 6,
      term_unit: 'months',
      payment_frequency: 'monthly',
      amortization_type: 'fixed_installment',
      disbursement_date: new Date(disbDate.getTime() - 60 * 86400000),
      first_payment_date: new Date(disbDate.getTime() - 55 * 86400000),
      maturity_date: new Date(disbDate.getTime() + 30 * 86400000),
      principal_balance: 12000,
      interest_balance: 1500,
      mora_balance: 450,
      total_balance: 13950,
      days_overdue: 25,
      total_paid: 3000,
      total_paid_principal: 2500,
      total_paid_interest: 500,
      total_paid_mora: 0,
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      collector_id: collector2.id,
    }
  });

  // Installments for mora loan
  const maturingDate = new Date(disbDate.getTime() - 55 * 86400000);
  for (let i = 1; i <= 6; i++) {
    const dueDate = new Date(maturingDate);
    dueDate.setMonth(dueDate.getMonth() + i - 1);

    const isOverdue = i === 1;
    const moraDays = isOverdue ? 25 : 0;
    const moraAmount = isOverdue ? 450 : 0;

    await prisma.installment.create({
      data: {
        loan_id: loan3.id,
        installment_number: i,
        due_date: dueDate,
        principal_amount: 2500,
        interest_amount: 250,
        total_amount: 2750,
        paid_principal: isOverdue ? 2500 : 0,
        paid_interest: isOverdue ? 500 : 0,
        paid_mora: 0,
        mora_amount: moraAmount,
        mora_days: moraDays,
        status: isOverdue ? 'paid' : 'overdue',
        paid_at: isOverdue ? new Date(disbDate.getTime() - 30 * 86400000) : undefined
      }
    });
  }

  // LOAN 4: Pending Review - Roberto Sanchez
  const loan4 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      client_id: clients[5].id,
      product_id: productPersonal.id,
      loan_number: 'PRE-2024-00004',
      status: 'pending_review',
      requested_amount: 35000,
      rate: 5,
      rate_type: 'monthly',
      term: 12,
      term_unit: 'months',
      payment_frequency: 'monthly',
      amortization_type: 'fixed_installment',
      application_date: new Date(now.getTime() - 3 * 86400000),
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      purpose: 'Expandir negocio de repuestos'
    }
  });

  // LOAN 5: Approved (not disbursed) - Carolina Nunez
  const loan5 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch2.id,
      client_id: clients[6].id,
      product_id: productPersonal.id,
      loan_number: 'PRE-2024-00005',
      status: 'approved',
      requested_amount: 25000,
      approved_amount: 25000,
      rate: 5,
      rate_type: 'monthly',
      term: 12,
      term_unit: 'months',
      payment_frequency: 'monthly',
      amortization_type: 'fixed_installment',
      application_date: new Date(now.getTime() - 10 * 86400000),
      approval_date: new Date(now.getTime() - 2 * 86400000),
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      purpose: 'Capacitacion y equipos medicales'
    }
  });

  // LOAN 6: Commercial guaranteed loan - Miguel Puello
  const loan6 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch2.id,
      client_id: clients[7].id,
      product_id: productGarantia.id,
      loan_number: 'PRE-2024-00006',
      status: 'active',
      requested_amount: 100000,
      approved_amount: 100000,
      disbursed_amount: 100000,
      rate: 2.5,
      rate_type: 'monthly',
      term: 24,
      term_unit: 'months',
      payment_frequency: 'monthly',
      amortization_type: 'fixed_installment',
      disbursement_date: new Date(disbDate.getTime() - 10 * 86400000),
      first_payment_date: new Date(disbDate.getTime() + 20 * 86400000),
      maturity_date: new Date(disbDate.getTime() + 24 * 30 * 86400000),
      principal_balance: 98000,
      interest_balance: 12500,
      total_balance: 110500,
      total_interest: 13000,
      total_paid_principal: 2000,
      total_paid_interest: 500,
      total_paid: 2500,
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      collector_id: collector2.id,
      purpose: 'Ampliacion de escuela'
    }
  });

  // Guarantee for loan6
  await prisma.loanGuarantee.create({
    data: {
      loan_id: loan6.id,
      category_id: (await prisma.guaranteeCategory.findFirst({ where: { tenant_id: tenant1.id, name: 'Inmueble' } }))?.id,
      description: 'Propiedad residencial en Puerto Plata',
      estimated_value: 250000
    }
  });

  // LOAN 7: Reditos loan - Higher risk client with no approval needed
  const loan7 = await prisma.loan.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      client_id: clients[4].id,
      product_id: productReditos.id,
      loan_number: 'PRE-2024-00007',
      status: 'active',
      requested_amount: 50000,
      approved_amount: 50000,
      disbursed_amount: 50000,
      rate: 3,
      rate_type: 'monthly',
      term: 12,
      term_unit: 'months',
      payment_frequency: 'monthly',
      amortization_type: 'interest_only',
      disbursement_date: new Date(disbDate.getTime() - 20 * 86400000),
      first_payment_date: new Date(disbDate.getTime() - 13 * 86400000),
      principal_balance: 50000,
      interest_balance: 18000,
      total_balance: 68000,
      total_interest: 18000,
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      collector_id: collector1.id,
      purpose: 'Inversion empresarial'
    }
  });

  console.log(`✅ 7 loans created with various statuses and balances`);

  // Create payments
  const payment1 = await prisma.payment.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      loan_id: loan1.id,
      registered_by: admin.id,
      collector_id: collector1.id,
      payment_number: 'PAG-2024-000001',
      payment_date: new Date(disbDate.getTime() + 32 * 86400000),
      amount: 5500,
      applied_mora: 0,
      applied_charges: 0,
      applied_interest: 2500,
      applied_capital: 3000,
      payment_method: 'cash',
      type: 'regular'
    }
  });

  await prisma.receipt.create({
    data: {
      tenant_id: tenant1.id,
      payment_id: payment1.id,
      loan_id: loan1.id,
      issued_by: admin.id,
      series_id: (await prisma.receiptSeries.findFirst({ where: { tenant_id: tenant1.id } }))?.id,
      receipt_number: 'REC-000001',
      client_name: clients[0].full_name,
      client_id_number: clients[0].id_number,
      loan_number: loan1.loan_number,
      amount: 5500,
      concept_detail: JSON.stringify({ mora: 0, charges: 0, interest: 2500, capital: 3000 })
    }
  });

  // Additional payments for mora loan
  await prisma.payment.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      loan_id: loan3.id,
      registered_by: collector2.id,
      collector_id: collector2.id,
      payment_number: 'PAG-2024-000002',
      payment_date: new Date(disbDate.getTime() - 30 * 86400000),
      amount: 3000,
      applied_mora: 0,
      applied_charges: 0,
      applied_interest: 500,
      applied_capital: 2500,
      payment_method: 'cash',
      type: 'regular'
    }
  });

  console.log('✅ Payments and receipts created');

  // Collection notes for mora loan
  await prisma.collectionNote.create({
    data: {
      loan_id: loan3.id,
      user_id: collector2.id,
      type: 'visit',
      note: 'Visitado en domicilio. Cliente promete pago para el viernes proximo. Muy cooperativo.',
      next_date: new Date(now.getTime() + 3 * 86400000),
      next_action: 'Follow-up call'
    }
  });

  // Payment promise
  await prisma.paymentPromise.create({
    data: {
      loan_id: loan3.id,
      collector_id: collector2.id,
      promised_date: new Date(now.getTime() + 3 * 86400000),
      promised_amount: 3000,
      status: 'pending',
      notes: 'Cliente prometio pago para el 15 de abril'
    }
  });

  // Audit logs
  await prisma.auditLog.createMany({
    data: [
      { tenant_id: tenant1.id, user_id: admin.id, action: 'created', entity_type: 'client', entity_id: clients[0].id, notes: 'Enhanced seed' },
      { tenant_id: tenant1.id, user_id: admin.id, action: 'disbursed', entity_type: 'loan', entity_id: loan1.id, notes: 'Enhanced seed' },
      { tenant_id: tenant1.id, user_id: admin.id, action: 'payment_registered', entity_type: 'payment', entity_id: payment1.id, notes: 'Enhanced seed' },
      { tenant_id: tenant1.id, user_id: collector2.id, action: 'collection_visit', entity_type: 'loan', entity_id: loan3.id, notes: 'Enhanced seed' },
    ]
  });

  console.log('✅ Collection notes and audit logs created');

  // Summary report
  console.log('\n🎉 Enhanced seed complete!');
  console.log('\n=== DATABASE SUMMARY ===');
  const tenantCount = await prisma.tenant.count();
  const clientCount = await prisma.client.count();
  const loanCount = await prisma.loan.count();
  const paymentCount = await prisma.payment.count();

  console.log(`Tenants: ${tenantCount}`);
  console.log(`Clients: ${clientCount}`);
  console.log(`Loans: ${loanCount}`);
  console.log(`Payments: ${paymentCount}`);

  const loansByStatus = await prisma.loan.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('\nLoans by status:');
  for (const { status, _count } of loansByStatus) {
    console.log(`  ${status}: ${_count}`);
  }

  console.log('\n=== CREDENTIALS ===');
  console.log('Platform Admin: admin@prestamax.com / Admin123!');
  console.log('Loan Officer 1: oficial@garcia.com / Demo123!');
  console.log('Loan Officer 2: oficial2@garcia.com / Demo123!');
  console.log('Collector 1: cobrador@garcia.com / Demo123!');
  console.log('Collector 2: cobrador2@garcia.com / Demo123!');

  console.log('\n=== LOAN BALANCE VERIFICATION ===');
  const loans = await prisma.loan.findMany({ where: { status: { in: ['active', 'in_mora'] } } });
  for (const loan of loans) {
    const computed = (loan.principal_balance || 0) + (loan.interest_balance || 0) + (loan.mora_balance || 0);
    const match = computed === loan.total_balance ? '✅' : '❌';
    console.log(`${match} ${loan.loan_number}: Balance check (Principal: ${loan.principal_balance} + Interest: ${loan.interest_balance} + Mora: ${loan.mora_balance} = ${computed}, Expected: ${loan.total_balance})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
