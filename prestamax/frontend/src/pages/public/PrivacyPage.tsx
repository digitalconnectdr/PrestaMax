import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Eye, Database, Share2, ShieldCheck, Bell, Trash2, Mail, Globe } from 'lucide-react'

const LAST_UPDATED = '20 de abril de 2026'
const COMPANY = 'JPRS Digital Connect'
const APP = 'PrestaMax'
const EMAIL_PRIVACY = 'privacidad@prestamax.com'
const EMAIL_SUPPORT = 'soporte@prestamax.com'
const JURISDICTION = 'República Dominicana'

const Section: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className="mb-10">
    <div className="flex items-center gap-3 mb-4">
      <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] flex-shrink-0">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-slate-800">{title}</h2>
    </div>
    <div className="pl-12 space-y-3 text-slate-600 leading-relaxed">{children}</div>
  </section>
)

const InfoBox: React.FC<{ color: 'blue' | 'green' | 'amber' | 'red'; title: string; children: React.ReactNode }> = ({ color, title, children }) => {
  const styles = {
    blue:  'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red:   'bg-red-50 border-red-200 text-red-900',
  }
  return (
    <div className={`rounded-xl border p-4 ${styles[color]}`}>
      <p className="font-semibold text-sm mb-1">{title}</p>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

export const PrivacyPage: React.FC = () => {
  const navigate = useNavigate()

  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-blue-200 hover:text-white text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-1">Política de Privacidad</h1>
              <p className="text-blue-200 text-sm">
                Última actualización: <strong className="text-white">{LAST_UPDATED}</strong>
                &nbsp;·&nbsp; Versión 1.0
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Commitment banner */}
      <div className="bg-emerald-50 border-b border-emerald-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-800">
            <strong>Nuestro compromiso:</strong> En {APP} tomamos la privacidad muy en serio. Sus datos y los
            de sus clientes son de su exclusiva propiedad. Nosotros solo los procesamos para brindarle el servicio,
            nunca los vendemos ni los compartimos con fines comerciales de terceros.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-8">
          <p className="text-slate-600 leading-relaxed">
            La presente Política de Privacidad (<strong>"Política"</strong>) describe cómo{' '}
            <strong>{COMPANY}</strong> (<strong>"Nosotros"</strong>, <strong>"Proveedor"</strong>) recopila,
            utiliza, almacena y protege la información personal en el contexto del uso de la plataforma{' '}
            <strong>{APP}</strong>. Esta Política aplica a todos los Suscriptores, cobradores, usuarios
            invitados y visitantes que interactúan con {APP}. Forma parte integral de los{' '}
            <a href="/terms" className="text-[#1e3a5f] font-medium hover:underline">
              Términos y Condiciones de Uso
            </a>.
          </p>
        </div>

        {/* Quick reference cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center shadow-sm">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Aislamiento total</p>
            <p className="text-xs text-slate-500">Los datos de cada Prestamista están completamente separados de otros.</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center shadow-sm">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Cifrado en tránsito</p>
            <p className="text-xs text-slate-500">Toda comunicación con la plataforma usa HTTPS / TLS.</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 text-center shadow-sm">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Sin venta de datos</p>
            <p className="text-xs text-slate-500">Jamás vendemos ni cedemos su información a anunciantes.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-2">

          {/* 1 */}
          <Section icon={<Eye className="w-5 h-5" />} title="1. Responsable del Tratamiento de Datos">
            <p>
              El responsable del tratamiento de los datos personales recopilados a través de {APP} es:
            </p>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm space-y-1">
              <p><strong>Empresa:</strong> {COMPANY}</p>
              <p><strong>Plataforma:</strong> {APP}</p>
              <p><strong>País:</strong> {JURISDICTION}</p>
              <p><strong>Correo de privacidad:</strong>{' '}
                <a href={`mailto:${EMAIL_PRIVACY}`} className="text-[#1e3a5f] hover:underline">{EMAIL_PRIVACY}</a>
              </p>
            </div>
          </Section>

          {/* 2 */}
          <Section icon={<Database className="w-5 h-5" />} title="2. Datos que Recopilamos">

            <p className="font-medium text-slate-700">A. Datos del Suscriptor (prestamista / empresa):</p>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>Nombre completo o razón social, correo electrónico y número de teléfono.</li>
              <li>Nombre de la empresa / sucursal y datos de facturación.</li>
              <li>Información de pago (procesada de forma segura por Stripe; {COMPANY} no almacena números de tarjeta).</li>
              <li>Dirección IP, tipo de dispositivo y datos de sesión para fines de seguridad.</li>
            </ul>

            <p className="font-medium text-slate-700 mt-2">B. Datos de clientes del Suscriptor (personas a quienes se otorgan préstamos):</p>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>Nombre completo, cédula de identidad / pasaporte, fecha de nacimiento.</li>
              <li>Dirección, teléfono personal y número de WhatsApp.</li>
              <li>Información financiera: historial de préstamos, pagos, mora y score crediticio.</li>
              <li>Documentos y contratos de préstamo (cuando el Suscriptor los cargue).</li>
            </ul>

            <InfoBox color="amber" title="Importante sobre los datos de clientes finales">
              Los datos de los clientes del Suscriptor son ingresados directamente por el Suscriptor o sus
              cobradores. El Suscriptor es responsable de obtener el consentimiento de sus clientes para el
              registro y tratamiento de sus datos en {APP}.
            </InfoBox>

            <p className="font-medium text-slate-700 mt-2">C. Datos de uso de la plataforma:</p>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>Registros de acceso (logins, acciones), errores y eventos del sistema.</li>
              <li>Métricas de rendimiento para mantenimiento y mejora de la plataforma.</li>
            </ul>
          </Section>

          {/* 3 */}
          <Section icon={<Globe className="w-5 h-5" />} title="3. Finalidades del Tratamiento de Datos">
            <p>Procesamos los datos para los siguientes fines:</p>
            <div className="space-y-3 text-sm">
              {[
                ['Prestación del servicio', 'Crear y gestionar cuentas, procesar pagos, emitir recibos y contratos, calcular saldos y mora.'],
                ['Comunicaciones del servicio', 'Enviar notificaciones de pago, alertas de seguridad, actualizaciones importantes y cambios en estos documentos legales.'],
                ['Atención al cliente', 'Resolver consultas, incidencias técnicas y solicitudes de soporte.'],
                ['Seguridad y prevención de fraude', 'Monitorear accesos inusuales, proteger la integridad del sistema y prevenir usos no autorizados.'],
                ['Cumplimiento legal', 'Dar cumplimiento a obligaciones legales, requerimientos de autoridades o resoluciones judiciales.'],
                ['Mejora del servicio', 'Analizar métricas de uso agregadas y anónimas para optimizar funcionalidades (sin identificar usuarios individuales).'],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-3">
                  <span className="w-2 h-2 bg-[#1e3a5f] rounded-full mt-1.5 flex-shrink-0" />
                  <div><strong className="text-slate-700">{title}:</strong> {desc}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 4 */}
          <Section icon={<Lock className="w-5 h-5" />} title="4. Aislamiento de Datos (Modelo Multi-Tenant)">
            <InfoBox color="green" title="Su información está completamente aislada">
              {APP} opera bajo una arquitectura multi-tenant estricta. Los datos de cada Prestamista se
              almacenan bajo un identificador único de tenant (tenant_id) y ningún Suscriptor puede ver,
              acceder ni modificar los datos de otro Suscriptor, a ningún nivel de la aplicación.
            </InfoBox>
            <p>
              Los administradores de plataforma de {COMPANY} pueden acceder a los datos de cualquier tenant
              exclusivamente para fines de soporte técnico, mantenimiento o cumplimiento legal, y bajo
              estrictos controles de acceso internos.
            </p>
          </Section>

          {/* 5 */}
          <Section icon={<Share2 className="w-5 h-5" />} title="5. Compartición de Datos con Terceros">
            <p>
              {COMPANY} <strong>no vende, no alquila ni comercializa</strong> los datos personales de
              Suscriptores ni de sus clientes. Solo compartimos datos en los siguientes casos limitados:
            </p>
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="font-semibold text-slate-700 mb-1">Proveedores de infraestructura</p>
                <p className="text-slate-600">
                  Utilizamos servicios de terceros de confianza para operar la plataforma:
                </p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600">
                  <li><strong>Stripe</strong> — Procesamiento seguro de pagos de suscripción. Stripe tiene su propia política de privacidad.</li>
                  <li><strong>Render / AWS</strong> — Infraestructura de servidores y base de datos.</li>
                  <li><strong>WhatsApp Business API</strong> — Envío de mensajes de notificación cuando el Suscriptor lo activa.</li>
                </ul>
                <p className="mt-2 text-slate-500 text-xs">
                  Todos los proveedores están sujetos a acuerdos de confidencialidad y solo acceden a los datos
                  mínimos necesarios para prestar su servicio.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <p className="font-semibold text-slate-700 mb-1">Obligaciones legales</p>
                <p className="text-slate-600">
                  Podremos divulgar información cuando así lo exija una orden judicial, autoridad competente
                  o disposición legal vigente en la {JURISDICTION}, notificando al Suscriptor en la medida
                  que la ley lo permita.
                </p>
              </div>
            </div>
          </Section>

          {/* 6 */}
          <Section icon={<ShieldCheck className="w-5 h-5" />} title="6. Seguridad de los Datos">
            <p>Aplicamos las siguientes medidas técnicas y organizativas para proteger su información:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                ['🔒 HTTPS / TLS', 'Toda comunicación entre su navegador y nuestros servidores está cifrada.'],
                ['🔑 Autenticación JWT', 'Los tokens de sesión expiran automáticamente y se validan en cada solicitud.'],
                ['👥 Permisos granulares', 'Cada usuario solo accede a las funciones que el Prestamista le autoriza explícitamente.'],
                ['🏢 Aislamiento por tenant', 'Todas las consultas a la base de datos incluyen filtros obligatorios por tenant_id.'],
                ['📋 Registros de auditoría', 'Las acciones críticas quedan registradas con usuario, fecha y hora.'],
                ['🛡️ Protección de contraseñas', 'Las contraseñas se almacenan con hash bcrypt (sin texto plano).'],
              ].map(([title, desc]) => (
                <div key={title as string} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-medium text-slate-700 mb-0.5">{title}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              ))}
            </div>
            <InfoBox color="amber" title="Responsabilidad compartida en seguridad">
              Aunque {COMPANY} implementa controles técnicos robustos, la seguridad también depende del
              Suscriptor: use contraseñas fuertes, no comparta credenciales y notifíquenos inmediatamente
              ante cualquier acceso sospechoso a su cuenta.
            </InfoBox>
          </Section>

          {/* 7 */}
          <Section icon={<Database className="w-5 h-5" />} title="7. Retención y Eliminación de Datos">
            <p>Los datos se conservan de acuerdo con las siguientes reglas:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left p-3 font-semibold text-slate-700 rounded-tl-lg">Tipo de dato</th>
                    <th className="text-left p-3 font-semibold text-slate-700">Período de retención</th>
                    <th className="text-left p-3 font-semibold text-slate-700 rounded-tr-lg">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['Datos del Suscriptor', 'Vigencia de la cuenta + 30 días', 'Portabilidad y cierre de cuenta'],
                    ['Datos de clientes / préstamos', 'Mientras la cuenta esté activa', 'Prestación del servicio'],
                    ['Registros de acceso y auditoría', '90 días', 'Seguridad y detección de fraude'],
                    ['Datos de facturación (Stripe)', 'Según normativa fiscal aplicable', 'Cumplimiento legal'],
                    ['Backups de base de datos', '30 días de retención de backups', 'Recuperación ante desastres'],
                  ].map(([type, period, reason]) => (
                    <tr key={type as string} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-700 font-medium">{type}</td>
                      <td className="p-3 text-slate-600">{period}</td>
                      <td className="p-3 text-slate-500 text-xs">{reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Tras la cancelación de la cuenta, los datos del Suscriptor se eliminan de forma permanente
              e irrecuperable al finalizar el período de retención indicado.
            </p>
          </Section>

          {/* 8 */}
          <Section icon={<Bell className="w-5 h-5" />} title="8. Cookies y Tecnologías de Seguimiento">
            <p>
              {APP} utiliza cookies técnicas estrictamente necesarias para el funcionamiento de la sesión
              del usuario (autenticación y preferencias de tenant). <strong>No utilizamos cookies de
              rastreo publicitario ni de terceros para análisis de comportamiento.</strong>
            </p>
            <p>
              El Suscriptor puede configurar su navegador para bloquear cookies, pero esto puede
              afectar la funcionalidad de inicio de sesión y la experiencia general de la plataforma.
            </p>
          </Section>

          {/* 9 */}
          <Section icon={<ShieldCheck className="w-5 h-5" />} title="9. Derechos del Suscriptor y sus Clientes">
            <p>
              De conformidad con la legislación aplicable en la {JURISDICTION}, el Suscriptor y, en su
              caso, los clientes cuyos datos procesa el Suscriptor, tienen los siguientes derechos:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {[
                ['Acceso', 'Solicitar información sobre los datos personales que procesamos.'],
                ['Rectificación', 'Corregir datos inexactos o incompletos.'],
                ['Eliminación', 'Solicitar la eliminación de datos personales cuando no sean necesarios.'],
                ['Portabilidad', 'Recibir sus datos en formato estructurado y legible por máquina (CSV/PDF).'],
                ['Oposición', 'Oponerse al tratamiento de datos para fines específicos.'],
                ['Limitación', 'Solicitar la limitación del tratamiento en ciertos supuestos.'],
              ].map(([right, desc]) => (
                <div key={right as string} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-semibold text-slate-700 mb-0.5">✓ Derecho de {right}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              ))}
            </div>
            <p>
              Para ejercer cualquiera de estos derechos, escriba a{' '}
              <a href={`mailto:${EMAIL_PRIVACY}`} className="text-[#1e3a5f] font-medium hover:underline">
                {EMAIL_PRIVACY}
              </a>{' '}
              indicando su nombre, correo de cuenta y el derecho que desea ejercer.
              Responderemos en un plazo máximo de <strong>15 días hábiles</strong>.
            </p>
          </Section>

          {/* 10 */}
          <Section icon={<Trash2 className="w-5 h-5" />} title="10. Notificación de Brechas de Seguridad">
            <p>
              En caso de detectar una brecha de seguridad que afecte datos personales de Suscriptores,
              {COMPANY} se compromete a:
            </p>
            <ul className="list-disc pl-5 text-sm space-y-2">
              <li>Notificar a los Suscriptores afectados dentro de las <strong>72 horas</strong> siguientes
                a la confirmación de la brecha, siempre que técnica y legalmente sea posible.</li>
              <li>Informar la naturaleza de los datos comprometidos, el impacto estimado y las medidas
                correctivas implementadas.</li>
              <li>Cooperar con las autoridades competentes de la {JURISDICTION} en la investigación
                correspondiente.</li>
            </ul>
          </Section>

          {/* 11 */}
          <Section icon={<Globe className="w-5 h-5" />} title="11. Transferencias Internacionales de Datos">
            <p>
              Los servidores de {APP} pueden estar ubicados fuera de la {JURISDICTION} (en proveedores
              como AWS o Render con centros de datos en EE.UU. u otras regiones). Al utilizar el servicio,
              el Suscriptor consiente la transferencia y almacenamiento de sus datos en dichas ubicaciones,
              siempre bajo los estándares de seguridad descritos en esta Política.
            </p>
          </Section>

          {/* 12 */}
          <Section icon={<Bell className="w-5 h-5" />} title="12. Cambios a esta Política">
            <p>
              {COMPANY} puede actualizar esta Política periódicamente. Los cambios sustanciales serán
              notificados al Suscriptor mediante correo electrónico o aviso en la plataforma con al menos{' '}
              <strong>15 días de anticipación</strong>. La fecha de la última actualización siempre
              aparecerá al inicio de este documento.
            </p>
          </Section>

          {/* 13 */}
          <Section icon={<Mail className="w-5 h-5" />} title="13. Contacto — Oficial de Privacidad">
            <p>
              Para cualquier consulta, solicitud o reclamo relacionado con esta Política de Privacidad,
              puede contactarnos a través de:
            </p>
            <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm space-y-1">
              <p><strong>Empresa:</strong> {COMPANY}</p>
              <p><strong>Correo de privacidad:</strong>{' '}
                <a href={`mailto:${EMAIL_PRIVACY}`} className="text-[#1e3a5f] hover:underline">{EMAIL_PRIVACY}</a>
              </p>
              <p><strong>Soporte general:</strong>{' '}
                <a href={`mailto:${EMAIL_SUPPORT}`} className="text-[#1e3a5f] hover:underline">{EMAIL_SUPPORT}</a>
              </p>
            </div>
          </Section>

        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400 space-y-1">
          <p>© {new Date().getFullYear()} {COMPANY}. Todos los derechos reservados.</p>
          <p>
            <a href="/terms" className="hover:text-slate-600 underline">Términos y Condiciones</a>
            {' · '}
            <a href="/login" className="hover:text-slate-600 underline">Iniciar Sesión</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default PrivacyPage
