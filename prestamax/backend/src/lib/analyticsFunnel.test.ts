import { describe, it, expect } from 'vitest';
import {
  computeSequentialFunnel, computeSignupSources, classifySignupSource, computeGlobalCounts,
  FunnelEventRow, MAIN_FUNNEL_STEPS, PRICING_FUNNEL_STEPS, ALL_FUNNEL_EVENTS,
} from './analyticsFunnel';
import { normalizeSignupErrorType, ALLOWED_EVENT_NAMES, ONCE_PER_SESSION_EVENTS } from './analyticsHelpers';

let rid = 0;
const ev = (event_name: string, session: string | null, visitor: string | null, t: string,
  traffic_source: string | null = 'direct', cta_location: string | null = null): FunnelEventRow =>
  ({ rid: ++rid, event_name, session_id: session, visitor_id: visitor, created_at: `2026-10-01 ${t}`, traffic_source, cta_location });
const step = (res: ReturnType<typeof computeSequentialFunnel>, key: string) => res.steps.find(s => s.key === key)!;
const pricing = (rows: FunnelEventRow[]) => computeSequentialFunnel(rows, PRICING_FUNNEL_STEPS);

// Recorrido desde el CTA del HERO (sin pasar por Precios): landing -> CTA(hero) -> signup_started
const heroJourney = (s: string, v: string, t0: number, extra: string[] = []) => {
  const t = (n: number) => `10:${String(t0 + n).padStart(2, '0')}:00`;
  const base = [ev('landing_view', s, v, t(0)), ev('trial_cta_click', s, v, t(1), 'direct', 'hero'), ev('signup_started', s, v, t(2))];
  extra.forEach((e, i) => base.push(ev(e, s, v, t(3 + i))));
  return base;
};
// Recorrido por PRECIOS: landing -> pricing_view -> CTA(pricing) -> signup_started
const pricingJourney = (s: string, v: string, t0: number, extra: string[] = []) => {
  const t = (n: number) => `10:${String(t0 + n).padStart(2, '0')}:00`;
  const base = [
    ev('landing_view', s, v, t(0)), ev('pricing_view', s, v, t(1)),
    ev('trial_cta_click', s, v, t(2), 'direct', 'pricing'), ev('signup_started', s, v, t(3)),
  ];
  extra.forEach((e, i) => base.push(ev(e, s, v, t(4 + i))));
  return base;
};

describe('definicion de los funnels', () => {
  it('el funnel principal NO incluye pricing_view y conserva el resto de pasos en orden', () => {
    expect(MAIN_FUNNEL_STEPS.map(s => s.event)).toEqual([
      'landing_view', 'trial_cta_click', 'signup_started', 'signup_completed',
      'trial_activated', 'activation_completed', 'checkout_started', 'subscription_started',
    ]);
  });
  it('el funnel de Precios es separado: landing -> pricing -> CTA(pricing) -> signup_started -> signup_completed', () => {
    expect(PRICING_FUNNEL_STEPS.map(s => s.event)).toEqual(['landing_view', 'pricing_view', 'trial_cta_click', 'signup_started', 'signup_completed']);
    expect(PRICING_FUNNEL_STEPS[2].cta).toBe('pricing');
  });
});

describe('funnel PRINCIPAL — caso real reportado (CTA 3 / signup_started 4)', () => {
  // 3 sesiones por el landing + 1 sesion que llega directo a /register
  const rows = [
    ...heroJourney('s1', 'v1', 0), ...heroJourney('s2', 'v2', 10), ...heroJourney('s3', 'v3', 20),
    ev('signup_started', 's4', 'v4', '11:00:00'),
  ];
  const res = computeSequentialFunnel(rows);

  it('signup_started secuencial = 3 (no 4) y nunca supera 100% del paso previo', () => {
    expect(step(res, 'cta').count).toBe(3);
    expect(step(res, 'signup_started').count).toBe(3);
    expect(step(res, 'signup_started').pctOfPrevious).toBe(100);
  });

  it('el acceso directo a /register SI cuenta como signup_started global', () => {
    expect(computeGlobalCounts(rows).find(x => x.event === 'signup_started')!.sessions).toBe(4);
  });

  it('ninguna etapa supera 100% y el conteo es monotono no creciente', () => {
    for (let i = 1; i < res.steps.length; i++) {
      expect(res.steps[i].count).toBeLessThanOrEqual(res.steps[i - 1].count);
      expect(res.steps[i].pctOfPrevious).toBeLessThanOrEqual(100);
      expect(res.steps[i].pctOfTotal).toBeLessThanOrEqual(100);
    }
  });
});

