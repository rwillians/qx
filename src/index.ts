import * as std from './standard-schema';
import * as u from './utils';

// // // // // // // // // // // // // // // // // // // // // // // //
//                              SYMBOLS                              //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @private Symbol used to store the table name on aliased tables.
 * @since   0.1.0
 * @version 1
 */
const TABLE_NAME = Symbol.for('~exto.table-name');

/**
 * @private Symbol used to store the table alias on aliased tables.
 * @since   0.1.0
 * @version 1
 */
const TABLE_ALIAS = Symbol.for('~exto.table-alias');

// // // // // // // // // // // // // // // // // // // // // // // //
//                           UTILITY TYPES                           //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @private Little trick to force TypeScript to resolve types instead
 *          of composing them.
 * @since   0.1.0
 * @version 1
 */
type Expand<T> = T extends object ? { [K in keyof T]: T[K] } : never;

// // // // // // // // // // // // // // // // // // // // // // // //
//                         TABLE DEFINITION                          //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  The list of primitive types supported by qx.
 * @since   0.1.0
 * @version 1
 */
type Primitive =
  'BINARY'
  | 'BOOLEAN'
  | 'DATETIME'
  | 'FLOAT'
  | 'INTEGER'
  | 'TEXT'
  | 'VARCHAR';

/**
 * @private All properties of a column, except its name and the table
 *          to which they belong.
 * @since   0.1.0
 * @version 1
 */
type ColumnProps<T extends std.Schema = std.Schema> = {
  /**
   * @public  whether the column is autoincrementing.
   * @since   0.1.0
   * @version 1
   */
  autoincrement?: true;
  /**
   * @public  The default value for the column. If a column has
   *          nullish value in an insert, then this value will be used
   *          instead.
   * @since   0.1.0
   * @version 1
   */
  default?: std.output<T> | (() => std.output<T>);
  /**
   * @public  Whether the column is nullable.
   * @since   0.1.0
   * @version 1
   */
  nullable?: true;
  /**
   * @public  Whether the column is a primary key.
   * @since   0.1.0
   * @version 1
   */
  primaryKey?: true;
  /**
   * @public  The standard schema that defines the column's input and
   *          output types.
   * @since   0.1.0
   * @version 1
   */
  schema: T;
  /**
   * @public  The size of a string column (VARCHAR). If provided for
   *          non-varchar columns, it will be ignored.
   * @since   0.1.0
   * @version 1
   */
  size?: number;
  /**
   * @public  The type of the column, one of the supported primitive
   *          types by `qx`. See {@link Primitive} for the complete
   *          list of primitives.
   * @since   0.1.0
   * @version 1
   */
  type: Primitive;
  /**
   * @public  Whether the column has a unique constraint.
   * @since   0.1.0
   * @version 1
   */
  unique?: true;
};

/**
 * @public  A column definition.
 * @since   0.1.0
 * @version 2
 */
type Column<S extends string = string, T extends ColumnProps = ColumnProps> = Expand<T & {
  /**
   * @public  The name of the column.
   * @since   0.1.0
   * @version 1
   */
  name: S;
  /**
   * @public  The name of the table to which the column belongs or its
   *          alias when the table has been aliased.
   * @since   0.1.0
   * @version 1
   */
  table: string;
  /**
   * @public  The column's input type, cached.
   * @since   0.1.0
   * @version 2
   */
  inferInput: std.input<T['schema']>;
  /**
   * @public  The column's output type, cached.
   * @since   0.1.0
   * @version 2
   */
  inferOutput: std.output<T['schema']>;
}>;

/**
 * @public  A table definition.
 * @since   0.1.0
 * @version 1
 */
type Table<S extends string = string, T extends Record<string, ColumnProps> = Record<string, ColumnProps>> = {
  /**
   * @public  The name of the table.
   * @since   0.1.0
   * @version 1
   */
  name: S;
  /**
   * @public  The columns of the table.
   * @since   0.1.0
   * @version 1
   */
  columns: { [K in keyof T & string]: Column<K, T[K]> };
};

/**
 * @private Represents a table when it's been aliased in a query.
 * @since   0.1.0
 * @version 1
 */
type Aliased<S extends string = string, T extends Table = Table> = T['columns'] & {
  /**
   * @public  The original name of the table.
   * @since   0.1.0
   * @version 1
   */
  [TABLE_NAME]: T['name'];
  /**
   * @public  The alias of the table.
   * @since   0.1.0
   * @version 1
   */
  [TABLE_ALIAS]: S;
};

/**
 * @private Adds the ability to alias a table.
 * @since   0.1.0
 * @version 1
 */
type Aliasable<T extends Table> = T & {
  /**
   * @public  Creates an aliased table from a regular table.
   * @since   0.1.0
   * @version 1
   */
  as: <S extends string>(alias: S) => Aliased<S, T>;
};

/**
 * @private The pattern of columns that should be omitted when
 *          inserting a new row.
 * @since   0.1.0
 * @version 1
 */
type OmitOnInsert = { autoincrement: true };

/**
 * @private The pattern of columns that should be optional when
 *          inserting a new row.
 * @since   0.1.0
 * @version 1
 */
type OptionalOnInsert = { default: any } | { nullable: true };

/**
 * @private The pattern of columns that should be omitted when
 *          updating a row.
 * @since   0.1.0
 * @version 1
 */
type OmitOnUpdate = { autoincrement: true } | { primaryKey: true };

