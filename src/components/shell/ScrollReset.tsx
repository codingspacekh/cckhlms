'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';

// Opens every new page at the top. Next.js only scrolls when none of the new page is on screen, so after
// clicking a link part-way down a long page the next page could open part-way down, its title under the top
// bar. Back/Forward are left to the browser, which restores where you were.
export function ScrollReset() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const backOrForward = useRef(false);

  useEffect(() => {
    const onPop = () => (backOrForward.current = true);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A layout effect runs after Next's own scroll handling and before the new page is painted.
  useLayoutEffect(() => {
    if (pathname === previous.current) return;
    previous.current = pathname;
    if (backOrForward.current) backOrForward.current = false;
    else window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