describe('funnel PRINCIPAL — no exige pricing_view', () => {
  it('una conversion desde el CTA del Hero (sin ver precios) cuenta completa en el funnel principal', () => {
    const res = computeSequentialFunnel(heroJourney('s1', 'v1', 0, ['signup_completed', 'trial_activated']));
    expect(step(res, 'cta').count).toBe(1);
    expect(step(res, 'trial_activated').count).toBe(1);
    expect(step(res, 'trial_activated').pctOfTotal).toBe(100);
  });

  it('esa misma conversion NO aparece en el funnel diagnostico de Precios (nunca vio Precios)', () => {
    const res = pricing(heroJourney('s1', 'v1', 0, ['signup_completed']));
    expect(res.steps.find(s => s.key === 'pricing')!.count).toBe(0);
    expect(res.steps.find(s => s.key === 'signup_completed')!.count).toBe(0);
  });

  it('una conversion desde el footer o una pagina SEO (CTA con otra ubicacion) tambien cuenta', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('trial_cta_click', 's1', 'v1', '10:00:05', 'direct', 'footer'), ev('signup_started', 's1', 'v1', '10:00:06'),
      ev('landing_view', 's2', 'v2', '10:10:00'), ev('trial_cta_click', 's2', 'v2', '10:10:05', 'direct', 'nav_mobile'), ev('signup_started', 's2', 'v2', '10:10:06'),
    ];
    expect(step(computeSequentialFunnel(rows), 'signup_started').count).toBe(2);
  });
});

