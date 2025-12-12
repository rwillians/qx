import { type IDatabase, create, expr, from, into, table } from './index';

const migrations = table('migrations', t => ({
  id: t.string({ size: 36 }).primaryKey(),
  migratedAt: t.datetime(),
}));

/**
 * @private Defines the type for a migration function.
 * @since   0.1.6
 * @version 1
 */
type Migration = (db: IDatabase) => Promise<void>;

/**
 * @public  Defines and runs migrations against the given database.
 * @since   0.1.6
 * @version 1
 */
export const defineMigrations = (migs: Record<string, Migration>) => async (db: IDatabase) => {
  await create.table(migrations, { ifNotExists: true }).onto(db);

  for (const [id, migration] of Object.entries(migs)) {
    const alreadyMigrated = await from(migrations.as('m'))
      .where(({ m }) => expr.eq(m.id, id))
      .exists(db);

    if (alreadyMigrated) continue;

    // @TODO run in a transaction
    await migration(db);

    await into(migrations)
      .insert({ id, migratedAt: new Date() })
      .run(db);
  }
};
