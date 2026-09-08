import { z } from "zod";

/**
 * A value that has round-tripped through JSON.parse/JSON.stringify — unlike
 * `Record<string, unknown>`, TanStack Start's server function return-type
 * checker can prove this is serializable, so raw passthrough provider
 * payloads (shopping/advertising research; see merchant.ts, ads-
 * transparency.ts) use this instead of `unknown` at any boundary a server
 * function returns through.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonRecord;
export type JsonRecord = { [key: string]: JsonValue };

export function jsonCodec<Output>(schema: z.ZodType<Output>) {
  return z.codec(z.string(), schema, {
    decode: (jsonString, context) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString) as unknown;
      } catch {
        context.issues.push({
          code: "custom",
          message: "Invalid JSON",
          input: jsonString,
        });
        return z.NEVER;
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        context.issues.push({
          code: "custom",
          message: "JSON does not match schema",
          input: jsonString,
        });
        return z.NEVER;
      }

      return validated.data;
    },
    encode: (value) => JSON.stringify(value),
  });
}