/**
 * @private Infers the output type of a table's row.
 * @since   0.1.0
 * @version 2
 */
type Infer<T extends Table> = {
  [K in keyof T['columns']]: T['columns'][K]['inferOutput'];
};

/**
 * @private Infers the input type required to insert a new row.
 * @since   0.1.0
 * @version 2
 */
type InferForInsert<T extends Table> = Expand<{
  [K in keyof T['columns']as T['columns'][K] extends OmitOnInsert | OptionalOnInsert ? never : K]: T['columns'][K]['inferInput'];
} & {
  [K in keyof T['columns']as T['columns'][K] extends OptionalOnInsert ? K : never]?: T['columns'][K]['inferInput'];
}>;

/**
 * @private Infers the input type required to update an existing row.
 * @since   0.1.0
 * @version 2
 */
type InferForUpdate<T extends Table> = {
  [K in keyof T['columns']as T['columns'][K] extends OmitOnUpdate ? never : K]?: T['columns'][K]['inferInput'];
};

/**
 * @private Adds the ability to infer types of a table.
 * @since   0.1.0
 * @version 1
 */
type Inferrable<T extends Table> = T & {
  /**
   * @private The output type of a row, cached.
   * @since   0.1.0
   * @version 1
   */
  infer: Infer<T>;
  /**
   * @private The input type for a new row, cached.
   * @since   0.1.0
   * @version 1
   */
  inferForInsert: InferForInsert<T>;
  /**
   * @private The input type for updating an existing row, cached.
   * @since   0.1.0
   * @version 1
   */
  inferForUpdate: InferForUpdate<T>;
};

/**
 * @private A builder for column properties.
 * @since   0.1.0
 * @version 2
 */
class ColumnPropsBuilder<T extends ColumnProps = ColumnProps> {
  constructor(public readonly props: T) { }
  /**
   * @public  Marks the column as autoincrementing.
   * @since   0.1.0
   * @version 1
   */
  autoincrement() {
    if (this.props.type !== 'INTEGER') throw new Error('Autoincrement can only be set on integer columns');

    return new ColumnPropsBuilder({ ...this.props, autoincrement: true } as Expand<T & {
      autoincrement: true;
    }>);
  }
  /**
   * @public  Sets a default value for the column. This is not the
   *          table's default value for the column, but rather a
   *          fallback value that qx will use when inserting a new row
   *          where this column is nullish.
   * @since   0.1.0
   * @version 2
   */
  default<S extends std.output<T['schema']> | (() => std.output<T['schema']>)>(value: S) {
    return new ColumnPropsBuilder({ ...this.props, default: value } as Expand<T & {
      default: S;
    }>);
  }
  /**
   * @public  Marks the column as nullable.
   * @since   0.1.0
   * @version 2
   * @throws {Error} if the column is a primary key.
   */
  nullable() {
    if (this.props.primaryKey) throw new Error('Cannot make a primary key column nullable');

    const { schema, ...props } = this.props;

    return new ColumnPropsBuilder({ ...props, nullable: true, schema: std.nullable(schema) } as unknown as Expand<Omit<T, 'schema'> & {
      nullable: true;
      schema: std.QxNullable<T['schema']>;
    }>);
  }
  /**
   * @public  Marks the column as a primary key.
   * @since   0.1.0
   * @version 1
   * @throws {Error} if the column is nullable.
   */
  primaryKey() {
    if (this.props.nullable) throw new Error('Cannot make a nullable column a primary key');

    return new ColumnPropsBuilder({ ...this.props, primaryKey: true } as Expand<T & {
      primaryKey: true;
    }>);
  }
  /**
   * @public  Marks the column as unique.
   * @since   0.1.0
   * @version 2
   */
  unique() {
    if (this.props.primaryKey) throw new Error('Primary key columns are already unique');

    return new ColumnPropsBuilder({ ...this.props, unique: true } as Expand<T & {
      unique: true;
    }>);
  }
}

/**
 * @public  A way to define a column with a custom standard schema.
 * @since   0.1.0
 * @version 1
 */
const defineColumn = <T extends ColumnProps>(baseProps: T) => new ColumnPropsBuilder(baseProps);

/**
 * @public  Built-in column types.
 * @since   0.1.0
 * @version 1
 */
const types = {
  /**
   * @public  Defines a column type that accepts binary data.
   * @since   0.1.0
   * @version 1
   */
  binary: () => defineColumn({
    type: 'BINARY',
    schema: std.instanceOf(Uint8Array),
  }),
  /**
   * @public  Defines a column type that accepts boolean values.
   * @since   0.1.0
   * @version 1
   */
  boolean: () => defineColumn({
    type: 'BOOLEAN',
    schema: std.boolean(),
  }),
  /**
   * @public  Defines a column type that accepts a Date object, an
   *          ISO 8601 date string, or a Unix timestamp in milliseconds.
   * @since   0.1.0
   * @version 1
   */
  datetime: () => defineColumn({
    type: 'DATETIME',
    schema: std.date(),
  }),
  /**
   * @public  Defines a column type that accepts floating-point numbers.
   * @since   0.1.0
   * @version 1
   */
  float: () => defineColumn({
    type: 'FLOAT',
    schema: std.number({ min: Number.MIN_VALUE, max: Number.MAX_VALUE }),
  }),
  /**
   * @public  Defines a column type that accepts integer numbers.
   * @since   0.1.0
   * @version 1
   */
  integer: () => defineColumn({
    type: 'INTEGER',
    schema: std.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
  }),
  /**
   * @public  Defines a column type that accepts small strings (VARCHAR,
   *          up to 255 characters).
   * @since   0.1.0
   * @version 1
   * @throws {Error} if the specified size is greater than 255.
   */
  string: ({ size = 255 }: { size?: number } = {}) => defineColumn({
    type: 'VARCHAR',
    schema: std.string({ max: u.lte(size, 255) }),
    size,
  }),
  /**
   * @public  Defines a column type that accepts large strings (TEXT).
   * @since   0.1.0
   * @version 1
   */
  text: () => defineColumn({
    type: 'TEXT',
    schema: std.string(),
  }),
};

