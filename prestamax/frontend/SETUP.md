# PestaMax Frontend - Setup Guide

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Steps

1. Navigate to the frontend directory:
```bash
cd prestamax/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Build for Production

```bash
npm run build
```

This will create an optimized production build in the `dist/` directory.

## Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/        (AppLayout, Sidebar, Header)
│   │   ├── ui/            (reusable UI components)
│   │   └── shared/        (domain-specific components)
│   ├── pages/             (feature pages)
│   ├── contexts/          (React Context providers)
│   ├── hooks/             (custom React hooks)
│   ├── lib/               (utilities, API, constants)
│   ├── types/             (TypeScript interfaces)
│   ├── main.tsx           (entry point)
│   ├── App.tsx            (routing)
│   └── index.css          (global styles)
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

## Demo Credentials

- **Email:** admin@prestamax.com
- **Password:** Admin123!

## API Integration

The frontend is configured to proxy API requests to `http://localhost:3001/api`.

Make sure your backend is running on port 3001.

## Key Features

- Multi-tenant SaaS loan management system
- Complete dashboard with KPI metrics
- Client management (CRUD operations)
- Loan origination and management
- Payment processing and receipts
- Collections dashboard
- Comprehensive reporting
- WhatsApp integration ready
- Professional UI with Tailwind CSS
- Responsive design (mobile-first)

## Tech Stack

- React 18 + Vite
- TypeScript
- Tailwind CSS
- React Router v6
- React Hook Form + Zod
- Recharts (data visualization)
- Lucide React (icons)
- Axios (HTTP client)
- React Hot Toast (notifications)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Troubleshooting

### Port already in use
If port 5173 is already in use, edit `vite.config.ts` and change the port:
```typescript
server: {
  port: 5174, // or another available port
}
```

### API connection issues
Make sure the backend is running on port 3001 and check the proxy configuration in `vite.config.ts`.

### Tailwind not working
Run `npm install` again to ensure all dependencies are installed correctly.

## Development Notes

- All pages use mock data when API calls fail, making the app functional without a backend
- The design system is defined in `tailwind.config.js`
- Authentication state is managed via React Context
- Components follow a consistent structure for maintainability

## Next Steps

1. Connect to your backend API
2. Implement remaining forms (Client, Loan application)
3. Add more detailed error handling
4. Implement PDF generation for contracts and receipts
5. Add email notifications
6. Implement real-time updates with WebSockets
