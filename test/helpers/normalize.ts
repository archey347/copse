const SHA_RE = /\b[0-9a-f]{7,40}\b/g;

/**
 * Replace temp-root paths before hashes: a temp dir's random suffix can itself look like a
 * short hex sha, so it must become `<tmp>` first or the sha pass would eat part of it.
 */
export function normalize(text: string, tempRoots: string | string[]): string {
  let result = Bun.stripANSI(text);

  const roots = Array.isArray(tempRoots) ? tempRoots : [tempRoots];
  for (const root of roots) {
    result = result.split(root).join("<tmp>");
  }

  return result.replace(SHA_RE, "<sha>");
}
