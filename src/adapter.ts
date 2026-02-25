import { type ILogger } from './index';
import * as u from './utils';

/**
 * @public  Wraps a function call that executes DDL with logging
 *          capabilities.
 *
 *          A `debug` log is emitted before the function is executed,
 *          and an `error` log if the function throws an error. After
 *          logging, the error is re-thrown.
 * @since   0.1.17
 * @version 1
 */
export const withLoggedQuery = async <T>(
  logger: ILogger | ILogger[],
  data: { sql: string, params: any[] },
  fn: (sql: string, params: any[]) => Promise<T> | T,
): Promise<T> => {
  const loggers = u.wrap(logger);
  const { sql, params } = data;

  loggers.forEach(logger => logger.debug(sql, params));

  return Promise.resolve().then(() => fn(sql, params)).catch(error => {
    loggers.forEach(logger => logger.error(sql, params, error));

    return Promise.reject(error); // propagate the error without
                                  // appending stack traces
  });
};

export {
  type CodecsRegistry,
  type Column,
  type CreateTableStatement,
  type DDL,
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
} from './index';
