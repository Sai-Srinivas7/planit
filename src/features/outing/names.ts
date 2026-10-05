/** Display names come only from the user directory (spec §3, D-12). */

import { useCallback } from 'react'
import { useUserLookup } from 'deepspace'

export function useNames() {
  const { getName } = useUserLookup()
  return useCallback((userId: string) => getName(userId) || 'Unknown', [getName])
}
