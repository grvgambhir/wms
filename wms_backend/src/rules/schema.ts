import { z } from 'zod';
import { refuse } from '../people/refuse';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'rules.date.invalid');

export const rangeBandSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  min: z.number(),
  max: z.number().nullable(),
});

export const createDraftSchema = z.object({
  fromVersionId: z.string().uuid(),
  aggregation: z.enum(['self', 'min', 'max', 'mean', 'sum']).optional(),
  bands: z.array(rangeBandSchema).min(1).optional(),
  versionLabel: z.string().trim().min(1).max(40).optional(),
});

export type CreateDraftBody = z.infer<typeof createDraftSchema>;

export const previewFactSchema = z.object({
  id: z.string().min(1),
  personId: z.string().min(1),
  attribute: z.string().min(1),
  numericValue: z.number().optional(),
  textValue: z.string().optional(),
  status: z.enum(['declared', 'verified', 'rejected', 'expired']).optional(),
  versionNo: z.number().int().optional(),
});

export const previewSchema = z.object({
  roster: z
    .array(
      z.object({
        personId: z.string().min(1),
        dob: isoDate,
        role: z.string().max(40).optional(),
      }),
    )
    .min(1),
  facts: z.array(previewFactSchema).optional(),
});

export type PreviewBody = z.infer<typeof previewSchema>;

/**
 * The admin category checker: a product and one date of birth per member, no entry needed.
 * Capped at 20 members — the largest crew is an eight plus cox, and an unbounded array is how a
 * preview endpoint becomes a CPU endpoint.
 */
export const categoryCheckSchema = z.object({
  sportEntryProductId: z.string().uuid(),
  members: z
    .array(z.object({ dateOfBirth: isoDate, role: z.string().max(40).optional() }))
    .min(1)
    .max(20),
});

export type CategoryCheckBody = z.infer<typeof categoryCheckSchema>;

export function parseBody<T>(schema: z.ZodType<T>, body: unknown, key: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fields[issue.path.join('.') || key] = issue.message;
    }
    refuse('VALIDATION_ERROR', key, fields);
  }
  return parsed.data;
}
