// M14a · FR-ADM-05, BR-28: a class meets in a room or online, with one Zoom link for the whole term.
import { describe, expect, it } from 'vitest';
import { isMeetingLink, placeOf, whereLabel } from '@/modules/academics/meeting';

const ZOOM = 'https://us06web.zoom.us/j/81234567890?pwd=Qk1aWnNw';

describe('a meeting link (BR-28)', () => {
  it('is a full https:// link', () => {
    expect(isMeetingLink(ZOOM)).toBe(true);
    expect(isMeetingLink('https://meet.google.com/abc-defg-hij')).toBe(true);
  });
  it('is refused without https://, a host or in pieces', () => {
    for (const bad of ['http://zoom.us/j/1', 'zoom.us/j/1', 'javascript:alert(1)', 'https://zoom', 'https://zoom.us/j/1 2', 'https://', ''])
      expect(isMeetingLink(bad), bad).toBe(false);
  });
  it('is at most 500 characters', () => {
    expect(isMeetingLink(`https://zoom.us/j/${'1'.repeat(482)}`)).toBe(true); // 500
    expect(isMeetingLink(`https://zoom.us/j/${'1'.repeat(483)}`)).toBe(false);
  });
});

describe('where a class meets', () => {
  it('is a room, and an online class has no room', () => {
    expect(placeOf({ mode: 'room', room: 'Room A', meetingUrl: ZOOM })).toEqual({ mode: 'room', room: 'Room A', meetingUrl: null });
    expect(placeOf({ mode: 'room' })).toEqual({ mode: 'room', room: null, meetingUrl: null });
    expect(placeOf({ mode: 'online', room: 'Room A', meetingUrl: ` ${ZOOM} ` })).toEqual({ mode: 'online', room: null, meetingUrl: ZOOM });
  });
  it('needs a good link when online, and says which field', () => {
    expect(() => placeOf({ mode: 'online' })).toThrow(
      expect.objectContaining({ message: 'Paste the class’s Zoom link.', field: 'meetingUrl' }),
    );
    expect(() => placeOf({ mode: 'online', meetingUrl: 'zoom.us/j/1' })).toThrow(
      expect.objectContaining({ message: 'Paste the full link, starting with https://', field: 'meetingUrl' }),
    );
    expect(() => placeOf({ mode: 'online', meetingUrl: `https://zoom.us/j/${'1'.repeat(483)}` })).toThrow(/500 characters/);
  });
  it('is shown as the room, or Online', () => {
    expect(whereLabel({ mode: 'room', room: 'Room A' })).toBe('Room A');
    expect(whereLabel({ mode: 'room', room: null })).toBeNull();
    expect(whereLabel({ mode: 'online', room: null })).toBe('Online');
  });
});
