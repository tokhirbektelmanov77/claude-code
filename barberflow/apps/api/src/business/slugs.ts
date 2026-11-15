import { randomBytes } from 'node:crypto';
import { RESERVED_SLUGS, slugify } from '@barberflow/shared';

/** Finds a free slug: "aziz", "aziz-2", ... then a random suffix. */
export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  let root = slugify(base);
  if (root.length < 3) root = `${root}-bf`.replace(/^-/, '');
  if (RESERVED_SLUGS.has(root)) root = `${root}-1`;
  if (!(await isTaken(root))) return root;
  for (let i = 2; i < 20; i++) {
    const s = `${root.slice(0, 36)}-${i}`;
    if (!(await isTaken(s))) return s;
  }
  return `${root.slice(0, 30)}-${randomBytes(3).toString('hex')}`;
}
