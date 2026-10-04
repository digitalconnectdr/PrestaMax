// Ayudas contextuales (ⓘ) en General > Operación (Modo de Score) y General > Mora y pagos.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const fe = (p: string) => fs.readFileSync(path.join(__dirname, '../../../frontend/src', p), 'utf8');
const settings = fe('pages/settings/SettingsPage.tsx');
const i18n = fe('lib/i18n.ts');
const infoTip = fe('components/shared/InfoTip.tsx');

// Cada campo que debe tener ayuda: etiqueta (clave i18n) -> claves de la ayuda
const FIELDS: Array<[string, string[]]> = [
  ['set.score_mode',      ['set.tip.score_aria', 'set.tip.score_intro', 'set.tip.score_global', 'set.tip.score_tenant']],
  ['set.mora_apply_on',   ['set.tip.apply_aria', 'set.tip.apply_intro', 'set.tip.apply_cuota', 'set.tip.apply_capital', 'set.tip.apply_note']],
  ['set.mora_rate',       ['set.tip.rate_aria', 'set.tip.rate_intro', 'set.tip.rate_example', 'set.tip.rate_note']],
  ['set.mora_fixed',      ['set.tip.fixed_aria', 'set.tip.fixed_intro', 'set.tip.fixed_on', 'set.tip.fixed_off']],
  ['set.rebate',          ['set.tip.rebate_aria', 'set.tip.rebate_intro', 'set.tip.rebate_on', 'set.tip.rebate_off']],
  ['set.rebate_type',     ['set.tip.rebate_type_aria', 'set.tip.rebate_type_intro', 'set.tip.rebate_prop', 'set.tip.rebate_fix']],
];

describe('ayudas ⓘ de Operación y Mora y pagos', () => {
  it('cada campo pedido usa InfoTip junto a su etiqueta con sus textos', () => {
    expect(settings).toContain("import InfoTip from '@/components/shared/InfoTip'");
    for (const [label, keys] of FIELDS) {
      const at = settings.indexOf(`tGen('${label}')`);
      expect(at, label).toBeGreaterThan(-1);
      const around = settings.slice(at, at + 1200);
      expect(around, label).toContain('<InfoTip');
      for (const k of keys) expect(around, `${label} -> ${k}`).toContain(`'${k}'`);
    }
  });

  it('los textos existen en español, inglés y portugués y no están vacíos', () => {
    const all = new Set(FIELDS.flatMap(([, ks]) => ks).concat(['set.tip.apply_term_cap', 'set.tip.fixed_term_on', 'set.tip.fixed_term_off', 'set.tip.example']));
    for (const k of all) {
      const line = i18n.split('\n').find(l => l.trimStart().startsWith(`'${k}':`));
      expect(line, k).toBeTruthy();
      for (const lang of ['es', 'en', 'pt']) expect(line!, `${k}.${lang}`).toMatch(new RegExp(`${lang}: '[^']{3,}`));
    }
  });

  it('el componente es accesible: botón con aria-label, role="tooltip", hover/foco/clic y cierre con Esc o clic fuera', () => {
    expect(infoTip).toContain('aria-label={ariaLabel}');
    expect(infoTip).toContain('role="tooltip"');
    expect(infoTip).toContain('aria-describedby');
    for (const h of ['onMouseEnter', 'onFocus', 'onClick', "e.key === 'Escape'", "addEventListener('mousedown'"]) expect(infoTip, h).toContain(h);
    expect(infoTip).toContain('max-w-[calc(100vw-1rem)]');      // no desborda en móvil
  });

  it('el globo se coloca según el espacio real de la ventana (no se corta abajo ni a los lados)', () => {
    expect(infoTip).toContain('fixed');                          // no depende del overflow de ningún contenedor
    expect(infoTip).toContain('getBoundingClientRect');
    expect(infoTip).toContain('window.innerHeight');
    expect(infoTip).toContain('window.innerWidth');
    expect(infoTip).toContain('useBelow');                       // abajo si cabe, si no arriba
    expect(infoTip).toContain('overflow-y-auto');                // si ni así cabe, scroll interno
    expect(infoTip).toContain("addEventListener('scroll', place, true)");
    expect(infoTip).toContain("addEventListener('resize', place)");
  });

  it('el modal Editar Préstamo scrollea desde arriba (el centrado va en un hijo min-h-full, no en el contenedor con overflow)', () => {
    const modal = fe('pages/loans/EditLoanModal.tsx');
    expect(modal).toContain('fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto');
    expect(modal).toContain('flex min-h-full items-center justify-center p-4');
    expect(modal).not.toContain('flex items-center justify-center z-50 p-4 overflow-y-auto');
  });

  it('el Input admite un complemento junto a la etiqueta sin cambiar el resto de usos', () => {
    const input = fe('components/ui/Input.tsx');
    expect(input).toContain('labelAddon');
    expect(input).toContain('{labelAddon}');
  });
});
