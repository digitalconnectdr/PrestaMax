import { getDb, initializeDatabase, uuid, now } from './database';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
  return seed();
}

async function seed() {
  initializeDatabase();
  const db = getDb();
  console.log('🌱 Seeding PestaMax...');

  // Plans
  const plans = [
    { id: uuid(), name: 'Básico', slug: 'basico', price_monthly: 29, max_collectors: 1, max_clients: 50 },
    { id: uuid(), name: 'Profesional', slug: 'profesional', price_monthly: 79, max_collectors: 5, max_clients: 500 },
    { id: uuid(), name: 'Empresarial', slug: 'empresarial', price_monthly: 199, max_collectors: 20, max_clients: 5000 },
    { id: uuid(), name: 'Premium', slug: 'premium', price_monthly: 499, max_collectors: -1, max_clients: -1 },
  ];
  const insertPlan = db.prepare('INSERT OR IGNORE INTO plans (id,name,slug,price_monthly,max_collectors,max_clients) VALUES (?,?,?,?,?,?)');
  for (const p of plans) insertPlan.run(p.id,p.name,p.slug,p.price_monthly,p.max_collectors,p.max_clients);
  console.log('✅ Plans');

  // Admin user
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const adminId = 'admin-platform-001';
  db.prepare('INSERT OR IGNORE INTO users (id,email,password_hash,full_name,platform_role,is_active) VALUES (?,?,?,?,?,?)').run(adminId,'admin@prestamax.com',adminHash,'Administrador PestaMax','platform_owner',1);

  // Demo users
  const demoHash = await bcrypt.hash('Demo123!', 12);
  const officerId = 'user-officer-001';
  const collectorId = 'user-collector-001';
  db.prepare('INSERT OR IGNORE INTO users (id,email,password_hash,full_name,is_active) VALUES (?,?,?,?,?)').run(officerId,'oficial@garcia.com',demoHash,'Carlos Ramírez',1);
  db.prepare('INSERT OR IGNORE INTO users (id,email,password_hash,full_name,is_active) VALUES (?,?,?,?,?)').run(collectorId,'cobrador@garcia.com',demoHash,'Miguel Ángel Pérez',1);
  console.log('✅ Users: admin@prestamax.com / Admin123!');

  // Tenant
  const tenantId = 'tenant-garcia-001';
  db.prepare('INSERT OR IGNORE INTO tenants (id,name,slug,email,phone,currency,is_active) VALUES (?,?,?,?,?,?,?)').run(tenantId,'Préstamos García & Asociados','prestamos-garcia','info@garcia.com','809-555-1000','DOP',1);
  db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(uuid(), tenantId);

  // Branch
  const branchId = 'branch-garcia-001';
  db.prepare('INSERT OR IGNORE INTO branches (id,tenant_id,name,address,phone) VALUES (?,?,?,?,?)').run(branchId,tenantId,'Sucursal Principal','Calle Principal #123, Santo Domingo','809-555-1001');

  // Memberships
  const addMember = (userId: string, roles: string[]) => {
    db.prepare('INSERT OR IGNORE INTO tenant_memberships (id,user_id,tenant_id,branch_id,roles,permissions) VALUES (?,?,?,?,?,?)').run(uuid(),userId,tenantId,branchId,JSON.stringify(roles),'{}');
  };
  addMember(adminId, ['tenant_owner']);
  addMember(officerId, ['loan_officer','cashier']);
  addMember(collectorId, ['collector']);

  // Receipt series
  db.prepare('INSERT OR IGNORE INTO receipt_series (id,tenant_id,name,prefix,is_default) VALUES (?,?,?,?,?)').run('series-garcia-001',tenantId,'Serie Principal','REC',1);

  // Guarantee categories
  const cats = ['Vehículo','Inmueble','Joya','Electrodoméstico','Otro'];
  for (const c of cats) db.prepare('INSERT OR IGNORE INTO guarantee_categories (id,tenant_id,name) VALUES (?,?,?)').run(uuid(),tenantId,c);

  // Loan products
  const products = [
    { id:'prod-personal-001', name:'Préstamo Personal', type:'personal', min_amount:1000, max_amount:100000, rate:5, rate_type:'monthly', min_term:1, max_term:36, term_unit:'months', payment_frequency:'monthly', amortization_type:'fixed_installment', requires_approval:1 },
    { id:'prod-san-001', name:'Préstamo SAN (Semanal)', type:'san', min_amount:500, max_amount:20000, rate:10, rate_type:'monthly', min_term:4, max_term:52, term_unit:'weeks', payment_frequency:'weekly', amortization_type:'fixed_installment', requires_approval:0, is_san_type:1 },
    { id:'prod-reditos-001', name:'Préstamo por Réditos', type:'reditos', min_amount:5000, max_amount:500000, rate:3, rate_type:'monthly', min_term:6, max_term:60, term_unit:'months', payment_frequency:'monthly', amortization_type:'interest_only', requires_approval:1, is_reditos:1 },
    { id:'prod-garantia-001', name:'Préstamo con Garantía', type:'guaranteed', min_amount:10000, max_amount:1000000, rate:2.5, rate_type:'monthly', min_term:12, max_term:120, term_unit:'months', payment_frequency:'monthly', amortization_type:'fixed_installment', requires_guarantee:1, requires_approval:1 },
  ];
  for (const p of products) {
    db.prepare('INSERT OR IGNORE INTO loan_products (id,tenant_id,name,type,min_amount,max_amount,rate,rate_type,min_term,max_term,term_unit,payment_frequency,amortization_type,requires_approval,requires_guarantee,is_san_type,is_reditos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      p.id,tenantId,p.name,p.type,p.min_amount,p.max_amount,p.rate,p.rate_type,p.min_term,p.max_term,p.term_unit,p.payment_frequency,p.amortization_type,(p as any).requires_approval??1,(p as any).requires_guarantee??0,(p as any).is_san_type??0,(p as any).is_reditos??0
    );
  }
  console.log('✅ Loan products');

  // Contract templates
  const pagareBody = [
    '                    PAGARÉ',
    '',
    '{{company_name}}',
    '{{company_address}}',
    'Tel: {{company_phone}}   Email: {{company_email}}',
    '',
    'Préstamo No.: {{loan_number}}',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Yo, {{client_name}}, portador de la cédula {{client_id}},',
    'domiciliado en {{client_address}}, {{client_city}},',
    'debo y pagaré a {{company_name}} la suma de RD$ {{amount}}',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DETALLE DE CUOTAS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '{{payment_plan}}',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DATOS DEL PRÉSTAMO',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Fecha de inicio:           {{start_date}}',
    'Fecha de vencimiento:      {{end_date}}',
    'Plazo:                     {{term}}',
    'Monto desembolsado:        {{amount}}',
    'Frecuencia de pago:        {{monthly_payment}}',
    'Tasa de interés:           {{rate}}',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DECLARACIÓN DE INCUMPLIMIENTO',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'En caso de incumplimiento con el presente préstamo, quedan',
    'afectados todos mis bienes habidos y por haber para el pago',
    'inmediato de esta deuda sin ninguna formalidad judicial.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'FIRMAS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Firma del deudor:  ______________________________________',
    'Nombre:            {{client_name}}',
    'Cédula:            {{client_id}}',
    '',
    'Firma del prestamista: __________________________________',
    'Empresa:           {{company_name}}',
    '',
    'Fecha de impresión: {{print_date}}',
  ].join('\n');

  const contractBody = [
    'CONTRATO DE PRÉSTAMO PERSONAL',
    '',
    'Entre {{company_name}} y el cliente {{client_name}},',
    'portador de la cédula {{client_id}}, domiciliado en',
    '{{client_address}}, {{client_city}}.',
    '',
    'MONTO:  RD${{amount}}',
    'TASA:   {{rate}}',
    'PLAZO:  {{term}}',
    'FECHA:  {{print_date}}',
    '',
    'El deudor se compromete a realizar los pagos según el plan',
    'de cuotas. En mora se aplica recargo diario.',
    '',
    '_______________________',
    'Firma del Deudor',
    '{{client_name}}',
    'C.I.: {{client_id}}',
  ].join('\n');

  db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)').run('tmpl-pagare-001',tenantId,'Pagaré Estándar','general',pagareBody,1);
  db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)').run('tmpl-contract-001',tenantId,'Contrato General de Prestamo','general',contractBody,0);

  // WhatsApp templates
  const waMsgs = [
    { event:'payment_confirmation', name:'Confirmación de Pago', body:'Estimado/a {{client_name}}, hemos registrado su pago de RD${{amount}} para el préstamo {{loan_number}}. Saldo pendiente: RD${{balance}}. ¡Gracias por su puntualidad!' },
    { event:'due_reminder', name:'Recordatorio de Vencimiento', body:'Estimado/a {{client_name}}, le recordamos que su cuota de RD${{amount}} vence el {{due_date}}. Por favor realice su pago a tiempo para mantener su historial.' },
    { event:'mora_alert', name:'Aviso de Mora', body:'Estimado/a {{client_name}}, su préstamo {{loan_number}} tiene {{days}} días de atraso. Mora acumulada: RD${{mora_amount}}. Comuníquese urgentemente al 809-555-1000.' },
    { event:'balance_letter', name:'Carta de Saldo', body:'Estimado/a {{client_name}}, adjunto encontrará el estado de su préstamo {{loan_number}}. Capital: RD${{capital}}. Intereses: RD${{interest}}. Mora: RD${{mora}}. Total: RD${{total}}.' },
  ];
  for (const m of waMsgs) db.prepare('INSERT OR IGNORE INTO whatsapp_templates (id,tenant_id,name,event,body) VALUES (?,?,?,?,?)').run(uuid(),tenantId,m.name,m.event,m.body);

  // Sample clients
  const clientsData = [
    { id:'cli-001', first_name:'Juan', last_name:'García Pérez', id_number:'001-1234567-8', phone_personal:'809-555-0101', whatsapp:'8095550101', address:'Av. 27 de Febrero #456', city:'Santo Domingo', monthly_income:35000, occupation:'Comerciante', score:4 },
    { id:'cli-002', first_name:'María', last_name:'Rodríguez Santos', id_number:'002-2345678-9', phone_personal:'809-555-0202', whatsapp:'8095550202', address:'Calle Las Mercedes #12', city:'Santiago', monthly_income:28000, occupation:'Empleada', score:5 },
    { id:'cli-003', first_name:'Pedro', last_name:'Martínez Díaz', id_number:'003-3456789-0', phone_personal:'809-555-0303', whatsapp:'8095550303', address:'Los Prados #89', city:'La Romana', monthly_income:22000, occupation:'Taxista', score:3 },
    { id:'cli-004', first_name:'Ana', last_name:'López Fernández', id_number:'004-4567890-1', phone_personal:'809-555-0404', whatsapp:'8095550404', address:'Villa Mella Sector 4', city:'Santo Domingo Norte', monthly_income:18000, occupation:'Costurera', score:2 },
    { id:'cli-005', first_name:'Luis', last_name:'Herrera Castillo', id_number:'005-5678901-2', phone_personal:'809-555-0505', whatsapp:'8095550505', address:'Ensanche Naco #23', city:'Santo Domingo', monthly_income:55000, occupation:'Empresario', score:5 },
  ];
  for (let i=0; i<clientsData.length; i++) {
    const d = clientsData[i];
    const full = `${d.first_name} ${d.last_name}`;
    db.prepare('INSERT OR IGNORE INTO clients (id,tenant_id,client_number,full_name,first_name,last_name,id_type,id_number,phone_personal,whatsapp,address,city,monthly_income,occupation,score,consent_data_processing,consent_whatsapp,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      d.id,tenantId,`CLI-${String(i+1).padStart(5,'0')}`,full,d.first_name,d.last_name,'cedula',d.id_number,d.phone_personal,d.whatsapp,d.address,d.city,d.monthly_income,d.occupation,d.score,1,1,1
    );
  }
  console.log('✅ Clients');

  // Sample loans
  const disbDate = new Date(); disbDate.setDate(disbDate.getDate()-30);
  const firstPay = new Date(disbDate); firstPay.setMonth(firstPay.getMonth()+1);
  const maturity = new Date(firstPay); maturity.setMonth(maturity.getMonth()+11);

  // Active personal loan - Juan García
  db.prepare('INSERT OR IGNORE INTO loans (id,tenant_id,branch_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,disbursed_amount,rate,rate_type,term,term_unit,payment_frequency,amortization_type,application_date,approval_date,disbursement_date,first_payment_date,maturity_date,principal_balance,interest_balance,total_balance,total_interest,mora_rate_daily,mora_grace_days,collector_id,purpose) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'loan-001',tenantId,branchId,'cli-001','prod-personal-001','PRE-2024-00001','active',50000,50000,50000,5,'monthly',12,'months','monthly','fixed_installment',
    new Date(disbDate.getTime()-5*86400000).toISOString(),new Date(disbDate.getTime()-2*86400000).toISOString(),disbDate.toISOString(),firstPay.toISOString(),maturity.toISOString(),
    46500,12000,58500,15000,0.001,3,collectorId,'Capital de trabajo para negocio'
  );

  // Generate installments for loan-001
  const monthlyRate = 0.05;
  const loanAmount = 50000;
  const mPayment = loanAmount*(monthlyRate*Math.pow(1+monthlyRate,12))/(Math.pow(1+monthlyRate,12)-1);
  let bal = loanAmount;
  const insertInst = db.prepare('INSERT OR IGNORE INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,?)');
  for (let i=1; i<=12; i++) {
    const interest = Math.round(bal*monthlyRate*100)/100;
    const principal = i===12 ? Math.round(bal*100)/100 : Math.round((mPayment-interest)*100)/100;
    bal = Math.round((bal-principal)*100)/100;
    const dd = new Date(firstPay); dd.setMonth(dd.getMonth()+(i-1));
    const isOverdue = dd < new Date();
    insertInst.run(uuid(),'loan-001',i,dd.toISOString(),principal,interest,Math.round((principal+interest)*100)/100,i===1&&isOverdue?'overdue':'pending');
  }

  // SAN weekly loan - María
  const disbDate2 = new Date(); disbDate2.setDate(disbDate2.getDate()-14);
  const firstPay2 = new Date(disbDate2); firstPay2.setDate(firstPay2.getDate()+7);
  db.prepare('INSERT OR IGNORE INTO loans (id,tenant_id,branch_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,disbursed_amount,rate,rate_type,term,term_unit,payment_frequency,amortization_type,disbursement_date,first_payment_date,principal_balance,interest_balance,total_balance,total_interest,total_paid,mora_rate_daily,mora_grace_days,collector_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'loan-002',tenantId,branchId,'cli-002','prod-san-001','PRE-2024-00002','active',10000,10000,10000,10,'monthly',12,'weeks','weekly','fixed_installment',
    disbDate2.toISOString(),firstPay2.toISOString(),8500,2000,10500,3000,1500,0.001,1,collectorId
  );

  // Mora loan - Ana
  db.prepare('INSERT OR IGNORE INTO loans (id,tenant_id,branch_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,disbursed_amount,rate,rate_type,term,term_unit,payment_frequency,amortization_type,principal_balance,interest_balance,mora_balance,total_balance,days_overdue,total_paid,mora_rate_daily,mora_grace_days,collector_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'loan-003',tenantId,branchId,'cli-004','prod-personal-001','PRE-2024-00003','in_mora',15000,15000,15000,5,'monthly',6,'months','monthly','fixed_installment',
    12000,1500,450,13950,25,3000,0.001,3,collectorId
  );

  // Approved loan - Luis (pending disburse)
  db.prepare('INSERT OR IGNORE INTO loans (id,tenant_id,branch_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,rate,rate_type,term,term_unit,payment_frequency,amortization_type,mora_rate_daily,mora_grace_days) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'loan-004',tenantId,branchId,'cli-005','prod-garantia-001','PRE-2024-00004','approved',200000,200000,2.5,'monthly',36,'months','monthly','fixed_installment',0.001,3
  );

  console.log('✅ Loans & installments');

  // A payment on loan-001
  const payId = 'pay-001';
  const payDate = new Date(disbDate.getTime()+32*86400000);
  db.prepare('INSERT OR IGNORE INTO payments (id,tenant_id,loan_id,registered_by,collector_id,payment_number,payment_date,amount,applied_mora,applied_charges,applied_interest,applied_capital,payment_method,type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    payId,tenantId,'loan-001',adminId,collectorId,'PAG-2024-000001',payDate.toISOString(),5500,0,0,2500,3000,'cash','regular'
  );
  db.prepare('INSERT OR IGNORE INTO receipts (id,tenant_id,payment_id,loan_id,issued_by,series_id,receipt_number,client_name,client_id_number,loan_number,amount,concept_detail) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
    uuid(),tenantId,payId,'loan-001',adminId,'series-garcia-001','REC-000001','Juan García Pérez','001-1234567-8','PRE-2024-00001',5500,'{"mora":0,"charges":0,"interest":2500,"capital":3000}'
  );

  // Collection note
  db.prepare('INSERT OR IGNORE INTO collection_notes (id,loan_id,user_id,type,note) VALUES (?,?,?,?,?)').run(uuid(),'loan-003',collectorId,'visit','Visita realizada. Cliente indica que realizará pago a finales de semana. Prometió RD$3,000.');
  db.prepare('INSERT OR IGNORE INTO payment_promises (id,loan_id,collector_id,promised_date,promised_amount,notes) VALUES (?,?,?,?,?,?)').run(uuid(),'loan-003',collectorId,new Date(Date.now()+3*86400000).toISOString(),3000,'Prometió pago para este viernes.');

  // Audit logs
  db.prepare('INSERT OR IGNORE INTO audit_logs (id,tenant_id,user_id,action,entity_type,entity_id) VALUES (?,?,?,?,?,?)').run(uuid(),tenantId,adminId,'created','client','cli-001');
  db.prepare('INSERT OR IGNORE INTO audit_logs (id,tenant_id,user_id,action,entity_type,entity_id) VALUES (?,?,?,?,?,?)').run(uuid(),tenantId,adminId,'disbursed','loan','loan-001');
  db.prepare('INSERT OR IGNORE INTO audit_logs (id,tenant_id,user_id,action,entity_type,entity_id) VALUES (?,?,?,?,?,?)').run(uuid(),tenantId,adminId,'payment_registered','payment',payId);

  console.log('✅ Payments, receipts, audit logs');
  console.log('\n🎉 Seed complete!');
  console.log('   admin@prestamax.com / Admin123!');
  console.log('   oficial@garcia.com / Demo123!');
  console.log('   cobrador@garcia.com / Demo123!');
}

seed().catch(console.error);
