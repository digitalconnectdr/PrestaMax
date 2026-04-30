import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, FileText, AlertTriangle, Users, CreditCard, Server, Scale, Mail } from 'lucide-react'

const LAST_UPDATED = '20 de abril de 2026'
const COMPANY = 'JPRS Digital Connect'
const APP = 'PrestaMax'
const EMAIL_LEGAL = 'legal@prestamax.com'
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

const Clause: React.FC<{ number: string; title: string; children: React.ReactNode }> = ({ number, title, children }) => (
  <div className="mb-4">
    <h3 className="font-semibold text-slate-700 mb-1">{number}. {title}</h3>
    <div className="text-sm space-y-2">{children}</div>
  </div>
)

export const TermsPage: React.FC = () => {
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
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold mb-1">Términos y Condiciones de Uso</h1>
              <p className="text-blue-200 text-sm">
                Última actualización: <strong className="text-white">{LAST_UPDATED}</strong>
                &nbsp;·&nbsp; Versión 1.0
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Intro banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <strong>Por favor lea este documento detenidamente.</strong> Al acceder o utilizar {APP}, usted acepta quedar
            vinculado por los presentes Términos y Condiciones. Si no está de acuerdo con alguna parte de estos términos,
            no podrá acceder al servicio.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* Intro */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mb-8">
          <p className="text-slate-600 leading-relaxed">
            Los presentes Términos y Condiciones de Uso (<strong>"Términos"</strong>) rigen el acceso y uso de la
            plataforma <strong>{APP}</strong>, un sistema de gestión de préstamos en modalidad SaaS (Software como
            Servicio), desarrollado y operado por <strong>{COMPANY}</strong> (<strong>"Nosotros"</strong>,
            <strong>"Proveedor"</strong>). Estos Términos constituyen un contrato legalmente vinculante entre usted
            (<strong>"Prestamista"</strong>, <strong>"Suscriptor"</strong> o <strong>"Usuario"</strong>) y {COMPANY},
            y se rigen por las leyes aplicables de la <strong>{JURISDICTION}</strong>.
          </p>
        </div>

        {/* Sections */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-2">

          <Section icon={<FileText className="w-5 h-5" />} title="1. Descripción del Servicio">
            <Clause number="1.1" title="Naturaleza del servicio">
              <p>
                {APP} es una plataforma de software basada en la nube que permite a prestamistas, empresas
                financieras y personas naturales gestionar préstamos personales, préstamos tipo "san", préstamos
                comerciales y préstamos con garantía, incluyendo la gestión de clientes, cobradores, pagos,
                recibos, contratos y reportes.
              </p>
            </Clause>
            <Clause number="1.2" title="Modelo multi-inquilino">
              <p>
                La plataforma opera bajo un modelo multi-tenant: cada Prestamista posee un espacio de datos
                completamente aislado. Los datos de un Prestamista nunca son accesibles por otro Prestamista
                dentro de la plataforma.
              </p>
            </Clause>
            <Clause number="1.3" title="Actualizaciones del servicio">
              <p>
                {COMPANY} se reserva el derecho de modificar, mejorar o descontinuar funcionalidades del
                servicio en cualquier momento, notificando a los Suscriptores activos con un mínimo de
                <strong> 15 días de anticipación</strong> en caso de cambios sustanciales.
              </p>
            </Clause>
          </Section>

          <Section icon={<CreditCard className="w-5 h-5" />} title="2. Suscripción, Pagos y Planes">
            <Clause number="2.1" title="Planes disponibles">
              <p>
                {APP} ofrece múltiples planes de suscripción con diferentes niveles de acceso, número de
                usuarios (cobradores), capacidad de clientes y funcionalidades. Los detalles de cada plan
                se encuentran publicados en la página oficial de precios de la plataforma.
              </p>
            </Clause>
            <Clause number="2.2" title="Período de prueba">
              <p>
                Los nuevos Suscriptores tienen acceso a un <strong>período de prueba gratuito</strong> según
                lo indicado en el plan seleccionado al registrarse. Al finalizar el período de prueba, se
                requerirá suscribirse a un plan de pago para continuar utilizando el servicio. Los datos
                ingresados durante la prueba se conservan durante la transición al plan de pago.
              </p>
            </Clause>
            <Clause number="2.3" title="Facturación y cobros">
              <p>
                Los pagos se procesan de forma segura a través de <strong>Stripe</strong>, un proveedor de
                servicios de pago de terceros. Al proporcionar información de pago, el Suscriptor autoriza
                a {COMPANY} a realizar cargos periódicos según el ciclo de facturación contratado
                (mensual o anual).
              </p>
            </Clause>
            <Clause number="2.4" title="Política de reembolsos">
              <p>
                Los pagos realizados son <strong>no reembolsables</strong>, excepto cuando la ley aplicable
                lo requiera expresamente. Si {COMPANY} interrumpe el servicio por causas atribuibles
                exclusivamente al Proveedor, se ofrecerá un crédito proporcional al tiempo no utilizado.
              </p>
            </Clause>
            <Clause number="2.5" title="Suspensión por falta de pago">
              <p>
                Ante el incumplimiento de pago por más de <strong>7 días calendario</strong> desde la fecha
                de facturación, {COMPANY} podrá suspender el acceso al servicio. Los datos permanecerán
                almacenados por un período adicional de <strong>30 días</strong>, tras los cuales podrán
                ser eliminados definitivamente si no se regulariza el pago.
              </p>
            </Clause>
          </Section>

          <Section icon={<Users className="w-5 h-5" />} title="3. Registro, Cuentas y Usuarios">
            <Clause number="3.1" title="Elegibilidad">
              <p>
                Para registrarse en {APP}, usted debe ser mayor de 18 años, tener capacidad legal para
                celebrar contratos y estar autorizado para operar actividades de préstamo en su jurisdicción
                de acuerdo con la legislación local aplicable.
              </p>
            </Clause>
            <Clause number="3.2" title="Veracidad de la información">
              <p>
                El Suscriptor se compromete a proporcionar información veraz, completa y actualizada al
                momento del registro y durante toda la vigencia de la suscripción. {COMPANY} no es
                responsable por los perjuicios derivados de datos incorrectos suministrados por el Suscriptor.
              </p>
            </Clause>
            <Clause number="3.3" title="Gestión de cobradores y sub-usuarios">
              <p>
                El Suscriptor puede agregar cobradores y asignarles permisos granulares dentro de su cuenta.
                El Suscriptor es el <strong>único responsable</strong> de las acciones realizadas por los
                cobradores y usuarios que agregue a su organización en {APP}.
              </p>
            </Clause>
            <Clause number="3.4" title="Seguridad de credenciales">
              <p>
                El Suscriptor es responsable de mantener la confidencialidad de sus credenciales de acceso
                (correo y contraseña). Cualquier actividad realizada desde su cuenta se presume autorizada
                por el Suscriptor. Ante una brecha de seguridad conocida o sospechada, debe notificar
                inmediatamente a {COMPANY} a través de <strong>{EMAIL_SUPPORT}</strong>.
              </p>
            </Clause>
          </Section>

          <Section icon={<Scale className="w-5 h-5" />} title="4. Uso Aceptable y Conducta Prohibida">
            <Clause number="4.1" title="Uso permitido">
              <p>
                {APP} está diseñado exclusivamente para la administración legítima y lícita de actividades
                de préstamo. El Suscriptor acepta utilizar la plataforma únicamente para fines que cumplan
                con todas las leyes aplicables de la <strong>{JURISDICTION}</strong> y demás normas locales.
              </p>
            </Clause>
            <Clause number="4.2" title="Conductas prohibidas">
              <p>Queda expresamente prohibido:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Utilizar la plataforma para gestionar actividades ilegales de préstamo o usura.</li>
                <li>Registrar datos de clientes sin el consentimiento previo y expreso de los mismos.</li>
                <li>Intentar acceder a datos de otros Suscriptores o a sistemas internos de {COMPANY}.</li>
                <li>Realizar ingeniería inversa, descompilar o desensamblar el software.</li>
                <li>Revender, sublicenciar o transferir el acceso al servicio a terceros sin autorización.</li>
                <li>Introducir virus, malware o cualquier código dañino en la plataforma.</li>
                <li>Sobrecargar o interferir con la infraestructura del servicio (ataques DDoS u otros).</li>
                <li>Usar bots o scripts automatizados para extraer datos masivamente de la plataforma.</li>
              </ul>
            </Clause>
            <Clause number="4.3" title="Consecuencias del incumplimiento">
              <p>
                El incumplimiento de la sección 4.2 faculta a {COMPANY} a suspender o cancelar
                inmediatamente el acceso del Suscriptor, sin perjuicio de las acciones legales que puedan
                corresponder.
              </p>
            </Clause>
          </Section>

          <Section icon={<Server className="w-5 h-5" />} title="5. Datos, Privacidad e Infraestructura">
            <Clause number="5.1" title="Propiedad de los datos">
              <p>
                Todos los datos ingresados por el Suscriptor (información de clientes, préstamos, pagos,
                contratos, etc.) son y seguirán siendo <strong>propiedad exclusiva del Suscriptor</strong>.
                {COMPANY} actúa únicamente como encargado del tratamiento de dichos datos.
              </p>
            </Clause>
            <Clause number="5.2" title="Privacidad y tratamiento de datos">
              <p>
                El tratamiento de datos personales se rige por nuestra{' '}
                <a href="/privacy" className="text-[#1e3a5f] font-medium hover:underline">
                  Política de Privacidad
                </a>
                , la cual forma parte integral de estos Términos.
              </p>
            </Clause>
            <Clause number="5.3" title="Seguridad">
              <p>
                {COMPANY} implementa medidas técnicas y organizativas razonables de seguridad cibernética
                para proteger los datos alojados en la plataforma, incluyendo cifrado en tránsito (TLS/HTTPS),
                autenticación con tokens JWT, y controles de acceso basados en roles y permisos granulares.
                Sin embargo, ningún sistema es completamente inexpugnable y {COMPANY} no garantiza la
                seguridad absoluta de los datos.
              </p>
            </Clause>
            <Clause number="5.4" title="Disponibilidad del servicio">
              <p>
                {COMPANY} procura mantener una disponibilidad del servicio del{' '}
                <strong>99% mensual</strong> (excluyendo mantenimientos programados). No se garantiza
                disponibilidad ininterrumpida y {COMPANY} no se responsabiliza por interrupciones causadas
                por fuerzas mayores, fallas de proveedores de infraestructura (AWS, Render, Supabase) u
                otros eventos fuera de su control razonable.
              </p>
            </Clause>
            <Clause number="5.5" title="Exportación y portabilidad de datos">
              <p>
                El Suscriptor puede solicitar la exportación de sus datos en formatos estándar (CSV, PDF)
                en cualquier momento mientras su cuenta esté activa, sin costo adicional.
              </p>
            </Clause>
          </Section>

          <Section icon={<Shield className="w-5 h-5" />} title="6. Propiedad Intelectual">
            <Clause number="6.1" title="Derechos del Proveedor">
              <p>
                {APP}, su código fuente, diseño, logotipos, marca y toda la propiedad intelectual asociada
                son propiedad exclusiva de <strong>{COMPANY}</strong> y están protegidos por las leyes de
                propiedad intelectual aplicables. La suscripción no transfiere al Suscriptor ningún derecho
                de propiedad sobre el software.
              </p>
            </Clause>
            <Clause number="6.2" title="Licencia de uso limitada">
              <p>
                {COMPANY} otorga al Suscriptor una licencia limitada, no exclusiva, no transferible y
                revocable para acceder y utilizar {APP} durante la vigencia de la suscripción pagada,
                únicamente para los fines establecidos en estos Términos.
              </p>
            </Clause>
            <Clause number="6.3" title="Retroalimentación">
              <p>
                Si el Suscriptor proporciona sugerencias o comentarios sobre {APP}, {COMPANY} podrá
                utilizarlos libremente para mejorar el servicio sin ninguna obligación de compensación.
              </p>
            </Clause>
          </Section>

          <Section icon={<AlertTriangle className="w-5 h-5" />} title="7. Limitación de Responsabilidad">
            <Clause number="7.1" title="Exoneración de garantías">
              <p>
                EL SERVICIO SE PROPORCIONA <strong>"TAL CUAL"</strong> Y{' '}
                <strong>"SEGÚN DISPONIBILIDAD"</strong>. {COMPANY.toUpperCase()} NO OFRECE GARANTÍAS
                EXPRESAS NI IMPLÍCITAS DE COMERCIABILIDAD, IDONEIDAD PARA UN FIN PARTICULAR O AUSENCIA
                DE ERRORES.
              </p>
            </Clause>
            <Clause number="7.2" title="Responsabilidad máxima">
              <p>
                En ningún caso la responsabilidad total de {COMPANY} ante el Suscriptor, derivada del
                uso o imposibilidad de uso del servicio, excederá el importe pagado por el Suscriptor
                durante los <strong>tres (3) meses inmediatamente anteriores</strong> al evento que dio
                origen a la reclamación.
              </p>
            </Clause>
            <Clause number="7.3" title="Daños excluidos">
              <p>
                {COMPANY} no será responsable por: pérdida de ganancias, ingresos o datos, daños
                indirectos, incidentales, especiales o punitivos, aun cuando haya sido advertido de la
                posibilidad de tales daños.
              </p>
            </Clause>
            <Clause number="7.4" title="Responsabilidad del Suscriptor frente a sus clientes">
              <p>
                El Suscriptor es el único responsable de las actividades de préstamo que administra
                a través de {APP}, incluyendo el cumplimiento de las regulaciones financieras vigentes,
                el trato a sus clientes y el correcto uso de la información personal de los mismos.
                {COMPANY} no interviene en las relaciones contractuales entre el Suscriptor y sus
                clientes finales.
              </p>
            </Clause>
          </Section>

          <Section icon={<Scale className="w-5 h-5" />} title="8. Terminación del Contrato">
            <Clause number="8.1" title="Cancelación por el Suscriptor">
              <p>
                El Suscriptor puede cancelar su suscripción en cualquier momento desde el panel de
                configuración de la cuenta. La cancelación surte efecto al finalizar el período de
                facturación en curso. Los datos permanecerán disponibles por <strong>30 días</strong>
                adicionales para su exportación.
              </p>
            </Clause>
            <Clause number="8.2" title="Cancelación por {COMPANY}">
              <p>
                {COMPANY} puede terminar o suspender el acceso del Suscriptor en cualquier momento,
                con o sin previo aviso, si se determina una violación grave de estos Términos, fraude,
                uso ilegal del servicio o peligro inminente para la seguridad del sistema.
              </p>
            </Clause>
            <Clause number="8.3" title="Efectos de la terminación">
              <p>
                Tras la terminación, el Suscriptor perderá acceso a la plataforma. Las cláusulas sobre
                Propiedad Intelectual, Limitación de Responsabilidad, Datos y Ley Aplicable sobreviven
                a la terminación de estos Términos.
              </p>
            </Clause>
          </Section>

          <Section icon={<Scale className="w-5 h-5" />} title="9. Ley Aplicable y Resolución de Disputas">
            <Clause number="9.1" title="Jurisdicción">
              <p>
                Estos Términos se rigen e interpretan conforme a las leyes de la{' '}
                <strong>{JURISDICTION}</strong>, con exclusión de sus normas sobre conflicto de leyes.
              </p>
            </Clause>
            <Clause number="9.2" title="Resolución amigable">
              <p>
                Ante cualquier disputa, las partes procurarán resolverla amigablemente dentro de los
                <strong> 30 días calendario</strong> siguientes a la notificación escrita del conflicto.
              </p>
            </Clause>
            <Clause number="9.3" title="Fuero competente">
              <p>
                De no alcanzarse un acuerdo amigable, las partes someten sus controversias a los
                tribunales competentes de <strong>Santo Domingo, República Dominicana</strong>,
                renunciando a cualquier otro fuero que pudiera corresponderles.
              </p>
            </Clause>
          </Section>

          <Section icon={<FileText className="w-5 h-5" />} title="10. Modificaciones a estos Términos">
            <p>
              {COMPANY} se reserva el derecho de modificar estos Términos en cualquier momento.
              Las modificaciones serán notificadas al Suscriptor con al menos{' '}
              <strong>15 días de anticipación</strong> por correo electrónico o mediante aviso
              destacado en la plataforma. El uso continuado del servicio después de la fecha de
              vigencia de los cambios constituye aceptación de los nuevos Términos.
            </p>
          </Section>

          <Section icon={<Mail className="w-5 h-5" />} title="11. Contacto">
            <p>
              Para consultas, reclamos o notificaciones relacionadas con estos Términos, puede
              comunicarse con nosotros a través de:
            </p>
            <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm space-y-1">
              <p><strong>Empresa:</strong> {COMPANY}</p>
              <p><strong>Correo legal:</strong>{' '}
                <a href={`mailto:${EMAIL_LEGAL}`} className="text-[#1e3a5f] hover:underline">{EMAIL_LEGAL}</a>
              </p>
              <p><strong>Soporte:</strong>{' '}
                <a href={`mailto:${EMAIL_SUPPORT}`} className="text-[#1e3a5f] hover:underline">{EMAIL_SUPPORT}</a>
              </p>
              <p><strong>País:</strong> {JURISDICTION}</p>
            </div>
          </Section>

        </div>

        {/* Footer note */}
        <div className="mt-8 text-center text-xs text-slate-400 space-y-1">
          <p>© {new Date().getFullYear()} {COMPANY}. Todos los derechos reservados.</p>
          <p>
            <a href="/privacy" className="hover:text-slate-600 underline">Política de Privacidad</a>
            {' · '}
            <a href="/login" className="hover:text-slate-600 underline">Iniciar Sesión</a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default TermsPage
