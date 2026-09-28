// pricing — cálculo de precio anual (Fase 3). Regla de negocio: el precio
// anual equivale a 9 mensualidades (3 meses gratis respecto al normal de 12).
// Una sola fórmula compartida por LandingPage y BillingPage para que nunca
// queden desincronizadas.
export interface AnnualPricing {
  annual: number
  monthlyEquivalent: number
  normalYearPrice: number
  savings: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function computeAnnualPricing(priceMonthly: number): AnnualPricing {
  const annual = r2(priceMonthly * 9)
  const normalYearPrice = r2(priceMonthly * 12)
  return {
    annual,
    monthlyEquivalent: r2(annual / 12),
    normalYearPrice,
    savings: r2(normalYearPrice - annual),
  }
}

export type BillingPeriod = 'monthly' | 'annual'