/**
 * @private  Creates the `as` function for aliasing a table.
 * @since   0.1.0
 * @version 1
 */
const aliasedTableFn = <T extends Table>(table: T) => <S extends string>(alias: S) => {
  const columns = Object.fromEntries(
    Object
      .entries(table.columns)
      .map(([cname, col]) => [cname, { ...col, table: alias }]),
  );

  return { [TABLE_NAME]: table.name, [TABLE_ALIAS]: alias, ...columns } as Aliased<S, T>;
};

/**
 * @public  Defines a new table.
 * @since   0.1.0
 * @version 1
 */
const defineTable = <
  S extends string,
  T extends Record<string, ColumnPropsBuilder>
>(tname: S, shapeFn: (t: typeof types) => T) => {
  const columns = Object.fromEntries(
    Object
      .entries(shapeFn(types))
      .map(([cname, { props }]) => [cname, { ...props, name: cname, table: tname }] as const),
  );

  const table = { name: tname, columns } as Table<S, {
    [K in keyof T & string]: T[K]['props'];
  }>;

  return { ...table, as: aliasedTableFn(table) } as Aliasable<Inferrable<typeof table>>;
};

// // // // // // // // // // // // // // // // // // // // // // // //
//                         EXPRESSION TYPES                          //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public Represents an equality expression.
 * @since   0.1.0
 * @version 1
 */
type ExprEq = { lhs: Expr, op: '=', rhs: Expr };

/**
 * @public Represents a not-equal expression.
 * @since   0.1.0
 * @version 1
 */
type ExprNe = { lhs: Expr, op: '!=', rhs: Expr };

/**
 * @public  Represents a less-than expression.
 * @since   0.1.0
 * @version 1
 */
type ExprLt = { lhs: Expr, op: '<', rhs: Expr };

/**
 * @public  Represents a less-than-or-equal expression.
 * @since   0.1.0
 * @version 1
 */
type ExprLte = { lhs: Expr, op: '<=', rhs: Expr };

/**
 * @public  Represents a greater-than expression.
 * @since   0.1.0
 * @version 1
 */
type ExprGt = { lhs: Expr, op: '>', rhs: Expr };

/**
 * @public  Represents a greater-than-or-equal expression.
 * @since   0.1.0
 * @version 1
 */
type ExprGte = { lhs: Expr, op: '>=', rhs: Expr };

/**
 * @public  Represents a LIKE expression.
 * @since   0.1.0
 * @version 1
 */
type ExprLike = { lhs: Expr, op: 'LIKE', rhs: string };

/**
 * @public  Represents a NOT LIKE expression.
 * @since   0.1.0
 * @version 1
 */
type ExprNotLike = { lhs: Expr, op: 'NOT LIKE', rhs: string };

/**
 * @public  Represents an IN expression.
 * @since   0.1.0
 * @version 1
 */
type ExprIn = { lhs: Expr, op: 'IN', rhs: Exclude<Expr, ExprLiteral> | ExprLiteral[] };

/**
 * @public  Represents a NOT IN expression.
 * @since   0.1.0
 * @version 1
 */
type ExprNotIn = { lhs: Expr, op: 'NOT IN', rhs: Exclude<Expr, ExprLiteral> | ExprLiteral[] };

/**
 * @public  Represents an AND expression.
 * @since   0.1.0
 * @version 1
 */
type ExprAnd = { and: Expr[] };

/**
 * @public  Represents an OR expression.
 * @since   0.1.0
 * @version 1
 */
type ExprOr = { or: Expr[] };

/**
 * @public  Represents a NOT expression.
 * @since   0.1.0
 * @version 1
 */
type ExprNot = { not: Expr };

/**
 * @public  Represents an IS expression.
 * @since   0.1.0
 * @version 1
 */
type ExprIs = { lhs: Expr, op: 'IS', rhs: true | false | null };

/**
 * @public  Represents an IS NOT expression.
 * @since   0.1.0
 * @version 1
 */
type ExprIsNot = { lhs: Expr, op: 'IS NOT', rhs: true | false | null };

/**
 * @private Represents a literal value in a query expression.
 * @since   0.1.0
 * @version 1
 */
type ExprLiteral =
  boolean
  | Date
  | number
  | string
  | null;

/**
 * @private Represents any binary expressions.
 * @since   0.1.0
 * @version 1
 */
type ExprBinaryOp =
  ExprEq
  | ExprNe
  | ExprLt
  | ExprLte
  | ExprGt
  | ExprGte
  | ExprLike
  | ExprNotLike
  | ExprIn
  | ExprNotIn
  | ExprIs
  | ExprIsNot;

