import React, { useId } from 'react'
import Input from '@/components/ui/Input'
import { useT } from '@/lib/i18n'
import {
  MoraValues, ProductMoraForm, SYSTEM_MORA_VALUES, formFromValues, pctFromFraction, MORA_BASE_OPTIONS,
} from '@/lib/productMora'

interface Props {
  value: ProductMoraForm
  onChange: (next: ProductMoraForm) => void
  /** Mora general vigente de la empresa (referencia mientras hereda; precarga al personalizar). */
  globals: MoraValues | null
}

const BASE_LABEL_KEY: Record<string, string> = {
  cuota_vencida: 'set.mora_cuota',
  capital_pendiente: 'set.mora_cap_pend',
  capital_vencido: 'set.mora_cap_venc',
}

/**
 * "Configuración de mora" del producto:
 *   ● Usar configuración general de la empresa   (por defecto; muestra los valores generales sin duplicarlos)
 *   ○ Personalizar para este producto            (precarga los valores generales y permite editarlos)
 * Al crear un préstamo con el producto, esa mora se copia al préstamo (instantánea).
 */
const ProductMoraSection: React.FC<Props> = ({ value, onChange, globals }) => {
  const t = useT()
  const uid = useId()
  const g = globals ?? SYSTEM_MORA_VALUES
  const set = (patch: Partial<ProductMoraForm>) => onChange({ ...value, ...patch })
  const baseLabel = (b: string) => t(BASE_LABEL_KEY[b] || 'set.mora_cuota')
  const sel = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <fieldset className="md:col-span-2 border border-slate-200 rounded-lg bg-white p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">{t('set.prod_mora_title')}</legend>

      <div role="radiogroup" aria-label={t('set.prod_mora_title')} className="space-y-2">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="radio" name={`${uid}-mora-mode`} className="mt-1" checked={value.inherit}
            onChange={() => onChange(formFromValues(true, g))} />
          <span>
            <span className="block text-sm font-medium text-slate-800">{t('set.prod_mora_inherit')}</span>
            <span className="block text-xs text-slate-500">{t('set.prod_mora_inherit_note')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="radio" name={`${uid}-mora-mode`} className="mt-1" checked={!value.inherit}
            onChange={() => { if (value.inherit) onChange(formFromValues(false, g)) }} />
          <span>
            <span className="block text-sm font-medium text-slate-800">{t('set.prod_mora_custom')}</span>
            <span className="block text-xs text-slate-500">{t('set.prod_mora_custom_note')}</span>
          </span>
        </label>
      </div>

      {value.inherit ? (
        <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs" aria-label={t('set.prod_mora_current_global')}>
          <div><dt className="text-slate-500">{t('set.mora_rate')}</dt><dd className="font-semibold text-slate-800">{pctFromFraction(g.moraRateDaily)} %</dd></div>
          <div><dt className="text-slate-500">{t('set.mora_grace')}</dt><dd className="font-semibold text-slate-800">{g.moraGraceDays}</dd></div>
          <div><dt className="text-slate-500">{t('set.mora_apply_on')}</dt><dd className="font-semibold text-slate-800">{baseLabel(g.moraBase)}</dd></div>
          <div><dt className="text-slate-500">{t('set.mora_fixed')}</dt><dd className="font-semibold text-slate-800">{g.moraFixedEnabled ? g.moraFixedAmount : t('set.disabled')}</dd></div>
        </dl>
      ) : (
        <>
        <p className="mt-3 text-xs text-slate-500">{t('set.prod_mora_custom_info')}</p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('set.mora_apply_on')}</label>
            <select value={value.base} onChange={e => set({ base: e.target.value })} className={sel}>
              {MORA_BASE_OPTIONS.map(b => <option key={b} value={b}>{baseLabel(b)}</option>)}
            </select>
          </div>
          <Input label={t('set.mora_rate')} type="number" step="0.001" min="0" max="100" value={value.ratePct}
            onChange={e => set({ ratePct: e.target.value })} />
          <Input label={t('set.mora_grace')} type="number" step="1" min="0" value={value.graceDays}
            onChange={e => set({ graceDays: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('set.mora_fixed')}</label>
            <select value={value.fixedEnabled} onChange={e => set({ fixedEnabled: parseInt(e.target.value) })} className={sel}>
              <option value={1}>{t('set.enabled')}</option>
              <option value={0}>{t('set.disabled')}</option>
            </select>
          </div>
          {value.fixedEnabled === 1 && (
            <Input label={t('set.mora_fixed_amt')} type="number" step="0.01" min="0" value={value.fixedAmount}
              onChange={e => set({ fixedAmount: e.target.value })} />
          )}
        </div>
        </>
      )}
    </fieldset>
  )
}

export default ProductMoraSection
