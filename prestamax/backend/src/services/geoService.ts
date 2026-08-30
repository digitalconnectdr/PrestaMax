import geoip from 'geoip-lite';
import { Request } from 'express';

export interface GeoResult {
  country: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

export function getClientIp(req: Request): string | null {
  const forwarded = (req.headers['x-forwarded-for'] as string) || '';
  const fromHeader = forwarded.split(',')[0]?.trim();
  const ip = fromHeader || req.ip || req.socket.remoteAddress || '';
  // Normaliza direcciones IPv4-mapped-in-IPv6 (::ffff:1.2.3.4)
  return ip.replace(/^::ffff:/, '') || null;
}

export function geolocateIp(ip: string | null): GeoResult | null {
  if (!ip) return null;
  // Direcciones locales/privadas no son geolocalizables (desarrollo local, red interna)
  if (ip === '127.0.0.1' || ip === '::1' || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) return null;
  const lookup = geoip.lookup(ip);
  if (!lookup) return null;
  return {
    country: lookup.country,
    city: lookup.city || null,
    lat: lookup.ll?.[0] ?? null,
    lng: lookup.ll?.[1] ?? null,
  };
}
