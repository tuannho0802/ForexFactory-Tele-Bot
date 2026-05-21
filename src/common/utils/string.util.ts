/**
 * Escape special characters for Telegram MarkdownV2 parse mode.
 * https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string | null | undefined): string {
  if (!text) return '';
  // Telegram requires escaping: _ * [ ] ( ) ~ > # + - = | { } . !
  // Note: the order in regex matters or we need to escape the escape char
  const specialChars = /([_*[\]()~>#+\-=|{}.!\\])/g;
  return String(text).replace(specialChars, '\\$1');
}
