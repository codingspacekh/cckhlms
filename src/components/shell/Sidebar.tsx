'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { ClubLogo } from './ClubLogo';
import { CLASS_SECTIONS, classSectionActive, NAV, type ClassLink, type Role } from './nav';
import { SignOutButton } from './SignOutButton';

// A class's name without its day and time ("Python Level 1 · Sat 09:00" → "Python Level 1"), which fits the
// sidebar; screen readers still hear the whole name.
function ClassName({ name }: { name: string }) {
  const [short, ...rest] = name.split(' · ');
  return (
    <span>
      {short}
      {rest.length > 0 && (
        <>
          {' '}
          <span className="sr-only">· {rest.join(' · ')}</span>
        </>
      )}
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Sidebar({ role, user, classes = [] }: { role: Role; user: { name: string; roleLabel: string }; classes?: ClassLink[] }) {
  const pathname = usePathname();
  const me = (
    <>
      <span className="av" aria-hidden="true">
        {initials(user.name)}
      </span>
      <span className="who">
        <span className="n">{user.name}</span>
        <span className="r">{user.roleLabel}</span>
      </span>
    </>
  );
  return (
    <aside className="side">
      <div className="brand">
        <ClubLogo />
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
        {classes.length > 0 && (
          <div className="navsec">
            <div className="sec">My classes</div>
            {classes.map((k) => {
              const base = `/${role === 'student' ? 'student' : 'teacher'}/classes/${k.id}`;
              const open = pathname === base || pathname.startsWith(`${base}/`);
              // A student's class is one page (lessons and work); a teacher's opens into its sections.
              if (role === 'student')
                return (
                  <Link key={k.id} href={base} aria-current={open ? 'page' : undefined} title={k.name}>
                    <Icon name="book" />
                    <ClassName name={k.name} />
                  </Link>
                );
              return (
                <div key={k.id} className="navgroup">
                  <Link href={base} className={open ? 'open' : undefined} title={k.name}>
                    <Icon name="layers" />
                    <ClassName name={k.name} />
                  </Link>
                  {open && (
                    <div className="subnav" role="group" aria-label={`${k.name} sections`}>
                      {CLASS_SECTIONS.map((s) => (
                        <Link
                          key={s.path}
                          href={base + s.path}
                          aria-current={classSectionActive(pathname, base, s.path) ? 'page' : undefined}
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>
      <div className="me">
        {role === 'student' ? (
          me
        ) : (
          // FR-AUTH-06 (M13): admins and teachers open My account (Change password) from their name.
          <Link
            className="me-link"
            href={`/${role}/account`}
            title="My account"
            aria-current={pathname === `/${role}/account` ? 'page' : undefined}
          >
            {me}
          </Link>
        )}
        <SignOutButton />
      </div>
    </aside>
  );
}
