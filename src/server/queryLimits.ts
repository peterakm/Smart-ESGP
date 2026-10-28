const DEFAULT_MAX_LIST_LIMIT = 100;
const ABSOLUTE_MAX_LIST_LIMIT = 1000;

export const resolveMaxListLimit = (env: NodeJS.ProcessEnv) => {
 const parsed = Number(env.SMART_ESGP_API_LIST_LIMIT_MAX);

 if (!Number.isFinite(parsed)) {
 return DEFAULT_MAX_LIST_LIMIT;
 }

 return Math.max(1, Math.min(ABSOLUTE_MAX_LIST_LIMIT, Math.trunc(parsed)));
};

export const parseListLimit = (
 value: unknown,
 defaultLimit: number,
 maxLimit = DEFAULT_MAX_LIST_LIMIT
) => {
 const parsed = typeof value === 'string' ? Number(value) : defaultLimit;
 const candidate = Number.isFinite(parsed) ? Math.trunc(parsed) : defaultLimit;

 return Math.max(1, Math.min(maxLimit, candidate));
};
