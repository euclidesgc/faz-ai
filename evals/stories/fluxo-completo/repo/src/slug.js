// Transforma um título em slug: minúsculas, com hífen no lugar dos espaços.
export function slugify(text) {
  return text.toLowerCase().replace(/ /g, '-');
}
