import React, { useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Check, Loader2, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { TenantContext } from '@/contexts/TenantContext';

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
  const { refreshCurrentTenant } = useContext(TenantContext);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [whopEnabled, setWhopEnabled] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{ id: string; planInterest: string; status: string; createdAt: string } | null>(null);
  const [requestModal, setRequestModal] = useState<{ planSlug: string; planName: string } | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  useEffect(() => {
    if (params.get('stripe') === 'success') {
      toast.success('Suscripcion activada exitosamente! Actualizando permisos...');
      // El webhook de Stripe puede tardar 1-3s en procesarse. Damos margen.
      setTimeout(async () => {
        await refreshCurrentTenant();
        // Recargar tambien la informacion de suscripcion local de esta pagina
        try {
          const subRes = await api.get('/billing/subscription');
          setSubscription(subRes.data || null);
        } catch (_) {}
      }, 2500);
    } else if (params.get('stripe') === 'cancel') {
      toast('Checkout cancelado. Puedes intentarlo de nuevo cuando quieras.', { icon: 'ℹ️' });
    } else if (params.get('stripe') === 'portal-return') {
      toast.success('Cambios guardados. Actualizando permisos...');
      setTimeout(async () => {
        await refreshCurrentTenant();
        try {
          const subRes = await api.get('/billing/subscription');
          setSubscription(subRes.data || null);
        } catch (_) {}
      }, 2500);
    }
  }, [params, refreshCurrentTenant]);

  const load = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, pendingRes, whopRes] = await Promise.all([
        api.get('/billing/plans'),
        api.get('/billing/subscription'),
        api.get('/billing/my-pending-request').catch(() => ({ data: { pending: null } })),
        api.get('/billing/whop-config').catch(() => ({ data: { enabled: false } })),
      ]);
      setPlans(plansRes.data || []);
      setSubscription(subRes.data || null);
      setPendingRequest(pendingRes.data?.pending || null);
      setWhopEnabled(!!whopRes.data?.enabled);
    } catch (e: any) {
      console.error('billing load error', e);
      toast.error(e?.response?.data?.error || 'No se pudo cargar la informacion de suscripcion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Flujo principal: crear plan_inquiry interno (manual). El owner ve la
  // solicitud en Admin Panel > Solicitudes y procesa manualmente.
  const handleRequestPlan = async () => {
    if (!requestModal) return;
    setIsSubmittingRequest(true);
    try {
      const res = await api.post('/billing/request-plan-change', {
        plan_slug: requestModal.planSlug,
        message: requestNote || undefined,
      });
      toast.success(res.data?.message || 'Solicitud enviada');
      setRequestModal(null);
      setRequestNote('');
      const pendingRes = await api.get('/billing/my-pending-request').catch(() => ({ data: { pending: null } }));
      setPendingRequest(pendingRes.data?.pending || null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error al enviar la solicitud');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleSubscribe = async (planSlug: string) => {
    setCheckoutLoading(planSlug);
    try {
      // Whop es la pasarela activa; si no está, cae a Stripe.
      const endpoint = whopEnabled ? '/billing/whop-checkout' : '/billing/checkout';
      const res = await api.post(endpoint, { plan_slug: planSlug });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        toast.error('No se pudo iniciar el checkout');
      }
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const message = e?.response?.data?.error || 'Error al iniciar el checkout';
      if (code === 'ALREADY_SUBSCRIBED') {
        toast.error('Ya tienes este plan activo. No te cobraremos dos veces.');
      } else if (code === 'USE_CUSTOMER_PORTAL') {
        toast(
          'Para cambiar de plan usa "Administrar suscripcion" — evita cobros duplicados.',
          { icon: 'ℹ️', duration: 6000 }
        );
      } else {
        toast.error(message);
      }
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
        <p className="text-gray-600 mt-1">Gestiona el plan y los pagos de tu cuenta de CredyTek</p>
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

      {/* Banner: solicitud pendiente de cambio de plan */}
      {pendingRequest && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-600" />
          <div className="flex-1">
            <p className="font-medium">Tienes una solicitud de cambio de plan en proceso</p>
            <p className="text-sm mt-1">
              Plan solicitado: <strong>{pendingRequest.planInterest}</strong> · Estado: <strong>{pendingRequest.status === 'new' ? 'Nuevo' : pendingRequest.status}</strong> · Enviada el {new Date(pendingRequest.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <p className="text-xs text-blue-700 mt-1">Soporte te contactara pronto. No es necesario que envies otra solicitud.</p>
          </div>
        </div>
      )}

      {/* Lista de planes */}
      <div id="cambiar-de-plan" className="scroll-mt-24">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {subscription?.subscriptionStatus === 'active' ? 'Cambiar de plan' : 'Elige tu plan'}
        </h2>
        {plans.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Planes no disponibles aun</p>
              <p className="text-sm mt-1">Los planes de suscripcion aun no estan publicados. Contacta a soporte para conocer las opciones disponibles.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map(plan => {
              // Un plan cuenta como "actual/activo" solo si está vigente por fecha.
              // Si el mismo plan venció (o se canceló), debe poder RENOVARSE.
              const isExpiredByDate = subscription?.subscriptionEnd ? new Date(subscription.subscriptionEnd) < new Date() : false;
              const isMyPlan = subscription?.planSlug === plan.slug;
              const isCurrent = isMyPlan && subscription?.subscriptionStatus === 'active' && !isExpiredByDate;
              const isRenewable = isMyPlan && !isCurrent; // mi plan pero vencido/cancelado
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
                    onClick={() => {
                      if (whopEnabled || (plan as any).stripe_price_id) {
                        handleSubscribe(plan.slug);
                      } else {
                        setRequestModal({ planSlug: plan.slug, planName: plan.name });
                        setRequestNote('');
                      }
                    }}
                    disabled={isCurrent || checkoutLoading !== null || !!pendingRequest}
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isCurrent ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : isRenewable ? 'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'}`}
                    title={pendingRequest ? 'Ya tienes una solicitud pendiente — espera respuesta de soporte' : ''}
                  >
                    {checkoutLoading === plan.slug && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCurrent ? 'Plan actual' : pendingRequest ? 'Solicitud pendiente' : checkoutLoading === plan.slug ? 'Redirigiendo...' : isRenewable ? 'Renovar plan' : ((whopEnabled || (plan as any).stripe_price_id) ? 'Suscribirse' : 'Solicitar este plan')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
        {whopEnabled ? (
          <>
            <p>El pago se procesa en línea de forma segura con tarjeta. Tu suscripción se activa automáticamente al completar el pago.</p>
            <p className="mt-1">Puedes cancelar cuando quieras; mantienes el acceso hasta el fin del período pagado.</p>
          </>
        ) : (
          <>
            <p>El pago de la suscripcion se gestiona de forma manual con nuestro equipo. Cuando seleccionas un plan se crea una solicitud que soporte procesa contactandote por WhatsApp o email.</p>
            <p className="mt-1">Pronto habilitaremos pago automatico con tarjeta.</p>
          </>
        )}
      </div>

      {/* Modal: confirmar solicitud de plan */}
      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !isSubmittingRequest && setRequestModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Solicitar plan: {requestModal.planName}</h3>
              <p className="text-sm text-gray-500 mt-1">Soporte recibira tu solicitud y te contactara por WhatsApp o email.</p>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-sm font-medium text-gray-700">Nota (opcional)</label>
              <textarea
                value={requestNote}
                onChange={e => setRequestNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: Quiero activar para el 15 de este mes, prefiero pagar trimestral, etc."
              />
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                Esta solicitud quedara registrada en Admin Panel &gt; Solicitudes y el equipo de soporte te contactara pronto.
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setRequestModal(null)}
                disabled={isSubmittingRequest}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRequestPlan}
                disabled={isSubmittingRequest}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingRequest && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSubmittingRequest ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPage;
