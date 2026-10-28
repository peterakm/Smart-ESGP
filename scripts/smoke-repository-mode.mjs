const loadModule = async () => {
  return import('../src/server/repositoryFactory.ts');
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { createRepositoryFromEnv, resolveRepositoryMode } = await loadModule();

assert(resolveRepositoryMode({}) === 'file', 'default repository mode should be file');
assert(resolveRepositoryMode({ SMART_ESGP_REPOSITORY: 'file' }) === 'file', 'file mode should resolve');
assert(resolveRepositoryMode({ SMART_ESGP_REPOSITORY: 'postgres' }) === 'postgres', 'postgres mode should resolve');

let unsupportedModeFailed = false;
try {
  resolveRepositoryMode({ SMART_ESGP_REPOSITORY: 'sqlite' });
} catch (error) {
  unsupportedModeFailed = error instanceof Error && error.message.includes('Unsupported SMART_ESGP_REPOSITORY');
}
assert(unsupportedModeFailed, 'unsupported repository mode should fail clearly');

let postgresMissingUrlFailed = false;
try {
  await createRepositoryFromEnv({ SMART_ESGP_REPOSITORY: 'postgres' });
} catch (error) {
  postgresMissingUrlFailed = error instanceof Error && error.message.includes('requires DATABASE_URL');
}
assert(postgresMissingUrlFailed, 'postgres repository mode should require DATABASE_URL');

const fileRepository = await createRepositoryFromEnv({
  SMART_ESGP_REPOSITORY: 'file',
  SMART_ESGP_DATA_FILE: `.smart-esgp-data/repository-mode-smoke-${Date.now()}.json`,
});

assert((await fileRepository.listFarmers()).length > 0, 'file repository should initialize with seed farmers');

console.log(JSON.stringify({
  ok: true,
  defaultMode: resolveRepositoryMode({}),
  postgresGuard: postgresMissingUrlFailed,
}, null, 2));
