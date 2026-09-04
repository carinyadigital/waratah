/**
 * Merges files-channel updates so distinct paths commute and the same path
 * last-write-wins. Parallel subgraph writes therefore cannot clobber each other
 * unless they target one path.
 */
export function mergeFiles(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...left, ...right };
}
