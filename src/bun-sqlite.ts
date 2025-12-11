import { Database } from 'bun:sqlite';
import { inspect } from 'node:util';
import * as u from './utils';

import {
  type CodecsRegistry,
  type Column,
  type CreateTableStatement,
  type DDL,
  type Expr,
  type ExprEq,
  type ExprLiteral,
  type IDatabase,
  type ILogger,
  type InsertStatement,
  type SelectStatement,
  is,
} from './index';

/**
 * @private The result of rendering SQL.
 * @since   0.1.0
 * @version 1
 */
type RenderResult = { frags: string[], params: any[] };

/**
 * @private An empty rendered result.
 * @since   0.1.0
 * @version 1
 */
const EMPTY_RENDER_RESULT: RenderResult = { frags: [], params: [] } as const;

/**
 * @private Rendering utility functions.
 * @since   0.1.0
 * @version 1
 */
namespace r {
  /**
   * @private Renders identifier (e.g., table name, column name, etc).
   * @since   0.1.0
   * @version 1
   */
  export const identifier = (value: string) => `"${value}"`;
  /**
   * @private Accumulates rendered fragments and parameters.
   * @since   0.1.0
   * @version 1
   */
  export const collect = <T>(fn: (arg: T) => RenderResult) => (acc: RenderResult, value: T) => {
    const result = fn(value);

    return { frags: [...acc.frags, ...result.frags], params: [...acc.params, ...result.params] };
  };
  /**
   * @private Renders a column definition, for the create table
   *          statement.
   * @since   0.1.0
   * @version 1
   */
  export const column = (col: Column): RenderResult => {
    const {
      name,
      type,
      primaryKey = false,
      autoincrement = false,
      nullable = false,
      unique = false,
    } = col;

    // @TODO DDL should not have to know that it needs to snake_case here
    const frags: string[] = [identifier(u.snakeCase(name)), type];

    if (primaryKey) frags.push('PRIMARY KEY ASC');
    if (autoincrement) frags.push('AUTOINCREMENT');
    if (primaryKey) return { frags: [frags.join(' ')], params: [] };

    if (!nullable) frags.push('NOT NULL');
    if (unique) frags.push('UNIQUE');

    return { frags: [frags.join(' ')], params: [] };
  };
  /**
   * @private Renders a value placeholder for an insert statement.
   * @since   0.1.0
   * @version 1
   */
  export const row = (shape: Record<string, Column>) => (record: Record<string, any>): RenderResult => {
    const frags = [];
    const params = [];

    for (const key of Object.keys(shape)) {
      frags.push('?');
      params.push(record[key]);
    }

    return { frags: ['(' + frags.join(', ') + ')'], params };
  };
  /**
   * @private Renders the columns of a query's selection.
   * @since   0.1.0
   * @version 1
   */
  export const selection = (selection: Record<string, Column>): RenderResult => {
    const frags = Object
      .entries(selection)
      // @TODO DDL should not have to know that it needs to snake_case here
      .map(([alias, col]) => `${r.identifier(col.table)}.${r.identifier(u.snakeCase(col.name))} AS ${r.identifier(alias)}`);

    return { frags: [frags.join(', ')], params: [] };
  };
  /**
   * @private Expression rendering functions.
   * @since   0.1.0
   * @version 1
   */
  export const expr = {
    /**
     * @private Renders any {@link Expr}.
     * @since   0.1.0
     * @version 1
     */
    any: (value: Expr): RenderResult => {
      if (is.column(value)) return expr.column(value);
      if (is.eq(value)) return expr.eq(value);
      if (is.literal(value)) return expr.literal(value);

      throw new Error(`Unsupported expression type: ${inspect(value)}`);
    },
    /**
     * @private Renders a boolean literal expression.
     * @since   0.1.0
     * @version 1
     */
    boolean: (value: boolean): RenderResult => ({
      frags: ['?'],
      params: [codecs.BOOLEAN.encode(value)],
    }),
    /**
     * @private Renders a column expression.
     * @since   0.1.0
     * @version 1
     */
    column: (col: Column): RenderResult => ({
      // @TODO DDL should not have to know that it needs to snake_case here
      frags: [`${r.identifier(col.table)}.${r.identifier(u.snakeCase(col.name))}`],
      params: [],
    }),
    /**
     * @private Renders a date literal expression.
     * @since   0.1.0
     * @version 1
     */
    date: (value: Date): RenderResult => ({
      frags: ['?'],
      params: [codecs.DATETIME.encode(value)],
    }),
    /**
     * @private Renders an equality expression.
     * @since   0.1.0
     * @version 1
     */
    eq: (value: ExprEq): RenderResult => {
      const lhs = expr.any(value.$eq[0]);
      const rhs = expr.any(value.$eq[1]);

      return {
        frags: ['(' + lhs.frags.join('') + ' = ' + rhs.frags.join('') + ')'],
        params: [...lhs.params, ...rhs.params],
      };
    },
    /**
     * @private Renders a literal expression.
     * @since   0.1.0
     * @version 1
     */
    literal: (value: ExprLiteral): RenderResult => {
      if (is.null(value)) return expr.null();
      if (is.boolean(value)) return expr.boolean(value);
      if (is.date(value)) return expr.date(value);
      if (is.number(value)) return expr.number(value);
      if (is.string(value)) return expr.string(value);

      throw new Error(`Unsupported literal expression: ${inspect(value)}`);
    },
    /**
     * @private Renders a null literal expression.
     * @since   0.1.0
     * @version 1
     */
    null: (): RenderResult => ({ frags: ['NULL'], params: [] }),
    /**
     * @private Renders a number literal expression.
     * @since   0.1.0
     * @version 1
     */
    number: (value: number): RenderResult => ({ frags: ['?'], params: [value] }),
    /**
     * @private Renders a string literal expression.
     * @since   0.1.0
     * @version 1
     */
    string: (value: string): RenderResult => ({ frags: ['?'], params: [value] })
  };
};

