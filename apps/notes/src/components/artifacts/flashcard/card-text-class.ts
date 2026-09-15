export function getCardTextClass(text: string): string {
  if (text.length <= 80) {
    return 'font-serif text-2xl lg:text-3xl leading-snug text-center text-balance';
  }
  if (text.length <= 200) {
    return 'font-serif text-xl lg:text-2xl leading-snug text-center text-balance';
  }
  return 'font-serif text-lg lg:text-xl leading-relaxed text-left';
}
