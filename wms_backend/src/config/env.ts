/**
 * Zod-validated environment. Parsed once at import; the rest of the codebase
 * reads `env`, never `process.env`. Throws at boot if anything required is
 * missing or malformed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

/** Cognito user pool ids look like `eu-south-1_AbCdEfGhI`. */
const COGNITO_USER_POOL_ID_RE = /^(?:eusc-[a-z]{2}|[a-z]{2})-(?:gov-)?[a-z]+-\d_[a-zA-Z0-9]+$/;

const BaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// or postgresql:// URL'),
  // Optional at parse. Required when the restricted evidence module boots —
  // that factory throws rather than falling back to DATABASE_URL.
  RESTRICTED_DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'RESTRICTED_DATABASE_URL must be a postgres:// or postgresql:// URL')
      .optional(),
  ),
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  GIT_SHA: z.string().min(1).optional(),
  AUTH_PROVIDER: z.preprocess(
    (value) => (value === '' || value === undefined ? 'cognito' : value),
    z.enum(['local', 'cognito'], {
      errorMap: () => ({ message: 'AUTH_PROVIDER must be local or cognito.' }),
    }),
  ),
  // No default. A fallback in source is how a dev secret reaches production.
  // Required for AUTH_PROVIDER=local; unused but still set when cognito.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  COGNITO_REGION: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  COGNITO_USER_POOL_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  COGNITO_CLIENT_ID_PARTICIPANT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  COGNITO_CLIENT_ID_ADMIN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AUTH_SEED_OC_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  AUTH_SEED_OC_ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AUTH_SEED_PARTICIPANT_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  AUTH_SEED_PARTICIPANT_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  // Names only — never default a credential. The SDK chain (env, shared file, IAM role)
  // supplies the value. A half-set pair fails at boot rather than at the first invite.
  AWS_REGION: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AWS_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AWS_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AWS_SESSION_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
});

/**
 * The complete configuration surface. The env-example test imports this rather
 * than maintaining a second hand-written list, so adding an env key here
 * requires documenting it in `.env.example` in the same change.
 */
export const environmentVariableNames = Object.freeze(Object.keys(BaseSchema.shape));

const EnvSchema = BaseSchema.superRefine((data, ctx) => {
  if (data.AUTH_PROVIDER === 'local') {
    return;
  }

  if (!data.COGNITO_REGION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COGNITO_REGION'],
      message: 'COGNITO_REGION is required when AUTH_PROVIDER=cognito.',
    });
  }
  if (!data.COGNITO_USER_POOL_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COGNITO_USER_POOL_ID'],
      message: 'COGNITO_USER_POOL_ID is required when AUTH_PROVIDER=cognito.',
    });
  } else if (!COGNITO_USER_POOL_ID_RE.test(data.COGNITO_USER_POOL_ID)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COGNITO_USER_POOL_ID'],
      message: 'COGNITO_USER_POOL_ID is not a valid Cognito user pool id.',
    });
  } else if (
    data.COGNITO_REGION &&
    !data.COGNITO_USER_POOL_ID.startsWith(`${data.COGNITO_REGION}_`)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COGNITO_USER_POOL_ID'],
      message: 'COGNITO_USER_POOL_ID must start with COGNITO_REGION followed by an underscore.',
    });
  }
  if (!data.COGNITO_CLIENT_ID_PARTICIPANT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COGNITO_CLIENT_ID_PARTICIPANT'],
      message: 'COGNITO_CLIENT_ID_PARTICIPANT is required when AUTH_PROVIDER=cognito.',
    });
  }
  if (!data.COGNITO_CLIENT_ID_ADMIN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['COGNITO_CLIENT_ID_ADMIN'],
      message: 'COGNITO_CLIENT_ID_ADMIN is required when AUTH_PROVIDER=cognito.',
    });
  }

  const hasKey = Boolean(data.AWS_ACCESS_KEY_ID);
  const hasSecret = Boolean(data.AWS_SECRET_ACCESS_KEY);
  if (hasKey !== hasSecret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: hasKey ? ['AWS_SECRET_ACCESS_KEY'] : ['AWS_ACCESS_KEY_ID'],
      message:
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set, or neither. The SDK credential chain is used when both are absent.',
    });
  }
});

type Parsed = z.infer<typeof BaseSchema>;

type AwsAdminEnv = {
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  /** True when an IAM identity for AdminCreateUser is present (static keys in env). */
  cognitoAdminConfigured: boolean;
};

