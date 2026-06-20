# @rwillians/qx

A teeny tiny, type-safe and dependency-free ORM for TypeScript and
JavaScript.

Built for you who wants a simple, small ORM that just works.

## Examples

```ts
// src/db.ts
import { schema } from '@rwillians/qx';
import { t } from '@rwillians/qx/postgres';

export const tenents = schema('tenants', {
  id: t.uuid().primaryKey(),
  slug: t.string().min(4).max(36)
  name: t.string(),
});

export const users = schema('users', {
  id: t.uuid().primaryKey(),
  tenantId: t.uuid().nullable(),
  name: t.string().max(100),
  email: t.email().unique(),
  hashedPassword: t.string(),
  createdAt: t.timestamp(),
  updatedAt: t.timestamp(),
});
