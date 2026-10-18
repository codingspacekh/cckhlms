'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { NAV, type Role } from './nav';
import { SignOutButton } from './SignOutButton';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Sidebar({ role, user }: { role: Role; user: { name: string; roleLabel: string } }) {
  const pathname = usePathname();
  return (
    <aside className="side">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          ck
        </div>
        <div>
          <b>CCKH LMS</b>
          <small>Coding club</small>
        </div>
      </div>
      <nav className="nav" aria-label="Sections">
        {NAV[role].map((section) => (
          <div key={section.title} className="navsec">
            <div className="sec">{section.title}</div>
            {section.items.map((item) => (
              <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="me">
        <div className="av" aria-hidden="true">
          {initials(user.name)}
        </div>
        <div className="who">
          <div className="n">{user.name}</div>
          <div className="r">{user.roleLabel}</div>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
