// ─────────────────────────────────────────────────────────────────────────────
// analyticsFunnel — logica PURA (sin DB) del funnel de adquisicion y del origen
// del signup, para poder probarla con vitest.
//
// Por que existe (oct 2026): el funnel anterior contaba, por cada paso,
// sesiones distintas con ESE evento sin exigir haber pasado por el paso previo.
// Por eso "CTA=3 / signup_started=4" daba 133%: el 4to signup_started era una
// sesion que llego directo a /register (o desde una pagina SEO) sin ningun CTA
// del landing. Aqui cada paso cuenta SOLO a quienes completaron el anterior y
// en orden temporal; los totales "globales" (sin exigir el paso previo) se
// devuelven aparte para que no se pierda ningun signup real.
// ─────────────────────────────────────────────────────────────────────────────

export interface FunnelEventRow {
  rid: number;                       // rowid: desempata eventos del mismo segundo
  event_name: string;
  session_id: string | null;
  visitor_id: string | null;
  created_at: string;
  traffic_source?: string | null;    // solo se usa para clasificar el origen del signup
}

// Pasos 1-6 (adquisicion): misma SESION. Pasos 7-9 (ciclo de vida): mismo
// VISITANTE, porque pueden ocurrir dias despues, en otra sesion.
export const FUNNEL_STEPS: { key: string; event: string; scope: 'session' | 'visitor' }[] = [
  { key: 'landing', event: 'landing_view', scope: 'session' },
  { key: 'pricing', event: 'pricing_view', scope: 'session' },
  { key: 'cta', event: 'trial_cta_click', scope: 'session' },
  { key: 'signup_started', event: 'signup_started', scope: 'session' },
  { key: 'signup_completed', event: 'signup_completed', scope: 'session' },
  { key: 'trial_activated', event: 'trial_activated', scope: 'session' },
  { key: 'activated', event: 'activation_completed', scope: 'visitor' },
  { key: 'checkout_started', event: 'checkout_started', scope: 'visitor' },
  { key: 'subscription_started', event: 'subscription_started', scope: 'visitor' },
];

export interface FunnelStepResult {
  key: string; event: string; count: number;
  pctOfPrevious: number; pctOfTotal: number; dropOff: number;
}
export interface GlobalEventCount { event: string; sessions: number; visitors: number }

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Ordena por (created_at, rid): orden temporal estable aunque haya empates al segundo. */
function sortRows(rows: FunnelEventRow[]): (FunnelEventRow & { ord: number })[] {
  return [...rows]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.rid - b.rid))
    .map((r, i) => ({ ...r, ord: i }));
}

