'use client';
import { useId, useState } from 'react';
import { meetingLinkProblem, type ClassMode } from '@/modules/academics/meeting';

// "Where the class meets" on the new-class form and the Edit class dialog (FR-ADM-05, BR-28; M14): in a room, or
// online with the class's Zoom link. Only the chosen one is sent; the server clears the other.
export function ClassPlace({
  mode: initial = 'room',
  room,
  meetingUrl,
}: {
  mode?: ClassMode;
  room?: string | null;
  meetingUrl?: string | null;
}) {
  const id = useId();
  const [mode, setMode] = useState<ClassMode>(initial);
  const [roomName, setRoomName] = useState(room ?? '');
  const [link, setLink] = useState(meetingUrl ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const help = `${id}-meeting-help`;
  const err = `${id}-meeting-err`;
  return (
    <>
      <div className="grid g2">
        <fieldset className="fs f">
          <legend>Where the class meets</legend>
          <div className="seg">
            {(
              [
                ['room', 'In a room'],
                ['online', 'Online (Zoom)'],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {mode === 'room' ? (
          <label className="f">
            Room
            <input
              name="room"
              type="text"
              maxLength={40}
              placeholder="Room A"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </label>
        ) : (
          <div className="f">
            <label htmlFor={`${id}-meeting`}>Zoom link</label>
            <input
              id={`${id}-meeting`}
              name="meetingUrl"
              type="url"
              required
              maxLength={500}
              placeholder="https://us06web.zoom.us/j/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={() => setProblem(link.trim() ? meetingLinkProblem(link, '') : null)}
              aria-invalid={!!problem}
              aria-describedby={problem ? `${help} ${err}` : help}
            />
            <span id={help} className="xs muted field-help">
              Paste the meeting&apos;s invite link from Zoom. Use a recurring meeting so the link works every week of the term.
            </span>
            {problem && (
              <span id={err} className="field-error">
                {problem}
              </span>
            )}
          </div>
        )}
      </div>
      {mode === 'online' && <p className="note">Students in this class will see Join on Zoom on their My week and class page.</p>}
    </>
  );
}
