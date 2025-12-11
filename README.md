# qx (provisory name)

A teeny tiny ORM for TypeScript and JavaScript inspired by Elixir's
[Ecto](https://hexdocs.pm/ecto).

Built for you who wants a simple, small ORM that just works.

```ts
import * as sqlite from '@rwillians/qx/bun-sqlite';
import { create, from, into, table } from '@rwillians/qx';

const users = table('users', t => ({
  id: t.integer({ primaryKey: true, autogenerate: true }),
  name: t.string(),
  email: t.string(),
  createdAt: t.timestamp({ autogenerate: true }),
}));

// ...

const db = sqlite.connect('./db.sqlite');

await create.table(users).onto(db);

// ...

const rows = await into(users)
  .insert({ name: 'John Doe', email: 'john.doe@gmail.com' })
  .insert([ userA, userB, userC ])
  .run(db);

// ...

const user = await from(users.as('u'))
  .where(({ u }) => e.eq(u.id, 1))
  .one(conn);

if (!user) {
  throw new Error('User not found');
}

console.log(user);
```

- See [roadmap to v1.0.0](https://github.com/users/rwillians/projects/1/views/1).
- See more [examples](#examples).


# Vision

Here's the basics of what I need from an ORM, thus it's my priority to
build it first:

- [ ] Defining model fields should be very similar to defining a
      schema with [Zod](https://zod.dev) (with support for validation
      refiements and transformations).
- [ ] The model should have a schema compatible with
      [standard schema](https://github.com/standard-schema/standard-schema),
      meaning it should be interoperable with [Zod](https://zod.dev),
      [ArkType](https://arktype.io), [Joi](https://joi.dev), etc.
- [ ] It should have a SQL-Like, type-safe, fluent query builder api
      that works even for NoSQL databases¹, allowing us to write
      queries once then use them with any supported database.
- [ ] The query builder should output a plain map representation of
      the query that can be encoded to JSON, mostly for three reasons:
    1. It's easy to test;
    2. Makes it easier to debug queries; and
    3. Makes `qx` more modular, allowing the community to build
       their own extensions.
- [ ] The query results should be type-safe.

_¹ Some database adapters might not support all query features, that's
   expected._

Once this vision is fullfilled, `qx` will become `v1.0.0`.

> [!NOTE]
> Migrations are not part of the scope yet, sorry.
> I don't like the way migrations work in most ORMs, so I'll take my
> time to figure out what coulde be a better way to do it.


## Components

The vision above implies the existence of four main components to this
library:

1. A table factory that outputs a model with a [standard schema](https://github.com/standard-schema/standard-schema);
2. A query builder that outputs a plain map representation of the
   query;
3. A query engine that orchestrates the query execution using a
   database adapter; and
4. Database adapters that can execute queries for a specific database
   driver.


# Database Adapters

Database adapters are per driver implementation. Quex ships with a few
hand picked built-in database adapters:

- [ ] bun-sqlite3 (prioritary)
- [ ] bun-postgres
- [ ] mongodb

For community-built adapters, check GitHub's tag [#qx-adapter](https://github.com/topics/qx-adapter)
(you won't find anything there yet).


## Examples

Here are some examples that I'm using to guide the implementation.

**Define a table:**
```ts
// src/db/tables/backups.ts
import { z } from 'zod/v4';
import { type as arktype } from 'arktype';
import { defineColumn, create, table } from 'qx';

// custom types
const tc = {
  absolutePath: () => defineColumn({
    type: 'VARCHAR',
    schema: z
      .string()
      .refine(str => str.startsWith('/'), "must be an absolute path")
      .transform(str => str.endsWith('/') ? str.slice(0, -1) : str)
  }),
  bytes: () => defineColumn({
    type: 'INTEGER',
    schema: arktype('number.integer > 0'),
  }),
  email: () => defineColumn({
    type: 'VARCHAR',
    schema: z.string().email(),
  }),
};

export const backups = table('backups', t => ({
  id: t.integer().autoincrement().primaryKey(),
  parentId: t.integer().nullable(),
  state: t.enum(['succeeded', 'failed']).default('succeeded'),
  path: tc.absolutePath(),
  size: tc.bytes().nullable(),
  notifyableContacts: tc.email().array().default([]),
  //                            ↑ should be stored as VARCHAR[] in postgres
  //                              should be stored as json encoded TEXT in sqlite
  createdAt: t.datetime().default(() => new Date),
}));

export type Backup = typeof backups.infer;
export type BackupForInsert = typeof backups.inferForInsert;
export type BackupForUpdate = typeof backups.inferForUpdate;
```

**Create the table in the database:**
```ts
import * as sqlite from 'qx/bun-sqlite';

// ...

const db = sqlite.connect('./db.sqlite');

await create.table(backups).onto(db);
```

**Insert rows:**
```ts
import { into } from 'qx';
import * as sqlite from 'qx/bun-sqlite';

// ...

const db = sqlite.connect('./db.sqlite');

const rows = await into(backups)
  .insert({ state: 'succeeded', path: '/data/backup_1.tar.gz', size: 104857600 })
  .run(db);
```

**Query the table:**
```ts
import { expr, from } from 'qx';
import * as sqlite from 'qx/bun-sqlite';

const conn = sqlite.connect('./db.sqlite');

// ...

const yesterday = new Date(Date.now() - (24 * 60 * 60 * 1000));

const results = await from(backups.as('b1'))
  .leftJoin(backups.as('b2'), ({ b1, b2 }) => expr.eq(b2.id, b1.parentId))
  .where(({ b1, b2 }) => expr.and([
    expr.eq(b1.state, 'failed'),
    expr.gte(b1.failedAt, yesterday),
    expr.eq(b1.scheduledBy, 'johndoe@gmail.com'),
  ]))
  .orderBy(({ b1 }) => expr.desc(b1.scheduledAt))
  .limit(25)
  .offset(0)
  .select(({ b1, b2 }) => ({
    ...b1,
    parentPath: b2.path,
    totalSizeMiB: expr.div(expr.add(b1.size, expr.coalesce(b2.size, 0)), 1048576),
  }))
  .all(db);
```

No singleton magic here! Not on my watch. You need to explicitly pass
the db connection to the query.

The results would look like this:

```ts
[
  {
    id: 2,
    parentId: 1,
    state: 'failed',
    path: '/backups/20251130133100.tar.gz',
    size: 104857600,
    notifyableContacts: ['devops@ecma.com'],
    createdAt: new Date('2025-11-30T13:31:00.000Z'),
    parentPath: '/backups/20251030134200.tar.gz',
    totalSizeMiB: 42069,
  }
]
```
