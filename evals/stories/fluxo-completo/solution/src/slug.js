// Transforma um título em slug: minúsculas, sem acentos, só [a-z0-9-], com no máximo maxLength caracteres.
export function slugify(text, maxLength) {
  const slug = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') throw new Error('Texto vazio');
  if (maxLength === undefined) return slug;
  return slug.slice(0, maxLength).replace(/-+$/, '');
}
