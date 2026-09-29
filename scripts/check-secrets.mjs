#!/usr/bin/env node
/**
 * Vérifie qu'aucun secret ni source map ne se retrouve dans le build front (dist/).
 * Échoue (code 1) si le token Navitia, une référence à NAVITIA_TOKEN ou un .map est trouvé.
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
  const m = fs.readFileSync(envPath, 'utf8').match(/^\s*NAVITIA_TOKEN\s*=\s*["']?([^"'\r\n]+)/m);
  return m ? m[1].trim() : null;
}

const token = readToken();
const needles = ['NAVITIA_TOKEN', 'api.navitia.io', ...(token ? [token] : [])];
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
          problems.push(`${rel} : contient ${needle === token ? 'le TOKEN Navitia' : `« ${needle} »`}`);
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
console.log(`✔ dist/ vérifié : aucun token, aucune URL Navitia directe, aucune source map${token ? '' : ' (server/.env absent : token non testé)'}.`);
