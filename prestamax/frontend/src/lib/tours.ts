// tours — definición de los 7 recorridos guiados de "Primeros pasos".
// Cada paso apunta a un elemento real ([data-tour="..."]) marcado en el
// Sidebar o en la página correspondiente. `data.route` indica a qué ruta
// navegar automáticamente antes de mostrar ese paso (ver tourEngine.ts).
import type { TourStep } from './tourEngine'

type TFn = (key: string) => string

export function getTourSteps(tourId: string, t: TFn): TourStep[] {
  switch (tourId) {
    case 'bank-account':
      return [
        { element: '[data-tour="nav-bank-accounts"]', popover: { title: t('tour.bank.1.t'), description: t('tour.bank.1.d') } },
        { element: '[data-tour="new-bank-account-btn"]', data: { route: '/settings/bank-accounts' }, popover: { title: t('tour.bank.2.t'), description: t('tour.bank.2.d') } },
      ]
    case 'product':
      return [
        { element: '[data-tour="nav-products"]', popover: { title: t('tour.product.1.t'), description: t('tour.product.1.d') } },
        { element: '[data-tour="new-product-btn"]', data: { route: '/settings/products' }, popover: { title: t('tour.product.2.t'), description: t('tour.product.2.d') } },
      ]
    case 'client':
      return [
        { element: '[data-tour="nav-clients"]', popover: { title: t('tour.client.1.t'), description: t('tour.client.1.d') } },
        { element: '[data-tour="new-client-btn"]', data: { route: '/clients' }, popover: { title: t('tour.client.2.t'), description: t('tour.client.2.d') } },
      ]
    case 'loan':
      return [
        { element: '[data-tour="nav-loans"]', popover: { title: t('tour.loan.1.t'), description: t('tour.loan.1.d') } },
        { element: '[data-tour="new-loan-btn"]', data: { route: '/loans' }, popover: { title: t('tour.loan.2.t'), description: t('tour.loan.2.d') } },
      ]
    case 'payment':
      return [
        { element: '[data-tour="nav-payments"]', popover: { title: t('tour.payment.1.t'), description: t('tour.payment.1.d') } },
        { element: '[data-tour="new-payment-btn"]', data: { route: '/payments' }, popover: { title: t('tour.payment.2.t'), description: t('tour.payment.2.d') } },
      ]
    case 'public-link':
      return [
        { element: '[data-tour="nav-requests"]', popover: { title: t('tour.link.1.t'), description: t('tour.link.1.d') } },
        { element: '[data-tour="show-link-btn"]', data: { route: '/requests' }, popover: { title: t('tour.link.2.t'), description: t('tour.link.2.d') } },
      ]
    case 'collections':
      return [
        { element: '[data-tour="nav-collections"]', popover: { title: t('tour.coll.1.t'), description: t('tour.coll.1.d') } },
        { element: '[data-tour="collections-tab-portfolio"]', data: { route: '/collections' }, popover: { title: t('tour.coll.2.t'), description: t('tour.coll.2.d') } },
        { element: '[data-tour="collections-tab-agenda"]', data: { route: '/collections' }, popover: { title: t('tour.coll.3.t'), description: t('tour.coll.3.d') } },
        { element: '[data-tour="nav-promises"]', popover: { title: t('tour.coll.4.t'), description: t('tour.coll.4.d') } },
        { element: '[data-tour="new-promise-btn"]', data: { route: '/collections/promises' }, popover: { title: t('tour.coll.5.t'), description: t('tour.coll.5.d') } },
      ]
    default:
      return []
  }
}

export function getTourLabels(t: TFn) {
  return {
    next: t('tour.next'),
    prev: t('tour.prev'),
    done: t('tour.done'),
    skip: t('tour.skip'),
    progress: '{{current}} ' + t('tour.of') + ' {{total}}',
  }
}
