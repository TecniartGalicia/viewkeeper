// Encuentra el servidor de desarrollo sin que el usuario escriba nada. Puro: la red se inyecta.

export const CANDIDATE_PORTS: readonly number[] = [5173, 3000, 4321, 4200, 8080, 5174, 3001, 4173, 8000, 5000, 8100, 1234, 3333, 5500];

export interface Probe {
  status: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Primeros bytes del cuerpo. */
  body: string;
}
export interface Found {
  port: number;
  origin: string;
  framework?: string;
}

/** Puertos que el propio proyecto declara en los scripts de su package.json. Van los primeros. */
export function portsFromScripts(packageJson: string): number[] {
  let scripts: Record<string, unknown> = {};
  try {
    scripts = (JSON.parse(packageJson) as { scripts?: Record<string, unknown> }).scripts ?? {};
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== 'string' || !/^(dev|start|serve|preview)/.test(name)) continue;
    for (const m of cmd.matchAll(/(?:--port[= ]|-p |PORT=)(\d{2,5})\b/g)) {
      const p = Number(m[1]);
      if (p > 0 && p < 65536 && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

export function identify(p: Probe): string | undefined {
  const powered = String(p.headers['x-powered-by'] ?? '');
  if (powered.includes('Next.js') || p.body.includes('/_next/')) return 'Next.js';
  if (p.body.includes('/@vite/client')) return p.body.includes('astro') ? 'Astro' : 'Vite';
  if (p.body.includes('__sveltekit')) return 'SvelteKit';
  if (p.body.includes('__NUXT__') || p.body.includes('/_nuxt/')) return 'Nuxt';
  if (p.body.includes('ng-version') || p.body.includes('<app-root')) return 'Angular';
  if (p.body.includes('astro-island') || powered.includes('Astro')) return 'Astro';
  return undefined;
}

/**
 * Prueba los puertos en paralelo y devuelve los que responden HTML, en el orden de preferencia dado.
 * `probe` debe resolver undefined si no hay nadie o si tarda (el adaptador le pone el plazo).
 */
export async function detect(ports: readonly number[], probe: (port: number) => Promise<Probe | undefined>): Promise<Found[]> {
  const unique = [...new Set(ports)];
  const results = await Promise.all(unique.map((port) => probe(port).catch(() => undefined)));
  const out: Found[] = [];
  results.forEach((r, i) => {
    if (!r) return;
    const type = String(r.headers['content-type'] ?? '');
    // Un 404 de API o un servicio que no sirve HTML no es la app que se quiere ver.
    if (!type.includes('text/html') && !r.body.trimStart().startsWith('<')) return;
    out.push({ port: unique[i], origin: `http://localhost:${unique[i]}`, framework: identify(r) });
  });
  return out;
}
