/**
 * Diagnostic du graphe ferroviaire (outil de développement) :
 *   npx tsx src/rail/diagnose.ts lonA,latA lonB,latB
 * Affiche les nœuds les plus proches, la taille de leurs composantes connexes et le résultat du routage.
 */
import { debugGraph, loadRailGraph, railSegment } from './graph.js';

const [a, b] = process.argv.slice(2).map((s) => s.split(',').map(Number) as [number, number]);
if (!a || !b) {
  console.error('Usage : npx tsx src/rail/diagnose.ts lonA,latA lonB,latB');
  process.exit(1);
}
await loadRailGraph();
console.log(JSON.stringify(debugGraph(a, b), null, 1));
console.log('segment :', railSegment(a, b) ? 'OK (tracé ferroviaire)' : 'null (ligne droite)');
