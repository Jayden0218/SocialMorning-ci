import { validator } from 'hono/validator';
import type { z, ZodType } from 'zod';
import { ApiError } from './errors.ts';

/**
 * JSON body validation with zod, answering 422 `validation` with the field names
 * (contracts/api.md). Written against `hono/validator` directly: `@hono/zod-validator`
 * 0.9 types against a different zod major than zod 4.6 and would not typecheck.
 */
export function json<T extends ZodType>(schema: T) {
  return validator('json', (value): z.infer<T> => {
    const result = schema.safeParse(value);
    if (!result.success) {
      const fields = [...new Set(result.error.issues.map((i) => i.path.join('.') || '(body)'))];
      throw new ApiError('validation', `Check these fields: ${fields.join(', ')}.`, { fields });
    }
    return result.data as z.infer<T>;
  });
}
