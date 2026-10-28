// Dev convenience: file-mode SmartEsgpRepository loads the data file into memory
// once at process startup, so a long-running process never sees writes made by
// ANY other process sharing the same file — including its own past writes made
// before a restart. Worse, each process's save() overwrites the *entire* file
// with its own in-memory snapshot, so a stale process can silently clobber a
// fresher write from another process (this bit us: an auditor action taken via
// the dashboard was erased by the WhatsApp service's next, stale-informed write).
//
// This watcher restarts BOTH the dashboard and the standalone WhatsApp service
// whenever the shared data file changes, so neither process is ever more than a
// few seconds stale relative to the other. It does not fully eliminate the race
// (a write during the ~2-4s restart window can still be missed) but it closes
// the common case.
//
// Usage: node scripts/watch-dashboard-reload.mjs

import { spawn, execSync } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';

const DATA_FILE = path.resolve(process.env.SMART_ESGP_DATA_FILE || '.smart-esgp-data/dev-store.json');
// Each new write resets this countdown, so a farmer's location-then-photo
// messages (typically a few seconds apart, longer over a slow upload) never
// trigger a restart mid-conversation — it only fires once things go quiet.
// 1.5s was too tight: a photo landing shortly after a location's own write
// could get killed mid-persist by the restart that write had just armed.
const RESTART_DEBOUNCE_MS = 20_000;

const SERVICES = [
  { name: 'dashboard', port: process.env.PORT || '3000', npmScript: 'dev' },
  { name: 'whatsapp', port: process.env.WHATSAPP_PORT || '3100', npmScript: 'dev:whatsapp' },
];

let debounceTimer = null;

const killWhateverIsOnPort = (port, label) => {
  let netstatOut = '';
  try {
    netstatOut = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  } catch {
    return; // nothing listening
  }

  const pids = new Set();
  netstatOut.split('\n').forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== '0' && /^\d+$/.test(pid)) pids.add(pid);
  });

  pids.forEach((pid) => {
    try {
      execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, { stdio: 'ignore' });
      console.log(`[watch] stopped previous ${label} process (pid ${pid})`);
    } catch {
      // already gone
    }
  });
};

const startService = ({ name, port, npmScript }) => {
  console.log(`[watch] starting ${name} (npm run ${npmScript}) on port ${port}...`);
  spawn('npm.cmd', ['run', npmScript], {
    stdio: 'inherit',
    shell: true,
  });
};

const restartAll = () => {
  console.log('[watch] data file changed, restarting dashboard + whatsapp service to stay in sync...');
  SERVICES.forEach((service) => killWhateverIsOnPort(service.port, service.name));
  setTimeout(() => SERVICES.forEach(startService), 1000);
};

SERVICES.forEach((service) => killWhateverIsOnPort(service.port, service.name));
SERVICES.forEach(startService);

watch(DATA_FILE, { persistent: true }, () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(restartAll, RESTART_DEBOUNCE_MS);
});

console.log(`[watch] watching ${DATA_FILE} for changes...`);