/**
 * @private DDL generation functions.
 * @since   0.1.0
 * @version 1
 */
namespace ddl {
  /**
   * @private Renders DDL for a create table statement.
   * @since   0.1.0
   * @version 1
   */
  export const createTable = (op: CreateTableStatement): DDL => {
    const columns = op
      .columns
      .map(col => r.column(col).frags.join(''))
      .join(', ');

    const frags: string[] = [
      'CREATE ',
      (op.unlogged ? 'UNLOGGED ' : ''),
      'TABLE ',
      (op.ifNotExists ? 'IF NOT EXISTS ': ''),
      r.identifier(op.table),
      ' (',
      ...columns,
      ');',
    ];

    return { sql: frags.join(''), params: [] };
  };
  /**
   * @private Renders DDL for an insert statement.
   * @since   0.1.0
   * @version 1
   */
  export const insert = (op: InsertStatement): DDL => {
    const values = op
      .records
      .reduce(r.collect(r.row(op.insertShape)), EMPTY_RENDER_RESULT);

    const frags = [
      'INSERT INTO ',
      r.identifier(op.table),
      ' (',
      Object.keys(op.insertShape).map(r.identifier).join(', '),
      ') VALUES ',
      values.frags.join(', '),
      ' RETURNING ',
      r.selection(op.returnShape).frags.join(', '),
      ';'
    ];

    return { sql: frags.join(''), params: values.params };
  };
  /**
   * @private Renders DDL for a select statement.
   * @since   0.1.0
   * @version 1
   */
  export const select = (op: SelectStatement): DDL => {
    const where = op.where
      ? r.expr.any(op.where)
      : EMPTY_RENDER_RESULT;

    const limit = op.limit !== undefined
      ? { frags: [' LIMIT ', '?'], params: [op.limit] }
      : EMPTY_RENDER_RESULT;

    const offset = op.offset !== undefined
      ? { frags: [' OFFSET ', '?'], params: [op.offset] }
      : EMPTY_RENDER_RESULT;

    const frags: string[] = [
      'SELECT ',
      r.selection(op.select).frags.join(', '),
      ' FROM ',
      r.identifier(op.registry[op.from]!),
      ' AS ',
      r.identifier(op.from),
      (where.frags.length > 0 ? ' WHERE ': ''),
      ...where.frags,
      ...limit.frags,
      ...offset.frags,
      ';'
    ];

    return { sql: frags.join(''), params: [...where.params, ...limit.params, ...offset.params] };
  };
}