/**
 * @private Represents any supported expressions.
 * @since   0.1.0
 * @version 1
 */
type Expr =
  Column
  | ExprEq
  | ExprNe
  | ExprLt
  | ExprLte
  | ExprGt
  | ExprGte
  | ExprLike
  | ExprNotLike
  | ExprIn
  | ExprNotIn
  | ExprIs
  | ExprIsNot
  | ExprAnd
  | ExprOr
  | ExprNot
  | ExprLiteral;

/**
 * @public  Expression builders.
 * @since   0.1.0
 * @version 1
 */
const expr = {
  // // // // // // // // // // // // // // // // // // // // // // //
  //                     BINARY OP EXPRESSIONS                      //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public  Builds an equality expression.
   * @since   0.1.0
   * @version 1
   */
  eq: <L extends Expr, R extends Expr>(lhs: L, rhs: R): ExprEq => ({ lhs, op: '=', rhs }),
  /**
   * @public Builds a not-equal expression.
   * @since   0.1.0
   * @version 1
   */
  ne: <L extends Expr, R extends Expr>(lhs: L, rhs: R): ExprNe => ({ lhs, op: '!=', rhs }),
  /**
   * @public Builds a less-than expression.
   * @since   0.1.0
   * @version 1
   */
  lt: <L extends Expr, R extends Expr>(lhs: L, rhs: R): ExprLt => ({ lhs, op: '<', rhs }),
  /**
   * @public Builds a less-than-or-equal expression.
   * @since   0.1.0
   * @version 1
   */
  lte: <L extends Expr, R extends Expr>(lhs: L, rhs: R): ExprLte => ({ lhs, op: '<=', rhs }),
  /**
   * @public Builds a greater-than expression.
   * @since   0.1.0
   * @version 1
   */
  gt: <L extends Expr, R extends Expr>(lhs: L, rhs: R): ExprGt => ({ lhs, op: '>', rhs }),
  /**
   * @public Builds a greater-than-or-equal expression.
   * @since   0.1.0
   * @version 1
   */
  gte: <L extends Expr, R extends Expr>(lhs: L, rhs: R): ExprGte => ({ lhs, op: '>=', rhs }),
  /**
   * @public Builds a LIKE expression.
   * @since   0.1.0
   * @version 1
   */
  like: <L extends Expr>(lhs: L, rhs: string): ExprLike => ({ lhs, op: 'LIKE', rhs }),
  /**
   * @public Builds a NOT LIKE expression.
   * @since   0.1.0
   * @version 1
   */
  notLike: <L extends Expr>(lhs: L, rhs: string): ExprNotLike => ({ lhs, op: 'NOT LIKE', rhs }),
  /**
   * @public Builds an IN expression.
   * @since   0.1.0
   * @version 1
   */
  in: <L extends Expr, R extends Exclude<Expr, ExprLiteral> | ExprLiteral[]>(lhs: L, rhs: R): ExprIn => ({ lhs, op: 'IN', rhs }),
  /**
   * @public Builds a NOT IN expression.
   * @since   0.1.0
   * @version 1
   */
  notIn: <L extends Expr, R extends Exclude<Expr, ExprLiteral> | ExprLiteral[]>(lhs: L, rhs: R): ExprNotIn => ({ lhs, op: 'NOT IN', rhs }),
  /**
   * @public Builds an IS expression.
   * @since   0.1.0
   * @version 1
   */
  is: (lhs: Expr, rhs: true | false | null): ExprIs => ({ lhs, op: 'IS', rhs }),
  /**
   * @public Builds an IS NOT expression.
   * @since   0.1.0
   * @version 1
   */
  isNot: (lhs: Expr, rhs: true | false | null): ExprIsNot => ({ lhs, op: 'IS NOT', rhs }),
  // // // // // // // // // // // // // // // // // // // // // // //
  //                     BOOLEAN OP EXPRESSIONS                     //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public Builds an AND expression.
   * @since   0.1.0
   * @version 1
   */
  and: <E extends Expr>(exprs: E[]): ExprAnd => ({ and: exprs }),
  /**
   * @public Builds an OR expression.
   * @since   0.1.0
   * @version 1
   */
  or: <E extends Expr>(exprs: E[]): ExprOr => ({ or: exprs }),
  /**
   * @public Builds a NOT expression.
   * @since   0.1.0
   * @version 1
   */
  not: <E extends Expr>(expr: E): ExprNot => ({ not: expr }),
  // // // // // // // // // // // // // // // // // // // // // // //
  //                         SEMANTICS ONLY                         //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public  Builds an ascending order expression.
   * @since   0.1.13
   * @version 1
   */
  asc: (expr: Expr) => [expr, 'ASC'] as const,
  /**
   * @public  Builds a descending order expression.
   * @since   0.1.13
   * @version 1
   */
  desc: (expr: Expr) => [expr, 'DESC'] as const,
};

/**
 * @public  Expression type guards.
 * @since   0.1.0
 * @version 1
 */
