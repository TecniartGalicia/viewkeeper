// Arranca la tienda de demostración como si fuera tu servidor de desarrollo, para probar ViewKeeper a mano.
// Uso: node scripts/demo-servidor.ts [puerto]   (por defecto 5173, el primero que busca ViewKeeper)
import { startDemoSite } from '../test/fixtures/demo-site.ts';

const port = Number(process.argv[2] ?? 5173);
const site = await startDemoSite(port);
console.log(`Tienda de demostración en ${site.origin} (Ctrl+C para pararla)`);