/**
 * @private Registry of codecs for Bun SQLite.
 * @since   0.1.0
 * @version 1
 */
const codecs: CodecsRegistry = {
  BINARY: {
    encode: (value: Uint8Array) => value,
    decode: (value: Uint8Array) => value,
  },
  BOOLEAN: {
    encode: (value: boolean) => (value ? 1 : 0),
    decode: (value: number) => value === 1,
  },
  DATETIME: {
    encode: (value: Date) => value.valueOf(),
    decode: (value: string) => new Date(value),
  },
  FLOAT: {
    encode: (value: number) => value * 1.0,
    decode: (value: number) => value * 1.0,
  },
  INTEGER: {
    encode: (value: number) => ~~value, // ← nifty little trick to truncate to integer
    decode: (value: number) => ~~value,
  },
  TEXT: {
    encode: (value: string) => value,
    decode: (value: string) => value,
  },
  VARCHAR: {
    encode: (value: string) => value,
    decode: (value: string) => value,
  },
};

/**
 * @private Creates an encoder function that converts a row into the
 *          expected shape and format expected by the database.
 * @since   0.1.0
 * @version 1
 */
const createEncoder = (shape: Record<string, Column>) => {
  const encoders = Object.fromEntries(
    Object
      .entries(shape)
      .map(([key, col]) => [key, (value: any) => value === null ? null : codecs[col.type].encode(value)] as const),
  );

  return (row: Record<string, any>) => Object.fromEntries(
    Object
      .entries(encoders)
      .map(([key, encode]) => [u.snakeCase(key), encode(row[key])] as const),
  );
};

/**
 * @private Creates a decoder function that converts a database row
 *          into the shape and format expected by the application.
 * @since   0.1.0
 * @version 1
 */
const createDecoder = (shape: Record<string, Column>) => {
  const decoders = Object.fromEntries(
    Object
      .entries(shape)
      .map(([key, col]) => [key, (value: any) => value === null ? null : codecs[col.type].decode(value)] as const),
  );

  return (row: Record<string, any>) => Object.fromEntries(
    Object
      .entries(decoders)
      .map(([key, decode]) => [key, decode(row[key])] as const),
  );
};

/**
 * @private Bun SQLite database adapter implementation.
 * @since   0.1.0
 * @version 1
 */
class BunSQLite implements IDatabase {
  constructor(private conn: Database, private loggers: ILogger[] = []) {}
  /**
   * @public  Attaches a logger to the database instance.
   * @since   0.1.0
   * @version 1
   */
  attachLogger(logger: ILogger) {
    this.loggers.push(logger);
    return this;
  }
  /**
   * @public  Executes a create table statement.
   * @since   0.1.0
   * @version 1
   */
  async createTable(op: CreateTableStatement) {
    const { sql } = ddl.createTable(op);

    this.loggers.forEach(logger => logger.log(sql, []));
    this.conn.run(sql);
  }
  /**
   * @public  Executes an insert statement.
   * @since   0.1.0
   * @version 1
   */
  async insert(op: InsertStatement) {
    const { sql, params } = ddl.insert({
      ...op,
      records: op.records.map(createEncoder(op.insertShape)),
      insertShape: u.mapKeys(op.insertShape, u.snakeCase),
    });

    this.loggers.forEach(logger => logger.log(sql, params));
    const stmt = this.conn.prepare(sql);
    const rows = stmt.all(...params) as Record<string, any>[];

    return rows.map(createDecoder(op.returnShape));
  }
  /**
   * @public  Executes a select statement.
   * @since   0.1.0
   * @version 1
   */
  async query(op: SelectStatement) {
    const { sql, params } = ddl.select(op);

    this.loggers.forEach(logger => logger.log(sql, params));
    const stmt = this.conn.prepare(sql);
    const rows = stmt.all(...params) as Record<string, any>[];

    return rows.map(createDecoder(op.select));
  }
}

/**
 * @public  Creates a connection to the database.
 * @since   0.1.0
 * @version 1
 */
export const connect = (...args: ConstructorParameters<typeof Database>) => new BunSQLite(new Database(...args));
