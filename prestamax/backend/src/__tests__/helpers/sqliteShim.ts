// Shim SOLO para vitest: vite-node recorta el prefijo "node:" y resuelve
// 'node:sqlite' como el id "sqlite" (que no es un builtin conocido), fallando
// con "Failed to load url sqlite". Se redirige a este módulo, que obtiene el
// builtin real vía require. No afecta al build ni a producción.
import { createRequire } from 'module';

const nodeRequire = createRequire(import.meta.url);
const sqlite = nodeRequire('node:sqlite');

export const DatabaseSync = sqlite.DatabaseSync;
export const StatementSync = sqlite.StatementSync;
export default sqlite;
