import { describe, it, expect } from 'vitest';
import {
  classifyBot, detectDeviceType, categorizeTrafficSource, stripPotentialPii, ALLOWED_EVENT_NAMES,
} from './analyticsHelpers';

describe('classifyBot', () => {
  it('marca como bot un User-Agent vacio', () => {
    expect(classifyBot('').isBot).toBe(true);
    expect(classifyBot(null).isBot).toBe(true);
    expect(classifyBot(undefined).isBot).toBe(true);
  });

  it('marca como bot navigator.webdriver=true sin importar el UA', () => {
    const r = classifyBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', true);
    expect(r.isBot).toBe(true);
    expect(r.reason).toBe('webdriver_flag');
  });

  it('detecta crawlers de buscadores conocidos', () => {
    expect(classifyBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)').isBot).toBe(true);
    expect(classifyBot('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)').isBot).toBe(true);
  });

  it('detecta crawlers de IA/LLM conocidos', () => {
    expect(classifyBot('Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)').isBot).toBe(true);
    expect(classifyBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)').isBot).toBe(true);
    expect(classifyBot('Mozilla/5.0 (compatible; PerplexityBot/1.0)').isBot).toBe(true);
  });

  it('detecta previsualizadores de redes sociales/mensajeria', () => {
    expect(classifyBot('facebookexternalhit/1.1').isBot).toBe(true);
    expect(classifyBot('WhatsApp/2.23.20.0').isBot).toBe(true);
    expect(classifyBot('Slackbot-LinkExpanding 1.0').isBot).toBe(true);
  });

  it('detecta automatizacion/navegadores headless', () => {
    expect(classifyBot('Mozilla/5.0 HeadlessChrome/120.0.0.0').isBot).toBe(true);
    expect(classifyBot('Mozilla/5.0 (compatible; PhantomJS/2.1)').isBot).toBe(true);
  });

  it('detecta escaners de seguridad reutilizados de securityMiddleware', () => {
    expect(classifyBot('sqlmap/1.7').isBot).toBe(true);
    expect(classifyBot('python-requests/2.31.0').isBot).toBe(true);
  });

  it('NO marca como bot un User-Agent de navegador real tipico', () => {
    const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    const r = classifyBot(chromeUA, false);
    expect(r.isBot).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('NO marca como bot un User-Agent de Safari/iOS real', () => {
    const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(classifyBot(iosUA).isBot).toBe(false);
  });

  it('documenta la limitacion: un bot con UA de navegador real falsificado no se detecta', () => {
    // Este test es intencional: prueba y documenta el limite conocido del enfoque,
    // no un bug. Ver el comentario de classifyBot().
    const spoofedUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    expect(classifyBot(spoofedUA, false).isBot).toBe(false);
  });
});

describe('detectDeviceType', () => {
  it('detecta desktop por defecto sin senales moviles/tablet', () => {
    expect(detectDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0')).toBe('desktop');
  });
  it('detecta mobile en iPhone y Android movil', () => {
    expect(detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)')).toBe('mobile');
    expect(detectDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe('mobile');
  });
  it('detecta tablet en iPad', () => {
    expect(detectDeviceType('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)')).toBe('tablet');
  });
  it('devuelve unknown si no hay User-Agent', () => {
    expect(detectDeviceType('')).toBe('unknown');
    expect(detectDeviceType(null)).toBe('unknown');
  });
});

describe('categorizeTrafficSource', () => {
  it('sin referrer y sin UTM -> direct', () => {
    expect(categorizeTrafficSource({})).toBe('direct');
    expect(categorizeTrafficSource({ referrer: '' })).toBe('direct');
  });
  it('referrer al propio dominio -> direct (navegacion interna, no fuente externa)', () => {
    expect(categorizeTrafficSource({ referrer: 'https://credytek.vercel.app/pricing', currentHost: 'credytek.vercel.app' })).toBe('direct');
  });
  it('referrer de un buscador -> organic', () => {
    expect(categorizeTrafficSource({ referrer: 'https://www.google.com/search?q=software+prestamos' })).toBe('organic');
    expect(categorizeTrafficSource({ referrer: 'https://www.bing.com/search?q=x' })).toBe('organic');
  });
  it('referrer de una red social -> social', () => {
    expect(categorizeTrafficSource({ referrer: 'https://www.facebook.com/' })).toBe('social');
    expect(categorizeTrafficSource({ referrer: 'https://www.instagram.com/p/xyz' })).toBe('social');
  });
  it('referrer externo generico -> referral', () => {
    expect(categorizeTrafficSource({ referrer: 'https://algunblog.com/articulo' })).toBe('referral');
  });
  it('UTM con medium pago -> paid, sin importar el referrer', () => {
    expect(categorizeTrafficSource({ utmSource: 'google', utmMedium: 'cpc', referrer: '' })).toBe('paid');
    expect(categorizeTrafficSource({ utmSource: 'facebook', utmMedium: 'paidsocial' })).toBe('paid');
  });
  it('UTM de red social sin medium pago -> social', () => {
    expect(categorizeTrafficSource({ utmSource: 'facebook', utmMedium: 'post' })).toBe('social');
  });
  it('UTM generico no pago/no social -> referral', () => {
    expect(categorizeTrafficSource({ utmSource: 'newsletter', utmMedium: 'email' })).toBe('referral');
  });
});

describe('stripPotentialPii', () => {
  it('redacta valores con forma de email', () => {
    const out = stripPotentialPii({ note: 'contactar a juan@example.com' });
    expect(out.note).toBe('[redacted:email]');
  });
  it('redacta valores con forma de telefono', () => {
    const out = stripPotentialPii({ note: 'llamar al 809-555-1234' });
    expect(out.note).toBe('[redacted:phone-like]');
  });
  it('redacta por nombre de clave sensible sin importar el valor', () => {
    const out = stripPotentialPii({ email: 'algo-inocuo', client_name: 'Pedro' });
    expect(out.email).toBe('[redacted:key]');
    expect(out.client_name).toBe('[redacted:key]');
  });
  it('conserva propiedades no sensibles intactas', () => {
    const out = stripPotentialPii({ cta_location: 'hero', plan: 'profesional', scroll_depth: 75, is_mobile: true });
    expect(out).toEqual({ cta_location: 'hero', plan: 'profesional', scroll_depth: 75, is_mobile: true });
  });
  it('ignora objetos/arrays anidados (los eventos deben ser planos)', () => {
    const out = stripPotentialPii({ nested: { a: 1 }, list: [1, 2, 3], flat: 'ok' } as any);
    expect(out.nested).toBeUndefined();
    expect(out.list).toBeUndefined();
    expect(out.flat).toBe('ok');
  });
  it('devuelve objeto vacio si properties es null/undefined', () => {
    expect(stripPotentialPii(null)).toEqual({});
    expect(stripPotentialPii(undefined)).toEqual({});
  });
});

describe('ALLOWED_EVENT_NAMES', () => {
  it('incluye todos los eventos minimos requeridos por la Fase 1', () => {
    const required = [
      'landing_view', 'pricing_view', 'trial_cta_click', 'signup_started',
      'signup_completed', 'trial_activated', 'billing_toggle_changed',
      'plan_selected', 'whatsapp_click',
    ];
    for (const name of required) expect(ALLOWED_EVENT_NAMES.has(name)).toBe(true);
  });
  it('rechaza nombres arbitrarios no registrados', () => {
    expect(ALLOWED_EVENT_NAMES.has('cualquier_cosa')).toBe(false);
  });
});
