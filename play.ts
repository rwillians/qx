import { create, expr, from, into, table } from './src/index';
import { createConsoleLogger } from './src/index';
import * as sqlite from './src/bun-sqlite';

const backups = table('backups', t => ({
  id: t.integer().autoincrement().primaryKey(),
  parentId: t.integer().nullable(),
  path: t.string({ size: 255 }),
  sizeBytes: t.integer(),
  createdAt: t.datetime().default(() => new Date()),
}));

type Backup = typeof backups.infer;
type BackupForInsert = typeof backups.inferForInsert;
type BackupForUpdate = typeof backups.inferForUpdate;

const _b1 = backups.as('b1');

const db = sqlite
  .connect('./qx.sqlite')
  .attachLogger(createConsoleLogger());

await create.table(backups, { ifNotExists: true }).onto(db);

const rows = await into(backups)
  .insert({ path: '/path/to/backup1', sizeBytes: 12345 })
  .insert([{ parentId: 1, path: '/path/to/backup2', sizeBytes: 12345 }, { path: '/path/to/backup3', sizeBytes: 12345 }])
  .run(db);
console.log('inserted rows:', rows);

const result = await from(backups.as('b1')).one(db);
console.log('query one:', result);

const results = await from(backups.as('b1'))
  .select(({ b1 }) => ({
    id: b1.id,
    previousBackupId: b1.parentId
  }))
  .limit(5)
  .offset(1)
  .all(db);
console.log('query all:', results);

const backup2 = await from(backups.as('b1'))
  .where(({ b1 }) => expr.eq(b1.id, 2))
  .one(db);
console.log('backup #2:', backup2);
