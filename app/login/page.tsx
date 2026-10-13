'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setError('');

        const cleanEmail = email.trim();
        if (!cleanEmail || !password) {
            setError('Please enter your email address and password.');
            return;
        }

        setLoading(true);
        try {
            let idToken = '';
            let registeredEmail = cleanEmail;

            // Strictly authenticate against Firebase — only manually registered users will succeed
            if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
                const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
                if (!userCredential?.user) {
                    throw new Error('Access denied: Authentication failed.');
                }
                idToken = await userCredential.user.getIdToken();
                registeredEmail = userCredential.user.email || cleanEmail;
            } else {
                throw new Error('Authentication service is not configured.');
            }

            // Sync verified session to server API route
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registeredEmail, token: idToken })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Login verification failed.');
            }

            // Issue session cookies ONLY after verified credentials
            document.cookie = "auth=true; path=/; max-age=604800; SameSite=Lax";
            document.cookie = `rodsync_user=${encodeURIComponent(registeredEmail)}; path=/; max-age=604800; SameSite=Lax`;

            window.location.href = '/';
        } catch (authErr: unknown) {
            console.error('Authentication rejected:', authErr);
            const fbErr = authErr as { code?: string; message?: string };

            let message = 'Access denied: Only registered users configured in Firebase can access this portal.';
            if (fbErr?.code === 'auth/user-not-found') {
                message = 'Access denied: No registered account found with this email in Firebase.';
            } else if (fbErr?.code === 'auth/wrong-password' || fbErr?.code === 'auth/invalid-credential') {
                message = 'Access denied: Invalid email or password. Only registered users configured in Firebase can log in.';
            } else if (fbErr?.code === 'auth/invalid-email') {
                message = 'Please provide a valid email address.';
            } else if (fbErr?.code === 'auth/user-disabled') {
                message = 'This account has been disabled in Firebase. Please contact your administrator.';
            } else if (fbErr?.code === 'auth/too-many-requests') {
                message = 'Access temporarily locked due to multiple failed login attempts. Please try again later.';
            } else if (fbErr?.message) {
                message = fbErr.message;
            }

            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
            fontFamily: 'Plus Jakarta Sans, sans-serif'
        }}>
            <div style={{
                background: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '24px',
                padding: '3rem 2.5rem',
                width: '100%',
                maxWidth: '420px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.05)',
                textAlign: 'center'
            }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1f36', marginBottom: '0.2rem' }}>
                        Rod<span style={{ color: '#2563eb' }}>Sync</span>
                    </h1>
                    <p style={{ color: '#4b5563', fontSize: '0.95rem' }}>Secure Portal Access</p>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {error && (
                        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'left', lineHeight: '1.4' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{
                                width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
                                background: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', outline: 'none', transition: 'all 0.2s ease',
                                boxSizing: 'border-box'
                            }}
                            placeholder="user@rodsync.com"
                            required
                        />
                    </div>

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{
                                width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)',
                                background: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', outline: 'none', transition: 'all 0.2s ease',
                                boxSizing: 'border-box'
                            }}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '0.75rem', width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none',
                            padding: '1rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', transition: 'background-color 0.2s ease, transform 0.1s ease',
                            opacity: loading ? 0.7 : 1
                        }}>
                        {loading ? 'Authenticating (Async)...' : 'Sign In'}
                    </button>
                </form>

                <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#6b7280' }}>
                    &copy; 2026 RodSync Management System
                </p>
            </div>
        </div>
    );
}
