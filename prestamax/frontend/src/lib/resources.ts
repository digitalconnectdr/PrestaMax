// resources — registro de contenido del Centro de Recursos (/recursos).
// Arquitectura de contenido: los artículos viven acá como datos estructurados
// (no en una CMS ni en Markdown/MDX — evita dependencias nuevas). Agregar un
// artículo nuevo es: (1) agregar una entrada a ARTICLES, (2) agregar una línea
// a public/sitemap.xml. La ruta /recursos/:slug es genérica (ResourceArticlePage)
// y no requiere tocar App.tsx ni crear un componente de página nuevo.
//
// Contenido verificado contra funcionalidades reales de CredyTek (Fases 1-3):
// clientes, préstamos (amortización francesa/cuota fija/tasas configurables),
// pagos y recibos, cobranza (promesas de pago, mora), reportes, importación
// CSV (planes Básico, Profesional y Enterprise), multimoneda. No se citan cifras,
// clientes ni resultados no verificables.

export interface ArticleSubsection {
  heading: string
  paragraphs: string[]
}

export interface ArticleSection {
  heading: string
  paragraphs: string[]
  subsections?: ArticleSubsection[]
}

export interface Article {
  slug: string
  title: string
  metaDescription: string
  category: string
  publishedDate: string
  updatedDate: string
  intro: string[]
  sections: ArticleSection[]
  ctaContextual: { text: string; label: string }
  relatedSlugs: string[]
  relatedSeoSlugs: string[]
}