const is = {
  // // // // // // // // // // // // // // // // // // // // // // //
  //                     BINARY OP EXPRESSIONS                      //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public  Checks whether the given value is a binary op expression.
   * @since   0.1.0
   * @version 1
   */
  binaryOp: (expr: Expr): expr is ExprBinaryOp => u.isPlainObject(expr) && 'op' in expr && 'lhs' in expr && 'rhs' in expr,
  /**
   * @public  Checks whether the given value is an equality expression.
   * @since   0.1.0
   * @version 1
   */
  eq: (expr: Expr): expr is ExprEq => u.isPlainObject(expr) && 'op' in expr && expr.op === '=',
  /**
   * @public  Checks whether the given value is a not-equal expression.
   * @since   0.1.0
   * @version 1
   */
  ne: (expr: Expr): expr is ExprNe => u.isPlainObject(expr) && 'op' in expr && expr.op === '!=',
  /**
   * @public  Checks whether the given value is a less-than expression.
   * @since   0.1.0
   * @version 1
   */
  lt: (expr: Expr): expr is ExprLt => u.isPlainObject(expr) && 'op' in expr && expr.op === '<',
  /**
   * @public  Checks whether the given value is a less-than-or-equal expression.
   * @since   0.1.0
   * @version 1
   */
  lte: (expr: Expr): expr is ExprLte => u.isPlainObject(expr) && 'op' in expr && expr.op === '<=',
  /**
   * @public  Checks whether the given value is a greater-than expression.
   * @since   0.1.0
   * @version 1
   */
  gt: (expr: Expr): expr is ExprGt => u.isPlainObject(expr) && 'op' in expr && expr.op === '>',
  /**
   * @public  Checks whether the given value is a greater-than-or-equal expression.
   * @since   0.1.0
   * @version 1
   */
  gte: (expr: Expr): expr is ExprGte => u.isPlainObject(expr) && 'op' in expr && expr.op === '>=',
  /**
   * @public  Checks whether the given value is a LIKE expression.
   * @since   0.1.0
   * @version 1
   */
  like: (expr: Expr): expr is ExprLike => u.isPlainObject(expr) && 'op' in expr && expr.op === 'LIKE',
  /**
   * @public  Checks whether the given value is a NOT LIKE expression.
   * @since   0.1.0
   * @version 1
   */
  notLike: (expr: Expr): expr is ExprNotLike => u.isPlainObject(expr) && 'op' in expr && expr.op === 'NOT LIKE',
  /**
   * @public  Checks whether the given value is an IN expression.
   * @since   0.1.0
   * @version 1
   */
  in: (expr: Expr): expr is ExprIn => u.isPlainObject(expr) && 'op' in expr && expr.op === 'IN',
  /**
   * @public  Checks whether the given value is a NOT IN expression.
   * @since   0.1.0
   * @version 1
   */
  notIn: (expr: Expr): expr is ExprNotIn => u.isPlainObject(expr) && 'op' in expr && expr.op === 'NOT IN',
  /**
   * @public  Checks whether the given value is an IS expression.
   * @since   0.1.0
   * @version 1
   */
  is: (expr: Expr): expr is ExprIs => u.isPlainObject(expr) && 'is' in expr,
  // // // // // // // // // // // // // // // // // // // // // // //
  //                     BOOLEAN OP EXPRESSIONS                     //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public  Checks whether the given value is an AND expression.
   * @since   0.1.0
   * @version 1
   */
  and: (expr: Expr): expr is ExprAnd => u.isPlainObject(expr) && 'and' in expr,
  /**
   * @public  Checks whether the given value is an OR expression.
   * @since   0.1.0
   * @version 1
   */
  or: (expr: Expr): expr is ExprOr => u.isPlainObject(expr) && 'or' in expr,
  /**
   * @public  Checks whether the given value is a NOT expression.
   * @since   0.1.0
   * @version 1
   */
  not: (expr: Expr): expr is ExprNot => u.isPlainObject(expr) && 'not' in expr,
  // // // // // // // // // // // // // // // // // // // // // // //
  //                            LITERALS                            //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public  Checks whether the given value is a boolean literal.
   * @since   0.1.0
   * @version 1
   */
  boolean: (value: Expr): value is boolean => typeof value === 'boolean',
  /**
   * @public  Checks whether the given value is a date literal.
   * @since   0.1.0
   * @version 1
   */
  date: (value: Expr): value is Date => value instanceof Date,
  /**
   * @public  Checks whether the given value is a null literal.
   * @since   0.1.0
   * @version 1
   */
  null: (expr: Expr): expr is null => expr === null,
  /**
   * @public  Checks whether the given value is a number literal.
   * @since   0.1.0
   * @version 1
   */
  number: (expr: Expr): expr is number => typeof expr === 'number',
  /**
   * @public  Checks whether the given value is a string literal.
   * @since   0.1.0
   * @version 1
   */
  string: (expr: Expr): expr is string => typeof expr === 'string',
  // // // // // // // // // // // // // // // // // // // // // // //
  //                             OTHERS                             //
  // // // // // // // // // // // // // // // // // // // // // // //
  /**
   * @public  Checks whether the given value is a literal expression.
   * @since   0.1.0
   * @version 1
   */
  literal: (expr: Expr): expr is ExprLiteral => expr === null || expr instanceof Date || ['boolean', 'number', 'string'].includes(typeof expr),
  /**
   * @public  Checks whether the given value is a column expression.
   * @since   0.1.0
   * @version 1
   */
  column: (expr: Expr): expr is Column => u.isPlainObject(expr) && 'type' in expr && 'schema' in expr,
};

// // // // // // // // // // // // // // // // // // // // // // // //
//                              LOGGER                               //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  Query logger interface.
 * @since   0.1.0
 * @version 2
 */
