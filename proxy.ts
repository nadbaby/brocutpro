import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get('auth')?.value;
  const isAuthenticated = authCookie === 'true' || (Boolean(authCookie) && authCookie !== 'false');

  // Allow API routes freely (they handle their own validation / webhooks)
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Protected paths: any page except /login
  if (!isAuthenticated && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If already authenticated and navigating to /login, redirect to dashboard
  if (isAuthenticated && pathname === '/login') {
    const dashboardUrl = new URL('/', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js, manifest.json (service worker & PWA files)
     * - public assets (.png, .svg, .jpg, .css, .js)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
