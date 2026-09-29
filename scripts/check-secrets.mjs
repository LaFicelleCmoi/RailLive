#!/usr/bin/env node
/**
 * Vérifie qu'aucun secret ni source map ne se retrouve dans le build front (dist/).
 * Échoue (code 1) si la clé API SNCF, une référence à SNCF_API_KEY ou un .map est trouvé.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('dist/ introuvable : lancez d’abord « npm run build:web ».');
  process.exit(1);
}

function readToken() {
  const envPath = path.join(root, 'server', '.env');
  if (!fs.existsSync(envPath)) return null;
  const m = fs.readFileSync(envPath, 'utf8').match(/^\s*SNCF_API_KEY\s*=\s*["']?([^"'\r\n]+)/m);
  return m ? m[1].trim() : null;
}

const token = readToken();
const tokenB64 = token ? Buffer.from(`${token}:`).toString('base64') : null;
const needles = ['SNCF_API_KEY', 'NAVITIA_TOKEN', 'api.navitia.io', 'api.sncf.com', ...(token ? [token, tokenB64] : [])];
const problems = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const rel = path.relative(root, full);
      if (entry.name.endsWith('.map')) problems.push(`${rel} : source map publique`);
      if (!/\.(js|mjs|css|html|json|txt|svg)$/.test(entry.name)) continue;
      const content = fs.readFileSync(full, 'utf8');
      for (const needle of needles) {
        if (content.includes(needle)) {
          const secret = needle === token || needle === tokenB64;
          problems.push(`${rel} : contient ${secret ? 'la CLÉ API SNCF' : `« ${needle} »`}`);
        }
      }
      if (/sourceMappingURL=/.test(content)) problems.push(`${rel} : référence sourceMappingURL`);
    }
  }
}

walk(dist);

if (problems.length) {
  console.error('\n✖ Vérification des secrets ÉCHOUÉE :\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
  process.exit(1);
}
console.log(`✔ dist/ vérifié : aucune clé, aucune URL directe de l’API SNCF, aucune source map${token ? '' : ' (server/.env absent : clé non testée)'}.`);
