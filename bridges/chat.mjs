/** Shared by the standalone bridges and server; no raw chat enters the outbox. */
const BLOCKLIST = ['amk', 'aq', 'orospu', 'pic', 'sik', 'yarrak', 'got', 'amcik', 'pezevenk', 'ibne', 'kahpe', 'fuck', 'shit', 'nigg', 'hitler', 'nazi'];
export const COMMANDS = ['!yogur', '!yoğur', '!uzat', '!slime', '!knead', '!stretch', 'yogur', 'yoğur', 'uzat', 'su', '!su', 'boraks', '!boraks', 'köpük', '!köpük', 'kopuk', '!kopuk'];
export function blockedText(value) {
  const flat = value.normalize('NFKD').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/\p{M}/gu, '')
    .replace(/[013457]/g, c => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' })[c]).replace(/[^a-z]/g, '');
  return BLOCKLIST.some(w => flat.includes(w));
}
export function chatCommand(value) {
  if (typeof value !== 'string' || value.length > 200) return '';
  const words = value.normalize('NFKC').trim().toLocaleLowerCase('tr').split(/\s+/);
  if (words[0] === 'slime' && words[1] === 'ekle') return '!slime';
  // A bare 1-4 is a dance vote (it has no letters, so it would never pass as chat text).
  if (words.length === 1 && /^[1-4]$/.test(words[0])) return `!oy${words[0]}`;
  return COMMANDS.includes(words[0]) ? words[0] : '';
}
/** Reject unsafe messages in full before shortening; emoji-only messages disappear. */
export function cleanChat(value) {
  if (typeof value !== 'string' || value.length > 200) return '';
  const raw = value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '');
  if (blockedText(raw) || /[@<>{}]|https?\s*:|www\s*\.|[\p{L}\p{N}-]+\.[\p{L}]{2,}(?:\b|\/)|[\p{L}\p{N}-]+\s*\.\s*(?:com|net|org|io|tr|xyz)\b/iu.test(raw)
    || /\d{5}/.test(raw.replace(/[\s()+.\-]/g, ''))) return '';
  const clean = raw.replace(/[^\p{L}\p{M}\p{N}\s.,!?…'’\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!/\p{L}/u.test(clean)) return '';
  return clean.length <= 50 ? clean : clean.slice(0, 50).replace(/\s+\S*$/, '').trim();
}
