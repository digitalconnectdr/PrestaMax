import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Check, Loader2, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Plan {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  maxCollectors: number;
  maxClients: number;
  maxUsers: number;
  features: string[];
  description: string;
  stripePriceId: string;
}

interface Subscription {
  id: string;
  name: string;
  subscriptionStatus: string;
  subscriptionEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planName: string | null;
  planSlug: string | null;
  priceMonthly: number | null;
  hasPaymentMethod: boolean;
  trialDaysLeft: number | null;
  isTrial: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  trial:     { label: 'Periodo de prueba', color: 'bg-blue-100 text-blue-800' },
  active:    { label: 'Activa', color: 'bg-green-100 text-green-800' },
  expired:   { label: 'Expirada', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada', color: 'bg-gray-100 text-gray-800' },
  suspended: { label: 'Suspendida', color: 'bg-yellow-100 text-yellow-800' },
};

const formatLimit = (n: number) => (n < 0 ? 'Sin limite' : n.toString());

const BillingPage: React.FC = () => {
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (params.get('stripe') === 'success') {
      toast.success('Suscripcion activada exitosamente! Ya puedes usar el sistema.');
    } else if (params.get('stripe') === 'cancel') {
      toast('Checkout cancelado. Puedes intentarlo de nuevo cuando quieras.', { icon: 'ℹ️' });
    } else if (params.get('stripe') === 'portal-return') {
      toast.success('Cambios guardados.');
    }
  }, [params]);

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        api.get('/billing/plans'),
        api.get('/billing/subscription'),
      ]);
      setPlans(plansRes.data || []);
      setSubscription(subRes.data || null);
    } catch (e: any) {
      console.error('billing load error', e);
      toast.error(e?.response?.data?.error || 'No se pudo cargar la informacion de suscripcion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubscribe = async (planSlug: string) => {
    setCheckoutLoading(planSlug);
    try {
      const res = await api.post('/billing/checkout', { plan_slug: planSlug });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('No se pudo iniciar el checkout');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error al iniciar el checkout');
      setCheckoutLoading(null);
    }
  };

  const handleManagePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await api.post('/billing/portal', {});
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('No se pudo abrir el portal');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error al abrir el portal');
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const statusInfo = subscription?.subscriptionStatus
    ? STATUS_LABELS[subscription.subscriptionStatus] || { label: subscription.subscriptionStatus, color: 'bg-gray-100 text-gray-800' }
    : null;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Suscripcion</h1>
        <p className="text-gray-600 mt-1">Gestiona el plan y los pagos de tu cuenta de PrestaMax</p>
      </div>

      {/* Estado actual */}
      {subscription && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Estado actual</h2>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                {statusInfo && (
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                )}
                <span className="text-gray-700">
                  Plan: <strong>{subscription.planName || 'Sin plan'}</strong>
                </span>
                {subscription.priceMonthly != null && subscription.priceMonthly > 0 && (
                  <span className="text-gray-500">${subscription.priceMonthly}/mes</span>
                )}
              </div>
              {subscription.isTrial && subscription.trialDaysLeft != null && (
                <div className={`mt-3 flex items-center gap-2 ${subscription.trialDaysLeft <= 3 ? 'text-red-700' : 'text-blue-700'}`}>
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">
                    {subscription.trialDaysLeft > 0
                      ? `Tu periodo de prueba termina en ${subscription.trialDaysLeft} dia${subscription.trialDaysLeft === 1 ? '' : 's'}. Suscribete a un plan para mantener el acceso.`
                      : 'Tu periodo de prueba ha terminado. Suscribete para continuar usando el sistema.'}
                  </span>
                </div>
              )}
              {subscription.subscriptionEnd && (
                <p className="text-sm text-gray-500 mt-2">
                  {subscription.subscriptionStatus === 'active' ? 'Renueva el' : 'Vence el'}: {' '}
                  {new Date(subscription.subscriptionEnd).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            {subscription.hasPaymentMethod && (
              <button
                onClick={handleManagePortal}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
              >
                {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Gestionar suscripcion
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lista de planes */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {subscription?.subscriptionStatus === 'active' ? 'Cambiar de plan' : 'Elige tu plan'}
        </h2>
        {plans.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Pagos no configurados</p>
              <p className="text-sm mt-1">El administrador no ha configurado los planes de Stripe todavia. Contacta a soporte.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map(plan => {
              const isCurrent = subscription?.planSlug === plan.slug && subscription?.subscriptionStatus === 'active';
              return (
                <div key={plan.id} className={`relative rounded-lg border-2 p-6 flex flex-col ${isCurrent ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-blue-400'} transition-colors`}>
                  {isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> PLAN ACTUAL
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <div className="mt-3 mb-4">
                    <span className="text-4xl font-bold text-gray-900">${plan.priceMonthly}</span>
                    <span className="text-gray-500"> / mes</span>
                  </div>
                  {plan.description && (
                    <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                  )}
                  <ul className="space-y-2 mb-6 flex-1">
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{formatLimit(plan.maxCollectors)} cobradores</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{formatLimit(plan.maxClients)} clientes</span>
                    </li>
                    <li className="flex items-start gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{formatLimit(plan.maxUsers)} usuarios</span>
                    </li>
                    {Array.isArray(plan.features) && plan.features.slice(0, 5).map((f: string) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSubscribe(plan.slug)}
                    disabled={isCurrent || checkoutLoading !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isCurrent ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'}`}
                  >
                    {checkoutLoading === plan.slug && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCurrent ? 'Plan actual' : checkoutLoading === plan.slug ? 'Redirigiendo...' : 'Suscribirse'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
        <p>Pagos procesados de forma segura por <strong>Stripe</strong>. PrestaMax no almacena datos de tarjeta.</p>
        <p className="mt-1">Puedes cancelar tu suscripcion en cualquier momento desde el portal de gestion.</p>
      </div>
    </div>
  );
};

export default BillingPage;
