import { Database } from 'bun:sqlite';
import { inspect } from 'node:util';
import * as u from './utils';

import {
  type CodecsRegistry,
  type Column,
  type CreateTableStatement,
  type DDL,
  type DeleteStatement,
  type Expr,
  type ExprAnd,
  type ExprBinaryOp,
  type ExprLiteral,
  type ExprNot,
  type ExprOr,
  type IDatabase,
  type ILogger,
  type InsertStatement,
  type Join,
  type OrderDirection,
  type PrimitiveToNativeTypeFactory,
  type SelectStatement,
  is,
  withLoggedQuery,
} from './adapter';

/**
 * @private Mapping of qx's primitive types to SQLite native types.
 * @since   0.1.0
 * @version 1
 */
const TYPES_MAPPING: PrimitiveToNativeTypeFactory = {
  BINARY:   () => 'BLOB',
  BOOLEAN:  () => 'INTEGER',
  DATETIME: () => 'INTEGER',
  FLOAT:    () => 'REAL',
  INTEGER:  () => 'INTEGER',
  TEXT:     () => 'TEXT',
  VARCHAR:  () => `TEXT`,
};

/**
 * @private Registry of codecs for Bun SQLite.
 * @since   0.1.0
 * @version 1
 */
const CODECS: CodecsRegistry = {
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
 * @private A function combinator that accumulates rendered fragments
 *          and parameters when used in a reduce operation.
 * @since   0.1.0
 * @version 1
 */
const collect = <T>(fn: (arg: T) => RenderResult) => (acc: RenderResult, value: T): RenderResult => {
  const result = fn(value);

  return { frags: [...acc.frags, ...result.frags], params: [...acc.params, ...result.params] };
};

/**
 * @private A function combinator that glues rendered fragments
 *          together.
 * @since   0.1.0
 * @version 1
 */
const glue = <T extends any[]>(fn: (...args: T) => RenderResult) => (...args: T): RenderResult => {
  const result = fn(...args);

  return { frags: [result.frags.join('')], params: result.params };
};

/**
 * @private Functions for rendering fragments while generateing DDL.
 * @since   0.1.0
 * @version 1
 */
const render = {
  /**
   * @private Renders an object reference (e.g., table name, column
   *          name, etc).
   * @since   0.1.0
   * @version 1
   */
  ref: (value: string) => `"${value}"`,
  /**
   * @private Renders a column definition, for the create table
   *          statement.
   * @since   0.1.0
   * @version 1
   */
  column: glue((col: Column): RenderResult => {
    const {
      name,
      primaryKey = false,
      autoincrement = false,
      nullable = false,
      unique = false,
    } = col;

    const type = TYPES_MAPPING[col.type](col);

    // @TODO DDL should not have to know that it needs to snake_case here
    const frags: string[] = [render.ref(u.snakeCase(name)), type];

    if (primaryKey) frags.push('PRIMARY KEY ASC');
    if (autoincrement) frags.push('AUTOINCREMENT');
    if (primaryKey) return { frags: [frags.join(' ')], params: [] };

    if (!nullable) frags.push('NOT NULL');
    if (unique) frags.push('UNIQUE');

    return { frags: [frags.join(' ')], params: [] };
  }),
  /**
   * @private Renders a value placeholder for an insert statement.
   * @since   0.1.0
   * @version 1
   */
  row: (shape: Record<string, Column>) => glue((record: Record<string, any>): RenderResult => {
    const frags = [];
    const params = [];

    for (const key of Object.keys(shape)) {
      frags.push('?');
      params.push(record[key]);
    }

    return { frags: ['(' + frags.join(', ') + ')'], params };
  }),
  /**
   * @private Renders the columns of a query's selection.
   * @since   0.1.0
   * @version 1
   */
  selection: glue((selection: Record<string, Column>): RenderResult => {
    const frags = Object
      .entries(selection)
      // @TODO DDL should not have to know that it needs to snake_case here
      .map(([alias, col]) => `${render.expr.column(col).frags.join('')} AS ${render.ref(alias)}`);

    return { frags: [frags.join(', ')], params: [] };
  }),
  /**
   * @private Renders an order by clause.
   * @since   0.1.0
   * @version 1
   *
   * Not using {@link glue} here becuase it's breaking typescript
   * ¯\_(ツ)_/¯
   */
  orderBy: ([expr, dir]: readonly [Expr, OrderDirection]) => {
    const { frags, params } = render.expr.any(expr);

    return { frags: [[...frags, dir].join(' ')], params };
  },
  /**
   * @private Renders a join clause.
   * @since   0.1.9
   * @version 1
   */
  join: glue((join: Join): RenderResult => {
    const result = render.expr.any(join.on);

    return {
      frags: [' ', join.type, ' ', render.ref(join.table), ' AS ', render.ref(join.alias), ' ON ', ...result.frags],
      params: result.params,
    };
  }),
  /**
   * @private Expression rendering functions.
   * @since   0.1.0
   * @version 1
   */
  expr: {
    /**
     * @private Renders any {@link Expr}.
     * @since   0.1.0
     * @version 1
     */
    any: glue((value: Expr): RenderResult => {
      if (is.binaryOp(value)) return render.expr.binaryOp(value);
      if (is.and(value)) return render.expr.and(value);
      if (is.or(value)) return render.expr.or(value);
      if (is.not(value)) return render.expr.not(value);
      if (is.column(value)) return render.expr.column(value);
      if (is.literal(value)) return render.expr.literal(value);

      throw new Error(`Unsupported expression type: ${inspect(value)}`);
    }),
    // // // // // // // // // // // // // // // // // // // // // //
    //                    BINARY OP EXPRESSIONS                    //
    // // // // // // // // // // // // // // // // // // // // // //
    /**
     * @private Renders any binary op expression.
     * @since   0.1.0
     * @version 1
     */
    binaryOp: glue((value: ExprBinaryOp): RenderResult => {
      const lhs = render.expr.any(value.lhs);

      const rhs = Array.isArray(value.rhs)
        ? render.expr.array(value.rhs)
        : render.expr.any(value.rhs);

      return { frags: ['(', ...lhs.frags, ` ${value.op} `, ...rhs.frags, ')'], params: [...lhs.params, ...rhs.params] };
    }),
    // // // // // // // // // // // // // // // // // // // // // //
    //                   BOOLEAN OP EXPRESSIONS                    //
    // // // // // // // // // // // // // // // // // // // // // //
    /**
     * @private Renders an AND expression.
     * @since   0.1.0
     * @version 1
     */
    and: glue((value: ExprAnd): RenderResult => {
      const inner = value.and.reduce(collect(render.expr.any), EMPTY_RENDER_RESULT);

      return { frags: ['(', inner.frags.join(' AND '), ')'], params: inner.params };
    }),
    /**
     * @private Renders an OR expression.
     * @since   0.1.0
     * @version 1
     */
    or: glue((value: ExprOr): RenderResult => {
      const inner = value.or.reduce(collect(render.expr.any), EMPTY_RENDER_RESULT);

      return { frags: ['(', inner.frags.join(' OR '), ')'], params: inner.params };
    }),
    /**
     * @private Renders a NOT expression.
     * @since   0.1.0
     * @version 1
     */
    not: glue((value: ExprNot): RenderResult => {
      const inner = render.expr.any(value.not);

      return { frags: ['NOT ', ...inner.frags], params: inner.params };
    }),
    // // // // // // // // // // // // // // // // // // // // // //
    //                      OTHER EXPRESSIONS                      //
    // // // // // // // // // // // // // // // // // // // // // //
    array: glue((values: Expr[]): RenderResult => {
      const { frags, params } = values.reduce(collect(render.expr.any), EMPTY_RENDER_RESULT);

      return { frags: ['(', frags.join(', '), ')'], params };
    }),
    /**
     * @private Renders a column expression.
     * @since   0.1.0
     * @version 1
     */
    column: glue((col: Column): RenderResult => ({
      // @TODO DDL should not have to know that it needs to snake_case here
      frags: [`${render.ref(col.table)}.${render.ref(u.snakeCase(col.name))}`],
      params: [],
    })),
    /**
     * @private Renders a literal expression.
     * @since   0.1.0
     * @version 1
     */
    literal: glue((value: ExprLiteral): RenderResult => {
      if (is.null(value)) return render.expr.null();
      if (is.boolean(value)) return render.expr.boolean(value);
      if (is.date(value)) return render.expr.date(value);
      if (is.number(value)) return render.expr.number(value);
      if (is.string(value)) return render.expr.string(value);

      throw new Error(`Unsupported literal expression: ${inspect(value)}`);
    }),
    // // // // // // // // // // // // // // // // // // // // // //
    //                          LITERALS                           //
    // // // // // // // // // // // // // // // // // // // // // //
    /**
     * @private Renders a boolean literal expression.
     * @since   0.1.0
     * @version 1
     */
    boolean: glue((value: boolean): RenderResult => ({
      frags: [value ? 'TRUE' : 'FALSE'],
      params: [],
    })),
    /**
     * @private Renders a date literal expression.
     * @since   0.1.0
     * @version 1
     */
    date: glue((value: Date): RenderResult => ({
      frags: ['?'],
      params: [CODECS.DATETIME.encode(value)],
    })),
    /**
     * @private Renders a null literal expression.
     * @since   0.1.0
     * @version 1
     */
    null: glue((): RenderResult => ({ frags: ['NULL'], params: [] })),
    /**
     * @private Renders a number literal expression.
     * @since   0.1.0
     * @version 1
     */
    number: glue((value: number): RenderResult => ({ frags: ['?'], params: [value] })),
    /**
     * @private Renders a string literal expression.
     * @since   0.1.0
     * @version 1
     */
    string: glue((value: string): RenderResult => ({ frags: ['?'], params: [value] })),
  },
};

/**
 * @private DDL generation functions.
 * @since   0.1.0
 * @version 1
 */
const ddl = {
  /**
   * @private Generates DDL for create table statement.
   * @since   0.1.0
   * @version 1
   */
  createTable: (op: CreateTableStatement): DDL => {
    const columns = op
      .columns
      .map(col => render.column(col).frags.join(''))
      .join(', ');

    const frags: string[] = [
      'CREATE ',
      (op.unlogged ? 'UNLOGGED ' : ''),
      'TABLE ',
      (op.ifNotExists ? 'IF NOT EXISTS ': ''),
      render.ref(op.table),
      ' (',
      ...columns,
      ');',
    ];

    return { sql: frags.join(''), params: [] };
  },
  /**
   * @private Generates DDL for insert statement.
   * @since   0.1.0
   * @version 1
   */
  insert: (op: InsertStatement): DDL => {
    const values = op
      .records
      .reduce(collect(render.row(op.insertShape)), EMPTY_RENDER_RESULT);

    const frags = [
      'INSERT INTO ',
      render.ref(op.table),
      ' (',
      Object.keys(op.insertShape).map(render.ref).join(', '),
      ') VALUES ',
      values.frags.join(', '),
      ' RETURNING ',
      render.selection(op.returnShape).frags.join(', '),
      ';'
    ];

    return { sql: frags.join(''), params: values.params };
  },
  /**
   * @private Generates DDL for delete statement.
   * @since   0.1.22
   * @version 1
   */
  delete: (op: DeleteStatement): DDL => {
    const where = op.where
      ? render.expr.any(op.where)
      : EMPTY_RENDER_RESULT;

    const frags: string[] = [
      'DELETE FROM ',
      render.ref(op.table),
      ' AS ',
      render.ref(op.alias),
      (where.frags.length > 0 ? ' WHERE ' : ''),
      ...where.frags,
      ';'
    ];

    return { sql: frags.join(''), params: [...where.params] };
  },
  /**
   * @private Generates DDL for select statement.
   * @since   0.1.0
   * @version 1
   */
  select: (op: SelectStatement): DDL => {
    const joins = op.joins && op.joins.length > 0
      ? op.joins.reduce(collect(render.join), EMPTY_RENDER_RESULT)
      : EMPTY_RENDER_RESULT;

    const where = op.where
      ? render.expr.any(op.where)
      : EMPTY_RENDER_RESULT;

    const orderBy = op.orderBy && op.orderBy.length > 0
      ? op.orderBy.reduce(collect(render.orderBy), EMPTY_RENDER_RESULT)
      : EMPTY_RENDER_RESULT;

    const limit = op.limit !== undefined
      ? { frags: [' LIMIT ', '?'], params: [op.limit] }
      : EMPTY_RENDER_RESULT;

    const offset = op.offset !== undefined
      ? { frags: [' OFFSET ', '?'], params: [op.offset] }
      : EMPTY_RENDER_RESULT;

    const frags: string[] = [
      'SELECT ',
      render.selection(op.select).frags.join(', '),
      ' FROM ',
      render.ref(op.registry[op.from]!),
      ' AS ',
      render.ref(op.from),
      ...joins.frags,
      (where.frags.length > 0 ? ' WHERE ': ''),
      ...where.frags,
      (orderBy.frags.length > 0 ? ' ORDER BY ' + orderBy.frags.join(', ') : ''),
      ...limit.frags,
      ...offset.frags,
      ';'
    ];

    return { sql: frags.join(''), params: [...joins.params, ...where.params, ...limit.params, ...offset.params] };
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
      .map(([key, col]) => [key, (value: any) => value === null ? null : CODECS[col.type].encode(value)] as const),
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
      .map(([key, col]) => [key, (value: any) => value === null ? null : CODECS[col.type].decode(value)] as const),
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
  constructor(private conn: Database,
              private loggers: ILogger[] = []) {}
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
   * @public  Executes a delete statement.
   * @since   0.1.22
   * @version 1
   */
  async delete(op: DeleteStatement) {
    const { sql, params } = ddl.delete(op);

    return await withLoggedQuery(this.loggers, { sql, params }, () => this.conn
      .prepare(sql)
      .run(...params)
      .changes);
  }
  /**
   * @public  Executes a create table statement.
   * @since   0.1.0
   * @version 1
   */
  async createTable(op: CreateTableStatement) {
    const { sql, params } = ddl.createTable(op);

    await withLoggedQuery(this.loggers, { sql, params }, () => this.conn.run(sql));
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

    const rows = await withLoggedQuery(this.loggers, { sql, params }, () => this.conn
      .prepare(sql)
      .all(...params) as Record<string, any>[]);

    return rows.map(createDecoder(op.returnShape));
  }
  /**
   * @public  Executes a select statement.
   * @since   0.1.0
   * @version 1
   */
  async query(op: SelectStatement) {
    const { sql, params } = ddl.select(op);

    const rows = await withLoggedQuery(this.loggers, { sql, params }, () => this.conn
      .prepare(sql)
      .all(...params) as Record<string, any>[]);

    return rows.map(createDecoder(op.select));
  }
  /**
   * @public  Executes a function within a transaction.
   * @since   0.1.10
   * @version 1
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.conn.transaction(fn)();
  }
}

/**
 * @public  Creates a connection to the database.
 * @since   0.1.0
 * @version 1
 */
const connect = (...args: ConstructorParameters<typeof Database>) => new BunSQLite(new Database(...args));

/**
 * @public  Creates a connection to an in-memory database.
 * @since   0.1.12
 * @version 2
 */
const inmemory = () => connect(':memory:');

// // // // // // // // // // // // // // // // // // // // // // // //
//                              EXPORTS                              //
// // // // // // // // // // // // // // // // // // // // // // // //

export {
  connect,
  inmemory,
};