interface ILogger {
  /**
   * @public  Logs a query that has executed successfully.
   * @since   0.1.17
   * @version 1
   */
  debug(sql: string, params: any[]): void;
  /**
   * @public  Logs a query that has failed with an error.
   * @since   0.1.12
   * @version 2
   */
  error(sql: string, params: any[], error?: Error): void;
}

// // // // // // // // // // // // // // // // // // // // // // // //
//                         DATABASE ADAPTER                          //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  Represents the direction of ordering in an ORDER BY
 *          clause.
 * @since   0.1.0
 * @version 1
 */
type OrderDirection = 'ASC' | 'DESC';

/**
 * @public  Represents a create table statement.
 * @since   0.1.0
 * @version 1
 */
type CreateTableStatement = {
  /**
   * @public  The name of the table to create.
   * @since   0.1.0
   * @version 1
   */
  table: string;
  /**
   * @public  The columns of the table.
   * @since   0.1.0
   * @version 1
   */
  columns: Column[];
  /**
   * @public  Whether to include an IF NOT EXISTS clause in the
   *          create table statement.
   * @since   0.1.0
   * @version 1
   */
  ifNotExists?: true;
  /**
   * @public  Whether to create the table as unlogged (won't produce
   *          WAL entries).
   * @since   0.1.0
   * @version 1
   */
  unlogged?: true;
};

/**
 * @public  Represents an insert statement.
 * @since   0.1.0
 * @version 1
 */
type InsertStatement = {
  /**
   * @public  The table to insert to.
   * @since   0.1.0
   * @version 1
   */
  table: string;
  /**
   * @public  The records to insert.
   * @since   0.1.0
   * @version 1
   */
  records: Record<string, any>[];
  /**
   * @public  The shape of the records being inserted.
   * @since   0.1.0
   * @version 1
   */
  insertShape: Record<string, Column>;
  /**
   * @public  The shape of the returned rows.
   * @since   0.1.0
   * @version 1
   */
  returnShape: Record<string, Column>;
};

/**
 * @public  Represents a select statement.
 * @since   0.1.0
 * @version 1
 */
type SelectStatement = {
  /**
   * @public  A map of table aliases to their actual name.
   * @since   0.1.0
   * @version 1
   */
  registry: Record<string, string>,
  /**
   * @public  The query's selection.
   * @since   0.1.0
   * @version 1
   */
  select: Record<string, Column>;
  /**
   * @public  The alias of the table from which to select.
   * @since   0.1.0
   * @version 1
   */
  from: string;
  /**
   * @public  The query's join clauses.
   * @since   0.1.9
   * @version 1
   */
  joins?: Join[];
  /**
   * @public  The query's where clause.
   * @since   0.1.0
   * @version 1
   */
  where?: Expr;
  /**
   * @public  The query's order by clause.
   * @since   0.1.0
   * @version 1
   */
  orderBy?: (readonly [Expr, OrderDirection])[];
  /**
   * @public  The maximum number of rows to return.
   * @since   0.1.0
   * @version 1
   */
  limit?: number;
  /**
   * @public  The number of rows to skip before starting to return
   *          rows.
   * @since   0.1.0
   * @version 1
   */
  offset?: number;
};

/**
 * @private A codec for encoding data to the database's expected type,
 *          and decoding data from the database to the application's
 *          expected type.
 * @since   0.1.0
 * @version 1
 */
type Codec<Decoded = any, Encoded = any> = {
  /**
   * @private Encodes a value fomr the application's type into the
   *          database's expected type.
   * @since   0.1.0
   * @version 1
   */
  encode: (value: Decoded) => Encoded;
  /**
   * @private Decodes a value from the database's type into the
   *          application's expected type.
   * @since   0.1.0
   * @version 1
   */
  decode: (value: Encoded) => Decoded;
};

/**
 * @public  A registry of {@link Codec} for all supported primitive
 *          types.
 * @since   0.1.0
 * @version 1
 */
type CodecsRegistry = {
  [K in Primitive]: Codec<any, any>;
  // ↑ exaustive mapping to prove that all primitives are covered
};

/**
 * @public  A mapping of qx's primitive types to their native database
 *          types.
 */
type PrimitiveToNativeTypeFactory = {
  [K in Primitive]: (col: Column) => string;
  // ↑ exaustive mapping to prove that all primitives are covered
};

/**
 * @public  Represents the result of a statement rendered into DDL.
 * @since   0.1.0
 * @version 1
 */
type DDL = { sql: string, params: any[] };

/**
 * @public  The interface that all database adapters must implement.
 * @since   0.1.0
 * @version 1
 */
