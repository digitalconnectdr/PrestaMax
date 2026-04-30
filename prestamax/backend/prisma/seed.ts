import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PestaMax database...');

  // Plans
  const plans = await Promise.all([
    prisma.plan.upsert({ where: { slug: 'basico' }, update: {}, create: { name: 'Basico', slug: 'basico', price_monthly: 29, max_collectors: 1, max_clients: 50, max_users: 3 } }),
    prisma.plan.upsert({ where: { slug: 'profesional' }, update: {}, create: { name: 'Profesional', slug: 'profesional', price_monthly: 79, max_collectors: 5, max_clients: 500, max_users: 10 } }),
    prisma.plan.upsert({ where: { slug: 'empresarial' }, update: {}, create: { name: 'Empresarial', slug: 'empresarial', price_monthly: 199, max_collectors: 20, max_clients: 5000, max_users: 50 } }),
    prisma.plan.upsert({ where: { slug: 'premium' }, update: {}, create: { name: 'Premium', slug: 'premium', price_monthly: 499, max_collectors: -1, max_clients: -1, max_users: -1 } }),
  ]);
  console.log('Plans created');

  // Platform admin
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@prestamax.com' },
    update: {},
    create: { email: 'admin@prestamax.com', password_hash: adminHash, full_name: 'Administrador PestaMax', platform_role: 'platform_owner', is_active: true }
  });
  console.log('Admin user created: admin@prestamax.com / Admin123!');

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

  // Add admin to tenant 1
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: admin.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: admin.id, tenant_id: tenant1.id, branch_id: branch1.id, roles: JSON.stringify(['tenant_owner']), permissions: JSON.stringify({ all: true }) }
  });

  // Tenant user (loan officer)
  const userHash = await bcrypt.hash('Demo123!', 12);
  const officer = await prisma.user.upsert({
    where: { email: 'oficial@garcia.com' },
    update: {},
    create: { email: 'oficial@garcia.com', password_hash: userHash, full_name: 'Carlos Ramirez', is_active: true }
  });
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: officer.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: officer.id, tenant_id: tenant1.id, branch_id: branch1.id, roles: JSON.stringify(['loan_officer', 'cashier']) }
  });

  // Collector
  const collector = await prisma.user.upsert({
    where: { email: 'cobrador@garcia.com' },
    update: {},
    create: { email: 'cobrador@garcia.com', password_hash: userHash, full_name: 'Miguel Angel Perez', is_active: true }
  });
  await prisma.tenantMembership.upsert({
    where: { user_id_tenant_id: { user_id: collector.id, tenant_id: tenant1.id } },
    update: {},
    create: { user_id: collector.id, tenant_id: tenant1.id, branch_id: branch1.id, roles: JSON.stringify(['collector']) }
  });

  // Receipt series
  await prisma.receiptSeries.upsert({
    where: { id: 'series-garcia-default' },
    update: {},
    create: { id: 'series-garcia-default', tenant_id: tenant1.id, name: 'Serie Principal', prefix: 'REC', last_number: 0, is_default: true }
  });

  // Loan products for tenant 1
  const productPersonal = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo Personal', type: 'personal', min_amount: 1000, max_amount: 100000, rate: 5, rate_type: 'monthly', min_term: 1, max_term: 36, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'fixed_installment', requires_approval: true, allows_prepayment: true }
  });

  const productSAN = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo SAN (Semanal)', type: 'san', min_amount: 500, max_amount: 20000, rate: 10, rate_type: 'monthly', min_term: 4, max_term: 52, term_unit: 'weeks', payment_frequency: 'weekly', amortization_type: 'fixed_installment', is_san_type: true, requires_approval: false, allows_prepayment: true }
  });

  const productReditos = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo por Reditos', type: 'reditos', min_amount: 5000, max_amount: 500000, rate: 3, rate_type: 'monthly', min_term: 6, max_term: 60, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'interest_only', is_reditos: true, requires_approval: true }
  });

  const productGarantia = await prisma.loanProduct.create({
    data: { tenant_id: tenant1.id, name: 'Prestamo con Garantia', type: 'guaranteed', min_amount: 10000, max_amount: 1000000, rate: 2.5, rate_type: 'monthly', min_term: 12, max_term: 120, term_unit: 'months', payment_frequency: 'monthly', amortization_type: 'fixed_installment', requires_guarantee: true, requires_approval: true }
  });

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
      { tenant_id: tenant1.id, name: 'Confirmacion de Pago', event: 'payment_confirmation', body: 'Estimado {{client_name}}, hemos recibido su pago de {{amount}} para el prestamo {{loan_number}}. Gracias por su puntualidad. Saldo pendiente: {{balance}}.' },
      { tenant_id: tenant1.id, name: 'Recordatorio de Vencimiento', event: 'due_reminder', body: 'Estimado {{client_name}}, le recordamos que su cuota de {{amount}} vence el {{due_date}}. Por favor realice su pago a tiempo.' },
      { tenant_id: tenant1.id, name: 'Aviso de Mora', event: 'mora_alert', body: 'Estimado {{client_name}}, su prestamo tiene {{days}} dias de atraso. Mora acumulada: {{mora_amount}}. Por favor comuniquese urgente.' },
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

  console.log('Tenant 1 setup complete');

  // Create sample clients
  const clientsData = [
    { first_name: 'Juan', last_name: 'Garcia Perez', id_number: '001-1234567-8', phone_personal: '809-555-0101', whatsapp: '8095550101', address: 'Av. 27 de Febrero #456', city: 'Santo Domingo', monthly_income: 35000, occupation: 'Comerciante', score: 4 },
    { first_name: 'Maria', last_name: 'Rodriguez Santos', id_number: '002-2345678-9', phone_personal: '809-555-0202', whatsapp: '8095550202', address: 'Calle Las Mercedes #12', city: 'Santiago', monthly_income: 28000, occupation: 'Empleada', score: 5 },
    { first_name: 'Pedro', last_name: 'Martinez Diaz', id_number: '003-3456789-0', phone_personal: '809-555-0303', whatsapp: '8095550303', address: 'Los Prados #89', city: 'La Romana', monthly_income: 22000, occupation: 'Taxista', score: 3 },
    { first_name: 'Ana', last_name: 'Lopez Fernandez', id_number: '004-4567890-1', phone_personal: '809-555-0404', whatsapp: '8095550404', address: 'Villa Mella Sector 4', city: 'Santo Domingo Norte', monthly_income: 18000, occupation: 'Costurera', score: 2 },
    { first_name: 'Luis', last_name: 'Herrera Castillo', id_number: '005-5678901-2', phone_personal: '809-555-0505', whatsapp: '8095550505', address: 'Ensanche Naco #23', city: 'Santo Domingo', monthly_income: 55000, occupation: 'Empresario', score: 5 },
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
  console.log(`${clients.length} clients created`);

  // Create sample loans
  const disbDate = new Date();
  disbDate.setDate(disbDate.getDate() - 30); // 30 days ago

  const firstPayDate = new Date(disbDate);
  firstPayDate.setMonth(firstPayDate.getMonth() + 1);

  const maturityDate = new Date(firstPayDate);
  maturityDate.setMonth(maturityDate.getMonth() + 11);

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
      principal_balance: 50000,
      interest_balance: 15000,
      total_balance: 65000,
      total_interest: 15000,
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      collector_id: collector.id,
      purpose: 'Capital de trabajo para negocio'
    }
  });

  // Installments for loan1 (monthly, 12 months)
  const installments1 = [];
  let balance1 = 50000;
  const monthlyRate = 0.05;
  const monthlyPayment = 50000 * (monthlyRate * Math.pow(1 + monthlyRate, 12)) / (Math.pow(1 + monthlyRate, 12) - 1);

  for (let i = 1; i <= 12; i++) {
    const interest = balance1 * monthlyRate;
    const principal = monthlyPayment - interest;
    balance1 -= principal;
    const dueDate = new Date(firstPayDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    installments1.push({
      loan_id: loan1.id,
      installment_number: i,
      due_date: dueDate,
      principal_amount: Math.round(principal * 100) / 100,
      interest_amount: Math.round(interest * 100) / 100,
      total_amount: Math.round(monthlyPayment * 100) / 100,
      status: i === 1 && new Date() > firstPayDate ? 'overdue' : 'pending'
    });
  }
  await prisma.installment.createMany({ data: installments1 });

  // SAN loan
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
      mora_rate_daily: 0.001,
      mora_grace_days: 1,
      collector_id: collector.id,
    }
  });

  // Mora loan
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
      principal_balance: 12000,
      interest_balance: 1500,
      mora_balance: 450,
      total_balance: 13950,
      days_overdue: 25,
      total_paid: 3000,
      mora_rate_daily: 0.001,
      mora_grace_days: 3,
      collector_id: collector.id,
    }
  });

  // A payment on loan1
  const payment1 = await prisma.payment.create({
    data: {
      tenant_id: tenant1.id,
      branch_id: branch1.id,
      loan_id: loan1.id,
      registered_by: admin.id,
      collector_id: collector.id,
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

  // Audit log entries
  await prisma.auditLog.createMany({
    data: [
      { tenant_id: tenant1.id, user_id: admin.id, action: 'created', entity_type: 'client', entity_id: clients[0].id, notes: 'Initial seed' },
      { tenant_id: tenant1.id, user_id: admin.id, action: 'disbursed', entity_type: 'loan', entity_id: loan1.id, notes: 'Initial seed' },
      { tenant_id: tenant1.id, user_id: admin.id, action: 'payment_registered', entity_type: 'payment', entity_id: payment1.id, notes: 'Initial seed' },
    ]
  });

  console.log('Sample loans, payments and receipts created');
  console.log('\nDatabase seeded successfully!');
  console.log('\nCredenciales de acceso:');
  console.log('  Platform Admin: admin@prestamax.com / Admin123!');
  console.log('  Loan Officer: oficial@garcia.com / Demo123!');
  console.log('  Collector: cobrador@garcia.com / Demo123!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