describe('funnel PRINCIPAL — orden temporal y misma sesion', () => {
  it('un recorrido real Landing -> CTA -> Signup se atribuye a la misma sesion hasta completar', () => {
    const res = computeSequentialFunnel(heroJourney('s1', 'v1', 0, ['signup_completed', 'trial_activated']));
    expect(step(res, 'trial_activated').count).toBe(1);
    expect(step(res, 'signup_completed').count).toBe(1);
  });

  it('un signup_started ANTERIOR al CTA no cuenta como paso posterior al CTA', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('signup_started', 's1', 'v1', '10:00:10'),
      ev('trial_cta_click', 's1', 'v1', '10:00:20', 'direct', 'hero'),
    ];
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'cta').count).toBe(1);
    expect(step(res, 'signup_started').count).toBe(0);
    expect(computeGlobalCounts(rows).find(g => g.event === 'signup_started')!.sessions).toBe(1);
  });

  it('un CTA en otra sesion no habilita el signup de esta sesion', () => {
    const rows = [
      ...heroJourney('s1', 'v1', 0).slice(0, 2),                // landing + CTA en s1
      ev('landing_view', 's2', 'v1', '10:30:00'),               // mismo visitante, otra sesion
      ev('signup_started', 's2', 'v1', '10:30:30'),             // signup en s2 sin CTA en s2
    ];
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'cta').count).toBe(1);
    expect(step(res, 'signup_started').count).toBe(0);
  });

  it('desempata eventos del mismo segundo por rowid (insercion)', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('trial_cta_click', 's1', 'v1', '10:00:00', 'direct', 'hero'),
      ev('signup_started', 's1', 'v1', '10:00:00'),
    ];
    expect(step(computeSequentialFunnel(rows), 'signup_started').count).toBe(1);
  });

  it('pasos de ciclo de vida usan el mismo VISITANTE aunque sea otra sesion, y deben ser posteriores', () => {
    const rows = [
      ...heroJourney('s1', 'v1', 0, ['signup_completed', 'trial_activated']),
      ev('activation_completed', 's9', 'v1', '12:00:00'),       // otra sesion, mismo visitante, despues
      ev('checkout_started', 's9', 'v1', '12:05:00'),
      ev('activation_completed', 's10', 'v2', '12:00:00'),      // otro visitante que nunca paso por el funnel
    ];
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'activated').count).toBe(1);
    expect(step(res, 'checkout_started').count).toBe(1);
    expect(step(res, 'subscription_started').count).toBe(0);
    expect(computeGlobalCounts(rows).find(g => g.event === 'activation_completed')!.visitors).toBe(2);
  });

  it('sin datos devuelve ceros sin dividir por cero (ambos funnels)', () => {
    for (const res of [computeSequentialFunnel([]), pricing([])]) {
      expect(res.steps.every(s => s.count === 0 && s.pctOfPrevious <= 100)).toBe(true);
      expect(res.overallConversion).toBe(0);
    }
    expect(computeSequentialFunnel([]).steps).toHaveLength(MAIN_FUNNEL_STEPS.length);
  });

  it('propiedad: con eventos aleatorios ninguna etapa excede 100% (funnel principal y de Precios)', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const rows: FunnelEventRow[] = [];
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rnd() * 25);
      const name = ALL_FUNNEL_EVENTS[Math.floor(rnd() * ALL_FUNNEL_EVENTS.length)];
      const cta = name === 'trial_cta_click' ? (rnd() < 0.5 ? 'pricing' : 'hero') : null;
      rows.push(ev(name, `s${n}`, `v${n % 11}`, `10:${String(Math.floor(rnd() * 59)).padStart(2, '0')}:00`, 'direct', cta));
    }
    for (const res of [computeSequentialFunnel(rows), pricing(rows)]) {
      for (let i = 1; i < res.steps.length; i++) {
        expect(res.steps[i].count).toBeLessThanOrEqual(res.steps[i - 1].count);
        expect(res.steps[i].pctOfPrevious).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('funnel DIAGNOSTICO de Precios', () => {
  it('cuenta el camino landing -> pricing_view -> CTA(pricing) -> signup_started -> signup_completed', () => {
    const res = pricing(pricingJourney('s1', 'v1', 0, ['signup_completed']));
    expect(res.steps.map(s => s.count)).toEqual([1, 1, 1, 1, 1]);
    expect(res.overallConversion).toBe(100);
  });

  it('exige que el CTA sea el de Precios: un CTA del Hero tras ver Precios no avanza el diagnostico', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('pricing_view', 's1', 'v1', '10:00:05'),
      ev('trial_cta_click', 's1', 'v1', '10:00:10', 'direct', 'hero'), ev('signup_started', 's1', 'v1', '10:00:11'),
    ];
    const res = pricing(rows);
    expect(res.steps.find(s => s.key === 'pricing')!.count).toBe(1);
    expect(res.steps.find(s => s.key === 'cta_pricing')!.count).toBe(0);
    expect(step(computeSequentialFunnel(rows), 'signup_started').count).toBe(1); // pero en el principal SI convierte
  });

  it('el CTA de Precios debe ser posterior a pricing_view', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('trial_cta_click', 's1', 'v1', '10:00:05', 'direct', 'pricing'),
      ev('pricing_view', 's1', 'v1', '10:00:10'), ev('signup_started', 's1', 'v1', '10:00:11'),
    ];
    expect(pricing(rows).steps.find(s => s.key === 'cta_pricing')!.count).toBe(0);
  });

  it('mezcla de recorridos: principal y Precios cuentan poblaciones distintas sin superar 100%', () => {
    const rows = [
      ...heroJourney('a', 'va', 0, ['signup_completed']),
      ...pricingJourney('b', 'vb', 10, ['signup_completed']),
      ...pricingJourney('c', 'vc', 20),
      ev('landing_view', 'd', 'vd', '10:40:00'),
    ];
    const main = computeSequentialFunnel(rows);
    const pr = pricing(rows);
    expect(main.steps.map(s => s.count).slice(0, 4)).toEqual([4, 3, 3, 2]);   // landing, cta, started, completed
    expect(pr.steps.map(s => s.count)).toEqual([4, 2, 2, 2, 1]);              // landing, pricing, cta(pricing), started, completed
    for (const r of [main, pr]) for (const s of r.steps) expect(s.pctOfPrevious).toBeLessThanOrEqual(100);
  });
});

