/**
 * Escape special characters for Telegram MarkdownV2 parse mode.
 * https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string | null | undefined): string {
  if (!text) return '';
  // Telegram requires escaping: _ * [ ] ( ) ~ > # + - = | { } . !
  // We also escape \ itself just in case.
  return String(text).replace(/([_*[\]()~>#+\-=|{}.!\\])/g, '\\$1');
}