export function computeSequentialFunnel(rawRows: FunnelEventRow[]): {
  steps: FunnelStepResult[];
  overallConversion: number;
  globals: GlobalEventCount[];
} {
  const rows = sortRows(rawRows);

  // Indices por evento: clave -> lista ascendente de ord
  const bySession = new Map<string, Map<string, number[]>>(); // event -> session -> ords
  const byVisitor = new Map<string, Map<string, number[]>>(); // event -> visitor -> ords
  const sessionVisitor = new Map<string, string>();
  const add = (m: Map<string, Map<string, number[]>>, ev: string, key: string, ord: number) => {
    let inner = m.get(ev); if (!inner) { inner = new Map(); m.set(ev, inner); }
    const arr = inner.get(key); if (arr) arr.push(ord); else inner.set(key, [ord]);
  };
  for (const r of rows) {
    if (r.session_id) add(bySession, r.event_name, r.session_id, r.ord);
    if (r.visitor_id) add(byVisitor, r.event_name, r.visitor_id, r.ord);
    if (r.session_id && r.visitor_id && !sessionVisitor.has(r.session_id)) sessionVisitor.set(r.session_id, r.visitor_id);
  }
  const firstAfter = (ords: number[] | undefined, after: number) => {
    if (!ords) return undefined;
    for (const o of ords) if (o > after) return o;
    return undefined;
  };

  const counts: number[] = [];
  // ── Paso 1: sesiones con landing_view (primer evento) ──
  let cur = new Map<string, number>();
  for (const [sid, ords] of bySession.get(FUNNEL_STEPS[0].event) || []) cur.set(sid, ords[0]);
  counts.push(cur.size);

  // ── Pasos 2..6: misma sesion, evento posterior al paso previo ──
  let i = 1;
  for (; i < FUNNEL_STEPS.length && FUNNEL_STEPS[i].scope === 'session'; i++) {
    const next = new Map<string, number>();
    const evMap = bySession.get(FUNNEL_STEPS[i].event);
    for (const [sid, prevOrd] of cur) {
      const o = firstAfter(evMap?.get(sid), prevOrd);
      if (o !== undefined) next.set(sid, o);
    }
    cur = next;
    counts.push(cur.size);
  }

  // ── Pasos 7..9: por visitante. Se parte de los visitantes de las sesiones que
  // llegaron a trial_activated (ord minimo por visitante). ──
  let curV = new Map<string, number>();
  for (const [sid, ord] of cur) {
    const vid = sessionVisitor.get(sid);
    if (!vid) continue;
    const prev = curV.get(vid);
    if (prev === undefined || ord < prev) curV.set(vid, ord);
  }
  for (; i < FUNNEL_STEPS.length; i++) {
    const next = new Map<string, number>();
    const evMap = byVisitor.get(FUNNEL_STEPS[i].event);
    for (const [vid, prevOrd] of curV) {
      const o = firstAfter(evMap?.get(vid), prevOrd);
      if (o !== undefined) next.set(vid, o);
    }
    curV = next;
    counts.push(curV.size);
  }

  const first = counts[0] || 0;
  const steps: FunnelStepResult[] = FUNNEL_STEPS.map((s, idx) => {
    const count = counts[idx];
    const prev = idx === 0 ? null : counts[idx - 1];
    return {
      key: s.key, event: s.event, count,
      pctOfPrevious: idx === 0 ? 100 : pct(count, prev as number),
      pctOfTotal: pct(count, first),
      dropOff: prev != null ? Math.max(0, prev - count) : 0,
    };
  });

  const globals: GlobalEventCount[] = FUNNEL_STEPS.map(s => ({
    event: s.event,
    sessions: bySession.get(s.event)?.size || 0,
    visitors: byVisitor.get(s.event)?.size || 0,
  }));

  return { steps, overallConversion: pct(counts[counts.length - 1], first), globals };
}

// ── Origen del signup ────────────────────────────────────────────────────────
export type SignupSource = 'landing_cta' | 'seo' | 'direct' | 'referral' | 'other_unknown';

export function classifySignupSource(args: {
  hadCtaBefore: boolean;          // trial_cta_click previo en la misma sesion
  hadSeoBefore: boolean;          // seo_cta_click / resource_view previo en la misma sesion
  trafficSource: string | null;   // traffic_source del propio signup_started
}): SignupSource {
  if (args.hadCtaBefore) return 'landing_cta';
  if (args.hadSeoBefore) return 'seo';
  switch (args.trafficSource) {
    case 'direct': return 'direct';
    case 'organic': return 'seo';
    case 'referral':
    case 'social': return 'referral';
    default: return 'other_unknown'; // paid, unknown, NULL (legacy): nunca se convierte en 'direct'
  }
}

/** Una fila por sesion con signup_started (el primero), clasificada por su origen. */
export function computeSignupSources(rawRows: FunnelEventRow[]): Record<SignupSource, number> {
  const rows = sortRows(rawRows);
  const out: Record<SignupSource, number> = { landing_cta: 0, seo: 0, direct: 0, referral: 0, other_unknown: 0 };
  const firstSignup = new Map<string, { ord: number; src: string | null }>();
  for (const r of rows) {
    if (r.event_name === 'signup_started' && r.session_id && !firstSignup.has(r.session_id)) {
      firstSignup.set(r.session_id, { ord: r.ord, src: r.traffic_source ?? null });
    }
  }
  const before = (sid: string, events: string[], ord: number) =>
    rows.some(r => r.session_id === sid && events.includes(r.event_name) && r.ord < ord);
  for (const [sid, s] of firstSignup) {
    out[classifySignupSource({
      hadCtaBefore: before(sid, ['trial_cta_click'], s.ord),
      hadSeoBefore: before(sid, ['seo_cta_click', 'resource_view'], s.ord),
      trafficSource: s.src,
    })]++;
  }
  return out;
}
