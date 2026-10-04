// Pantalla en blanco intermitente: tras un despliegue, una pestaña abierta pide un chunk con hash que ya no existe, el
// import() dinámico falla y, sin ErrorBoundary, React desmonta todo. Se verifica la red de seguridad.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isChunkLoadError, reloadOnceForNewVersion } from '../../../frontend/src/lib/chunkReload';

const fe = (p: string) => fs.readFileSync(path.join(__dirname, '../../../frontend', p), 'utf8');

describe('isChunkLoadError', () => {
  it('reconoce los errores de carga de módulos/chunks de Chrome, Firefox, Safari y Vite', () => {
    for (const m of [
      'Failed to fetch dynamically imported module: https://credytek.vercel.app/assets/DashboardPage-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Loading chunk 12 failed.',
      'Loading CSS chunk 7 failed',
      'Unable to preload CSS for /assets/index-abc.css',
      "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\". ... is not a valid JavaScript MIME type",
    ]) expect(isChunkLoadError(new Error(m)), m).toBe(true);
    const named = new Error('x'); named.name = 'ChunkLoadError';
    expect(isChunkLoadError(named)).toBe(true);
  });
  it('no confunde errores normales de la aplicación', () => {
    for (const m of ["Cannot read properties of undefined (reading 'map')", 'Network Error', 'Request failed with status code 500'])
      expect(isChunkLoadError(new Error(m)), m).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('reloadOnceForNewVersion: recarga una sola vez (sin bucles)', () => {
  const store: Record<string, string> = {};
  let reloads = 0;
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    reloads = 0;
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
    vi.stubGlobal('window', { location: { reload: () => { reloads++; } } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('la primera falla recarga; una segunda dentro de 30 s NO (evita el bucle si el problema persiste)', () => {
    expect(reloadOnceForNewVersion()).toBe(true);
    expect(reloads).toBe(1);
    expect(reloadOnceForNewVersion()).toBe(false);
    expect(reloads).toBe(1);
  });
  it('pasada la ventana de seguridad vuelve a permitir una recarga', () => {
    store['credytek_chunk_reload_at'] = String(Date.now() - 60_000);
    expect(reloadOnceForNewVersion()).toBe(true);
    expect(reloads).toBe(1);
  });
});

describe('cableado', () => {
  it('toda la app va dentro de AppErrorBoundary y se instalan los manejadores al arrancar', () => {
    const app = fe('src/App.tsx');
    expect(app).toContain("import AppErrorBoundary from '@/components/shared/AppErrorBoundary'");
    expect(app.indexOf('<AppErrorBoundary>')).toBeGreaterThan(-1);
    expect(app.indexOf('<AppErrorBoundary>')).toBeLessThan(app.indexOf('<BrowserRouter>'));       // cubre también a los providers
    expect(app.indexOf('</BrowserRouter>')).toBeLessThan(app.indexOf('</AppErrorBoundary>'));
    expect(fe('src/main.tsx')).toContain('installChunkErrorRecovery()');
  });
  it('el boundary recarga solo ante chunks obsoletos, reporta a Sentry el resto y muestra un mensaje con botón Recargar', () => {
    const b = fe('src/components/shared/AppErrorBoundary.tsx');
    expect(b).toContain('getDerivedStateFromError');
    expect(b).toContain('componentDidCatch');
    expect(b).toContain('isChunkLoadError(error)');
    expect(b).toContain('reloadOnceForNewVersion()');
    expect(b).toContain("captureError(error, { tag: 'react-error-boundary' })");
    expect(b).toContain('window.location.reload()');
    expect(b).toContain('role="alert"');
  });
  it('los textos de la pantalla de recuperación existen en es/en/pt', () => {
    const i18n = fe('src/lib/i18n.ts');
    for (const k of ['err.title', 'err.desc', 'err.reload', 'err.home', 'err.updating_title', 'err.updating_desc']) {
      const line = i18n.split('\n').find(l => l.trimStart().startsWith(`'${k}':`));
      expect(line, k).toBeTruthy();
      for (const lang of ['es', 'en', 'pt']) expect(line!, `${k}.${lang}`).toMatch(new RegExp(`${lang}: '[^']{3,}`));
    }
  });
  it('un archivo de /assets inexistente ya no se reescribe a index.html (daba HTML donde se esperaba JS)', () => {
    const v = JSON.parse(fe('vercel.json'));
    expect(v.rewrites[0].source).toBe('/((?!assets/).*)');
    expect(v.rewrites[0].destination).toBe('/index.html');
  });
});
