// seoContent — registro de las páginas SEO comerciales (Fase 4). Mismo
// principio que resources.ts: datos estructurados, una sola plantilla
// (SeoLandingPage) los renderiza. Cada página responde a una intención de
// búsqueda distinta y no repite el mismo texto que las otras — ver el ángulo
// de cada una en su comentario.
//
// Todo lo afirmado abajo está verificado contra funcionalidad real (Fases 1-3
// de este proyecto): módulos de clientes/préstamos/pagos/recibos/cobranza/
// reportes, importación CSV (planes Básico, Profesional y Enterprise), multimoneda (12
// monedas incl. DOP), 4 planes (Starter a Enterprise), trial de 14 días sin
// tarjeta. No se citan clientes, cifras de mercado, rankings ni ahorros.

export interface SeoSolutionItem {
  title: string
  description: string
}

export interface SeoPage {
  slug: string
  h1: string
  metaTitle: string
  metaDescription: string
  intro: string[]
  problemHeading: string
  problemItems: string[]
  solutionHeading: string
  solutionIntro: string
  solutionItems: SeoSolutionItem[]
  ctaFinalTitle: string
  ctaFinalText: string
  relatedArticleSlugs: string[]
}

export const SEO_PAGES: SeoPage[] = [
  // Ángulo: intención de búsqueda local (República Dominicana), panorama general del producto.
  {
    slug: 'software-prestamos-republica-dominicana',
    h1: 'Software de préstamos en República Dominicana',
    metaTitle: 'Software de préstamos en República Dominicana | CredyTek',
    metaDescription: 'Software para gestionar préstamos, cobros y clientes, pensado para prestamistas en República Dominicana. Multi-moneda (incluye DOP), prueba gratis de 14 días.',
    intro: [
      'Si prestas dinero en República Dominicana, probablemente ya conoces el problema: la operación crece más rápido que las herramientas que usas para administrarla. CredyTek es un sistema web para gestionar clientes, préstamos, pagos y cobranza desde un solo lugar, con soporte nativo para pesos dominicanos (DOP) y otras monedas de la región.',
    ],
    problemHeading: 'Lo que suele fallar al operar desde Excel o libretas',
    problemItems: [
      'No hay una sola cifra confiable de cuánto está prestado y cuánto en mora',
      'El seguimiento de cobradores y promesas de pago depende de mensajes sueltos',
      'Los recibos y contratos se hacen a mano, uno por uno',
      'Nadie más que quien lo armó entiende del todo el Excel de la cartera',
    ],
    solutionHeading: 'Qué puedes administrar en CredyTek',
    solutionIntro: 'Un sistema web (sin instalar nada) con los módulos que un prestamista realmente usa día a día:',
    solutionItems: [
      { title: 'Clientes', description: 'Perfil por cliente con historial de préstamos, documentos y referencias.' },
      { title: 'Préstamos', description: 'Amortización francesa o cuota fija, tasas y plazos configurables, en pesos dominicanos u otra moneda.' },
      { title: 'Pagos y recibos', description: 'Pagos aplicados a capital, interés o mora, con recibo generado automáticamente.' },
      { title: 'Cobranza', description: 'Mora en tiempo real y seguimiento de promesas de pago.' },
      { title: 'Reportes', description: 'Cartera total, cartera activa, mora y proyección de cobros desde un panel central.' },
    ],
    ctaFinalTitle: 'Prueba CredyTek en tu operación',
    ctaFinalText: '14 días de prueba, sin tarjeta de crédito. Registra tus clientes y préstamos actuales y empieza a operar desde CredyTek hoy.',
    relatedArticleSlugs: ['como-llevar-control-de-prestamos', 'como-organizar-cartera-de-prestamos'],
  },
  // Ángulo: para quién es (individual → financiera), sin foco geográfico único.
  {
    slug: 'software-para-prestamistas',
    h1: 'Software para prestamistas',
    metaTitle: 'Software para prestamistas independientes y financieras | CredyTek',
    metaDescription: 'CredyTek se adapta desde un prestamista independiente hasta un equipo con varios cobradores y sucursales. Clientes, préstamos, pagos y cobranza en un solo sistema.',
    intro: [
      'No todos los prestamistas operan igual: algunos trabajan solos con una cartera pequeña, otros coordinan varios cobradores y sucursales. CredyTek está construido para funcionar en ambos extremos, con planes que van desde un cobrador hasta operación sin límites de usuarios.',
    ],
    problemHeading: 'Por qué las hojas de cálculo dejan de alcanzar',
    problemItems: [
      'Un cobrador no puede ver en tiempo real qué le corresponde cobrar hoy',
      'No hay control de quién tiene acceso a qué información dentro del equipo',
      'Agregar un cobrador o una sucursal nueva significa duplicar el Excel',
      'No existe un registro único de quién hizo qué cambio y cuándo',
    ],
    solutionHeading: 'Cómo CredyTek se adapta a tu operación',
    solutionIntro: 'La plataforma crece con la operación, no al revés:',
    solutionItems: [
      { title: 'Roles y permisos', description: 'Defines qué puede ver y hacer cada usuario del equipo (cobrador, oficial, administrador).' },
      { title: 'Múltiples sucursales', description: 'Disponible desde el plan Profesional, para operar más de una sucursal en una misma cuenta.' },
      { title: 'Cobradores con acceso propio', description: 'Cada cobrador entra con su propio usuario y ve la cartera que le corresponde.' },
      { title: 'Registro de auditoría', description: 'Cada acción relevante (crear, editar, registrar un pago) queda registrada con usuario y fecha.' },
    ],
    ctaFinalTitle: 'Empieza donde estés hoy',
    ctaFinalText: 'Ya seas un prestamista independiente o manejes un equipo, empieza gratis por 14 días y crece de plan cuando lo necesites.',
    relatedArticleSlugs: ['como-organizar-cartera-de-prestamos', 'como-controlar-cobros-y-pagos'],
  },
  // Ángulo: caso de uso operativo (control + cobranza), no producto en general.
  {
    slug: 'control-prestamos-cobros',
    h1: 'Control de préstamos y cobros',
    metaTitle: 'Control de préstamos y cobros en un solo sistema | CredyTek',
    metaDescription: 'Controla el estado de cada préstamo y el avance de tu cobranza desde un panel central: mora en tiempo real, promesas de pago y reportes actualizados.',
    intro: [
      'Controlar una cartera de préstamos significa poder responder, en cualquier momento, cuánto se debe, quién está atrasado y qué se prometió cobrar. Esta página se enfoca en esa parte específica: cómo CredyTek conecta el estado de los préstamos con el trabajo diario de cobranza.',
    ],
    problemHeading: 'Señales de que el control se está perdiendo',
    problemItems: [
      'La mora se calcula "a ojo" o se actualiza manualmente cada cierto tiempo',
      'Las promesas de pago de los clientes no quedan registradas en ningún lado',
      'No hay forma rápida de ver qué préstamos llevan más días vencidos',
      'Los reportes de cartera se arman a mano antes de cada reunión',
    ],
    solutionHeading: 'Qué controla CredyTek automáticamente',
    solutionIntro: 'Sin procesos manuales adicionales, a partir de los pagos y préstamos ya registrados:',
    solutionItems: [
      { title: 'Mora en tiempo real', description: 'El sistema calcula la mora de cada préstamo a partir del estado real de sus cuotas.' },
      { title: 'Promesas de pago', description: 'Registra cuándo un cliente promete pagar y da seguimiento a esa fecha.' },
      { title: 'Préstamos en mora (top)', description: 'El dashboard muestra los préstamos con más días de atraso sin armar el reporte a mano.' },
      { title: 'Recaudación reciente', description: 'Visibilidad de los cobros de los últimos días para medir el ritmo real de la cobranza.' },
    ],
    ctaFinalTitle: 'Pon tu cobranza bajo control',
    ctaFinalText: 'Registra tu cartera actual y empieza a ver la mora y las promesas de pago en un solo panel, desde hoy.',
    relatedArticleSlugs: ['como-controlar-cobros-y-pagos', 'como-llevar-control-de-prestamos'],
  },
  // Ángulo: migración desde Excel — sin atacar Excel como producto.
  {
    slug: 'alternativa-excel-prestamos',
    h1: 'Alternativa a Excel para gestionar préstamos',
    metaTitle: 'Alternativa a Excel para gestionar préstamos | CredyTek',
    metaDescription: 'Excel funciona bien para muchas cosas, pero no fue diseñado para operar una cartera de préstamos activa. Qué cambia al centralizar esa operación en CredyTek.',
    intro: [
      'Excel es una herramienta excelente para lo que fue diseñada: hojas de cálculo flexibles. El problema no es Excel — es usarlo como si fuera un sistema de gestión de préstamos, algo para lo que nunca fue construido. A partir de cierto volumen de clientes, esa flexibilidad se convierte en el problema.',
    ],
    problemHeading: 'Dónde Excel deja de alcanzar para préstamos',
    problemItems: [
      'Excel no incluye de forma nativa una lógica de gestión de préstamos que automatice cuotas, mora, recibos y seguimiento',
      'Cada persona del equipo puede tener su propia copia, con datos distintos',
      'No genera recibos ni contratos — hay que hacerlos aparte',
      'Un error de fórmula puede pasar meses sin detectarse',
    ],
    solutionHeading: 'Qué cambia al centralizar en CredyTek',
    solutionIntro: 'El mismo trabajo, pero en un sistema construido específicamente para esto:',
    solutionItems: [
      { title: 'Un solo lugar, un solo dato', description: 'Clientes, préstamos y pagos centralizados — no hay copias distintas por persona.' },
      { title: 'Cálculos automáticos', description: 'Cuotas, intereses y mora calculados por el sistema, no por fórmulas mantenidas a mano.' },
      { title: 'Recibos automáticos', description: 'Cada pago genera su recibo, sin armarlo aparte.' },
      { title: 'Importación desde CSV', description: 'En los planes Básico, Profesional y Enterprise, puedes importar tu cartera actual desde un archivo CSV con la plantilla que CredyTek provee, en vez de capturar todo de nuevo a mano.' },
    ],
    ctaFinalTitle: 'No tienes que empezar de cero',
    ctaFinalText: 'Registra tu cartera actual directamente, o impórtala desde un CSV si tu plan lo incluye, y sigue gestionándola desde CredyTek.',
    relatedArticleSlugs: ['como-llevar-control-de-prestamos', 'como-organizar-cartera-de-prestamos'],
  },
]

export function getSeoPageBySlug(slug: string | undefined): SeoPage | undefined {
  return SEO_PAGES.find(p => p.slug === slug)
}
