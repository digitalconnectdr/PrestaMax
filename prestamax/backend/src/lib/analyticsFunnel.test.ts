import { describe, it, expect } from 'vitest';
import {
  computeSequentialFunnel, computeSignupSources, classifySignupSource, FunnelEventRow, FUNNEL_STEPS,
} from './analyticsFunnel';
import { normalizeSignupErrorType, ALLOWED_EVENT_NAMES, ONCE_PER_SESSION_EVENTS } from './analyticsHelpers';

let rid = 0;
const ev = (event_name: string, session: string | null, visitor: string | null, t: string, traffic_source: string | null = 'direct'): FunnelEventRow =>
  ({ rid: ++rid, event_name, session_id: session, visitor_id: visitor, created_at: `2026-10-01 ${t}`, traffic_source });
const step = (res: ReturnType<typeof computeSequentialFunnel>, key: string) => res.steps.find(s => s.key === key)!;

// Recorrido completo landing → pricing → CTA → signup_started de una sesion
const journey = (s: string, v: string, t0: number, extra: string[] = []) => {
  const t = (n: number) => `10:${String(t0 + n).padStart(2, '0')}:00`;
  const base = [
    ev('landing_view', s, v, t(0)), ev('pricing_view', s, v, t(1)),
    ev('trial_cta_click', s, v, t(2)), ev('signup_started', s, v, t(3)),
  ];
  extra.forEach((e, i) => base.push(ev(e, s, v, t(4 + i))));
  return base;
};

describe('computeSequentialFunnel — caso real reportado (CTA 3 / signup_started 4)', () => {
  // 3 sesiones por el landing + 1 sesion que llega directo a /register
  const rows = [
    ...journey('s1', 'v1', 0), ...journey('s2', 'v2', 10), ...journey('s3', 'v3', 20),
    ev('signup_started', 's4', 'v4', '11:00:00'),
  ];
  const res = computeSequentialFunnel(rows);

  it('signup_started secuencial = 3 (no 4) y nunca supera 100% del paso previo', () => {
    expect(step(res, 'cta').count).toBe(3);
    expect(step(res, 'signup_started').count).toBe(3);
    expect(step(res, 'signup_started').pctOfPrevious).toBe(100);
  });

  it('el acceso directo a /register SI cuenta como signup_started global', () => {
    const g = res.globals.find(x => x.event === 'signup_started')!;
    expect(g.sessions).toBe(4);
  });

  it('ninguna etapa supera 100% y el conteo es monotono no creciente', () => {
    for (let i = 1; i < res.steps.length; i++) {
      expect(res.steps[i].count).toBeLessThanOrEqual(res.steps[i - 1].count);
      expect(res.steps[i].pctOfPrevious).toBeLessThanOrEqual(100);
      expect(res.steps[i].pctOfTotal).toBeLessThanOrEqual(100);
    }
  });
});

describe('computeSequentialFunnel — orden temporal y misma sesion', () => {
  it('un recorrido real Landing → CTA → Signup se atribuye a la misma sesion hasta completar', () => {
    const rows = journey('s1', 'v1', 0, ['signup_completed', 'trial_activated']);
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'trial_activated').count).toBe(1);
    expect(step(res, 'signup_completed').count).toBe(1);
  });

  it('un signup_started ANTERIOR al CTA no cuenta como paso posterior al CTA', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('pricing_view', 's1', 'v1', '10:00:05'),
      ev('signup_started', 's1', 'v1', '10:00:10'), ev('trial_cta_click', 's1', 'v1', '10:00:20'),
    ];
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'cta').count).toBe(1);
    expect(step(res, 'signup_started').count).toBe(0);
    expect(res.globals.find(g => g.event === 'signup_started')!.sessions).toBe(1);
  });

  it('un CTA en otra sesion no habilita el signup de esta sesion', () => {
    const rows = [
      ...journey('s1', 'v1', 0).slice(0, 3),                    // landing, pricing, cta en s1
      ev('landing_view', 's2', 'v1', '10:30:00'),               // mismo visitante, otra sesion
      ev('pricing_view', 's2', 'v1', '10:30:05'),
      ev('signup_started', 's2', 'v1', '10:30:30'),             // signup en s2 sin CTA en s2
    ];
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'cta').count).toBe(1);
    expect(step(res, 'signup_started').count).toBe(0);
  });

  it('desempata eventos del mismo segundo por rowid (insercion)', () => {
    const rows = [
      ev('landing_view', 's1', 'v1', '10:00:00'), ev('pricing_view', 's1', 'v1', '10:00:00'),
      ev('trial_cta_click', 's1', 'v1', '10:00:00'), ev('signup_started', 's1', 'v1', '10:00:00'),
    ];
    expect(step(computeSequentialFunnel(rows), 'signup_started').count).toBe(1);
  });

  it('pasos de ciclo de vida usan el mismo VISITANTE aunque sea otra sesion, y deben ser posteriores', () => {
    const rows = [
      ...journey('s1', 'v1', 0, ['signup_completed', 'trial_activated']),
      ev('activation_completed', 's9', 'v1', '12:00:00'),       // otra sesion, mismo visitante, despues
      ev('checkout_started', 's9', 'v1', '12:05:00'),
      ev('activation_completed', 's10', 'v2', '12:00:00'),      // otro visitante que nunca paso por el funnel
    ];
    const res = computeSequentialFunnel(rows);
    expect(step(res, 'activated').count).toBe(1);
    expect(step(res, 'checkout_started').count).toBe(1);
    expect(step(res, 'subscription_started').count).toBe(0);
    expect(res.globals.find(g => g.event === 'activation_completed')!.visitors).toBe(2);
  });

  it('sin datos devuelve ceros sin dividir por cero', () => {
    const res = computeSequentialFunnel([]);
    expect(res.steps).toHaveLength(FUNNEL_STEPS.length);
    expect(res.steps.every(s => s.count === 0 && s.pctOfPrevious <= 100)).toBe(true);
    expect(res.overallConversion).toBe(0);
  });

  it('propiedad: con eventos aleatorios ninguna etapa excede 100%', () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const names = FUNNEL_STEPS.map(s => s.event);
    const rows: FunnelEventRow[] = [];
    for (let i = 0; i < 400; i++) {
      const n = Math.floor(rnd() * 25);
      rows.push(ev(names[Math.floor(rnd() * names.length)], `s${n}`, `v${n % 11}`, `10:${String(Math.floor(rnd() * 59)).padStart(2, '0')}:00`));
    }
    const res = computeSequentialFunnel(rows);
    for (let i = 1; i < res.steps.length; i++) {
      expect(res.steps[i].count).toBeLessThanOrEqual(res.steps[i - 1].count);
      expect(res.steps[i].pctOfPrevious).toBeLessThanOrEqual(100);
    }
  });
});

describe('origen del signup', () => {
  it('clasifica landing_cta, seo, direct, referral y other_unknown', () => {
    const rows = [
      ...journey('a', 'va', 0),                                                         // CTA previo → landing_cta
      ev('seo_cta_click', 'b', 'vb', '10:00:00'), ev('signup_started', 'b', 'vb', '10:00:05', 'direct'), // seo
      ev('signup_started', 'c', 'vc', '10:00:00', 'direct'),                            // direct
      ev('signup_started', 'd', 'vd', '10:00:00', 'referral'),                          // referral
      ev('signup_started', 'e', 've', '10:00:00', null),                                // legacy → other_unknown
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
