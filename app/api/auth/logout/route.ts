import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully'
  });

  // Expire auth cookies
  response.cookies.set('auth', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });

  response.cookies.set('rodsync_user', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });

  return response;
}
