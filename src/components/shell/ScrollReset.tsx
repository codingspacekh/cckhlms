'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef } from 'react';

// Scroll to y; if the page is still too short (Back can show it before all of it is drawn), try again as it
// grows, until y is reached, 1.5 s pass, or the person scrolls themselves.
function scrollWhenReady(y: number) {
  window.scrollTo(0, y);
  if (window.scrollY >= y - 1 || typeof ResizeObserver === 'undefined') return;
  const userScroll = ['wheel', 'touchmove', 'keydown'] as const;
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    userScroll.forEach((e) => window.removeEventListener(e, stop));
  };
  const observer = new ResizeObserver(() => {
    window.scrollTo(0, y);
    if (window.scrollY >= y - 1) stop();
  });
  const timer = setTimeout(stop, 1500);
  userScroll.forEach((e) => window.addEventListener(e, stop, { passive: true }));
  observer.observe(document.querySelector('main') ?? document.body); // body is fixed at 100% height; main grows
}

// Where each page opens. A new page opens at the top: Next.js only scrolls when none of the new page is on
// screen, so after a link part-way down a long page the next page could open part-way down, its title under
// the top bar. Back and Forward put you back where you were: the browser's own restoration runs before Next
// has drawn the old page again, so it landed at a random spot near the top.
export function ScrollReset() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const backOrForward = useRef(false);
  const saved = useRef(new Map<string, number>());

  useEffect(() => {
    history.scrollRestoration = 'manual';
    // Scroll events arrive after a navigation has committed, so `current` already names the page they belong to.
    const onScroll = () => saved.current.set(current.current, window.scrollY);
    const onPop = () => (backOrForward.current = true);
    onScroll(); // someone may have scrolled before this script started, when there was no listener yet
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // A layout effect runs after Next's own scroll handling and before the new page is painted.
  useLayoutEffect(() => {
    if (pathname === current.current) return;
    current.current = pathname;
    const y = backOrForward.current ? (saved.current.get(pathname) ?? 0) : 0;
    backOrForward.current = false;
    scrollWhenReady(y);
  }, [pathname]);

  return null;
}
