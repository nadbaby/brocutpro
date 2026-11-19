import { NextResponse } from 'next/server';
import { getUserRoleProfile } from '@/lib/roles';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, token } = body;

    // Validate that we received authentication information
    if (!email && !token) {
      return NextResponse.json(
        { success: false, message: 'Email or token is required for authentication' },
        { status: 400 }
      );
    }

    const cleanEmail = String(email || '').toLowerCase().trim();
    const profile = getUserRoleProfile(cleanEmail);

    const response = NextResponse.json({
      success: true,
      message: 'Authenticated successfully',
      user: { email: cleanEmail, name: profile.name, role: profile.role },
      profile
    });

    // Set auth cookie for session verification
    response.cookies.set('auth', 'true', {
      path: '/',
      maxAge: 86400 * 7, // 7 days
      sameSite: 'lax',
      httpOnly: false // Accessible by client scripts & proxy
    });

    if (email) {
      response.cookies.set('rodsync_user', encodeURIComponent(email), {
        path: '/',
        maxAge: 86400 * 7,
        sameSite: 'lax',
        httpOnly: false
      });
    }

    return response;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Authentication failed';
    return NextResponse.json({ success: false, message: errorMsg }, { status: 500 });
  }
}