describe('totales globales', () => {
  it('incluyen pricing_view aunque no sea parte del funnel principal', () => {
    const rows = pricingJourney('a', 'va', 0);
    const g = computeGlobalCounts(rows);
    expect(g.map(x => x.event)).toEqual(ALL_FUNNEL_EVENTS);
    expect(g.find(x => x.event === 'pricing_view')!.sessions).toBe(1);
  });
});

describe('origen del signup', () => {
  it('clasifica landing_cta, seo, direct, referral y other_unknown', () => {
    const rows = [
      ...heroJourney('a', 'va', 0),                                                     // CTA previo -> landing_cta
      ev('seo_cta_click', 'b', 'vb', '10:00:00'), ev('signup_started', 'b', 'vb', '10:00:05', 'direct'), // seo
      ev('signup_started', 'c', 'vc', '10:00:00', 'direct'),                            // direct
      ev('signup_started', 'd', 'vd', '10:00:00', 'referral'),                          // referral
      ev('signup_started', 'e', 've', '10:00:00', null),                                // legacy -> other_unknown
    ];
    expect(computeSignupSources(rows)).toEqual({ landing_cta: 1, seo: 1, direct: 1, referral: 1, other_unknown: 1 });
  });

  it('un signup directo a /register NO entra a landing_cta', () => {
    expect(computeSignupSources([ev('signup_started', 'x', 'vx', '10:00:00', 'direct')]).landing_cta).toBe(0);
  });

  it('datos sin informacion suficiente nunca se convierten en direct', () => {
    expect(classifySignupSource({ hadCtaBefore: false, hadSeoBefore: false, trafficSource: null })).toBe('other_unknown');
    expect(classifySignupSource({ hadCtaBefore: false, hadSeoBefore: false, trafficSource: 'unknown' })).toBe('other_unknown');
    expect(classifySignupSource({ hadCtaBefore: false, hadSeoBefore: false, trafficSource: 'paid' })).toBe('other_unknown');
  });

  it('cuenta una sola vez por sesion aunque signup_started se repita', () => {
    const rows = [ev('signup_started', 'x', 'vx', '10:00:00'), ev('signup_started', 'x', 'vx', '10:00:01')];
    const out = computeSignupSources(rows);
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('signup_error — categoria segura, sin PII', () => {
  it('solo acepta categorias tecnicas; cualquier otro valor pasa a unknown', () => {
    expect(normalizeSignupErrorType('duplicate_email')).toBe('duplicate_email');
    expect(normalizeSignupErrorType('network')).toBe('network');
    expect(normalizeSignupErrorType('juan@correo.com')).toBe('unknown');
    expect(normalizeSignupErrorType('La contrasena debe contener un numero')).toBe('unknown');
    expect(normalizeSignupErrorType(undefined)).toBe('unknown');
    expect(normalizeSignupErrorType({ a: 1 })).toBe('unknown');
  });

  it('nuevos eventos permitidos y eventos baseline intactos', () => {
    for (const n of ['signup_submit', 'signup_error', 'landing_view', 'pricing_view', 'trial_cta_click', 'signup_started',
      'signup_completed', 'trial_activated', 'activation_completed', 'checkout_started', 'subscription_started', 'section_view', 'scroll_25', 'scroll_100']) {
      expect(ALLOWED_EVENT_NAMES.has(n)).toBe(true);
    }
    expect(ONCE_PER_SESSION_EVENTS.has('signup_completed')).toBe(true);
    expect(ONCE_PER_SESSION_EVENTS.has('signup_started')).toBe(false);
  });
});
