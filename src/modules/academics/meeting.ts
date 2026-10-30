// Where a class meets (FR-ADM-05, BR-28; M14): in a room, or online with one Zoom link for the whole term.
import { ValidationError } from '@/server/errors';

export type ClassMode = 'room' | 'online';
export const CLASS_MODES = ['room', 'online'] as const;
export const MEETING_LINK_MAX = 500;

// A full https:// link with a host, in one piece. The link is put in an href, so nothing else gets through.
export function isMeetingLink(raw: string): boolean {
  const v = raw.trim();
  if (v.length > MEETING_LINK_MAX || !/^https:\/\/[^\s/?#]+\.[^\s/?#]+(?:[/?#]\S*)?$/i.test(v)) return false;
  return URL.canParse(v);
}

export function meetingLinkProblem(raw: string | null | undefined, empty: string): string | null {
  const v = raw?.trim() ?? '';
  if (!v) return empty;
  if (v.length > MEETING_LINK_MAX) return `That link is too long (${MEETING_LINK_MAX} characters at most).`;
  return isMeetingLink(v) ? null : 'Paste the full link, starting with https://';
}

// The room or the link, never both: going online drops the room, and going back to a room drops the link.
export function placeOf(c: { mode: ClassMode; room?: string | null; meetingUrl?: string | null }): {
  mode: ClassMode;
  room: string | null;
  meetingUrl: string | null;
} {
  if (c.mode === 'room') return { mode: 'room', room: c.room?.trim() || null, meetingUrl: null };
  const problem = meetingLinkProblem(c.meetingUrl, 'Paste the class’s Zoom link.');
  if (problem) throw new ValidationError(problem, 'meetingUrl');
  return { mode: 'online', room: null, meetingUrl: c.meetingUrl!.trim() };
}

// What a list shows under Where: the room, Online, or nothing when no room was given.
export const whereLabel = (c: { mode: string; room: string | null }) => (c.mode === 'online' ? 'Online' : c.room);
