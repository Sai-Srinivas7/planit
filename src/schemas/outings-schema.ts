/**
 * Outings - Schema (spec §4.2)
 *
 * One record per outing; business state lives in `payload`. Members read via
 * `collaboratorsField`; no role writes from the client — every change goes
 * through POST /api/outing/:command and the serialized room.
 */

import type { CollectionSchema } from 'deepspace/schema'

const access = { read: 'collaborator', create: false, update: false, delete: false } as const

export const outingsSchema: CollectionSchema = {
  name: 'outings',
  columns: [
    { name: 'hostId', storage: 'text', interpretation: 'plain', userBound: true },
    { name: 'members', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'inviteToken', storage: 'text', interpretation: 'plain' },
    { name: 'payload', storage: 'text', interpretation: { kind: 'json' } },
  ],
  ownerField: 'hostId',
  collaboratorsField: 'members',
  permissions: { viewer: access, member: access, admin: access },
}
