// A person's picture (owner, 2026-10-31): the one they set on My account, or else their own gradient. Never their
// initials. Decorative: their name is always next to it.
import { avatarSrc, gradientFor } from '@/lib/avatar';

export function Avatar({
  userId,
  image,
  className = 'av',
  testId,
}: {
  userId: string;
  image: string | null;
  className?: string;
  testId?: string;
}) {
  return (
    <span className={className} aria-hidden="true" data-testid={testId} style={image ? undefined : { background: gradientFor(userId) }}>
      {image && <img src={avatarSrc(userId, image)} alt="" />}
    </span>
  );
}
