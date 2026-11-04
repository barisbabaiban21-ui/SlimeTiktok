import { createHash } from 'node:crypto';
import { chatCommand, cleanChat } from './chat.mjs';
const object = v => v && typeof v === 'object' ? v : {};
const id = v => typeof v === 'string' ? v : typeof v === 'bigint' ? String(v) : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : '';
const integer = (v, fallback = 0) => Number.isSafeInteger(Number(v)) ? Number(v) : fallback;
const hash = fields => createHash('sha256').update(JSON.stringify(fields)).digest('hex');

/** Normalize documented modern v2 payloads and TikFinity Desktop's legacy-shaped data.
 * Unknown gift price, unsafe numeric IDs or missing stable streak IDs fail closed.
 * Gift unit values are catalog units, not a creator payout or a USD conversion.
 */
export function normalize(kind, payload, context, now = Date.now()) {
  if (kind === 'member') kind = 'join';
  const d = object(payload), u = object(d.user), common = object(d.common);
  const userId = id(u.id) || id(d.userId) || id(u.userId);
  const roomId = id(context.roomId) || id(d.roomId);
  if (!userId || !roomId) return null;
  const name = String(u.nickname || u.displayId || d.nickname || d.uniqueId || 'Viewer').slice(0, 128);
  const msgId = id(common.msgId) || id(common.messageId) || id(d.msgId) || id(d.messageId);
  const base = { source: context.source, roomId, timestamp: now, kind, user: { id: userId, name } };
  if (kind === 'gift') {
    const g = object(d.gift), x = object(d.extendedGiftInfo);
    const giftId = id(d.giftId) || id(g.id);
    const recipient = object(d.toUser);
    const recipientId = id(recipient.id) || id(d.receiverUserId);
    const recipientName = String(recipient.displayId || '').toLowerCase().replace(/^@/, '');
    if (recipientId && context.hostId && recipientId !== context.hostId) return null;
    if (recipientName && context.hostUsername && recipientName !== context.hostUsername.toLowerCase().replace(/^@/, '')) return null;
    // If the provider identifies another recipient, require host resolution rather than
    // accidentally counting another creator's gifts during a battle.
    if (recipientId && !context.hostId && !recipientName) return null;
    const coins = integer(g.diamondCount ?? x.diamondCount ?? x.diamond_count ?? d.diamondCount);
    const repeat = integer(d.repeatCount, 1);
    const type = integer(g.type ?? g.giftType ?? d.giftType);
    const group = id(d.groupId) || id(d.streakId);
    const ended = d.repeatEnd === true || d.repeatEnd === 1;
    if (!giftId || coins < 1 || coins > 1000000 || repeat < 1 || repeat > 10000) return null;
    if (type === 1 && !group) return null;
    if (!group && !msgId) return null;
    const series = group || msgId;
    // Stable across reconnects, duplicate final frames and out-of-order repeats.
    const eventId = hash([context.source, roomId, userId, giftId, series, repeat]);
    return { ...base, id: eventId, gift: { id: giftId, name: String(g.name || x.name || d.giftName || 'Gift').slice(0,80), coins, repeat, streakId: series, ended } };
  }
  if (kind === 'comment') {
    // Chat text leaves the bridge only when the operator opted in (FORWARD_CHAT=true); commands always do.
    const raw = d.content ?? d.comment ?? '', command = chatCommand(raw), text = context.forwardChat ? cleanChat(raw) : '';
    if (!command && !text) return null;
    return { ...base, id: msgId || hash([roomId,userId,kind,command,text,Math.floor(now/6000)]), command, ...(text ? { text } : {}) };
  }
  if (kind === 'like') {
    const count = integer(d.count ?? d.likeCount, 1);
    if (count < 1) return null;
    return { ...base, id: msgId || hash([roomId,userId,kind,Math.floor(now/2000)]), count: Math.min(5000,count) };
  }
  if (kind === 'follow') return { ...base, id: msgId || hash([roomId,userId,kind,new Date(now).toISOString().slice(0,10)]) };
  if (kind === 'join') return { ...base, id: msgId || hash([context.source,roomId,userId,kind,Math.floor(now/60000)]) };
  return null;
}
