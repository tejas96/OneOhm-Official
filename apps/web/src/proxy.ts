import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'oneohm_session';
const PUBLIC_PATHS = ['/sign-in'];

/**
 * Sends visitors without a session cookie to sign-in, keeping where they were going.
 * The API still decides whether the cookie is valid; this is only the fast first check.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (!isPublic && !request.cookies.has(SESSION_COOKIE)) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = '/sign-in';
    signIn.search = '';
    if (pathname !== '/') signIn.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt)$).*)',
  ],
};
