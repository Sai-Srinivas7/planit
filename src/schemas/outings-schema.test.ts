import { describe, expect, test } from 'vitest'
import { ROLES } from '../constants'
import { schemas } from '../schemas'

describe('outings schema', () => {
  test('BASE-02: registered outings schema denies client create, update, and delete for every role', () => {
    const outings = schemas.find((s) => s.name === 'outings')
    expect(outings, 'outings schema is registered in src/schemas.ts').toBeDefined()

    // Every app role is listed explicitly, so none falls through to a default.
    expect(Object.keys(outings!.permissions)).toEqual(expect.arrayContaining(Object.values(ROLES)))

    // Every entry, including any `*` catch-all, refuses all client writes.
    for (const [role, perms] of Object.entries(outings!.permissions)) {
      expect({ role, create: perms.create, update: perms.update, delete: perms.delete }).toEqual({
        role,
        create: false,
        update: false,
        delete: false,
      })
    }
  })
})
