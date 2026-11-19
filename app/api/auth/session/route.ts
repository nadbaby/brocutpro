import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getUserRoleProfile } from '@/lib/roles';

export async function GET() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('auth')?.value;
  const userCookie = cookieStore.get('rodsync_user')?.value;

  const isAuthenticated = authCookie === 'true';

  if (!isAuthenticated) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const email = userCookie ? decodeURIComponent(userCookie) : '';
  const profile = getUserRoleProfile(email);

  return NextResponse.json({
    authenticated: true,
    user: email,
    profile
  });
}
