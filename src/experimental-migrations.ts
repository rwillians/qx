import {
  type IDatabase,
  type Table,
  expr,
  from,
  into,
  table,
  transaction,
} from './index';

// // // // // // // // // // // // // // // // // // // // // // // //
//                         CREATE STATEMENTS                         //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @public  Create statement builder.
 * @since   0.1.0
 * @version 1
 */
const create = {
  /**
   * @public  Prepares a create table statement.
   * @since   0.1.0
   * @version 1
   */
  table: <T extends Table, S extends { ifNotExists?: true; unlogged?: true }>(table: T, options: S = {} as S) => ({
    /**
     * @public  Executes the create table statement onto the given
     *          database.
     * @since   0.1.0
     * @version 1
     */
    onto: async (db: IDatabase) => db.createTable({
      ...options,
      table: table.name,
      columns: Object.values(table.columns),
    }),
  }),
};

// // // // // // // // // // // // // // // // // // // // // // // //
//                       MIGRATIONS MANAGEMENT                       //
// // // // // // // // // // // // // // // // // // // // // // // //

/**
 * @private Defines the schema migrations table.
 * @since   0.1.6
 * @version 1
 */
const migrations = table('schema_migrations', t => ({
  id: t.string({ size: 36 }).primaryKey(),
  timestamp: t.datetime(),
}));

/**
 * @private Defines the type for a migration function.
 * @since   0.1.6
 * @version 1
 */
type Migration = (db: IDatabase) => Promise<void>;

/**
 * @public  Defines a set of migrations to be executed against a
 *          database.
 * @since   0.1.6
 * @version 2
 */
export const defineMigrations = (migs: Record<string, Migration>) => async (db: IDatabase) => {
  await create.table(migrations, { ifNotExists: true }).onto(db);

  const { mostRecentId } = await from(migrations.as('m'))
    .orderBy(({ m }) => [expr.desc(m.timestamp)])
    .select(({ m }) => ({ mostRecentId: m.id }))
    .one(db) || { mostRecentId: '' };

  for (const [id, migrate] of Object.entries(migs)) {
    if (id <= mostRecentId) continue;

    await transaction(db, async () => {
      await migrate(db);
      await into(migrations).values({ id, timestamp: new Date() }).insert(db);
    });
  }
};
