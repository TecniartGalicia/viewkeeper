// Utilidades comunes de los guiones de la auditoría. No forman parte del prototipo.
import * as http from 'node:http';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';

export interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  raw: string[];
  body: Buffer;
  ended: boolean;
  aborted: boolean;
}

/** Petición HTTP al proxy con el Host de una sesión. Resuelve aunque la respuesta no termine (plazo). */
export function pedir(
  port: number,
  path: string,
  o: { host?: string; headers?: Record<string, string>; method?: string; body?: string; plazo?: number } = {},
): Promise<Res | { error: string }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = { host: o.host ?? `s-main.localhost:${port}`, accept: 'text/html', ...o.headers };
    const req = http.request({ host: '127.0.0.1', port, path, method: o.method ?? 'GET', headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      const out: Res = { status: res.statusCode ?? 0, headers: res.headers, raw: res.rawHeaders, body: Buffer.alloc(0), ended: false, aborted: false };
      const fin = (): void => {
        out.body = Buffer.concat(chunks);
        clearTimeout(t);
        resolve(out);
      };
      const t = setTimeout(() => {
        fin();
        req.destroy();
      }, o.plazo ?? 3000);
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        out.ended = true;
        fin();
      });
      res.on('aborted', () => {
        out.aborted = true;
        fin();
      });
      res.on('error', () => {
        out.aborted = true;
        fin();
      });
    });
    const t0 = setTimeout(() => {
      resolve({ error: 'sin respuesta en el plazo' });
      req.destroy();
    }, o.plazo ?? 3000);
    req.on('response', () => clearTimeout(t0));
    req.on('error', (e) => {
      clearTimeout(t0);
      resolve({ error: e.message });
    });
    req.end(o.body);
  });
}

/** Manda bytes tal cual por un socket y devuelve lo que llegue en el plazo. */
export function crudo(port: number, bytes: string | Buffer, plazo = 1500): Promise<string> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    let got = '';
    s.on('data', (d) => (got += d.toString('latin1')));
    s.on('error', () => resolve(got + '[error de socket]'));
    s.on('connect', () => s.write(bytes));
    setTimeout(() => {
      s.destroy();
      resolve(got);
    }, plazo);
  });
}

export interface Falso {
  origin: string;
  port: number;
  /** Peticiones tal y como las vio el servidor falso. */
  vistas: { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }[];
  /** Conexiones abiertas ahora mismo en el servidor falso. */
  abiertas(): number;
  close(): Promise<void>;
}

/** Servidor de pruebas: cada ruta la decide `manejar`. Solo escucha en 127.0.0.1. */
export function servidorFalso(manejar: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void): Promise<Falso> {
  const vistas: Falso['vistas'] = [];
  const socks = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    let hecho = false;
    const ir = (): void => {
      if (hecho) return;
      hecho = true;
      const body = Buffer.concat(chunks).toString('utf8');
      vistas.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      manejar(req, res, body);
    };
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', ir);
    // Los GET no esperan cuerpo: se atienden ya, para poder dejar respuestas abiertas.
    if (req.method === 'GET' || req.method === 'HEAD') ir();
  });
  server.on('connection', (s) => {
    socks.add(s);
    s.on('close', () => socks.delete(s));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        vistas,
        abiertas: () => socks.size,
        close: () =>
          new Promise<void>((done) => {
            for (const s of socks) s.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

export const espera = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Lo que el banco reproduce y está aceptado: límites declarados en el README y en el plan (§17.3),
 * no defectos por arreglar. Cualquier otro caso reproducido hace fallar el banco.
 */
const ACEPTADOS: Record<string, string> = {
  'GES-1': 'N-9: lo arregla el agente (renueva el gesto en pagehide); este caso prueba el reparto sin agente',
  'GES-2': 'N-9: ídem',
  'COK-2': 'una cookie borrada desde JavaScript sigue en la captura; se olvida cuando el servidor la caduca',
  'COK-4': 'las cookies reproducidas en la captura pierden HttpOnly; solo viven en un perfil temporal',
  'API-4': 'una cookie de la API con Path distinto de / no vuelve',
  'EMB-1': 'una página ajena puede incrustar la app; no puede leerla ni mandarle órdenes (AGE-1, AGE-2)',
  'CRZ-4': 'un iframe con sandbox dentro de la app no carga recursos',
  'FOR-1': 'el panel reenvía el aviso; el host no se fía de él y comprueba CORS antes de ofrecer nada',
};
const inesperados: string[] = [];
let n = 0;
/** Código de salida del banco: 1 si se reprodujo algo que no está aceptado. */
export function resultado(): number {
  if (inesperados.length) {console.log(`
FALLO: se reproducen ${inesperados.length} casos no aceptados: ${inesperados.join(', ')}`);}
  else {console.log(`
Banco en verde: ${n} casos, ninguno inesperado.`);}
  return inesperados.length ? 1 : 0;
}
export function caso(id: string, titulo: string, reproducido: boolean, detalle: string): void {
  n++;
  if (reproducido && !(id in ACEPTADOS)) inesperados.push(id);
  if (reproducido && id in ACEPTADOS) detalle += ` [aceptado: ${ACEPTADOS[id]}]`;
  console.log(`\n[${id}] ${titulo}\n    ${reproducido ? 'REPRODUCIDO' : 'no reproducido'} — ${detalle}`);
}
export function nota(texto: string): void {
  console.log(`    · ${texto}`);
}
