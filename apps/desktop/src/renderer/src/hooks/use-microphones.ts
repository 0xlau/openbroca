import { trpc } from '@renderer/trpc'

export function useMicrophones() {
  const query = trpc.audio.listDevices.useQuery()
  return {
    microphones: query.data ?? [],
    refresh: () => query.refetch(),
    isLoading: query.isLoading || query.isRefetching
  }
}
