// Deduce las rutas de la app a partir de la lista de ficheros del proyecto. Puro: no toca el disco.

export interface Route {
  path: string;
  /** Tiene segmentos como [id]: no se puede abrir sin que el usuario dé un valor. */
  dynamic: boolean;
  source: string;
}

const PAGE_EXT = /\.(tsx|jsx|ts|js|mdx|md)$/;

function fromSegments(segs: string[]): { path: string; dynamic: boolean } | undefined {
  const out: string[] = [];
  let dynamic = false;
  for (const s of segs) {
    if (s === '' || s === 'index') continue;
    if (/^\(.*\)$/.test(s)) {
      if (/^\(\.{1,3}\)/.test(s)) return undefined; // ruta interceptada de Next: no es navegable por sí sola
      continue; // grupo de rutas: no aparece en la URL
    }
    if (s.startsWith('@') || s.startsWith('_')) return undefined; // ranura paralela o carpeta privada
    if (/^\[.*\]$/.test(s) || s.startsWith(':')) dynamic = true;
    out.push(s);
  }
  return { path: '/' + out.join('/'), dynamic };
}

export function detectRoutes(files: readonly string[]): Route[] {
  const found = new Map<string, Route>();
  const add = (segs: string[], source: string): void => {
    const r = fromSegments(segs);
    if (r && !found.has(r.path)) found.set(r.path, { ...r, source });
  };
  for (const raw of files) {
    const f = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (f.includes('node_modules/') || f.startsWith('.') || f.includes('/.')) continue;
    let m: RegExpExecArray | null;
    // Next, App Router: app/**/page.tsx
    if ((m = /^(?:src\/)?app\/(?:(.*)\/)?page\.(?:tsx|jsx|ts|js|mdx)$/.exec(f))) add((m[1] ?? '').split('/'), f);
    // SvelteKit: src/routes/**/+page.svelte
    else if ((m = /^src\/routes\/(?:(.*)\/)?\+page\.svelte$/.exec(f))) add((m[1] ?? '').split('/'), f);
    // Astro: src/pages/**/*.astro|md|mdx|html
    else if ((m = /^src\/pages\/(.*)\.(?:astro|md|mdx|html)$/.exec(f))) add(m[1].split('/'), f);
    // Nuxt: pages/**/*.vue
    else if ((m = /^(?:app\/)?pages\/(.*)\.vue$/.exec(f))) add(m[1].split('/'), f);
    // Next, Pages Router: pages/**/*.tsx (sin api ni ficheros especiales)
    else if ((m = /^(?:src\/)?pages\/(.*)$/.exec(f)) && PAGE_EXT.test(m[1]) && !m[1].startsWith('api/')) add(m[1].replace(PAGE_EXT, '').split('/'), f);
    // HTML estático en la raíz o en public/
    else if ((m = /^(?:public\/)?([^/]+)\.html$/.exec(f))) {
      const path = m[1] === 'index' ? '/' : `/${m[1]}.html`;
      if (!found.has(path)) found.set(path, { path, dynamic: false, source: f });
    }
  }
  return [...found.values()]
    .sort((a, b) => Number(a.dynamic) - Number(b.dynamic) || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
    .slice(0, 200);
}

/** Sustituye los segmentos dinámicos por los valores que dio el usuario: /blog/[slug] + {slug:'hola'} → /blog/hola */
export function fillRoute(path: string, values: Readonly<Record<string, string>>): string | undefined {
  let ok = true;
  const out = path.replace(/\[\[?\.{0,3}([^\]]+)\]\]?/g, (all: string, name: string) => {
    const v = values[name];
    if (v === undefined || v === '') {
      // [[...slug]] es opcional: vacío es válido y quita el segmento.
      if (!all.startsWith('[[')) ok = false;
      return '';
    }
    return v.split('/').map(encodeURIComponent).join('/');
  });
  if (!ok) return undefined;
  const clean = out.replace(/\/{2,}/g, '/');
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
}
