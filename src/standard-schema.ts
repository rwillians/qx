import * as std from '@standard-schema/spec';

// // // // // // // // // // // // // // // // // // // // // // // //
//                        STANDARD SCHEMA API                        //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  The Standard Schema interface.
 * @since   0.1.0
 * @version 1
 */
export { type StandardSchemaV1 as Schema } from '@standard-schema/spec';

/**
 * @public  Infers the input type of a Standard Schema.
 * @since   0.1.0
 * @version 1
 */
export type input<T extends std.StandardSchemaV1> = std.StandardSchemaV1.InferInput<T>;

/**
 * @public  Infers the Input type of a Standard Schema.
 * @since   0.1.0
 * @version 1
 */
export type output<T extends std.StandardSchemaV1> = std.StandardSchemaV1.InferOutput<T>;

/**
 * @public  Use any standard schema to parse a value.
 * @since   0.1.0
 * @version 1
 */
export const parse = <T extends std.StandardSchemaV1>(schema: T, value: unknown) => {
  const parsed = schema['~standard'].validate(value);

  if (parsed instanceof Promise) {
    throw new Error('async standard schema validators are not supported');
  }

  return parsed as std.StandardSchemaV1.Result<output<T>>;
};

// // // // // // // // // // // // // // // // // // // // // // // //
//                               UTILS                               //
// // // // // // // // // // // // // // // // // // // // // // // //

const prependPath = (path: string | number | symbol) => (issue: std.StandardSchemaV1.Issue) => ({
  ...issue,
  path: [path, ...(issue.path ?? [])],
});

// // // // // // // // // // // // // // // // // // // // // // // //
//                        BUILT-IN VALIDATORS                        //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  Defines an array of a given standard schema.
 * @since   0.1.0
 * @version 1
 */
export type QxArray<T extends std.StandardSchemaV1> = std.StandardSchemaV1<
  input<T>[],
  output<T>[]
>;

/**
 * @public  Defines an array of a given standard schema.
 * @since   0.1.0
 * @version 1
 */
export const array = <T extends std.StandardSchemaV1>(schema: T): QxArray<T> => ({
  '~standard': {
    version: 1 as const,
    vendor: 'qx',
    validate: (input: unknown) => {
      if (!Array.isArray(input)) {
        return { issues: [{ message: 'must be an array' }] };
      }

      const issues: std.StandardSchemaV1.Issue[] = [];
      const value: any[] = [];

      for (let i = 0; i < input.length; i++) {
        const parsed = parse(schema, input[i]);

        parsed.issues
          ? issues.push(...parsed.issues.map(prependPath(i)))
          : value.push(parsed.value);
      }

      return issues.length > 0
        ? { issues }
        : { value: value as output<T>[] };
    },
  },
});

/**
 * @public  Enables nullable to any standard schema.
 * @since   0.1.0
 * @version 1
 */
export type QxNullable<T extends std.StandardSchemaV1 = std.StandardSchemaV1> = std.StandardSchemaV1<
  input<T> | null,
  output<T> | null
>;

/**
 * @public  Makes any standard schema accepts `null` as a valid value.
 * @since   0.1.0
 * @version 1
 */
export const nullable = <T extends std.StandardSchemaV1>(schema: T): QxNullable<T> => ({
  '~standard': {
    version: 1 as const,
    vendor: 'qx',
    validate: (value: unknown) => value === null
      ? { value }
      : parse(schema, value),
  },
});

/**
 * @public  Defines an object schema that does not allow extra fields.
 * @since   0.1.0
 * @version 1
 */
type QxStrictObject<T extends Record<string, std.StandardSchemaV1>> = std.StandardSchemaV1<
  { [K in keyof T]: input<T[K]> },
  { [K in keyof T]: output<T[K]> }
>;

/**
 * @public  Defines an object schema that does not allow extra fields.
 * @since   0.1.0
 * @version 1
 */
export const strictObject = <T extends Record<string, std.StandardSchemaV1>>(shape: T): QxStrictObject<T> => ({
  '~standard': {
    version: 1 as const,
    vendor: 'qx',
    validate: (input: unknown) => {
      if (typeof input !== 'object' || input === null) {
        return { issues: [{ message: 'must be an object' }] };
      }

      const issues: std.StandardSchemaV1.Issue[] = [];

      const inputKeys = new Set(Object.keys(input));
      const shapeKeys = new Set(Object.keys(shape));

      // one issue for each key of `input` that doesn't exist in `shape`
      for (const key of inputKeys.difference(shapeKeys)) {
        issues.push({ path: [key], message: 'unknown field' });
      }

      // one issue for each key of `shape` that doesn't exist in `input`
      for (const key of shapeKeys.difference(inputKeys)) {
        issues.push({ path: [key], message: 'is required' });
      }

      const record: Record<string, any> = {};

      for (const [key, value] of Object.entries(input)) {
        const parsed = shape[key]!['~standard'].validate(value);

        if (parsed instanceof Promise) {
          throw new Error('async validators are not supported');
        }

        parsed.issues
          ? issues.push(...parsed.issues.map(prependPath(key)))
          : record[key] = parsed.value;
      }

      return issues.length > 0
        ? { issues }
        : { value: record as { [K in keyof T]: output<T[K]> } };
    },
  },
});
