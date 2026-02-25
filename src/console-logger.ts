import type { Socket } from 'node:net';
import { inspect } from 'node:util';

import {
  type ILogger,
} from './index';

/**
 * @private Non-exhaustive table of ASCII codes for styled console
 *          output.
 * @since   0.1.21
 * @version 1
 */
const ASCII_STYLE_CODES = {
  blue:      { open: 34, close: 39 },
  bold:      { open:  1, close: 22 },
  brightRed: { open: 91, close: 39 },
  dim:       { open:  2, close: 22 },
  green:     { open: 32, close: 39 },
  italic:    { open:  3, close: 23 },
  red:       { open: 31, close: 39 },
  yellow:    { open: 33, close: 39 },
} as const;

/**
 * @private Either a string or anything that quacks like a string.
 * @since   0.1.21
 * @version 1
 */
type StringLike = string | { toString: () => string };

/**
 * @private A registry of style functions for console output, one for
 *          each style in the ASCII codes table.
 * @since   0.1.21
 * @version 1
 */
const s: {
  [K in keyof typeof ASCII_STYLE_CODES]: (str: StringLike) => string;
} & {
  default: (str: StringLike) => string;
} = Object.fromEntries(
  Object
    .entries(ASCII_STYLE_CODES)
    .map(([key, style]) => [key, (str: StringLike) => `\u001b[${style.open}m${str.toString()}\u001b[${style.close}m`])
    .concat([['default', (str: StringLike) => str.toString()]]), // alias for no style
);

/**
 * @private Split the given query into a tuple, where the first elment
 *          is the statement name (e.g. SELECT, INSERT, etc) and the
 *          second element is the rest of the query.
 * @since   0.1.21
 * @version 1
 */
const splitAtStatementName = (str: string) => [str.split(' ')[0], str.slice(str.indexOf(' '))] as const;

/**
 * @private Paints the given SQL depending on what it does (e.g.
 *          DELETEs are red, SELECTs are green, etc).
 * @since   0.1.21
 * @version 1
 */
const dye = (sql: string) => {
  const [statement, rest] = splitAtStatementName(sql);

  if (statement === 'INSERT') return s.green(`${s.bold(statement)} ${rest}`);
  if (statement === 'SELECT') return s.blue(`${s.bold(statement)} ${rest}`);
  if (statement === 'UPDATE') return s.yellow(`${s.bold(statement)} ${rest}`);
  if (statement === 'DELETE') return s.brightRed(`${s.bold(statement)} ${rest}`);

  return sql;
};

/**
 * @private Renders a query parameter value for logging purposes.
 * @since   0.1.21
 * @version 1
 */
const render = (value: unknown): string => {
  if (value === null) return s.dim('null');
  if (value === undefined) return s.dim('null');
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return s.blue(value.toString());
  if (typeof value === 'string') return [s.dim('`'), value, s.dim('`')].join('');
  if (value instanceof Date) return s.blue(`${value.toISOString()}`);
  if (Array.isArray(value)) return [s.dim('['), value.map(render).join(s.dim(', ')), s.dim(']')].join('');
  throw new Error(`Unable to render value: ${inspect(value, true, null, true)}`);
};

/**
 * @private A function that [p]retty-[p]rints the given SQL query, its
 *          parameters and its error.
 * @since   0.1.21
 * @version 1
 */
const pp = (sql: string, params: any[], error?: Error | undefined) => [
  dye(sql),
  ' ',
  render(params),
  error
    ? ('\n\n' + s.red(`${s.bold(error.constructor.name)} ${error.message}\n${error.stack}`.trim()) + '\n\n')
    : '',
].join('');

/**
 * @private A function that prints the given SQL query, its parameters
 *          and its error as [p]lain [t]ext (no ASCII styling).
 * @since   0.1.21
 * @version 1
 */
const pt = (sql: string, params: any[], error?: Error | undefined) => [
  sql,
  ' ',
  render(params),
  error
    ? ('\n\n' + (`${error.constructor.name} ${error.message}\n${error.stack}`.trim()) + '\n\n')
    : '',
].join('');

/**
 * @private Returns a function that pretty-prints its given arguments
 *          to the specified stream.
 * @since   0.1.21
 * @version 1
 */
const handler = <T extends any[]>(stream: Socket, fn: (...args: T) => string) =>
  (...args: T) => { stream.write(fn(...args)); };

/**
 * @public  Creates a basic console logger that pretty-prints queries.
 *
 *          Pretty printing is enabled by default but you can disable
 *          it to print plain-text instead (no ASCII styling), just
 *          set the option `pretty` to `false`.
 * @since   0.1.0
 * @version 3
 *
 * @example
 * ```ts
 * import { createConsoleLogger } from '@rwillians/qx/console-logger';
 *
 * const prettyLogger = createConsoleLogger();
 * const plainLogger = createConsoleLogger({ pretty: false });
 * ```
 */
export const createConsoleLogger = (opts: { pretty: boolean } = { pretty: true }): ILogger => ({
  debug: handler(process.stdout, opts.pretty ? pp : pt),
  error: handler(process.stderr, opts.pretty ? pp : pt),
});
