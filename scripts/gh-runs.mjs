// node scripts/gh-runs.mjs [ci|release] [--esperar]  — estado de la última ejecución de un flujo de GitHub Actions,
// con sus trabajos y pasos. Con --esperar, vuelve a mirar cada 30 s hasta que termina (máximo 40 min).
// Usa el token de git credential; no imprime nada secreto.
import { execSync } from 'node:child_process';
const cred = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = /^password=(.*)$/m.exec(cred)?.[1];
const H = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'viewkeeper-ci' };
const repo = 'TecniartGalicia/viewkeeper';
const flujo = process.argv[2] === 'release' ? 'release.yml' : 'ci.yml';
const esperar = process.argv.includes('--esperar');
const fin = Date.now() + 40 * 60 * 1000;
for (;;) {
  const r = await (await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${flujo}/runs?per_page=1`, { headers: H })).json();
  const run = r.workflow_runs?.[0];
  if (!run) {
    console.log('sin ejecuciones todavía');
    if (!esperar || Date.now() > fin) process.exit(1);
  } else if (run.status !== 'completed' && esperar && Date.now() < fin) {
    // sigue
  } else {
    console.log(`${flujo} ${run.id} ${run.head_sha.slice(0, 7)} ${run.status}/${run.conclusion}`);
    const jobs = await (await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs`, { headers: H })).json();
    for (const j of jobs.jobs ?? []) {
      console.log(`  ${j.name}: ${j.status}/${j.conclusion}`);
      for (const s of j.steps ?? []) if (s.conclusion !== 'success' && s.conclusion !== 'skipped') console.log(`    - ${s.name}: ${s.status}/${s.conclusion}`);
    }
    process.exit(run.conclusion === 'success' ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 30000));
}
