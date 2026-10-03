/** Idiomas da interface. `auto` segue o idioma do editor (ou do navegador). */
export type Locale = 'pt-BR' | 'en';
export type Language = 'auto' | Locale;

export const LANGUAGES: Language[] = ['auto', 'pt-BR', 'en'];

/** O idioma que vale: o escolhido, ou, em `auto`, o do editor/navegador (inglês para qualquer `en*`; o resto fica em português). */
export function resolveLocale(language: Language, systemLanguage: string): Locale {
  if (language !== 'auto') return language;
  return /^en(-|_|$)/i.test(systemLanguage) ? 'en' : 'pt-BR';
}
