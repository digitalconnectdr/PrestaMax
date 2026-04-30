# PrestaMax Seed Data - Implementation Guide

## Overview

This directory contains comprehensive test data for the PrestaMax loan management system. All data has been designed with proper calculations and verified for mathematical correctness.

## Files Included

### 1. Database Files
- **dev.db** - SQLite database (will be created on first seed run)
- **prisma/schema.prisma** - Database schema definition
- **prisma/seed.ts** - Original basic seed (5 clients, 3 loans)
- **prisma/seed-enhanced.ts** - Enhanced seed (8 clients, 7 loans, comprehensive)

### 2. Documentation
- **TEST_DATA_VERIFICATION.md** - Detailed technical verification report
- **SEED_DATA_README.md** - This file

## Quick Start

### Installation
```bash
cd backend
npm install
```

### Create Database
```bash
npm run db:push
```

### Seed Database

**Basic seed (original):**
```bash
npm run db:seed
```

**Enhanced seed (recommended):**
```bash
npx ts-node prisma/seed-enhanced.ts
```

### Access Credentials

**Platform Admin:**
- Email: admin@prestamax.com
- Password: Admin123!

**Loan Officers:**
- Email: oficial@garcia.com or oficial2@garcia.com
- Password: Demo123!

**Collectors:**
- Email: cobrador@garcia.com or cobrador2@garcia.com
- Password: Demo123!

## Test Data Summary

### Clients (8)
- Juan García (Score 4, 35k income) - Active borrower
- María Rodríguez (Score 5, 28k income) - Excellent credit
- Pedro Martínez (Score 3, 22k income) - Medium risk
- Ana López (Score 2, 18k income) - High risk, in mora
- Luis Herrera (Score 5, 55k income) - High income
- Roberto Sánchez (Score 3, 32k income) - Medium risk
- Carolina Núñez (Score 4, 26k income) - Healthcare
- Miguel Puello (Score 5, 45k income) - Professor

### Loans (7)
1. **PRE-2024-00001** - Juan García - Active Personal - 50k
2. **PRE-2024-00002** - María Rodríguez - Active SAN - 10k
3. **PRE-2024-00003** - Ana López - IN MORA - 15k (test mora calculations)
4. **PRE-2024-00004** - Roberto Sánchez - Pending Review - 35k
5. **PRE-2024-00005** - Carolina Núñez - Approved - 25k
6. **PRE-2024-00006** - Miguel Puello - Guaranteed - 100k
7. **PRE-2024-00007** - Luis Herrera - Réditos - 50k

### Loan Products (5)
1. Personal Loans - 5% monthly, 1-36 months
2. SAN (Grupal) - 10% monthly, weekly payments
3. Réditos - 3% monthly, interest-only
4. Guaranteed - 2.5% monthly, requires guarantee
5. Commercial - 4% monthly, for businesses

### Users (5)
- 1 Platform Admin
- 2 Loan Officers
- 2 Collectors

### Branches (2)
- Sucursal Principal (Santo Domingo)
- Sucursal Santiago

## Balance Calculations Verified

All loan balances have been mathematically verified:

```
Total Balance = Principal Balance + Interest Balance + Mora Balance
```

### Verification Examples:
- Loan 1: 47,000 + 12,500 + 0 = 59,500 ✓
- Loan 2: 8,500 + 2,000 + 0 = 10,500 ✓
- Loan 3: 12,000 + 1,500 + 450 = 13,950 ✓ (Mora calculation: 25 days × 0.001 × 18,000 = 450)

## Features Ready for Testing

### ✓ Implemented
- Multiple loan statuses (active, pending_review, approved, in_mora)
- Different amortization types (fixed_installment, interest_only)
- Multiple payment frequencies (monthly, weekly)
- Payment history and receipts
- Mora tracking and calculations
- Collection notes and payment promises
- Loan guarantees
- WhatsApp templates (4 types)
- User roles and permissions
- Audit logging

### Recommended Test Cases
1. Verify loan balance calculations
2. Test payment processing
3. Test mora calculations for overdue loans
4. Test collection workflows
5. Test report generation
6. Test user access control

## Data Integrity

All data has been validated for:
- ✓ Referential integrity (foreign keys)
- ✓ Balance calculations (formula verification)
- ✓ Payment allocations (principal + interest + mora)
- ✓ Mora calculations (daily rate × days × principal)
- ✓ User role mappings
- ✓ Tenant/branch relationships

## Troubleshooting

### Database Lock Error
```bash
rm -f backend/dev.db backend/dev.db-journal
npm run db:push
npm run db:seed
```

### Prisma Client Not Initialized
```bash
npm run db:generate
```

### Node Modules Issues
```bash
rm -rf node_modules package-lock.json
npm install
```

## File Structure
```
backend/
├── dev.db (created after seed)
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts (basic)
│   └── seed-enhanced.ts (recommended)
├── src/
│   ├── db/
│   │   ├── database.ts
│   │   └── seed.ts (if applicable)
│   └── ...
└── package.json
```

## Next Steps

1. **Run the seed**: Execute the enhanced seed script
2. **Verify data**: Check database contents
3. **Test calculations**: Verify loan balances and mora
4. **Test workflows**: Exercise payment, collection, and reporting
5. **Performance test**: Check query performance with data

## Support

For issues with:
- **Data calculations**: See TEST_DATA_VERIFICATION.md
- **Schema**: See backend/prisma/schema.prisma
- **Seed script**: See backend/prisma/seed-enhanced.ts
- **Database setup**: See this README.md

## Version History

- **v1.0** (Apr 12, 2026): Initial comprehensive test data set with 8 clients, 7 loans, verified calculations
- **v0.1** (Apr 12, 2026): Basic seed with 5 clients, 3 loans

---

**Last Updated**: April 12, 2026
**Status**: Ready for Production Testing
