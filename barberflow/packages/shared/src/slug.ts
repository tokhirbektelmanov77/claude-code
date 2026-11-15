const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** "Азиз Каримов" -> "aziz-karimov", "Barber Shop #1" -> "barber-shop-1". */
export function slugify(input: string): string {
  const latin = input
    .toLowerCase()
    .split('')
    .map((c) => (c in CYR ? CYR[c] : c))
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʻʼ']/g, '');
  return latin.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'barber';
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Slugs that would collide with app routes or look official. */
export const RESERVED_SLUGS = new Set([
  'admin', 'platform-admin', 'api', 'app', 'login', 'logout', 'me', 'onboarding', 'tg', 'help', 'support',
  'barberflow', 'settings', 'static', 'public', 'www',
]);
