import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (baseUrl, label) => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      await sleep(400);
    }
  }

  throw new Error(`${label} did not become healthy.`);
};

const waitForExit = (child, label) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${label} did not exit after SIGTERM.`));
    }, 10_000);

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`${label} exited with code ${code} and signal ${signal || 'none'}.`));
        return;
      }

      resolve({ code, signal });
    });
  });
};

const runShutdownCheck = async ({ label, entrypoint, port, portEnv = 'PORT' }) => {
  const useIpcShutdown = process.platform === 'win32';
  const shutdownSignal = 'SIGTERM';
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SMART_ESGP_DEPLOYMENT_ENV: 'production',
      SMART_ESGP_REQUIRE_AUTH: 'true',
      SMART_ESGP_AUDITOR_TOKEN: `${label.toLowerCase().replace(/\s+/g, '-')}-auditor-token`,
      SMART_ESGP_DATA_FILE: `.smart-esgp-data/graceful-shutdown-${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`,
      WHATSAPP_VERIFY_TOKEN: 'graceful-shutdown-verify-token',
      WHATSAPP_APP_SECRET: 'graceful-shutdown-app-secret',
      WHATSAPP_ACCESS_TOKEN: 'graceful-shutdown-access-token',
      WHATSAPP_PHONE_NUMBER_ID: 'graceful-shutdown-phone-id',
      SMART_ESGP_ENABLE_TEST_SHUTDOWN_MESSAGE: useIpcShutdown ? 'true' : '',
      [portEnv]: String(port),
    },
    stdio: useIpcShutdown ? ['ignore', 'ignore', 'ignore', 'ipc'] : 'ignore',
  });

  await waitForHealth(`http://localhost:${port}`, label);
  if (useIpcShutdown) {
    child.send({ type: 'smart-esgp.shutdown' });
  } else {
    child.kill(shutdownSignal);
  }
  const exit = await waitForExit(child, label);

  return {
    label,
    port,
    shutdownSignal: useIpcShutdown ? 'test-ipc-sigterm-path' : shutdownSignal,
    code: exit.code,
    signal: exit.signal,
  };
};

const results = [
  await runShutdownCheck({
    label: 'Dashboard',
    entrypoint: 'dist/server.mjs',
    port: 3081,
  }),
  await runShutdownCheck({
    label: 'WhatsApp',
    entrypoint: 'dist/whatsapp-server.mjs',
    port: 3082,
    portEnv: 'WHATSAPP_PORT',
  }),
];

console.log(JSON.stringify({
  ok: true,
  results,
}, null, 2));
