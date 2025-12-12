import { inspect } from 'node:util';

import {
  type ILogger,
} from './index';

/**
 * @public  Creates a basic console logger that logs all queries.
 * @since   0.1.0
 * @version 1
 */
export const createConsoleLogger = (): ILogger => ({
  query: {
    debug: (sql: string, params: any[]) => { process.stdout.write(sql + ' ' + inspect(params, false, null, true) + '\n'); },
  },
});