interface IDatabase {
  /**
   * @public  Attaches a query logger to the database adapter.
   * @since   0.1.0
   * @version 1
   */
  attachLogger(logger: ILogger): this;
  /**
   * @public  Executes a create table statement.
   * @since   0.1.0
   * @version 1
   */
  createTable(op: CreateTableStatement): Promise<void>;
  /**
   * @public  Executes an insert statement, returning the newly
   *          inserted rows.
   * @since   0.1.0
   * @version 1
   */
  insert(op: InsertStatement): Promise<any>;
  /**
   * @public  Executes a select statement returning all matching rows.
   * @since   0.1.0
   * @version 1
   */
  query(op: SelectStatement): Promise<any[]>;
  /**
   * @public  Executes a function within a transaction.
   * @since   0.1.10
   * @version 1
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
};

// // // // // // // // // // // // // // // // // // // // // // // //
//                            TRANSACTION                            //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  Executes the given function within a transaction.
 * @since   0.1.10
 * @version 1
 */
const transaction = async <T>(db: IDatabase, fn: () => Promise<T>): Promise<T> => db.transaction(fn)

// // // // // // // // // // // // // // // // // // // // // // // //
//                         INSERT STATEMENT                          //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @private Resolves the value of a column before insertion. This is
 *          where default values are applied if the column is either
 *          missing or nullish.
 * @since   0.1.0
 * @version 1
 */
const resolveInsertValue = (column: Column, row: Record<string, any>) => {
  if (column.default) return row[column.name] ?? u.resolve(column.default);
  // ↓ it's ok to omit nullable columns, let's make it null if undefined
  if (column.nullable) return row[column.name] ?? null;

  return row[column.name];
};

/**
 * @private Prepares a row for insertion. Only known fields are kept,
 *          additional fields get disposed of.
 * @since   0.1.0
 * @version 1
 */
const prepareForInsert = (shape: Record<string, Column>) => (row: Record<string, any>) => Object.fromEntries(
  Object
    .entries(shape)
    .map(([key, column]) => [key, resolveInsertValue(column, row)] as const),
);

/**
 * @private Takes from the given table only the columns that can be
 *          present on insertion. It excludes, for example,
 *          autoincrement columns.
 * @since   0.1.0
 * @version 1
 */
const getInsertShape = (table: Table) => Object.fromEntries(
  Object
    .entries(table.columns)
    .filter(([_, col]) => !col.autoincrement),
);

/**
 * @private Builds the standard schema to be used to parse / validate
 *          rows before insertion.
 * @since   0.1.0
 * @version 1
 */
const buildInsertSchema = <T extends Record<string, Column>>(shape: T) => std.strictObject(
  u.mapValues(shape, (column) => column.schema),
);

/**
 * @public  Insert statement builder.
 * @since   0.1.0
 * @version 1
 */
class InsertBuilder<T extends Table> {
  constructor(private readonly table: T,
              private rows: InferForInsert<T>[] = []) { }
  /**
   * @public  Adds one or more rows to be inserted.
   * @since   0.1.0
   * @version 2
   */
  values(rows: InferForInsert<T> | InferForInsert<T>[]) {
    this.rows.push(...(u.wrap(rows)));

    return this;
  }
  /**
   * @public  Executes the insert statement onto the given database.
   * @since   0.1.0
   * @version 1
   */
  async insert(db: IDatabase) {
    if (this.rows.length === 0) return [];

    const insertShape = getInsertShape(this.table);
    const schema = std.array(buildInsertSchema(insertShape));

    const result = std.parse(schema, this.rows.map(prepareForInsert(insertShape)));
    if (result.issues) throw new Error('Failed validation: ' + JSON.stringify(result.issues, null, 2));

    const rows = await db.insert({
      table: this.table.name,
      records: result.value,
      insertShape,
      returnShape: this.table.columns,
    });

    return rows as Expand<Infer<T>>[];
  };
}

/**
 * @public  Starts an insert statement for the given table.
 * @since   0.1.0
 * @version 1
 */
const into = <T extends Table>(table: T) => new InsertBuilder(table);

// // // // // // // // // // // // // // // // // // // // // // // //
//                         SELECT STATEMENT                          //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  Represents a join clause in a select statement.
 * @since   0.1.9
 * @version 1
 */
type Join = {
  type: 'INNER JOIN' | 'LEFT OUTER JOIN' | 'RIGHT OUTER JOIN';
  table: string;
  alias: string;
  on: Expr;
};

/**
 * @private It's the object type for a query being built, that will
 *          later been transformed into a {@link SelectStatement}.
 * @since   0.1.0
 * @version 1
 */
type Query<
  T extends Record<string, Aliased<string, Table>> = Record<string, Aliased<string, Table>>,
  S extends Record<string, Column> = Record<string, Column>
> = {
  /**
   * @private A registry of all aliased tables in the query.
   * @since   0.1.0
   * @version 1
   */
  registry: T;
  /**
   * @private The query's selection.
   * @since   0.1.0
   * @version 1
   */
  select: S;
  /**
   * @private The alias of the table from which to select.
   * @since   0.1.0
   * @version 1
   */
  from: string;
  /**
   * @private The query's join clauses.
   * @since   0.1.9
   * @version 1
   */
  joins?: Join[];
  /**
   * @private The query's where clause.
   * @since   0.1.0
   * @version 1
   */
  where?: Expr;
  /**
   * @private The query's order by clause.
   * @since   0.1.0
   * @version 1
   */
  orderBy?: (readonly [Expr, OrderDirection])[];
  /**
   * @private The query's limit.
   * @since   0.1.0
   * @version 1
   */
  limit?: number;
  /**
   * @private The query's offset.
   * @since   0.1.0
   * @version 1
   */
  offset?: number;
};

/**
 * @private Infers the selection output type of given query.
 * @since   0.1.0
 * @version 2
 */
type InferSelection<T extends Query> = {
  [K in keyof T['select'] & string]: T['select'][K]['inferOutput'];
};

/**
 * @private Transforms a {@link Query} into a {@link SelectStatement}.
 * @since   0.1.0
 * @version 1
 */
const toSelectStatement = <T extends Query>(query: T): SelectStatement => ({
  ...query,
  registry: u.mapValues(query.registry, table => table[TABLE_NAME]),
});

/**
 * @public  Select statement builder with a fluent API.
 *
 *          We only need to keep track of two types in here:
 *          - the registry of aliased tables, so they can be
 *            referenced in expressions and selection; and
 *          - the selected columns, so we can infer the returning
 *            type of the query.
 * @since   0.1.0
 * @version 1
 */
class QueryBuilder<
  T extends Record<string, Aliased<string, Table>>,
  S extends Record<string, Column>
> {
  constructor(public readonly query: Query<T, S>) { }
  /**
   * @public  Executes the select statement against the given database,
   *          returning all matching rows.
   * @since   0.1.0
   * @version 1
   */
  async all(db: IDatabase) {
    // @TODO calls query engine with the query object
    return db.query(toSelectStatement(this.query)) as Promise<Expand<InferSelection<Query<T, S>>>[]>;
  }
  /**
   * @public  Checks whether any rows exist matching the query.
   * @since   0.1.6
   * @version 1
   */
  async exists(db: IDatabase) {
    // @TODO optimize this, maybe do a SELECT 1 or something
    const results = await db.query(toSelectStatement({ ...this.query, limit: 1, offset: 0 }));

    return results.length > 0;
  }
  /**
   * @public  Adds an INNER JOIN clause to the query.
   * @since   0.1.9
   * @version 1
   */
  innerJoin<U extends Aliased<string, Table>>(table: U, on: (registry: Expand<T & { [K in U[typeof TABLE_ALIAS]]: U }>) => Expr) {
    const registry = { ...this.query.registry, [table[TABLE_ALIAS]]: table } as Expand<T & { [K in U[typeof TABLE_ALIAS]]: U }>;
    const join: Join = { type: 'INNER JOIN', table: table[TABLE_NAME], alias: table[TABLE_ALIAS], on: on(registry) };

    return new QueryBuilder<typeof registry, S>({
      ...this.query,
      registry,
      joins: [...(this.query.joins ?? []), join],
    });
  }
  /**
   * @public  Sets a limit on the number of rows to be returned.
   * @since   0.1.0
   * @version 1
   */
  limit(n: number) {
    return new QueryBuilder<T, S>({ ...this.query, limit: n });
  }
  /**
   * @public  Sets an offset for the rows to be returned.
   * @since   0.1.0
   * @version 1
   */
  offset(n: number) {
    return new QueryBuilder<T, S>({ ...this.query, offset: n });
  }
  /**
   * @public  Executes the select statement against the given database,
   *          returning the first matching row.
   * @since   0.1.0
   * @version 1
   */
  async one(db: IDatabase) {
    // @TODO calls query engine with the query object
    const op = toSelectStatement({ ...this.query, limit: 1, offset: 0 });

    const rows = await db.query(op);
    if (rows.length === 0) return null;

    return rows[0] as Expand<InferSelection<Query<T, S>>> | null;
  }
  /**
   * @public  Defines the order by clause of the query.
   * @since   0.1.0
   * @version 1
   */
  orderBy(fn: (registry: T) => (readonly [Expr, OrderDirection])[]) {
    return new QueryBuilder<T, S>({ ...this.query, orderBy: fn(this.query.registry) });
  }
  /**
   * @public  Defines the selection of the query.
   * @since   0.1.0
   * @version 1
   */
  select<U extends Record<string, Column>>(fn: (r: T) => U) {
    return new QueryBuilder<T, U>({ ...this.query, select: fn(this.query.registry) });
  }
  /**
   * @public  Defines the where clause of the query. If there's already
   *          a WHERE clause in the query, the new clause will be
   *          ANDed to the existing one.
   * @since   0.1.0
   * @version 1
   */
  where<E extends Expr>(fn: (tables: T) => E) {
    const value = fn(this.query.registry);

    const where =
      this.query.where === undefined ? value
    : is.and(this.query.where) ? expr.and([...this.query.where.and, value])
    : expr.and([this.query.where, value]);

    return new QueryBuilder<T, S>({ ...this.query, where });
  }
}

/**
 * @public  Starts a select statement from the given table.
 * @since   0.1.0
 * @version 1
 */
const from = <S extends string, T extends Aliased<S, Table>>(table: T) => new QueryBuilder({
  registry: ({ [table[TABLE_ALIAS]]: table } as { [K in T[typeof TABLE_ALIAS]]: T }),
  from: table[TABLE_ALIAS],
  select: { ...table },
});

// // // // // // // // // // // // // // // // // // // // // // // //
//                              EXPORTS                              //
// // // // // // // // // // // // // // // // // // // // // // // //

export {
  type CodecsRegistry,
  type Column,
  type CreateTableStatement,
  type DDL,
  type Expr,
  type ExprAnd,
  type ExprBinaryOp,
  type ExprEq,
  type ExprGt,
  type ExprGte,
  type ExprIn,
  type ExprIs,
  type ExprIsNot,
  type ExprLike,
  type ExprLiteral,
  type ExprLt,
  type ExprLte,
  type ExprNe,
  type ExprNot,
  type ExprNotIn,
  type ExprNotLike,
  type ExprOr,
  type IDatabase,
  type ILogger,
  type Join,
  type InsertStatement,
  type OrderDirection,
  type Primitive,
  type PrimitiveToNativeTypeFactory,
  type SelectStatement,
  type Table,
  defineColumn as column,
  defineTable as table,
  expr,
  from,
  into,
  is,
  transaction,
  types as t,
};