type BaseEnv = {
  DATABASE_URL: string;
  RESTRICTED_DATABASE_URL?: string;
  PORT: number;
  NODE_ENV: 'development' | 'test' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  DATABASE_POOL_MAX: number;
  GIT_SHA: string | undefined;
  VERSION: string;
  JWT_SECRET: string;
  AUTH_SEED_OC_ADMIN_EMAIL?: string;
  AUTH_SEED_OC_ADMIN_PASSWORD?: string;
  AUTH_SEED_PARTICIPANT_EMAIL?: string;
  AUTH_SEED_PARTICIPANT_PASSWORD?: string;
} & AwsAdminEnv;

export type Env =
  | (BaseEnv & {
      AUTH_PROVIDER: 'local';
      COGNITO_REGION?: string;
      COGNITO_USER_POOL_ID?: string;
      COGNITO_CLIENT_ID_PARTICIPANT?: string;
      COGNITO_CLIENT_ID_ADMIN?: string;
    })
  | (BaseEnv & {
      AUTH_PROVIDER: 'cognito';
      COGNITO_REGION: string;
      COGNITO_USER_POOL_ID: string;
      COGNITO_CLIENT_ID_PARTICIPANT: string;
      COGNITO_CLIENT_ID_ADMIN: string;
      AWS_REGION: string;
    });

function detectGitSha(): string | undefined {
  try {
    // Resolve from the project root, rather than the process working directory.
    // This still works when the application was launched by a process manager
    // from elsewhere on disk, provided the backend itself is a Git checkout.
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

function bootError(issues: Array<{ message: string }>): Error {
  return new Error(issues.map((issue) => issue.message).join(' '));
}

function awsAdmin(parsed: Parsed, cognitoRegion?: string): AwsAdminEnv {
  const region = parsed.AWS_REGION ?? cognitoRegion;
  return {
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: parsed.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: parsed.AWS_SECRET_ACCESS_KEY,
    AWS_SESSION_TOKEN: parsed.AWS_SESSION_TOKEN,
    cognitoAdminConfigured: Boolean(parsed.AWS_ACCESS_KEY_ID && parsed.AWS_SECRET_ACCESS_KEY),
  };
}

function toEnv(parsed: Parsed): Env {
  const shared: Omit<BaseEnv, keyof AwsAdminEnv> = {
    DATABASE_URL: parsed.DATABASE_URL,
    RESTRICTED_DATABASE_URL: parsed.RESTRICTED_DATABASE_URL,
    PORT: parsed.PORT,
    NODE_ENV: parsed.NODE_ENV,
    LOG_LEVEL: parsed.LOG_LEVEL,
    DATABASE_POOL_MAX: parsed.DATABASE_POOL_MAX,
    GIT_SHA: parsed.GIT_SHA ?? detectGitSha(),
    VERSION: packageVersion(),
    JWT_SECRET: parsed.JWT_SECRET,
    AUTH_SEED_OC_ADMIN_EMAIL: parsed.AUTH_SEED_OC_ADMIN_EMAIL,
    AUTH_SEED_OC_ADMIN_PASSWORD: parsed.AUTH_SEED_OC_ADMIN_PASSWORD,
    AUTH_SEED_PARTICIPANT_EMAIL: parsed.AUTH_SEED_PARTICIPANT_EMAIL,
    AUTH_SEED_PARTICIPANT_PASSWORD: parsed.AUTH_SEED_PARTICIPANT_PASSWORD,
  };

  if (parsed.AUTH_PROVIDER === 'local') {
    return {
      ...shared,
      ...awsAdmin(parsed, parsed.COGNITO_REGION),
      AUTH_PROVIDER: 'local',
      COGNITO_REGION: parsed.COGNITO_REGION,
      COGNITO_USER_POOL_ID: parsed.COGNITO_USER_POOL_ID,
      COGNITO_CLIENT_ID_PARTICIPANT: parsed.COGNITO_CLIENT_ID_PARTICIPANT,
      COGNITO_CLIENT_ID_ADMIN: parsed.COGNITO_CLIENT_ID_ADMIN,
    };
  }

  const region = parsed.COGNITO_REGION as string;
  return {
    ...shared,
    ...awsAdmin(parsed, region),
    AUTH_PROVIDER: 'cognito',
    COGNITO_REGION: region,
    COGNITO_USER_POOL_ID: parsed.COGNITO_USER_POOL_ID as string,
    COGNITO_CLIENT_ID_PARTICIPANT: parsed.COGNITO_CLIENT_ID_PARTICIPANT as string,
    COGNITO_CLIENT_ID_ADMIN: parsed.COGNITO_CLIENT_ID_ADMIN as string,
    AWS_REGION: (parsed.AWS_REGION ?? region) as string,
  };
}

/** Parse and validate env. Used at boot and by tests; never reads AWS. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw bootError(result.error.issues);
  }
  return toEnv(result.data);
}

export const env = parseEnv();