export const ARTICLES: Article[] = [
  {
    slug: 'como-llevar-control-de-prestamos',
    title: 'Cómo llevar el control de tus préstamos',
    metaDescription: 'Guía práctica para prestamistas en República Dominicana: qué información registrar de cada préstamo y cómo evitar perder el control de la cartera.',
    category: 'Administración de préstamos',
    publishedDate: '2026-09-28',
    updatedDate: '2026-09-28',
    intro: [
      'Perder el control de un préstamo casi nunca pasa de golpe. Pasa de a poco: una cuota que se anota en un cuaderno, un pago que se registra en un Excel distinto al de la semana pasada, un cliente cuyo número de teléfono solo alguien del equipo tiene guardado.',
      'Esta guía repasa qué información necesitas llevar de cada préstamo para no perder ese control, y qué parte de eso puede volverse automática en vez de manual.',
    ],
    sections: [
      {
        heading: 'La información mínima de cada préstamo',
        paragraphs: [
          'Independientemente de cómo lo lleves (papel, Excel o un sistema), cada préstamo activo necesita al menos: el monto original, la tasa y el tipo de amortización, el plazo y la frecuencia de pago, la fecha de desembolso, y el estado de cada cuota (pagada, pendiente, vencida).',
        ],
        subsections: [
          {
            heading: 'Amortización francesa vs. cuota fija',
            paragraphs: [
              'La forma en que calculas el interés cambia el monto de cada cuota. Con amortización francesa, cada cuota es igual pero la proporción de interés y capital cambia con el tiempo; con interés fijo (flat), el interés se calcula sobre el monto original durante todo el préstamo. Mezclar estos dos criterios sin dejarlo explícito por préstamo es una fuente común de errores al calcular cuánto falta por pagar.',
            ],
          },
        ],
      },
      {
        heading: 'Por qué el control se pierde con el tiempo',
        paragraphs: [
          'Un solo préstamo es fácil de seguir de memoria. El problema aparece con el volumen: a partir de cierto número de clientes activos, ningún prestamista puede recordar de memoria quién pagó esta semana y quién no. Ahí es donde depender de hojas sueltas o cuadernos empieza a costar dinero real, en forma de cuotas que no se cobran a tiempo simplemente porque nadie las vio vencer.',
        ],
      },
      {
        heading: 'Cómo CredyTek te ayuda con esto',
        paragraphs: [
          'CredyTek centraliza estos datos por préstamo: tasa, plazo, tipo de amortización y frecuencia se configuran una vez al crear el préstamo, y el sistema genera y da seguimiento a cada cuota automáticamente. El estado de cada cuota (pagada, pendiente, vencida) se actualiza solo con cada pago registrado, sin necesitar que alguien lo marque a mano.',
          'Si ya tienes una cartera activa fuera de CredyTek, puedes registrar esos préstamos directamente, o importarlos desde un archivo CSV si tu plan incluye esa función — no tienes que "empezar de cero" para ordenar lo que ya tienes.',
        ],
      },
    ],
    ctaContextual: {
      text: '¿Quieres ver cómo se ve un préstamo con seguimiento automático de cuotas?',
      label: 'Probar CredyTek gratis',
    },
    relatedSlugs: ['como-organizar-cartera-de-prestamos', 'como-controlar-cobros-y-pagos'],
    relatedSeoSlugs: ['software-para-prestamistas', 'alternativa-excel-prestamos'],
  },
  {
    slug: 'como-organizar-cartera-de-prestamos',
    title: 'Cómo organizar tu cartera de préstamos',
    metaDescription: 'Cómo estructurar la información de clientes y préstamos para que tu cartera sea fácil de revisar, sin depender de la memoria de una sola persona.',
    category: 'Cartera',
    publishedDate: '2026-09-28',
    updatedDate: '2026-09-28',
    intro: [
      'Una cartera "organizada" no significa una cartera grande o pequeña — significa que cualquiera en el equipo puede responder, en segundos, preguntas como: ¿cuánto tenemos prestado ahora mismo?, ¿cuánto está en mora?, ¿qué clientes tienen más de un préstamo activo?',
      'Si esas preguntas toman minutos (u horas) en responderse, el problema no es el tamaño de la cartera: es cómo está organizada.',
    ],
    sections: [
      {
        heading: 'Separa el dato del cliente del dato del préstamo',
        paragraphs: [
          'Un error común es mezclar la información del cliente (nombre, cédula, teléfono, referencias) con la del préstamo específico (monto, cuotas, estado) en el mismo lugar, por ejemplo una fila de Excel por préstamo. Esto duplica los datos del cliente cada vez que pide un préstamo nuevo, y hace fácil que queden desactualizados en una copia pero no en otra.',
          'Lo más ordenado es tratar al cliente como una entidad propia, con su historial de préstamos (pasados y activos) visible desde su perfil, no repetido en cada hoja.',
        ],
      },
      {
        heading: 'Una cartera por moneda, no una mezcla',
        paragraphs: [
          'Si prestas en más de una moneda (pesos dominicanos y dólares, por ejemplo), sumar montos de distintas monedas en una sola cifra de "cartera total" no dice nada útil. Cada préstamo debería quedar registrado en su moneda real, y los totales deberían poder verse separados por moneda cuando haga falta.',
        ],
      },
      {
        heading: 'Cómo CredyTek te ayuda con esto',
        paragraphs: [
          'En CredyTek, cada cliente tiene un perfil propio con su historial completo de préstamos, y cada préstamo queda asociado a su cliente sin duplicar datos. El sistema soporta múltiples monedas por préstamo, y los reportes (cartera total, cartera activa, mora) reflejan esa separación en vez de mezclar cifras de monedas distintas.',
          'El dashboard muestra el estado general de la cartera (total, activa, en mora, cobros del día) sin tener que armar esa cifra a mano cada vez que alguien pregunta.',
        ],
      },
    ],
    ctaContextual: {
      text: '¿Manejas clientes con más de un préstamo o más de una moneda?',
      label: 'Organiza tu cartera con CredyTek',
    },
    relatedSlugs: ['como-llevar-control-de-prestamos', 'como-controlar-cobros-y-pagos'],
    relatedSeoSlugs: ['control-prestamos-cobros', 'software-prestamos-republica-dominicana'],
  },
  {
    slug: 'como-controlar-cobros-y-pagos',
    title: 'Cómo controlar cobros y pagos',
    metaDescription: 'Qué información necesitas registrar en cada pago y cómo dar seguimiento a la cobranza sin depender de notas sueltas o mensajes dispersos.',
    category: 'Cobranza',
    publishedDate: '2026-09-28',
    updatedDate: '2026-09-28',
    intro: [
      'La cobranza es, para la mayoría de los prestamistas, la parte más difícil de sostener a medida que crece la cartera: no basta con saber cuánto se debe, hay que dar seguimiento activo a quién está atrasado, quién prometió pagar y cuándo, y quién ya recibió un recordatorio.',
      'Cuando ese seguimiento vive en la cabeza de una persona (o en conversaciones de WhatsApp dispersas), se vuelve imposible de traspasar o auditar.',
    ],
    sections: [
      {
        heading: 'Registra el pago completo, no solo el monto',
        paragraphs: [
          'Un pago no es solo "el cliente pagó X". Para que el registro sirva después (para un reporte, una auditoría, o simplemente para saber el saldo real), cada pago debería quedar registrado con: a qué se aplicó (capital, interés, mora), la fecha real del pago, el método, y un recibo asociado.',
        ],
      },
      {
        heading: 'Las promesas de pago necesitan su propio seguimiento',
        paragraphs: [
          'Cuando un cliente atrasado promete pagar en una fecha específica, esa promesa es información valiosa para planificar la cobranza — pero solo si queda registrada en algún lugar consultable, no solo en la memoria de quien cobró la llamada.',
        ],
      },
      {
        heading: 'Cómo CredyTek te ayuda con esto',
        paragraphs: [
          'Cada pago en CredyTek se registra aplicado a capital, interés o mora, con su recibo generado automáticamente. La mora se calcula en tiempo real a partir del estado de las cuotas, sin depender de que alguien lleve la cuenta aparte.',
          'El módulo de cobranza permite registrar promesas de pago y dar seguimiento a los clientes que las hicieron, junto con notas de cada gestión — para que la cobranza no dependa de que una sola persona recuerde el historial de cada cliente.',
        ],
      },
    ],
    ctaContextual: {
      text: '¿La cobranza depende de la memoria de una sola persona en tu equipo?',
      label: 'Centraliza tu cobranza con CredyTek',
    },
    relatedSlugs: ['como-organizar-cartera-de-prestamos', 'como-llevar-control-de-prestamos'],
    relatedSeoSlugs: ['control-prestamos-cobros', 'software-para-prestamistas'],
  },
]

export function getArticleBySlug(slug: string | undefined): Article | undefined {
  return ARTICLES.find(a => a.slug === slug)
}
