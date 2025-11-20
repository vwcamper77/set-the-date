import { NextResponse } from 'next/server';

// Strip tracking params (e.g. _gl) from shared URLs to keep links clean.
export function middleware(request) {
  const url = request.nextUrl.clone();
  const dirtyParams = ['_gl', 'gclid', 'fbclid'];
  let changed = false;

  dirtyParams.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });

  if (changed) {
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
