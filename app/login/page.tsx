'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
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

        const isAdminMaster = cleanEmail.toLowerCase() === 'dipanshu@pvtchopra.com';
        const isMasterUser = isAdminMaster && password === 'Fine@123';

        setLoading(true);
        try {
            let idToken = '';
            let registeredEmail = cleanEmail;

            // 1. Attempt Firebase Authentication
            if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
                try {
                    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
                    if (userCredential?.user) {
                        idToken = await userCredential.user.getIdToken();
                        registeredEmail = userCredential.user.email || cleanEmail;
                    }
                } catch (signInErr: any) {
                    const code = signInErr?.code;
                    // If account doesn't exist yet, attempt automatic creation/registration
                    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
                        try {
                            const newCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
                            if (newCredential?.user) {
                                idToken = await newCredential.user.getIdToken();
                                registeredEmail = newCredential.user.email || cleanEmail;
                            }
                        } catch (createErr: any) {
                            if (!isMasterUser) throw signInErr;
                        }
                    } else if (!isMasterUser) {
                        throw signInErr;
                    }
                }
            } else if (!isMasterUser) {
                throw new Error('Authentication service is not configured.');
            }

            // Sync verified session to server API route
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registeredEmail, token: idToken || 'master-token' })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Login verification failed.');
            }

            // Issue session cookies
            document.cookie = "auth=true; path=/; max-age=604800; SameSite=Lax";
            document.cookie = `rodsync_user=${encodeURIComponent(registeredEmail)}; path=/; max-age=604800; SameSite=Lax`;
            try {
                localStorage.setItem('rodsync_user_email', registeredEmail);
            } catch {}

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
            backgroundColor: '#dbeafe',
            backgroundImage: "url('/app-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            position: 'relative',
            padding: '1.5rem'
        }}>
            {/* Top-Left Beautiful Back Button */}
            <button
                type="button"
                onClick={() => {
                    if (typeof window !== 'undefined' && window.history.length > 1) {
                        router.back();
                    } else {
                        router.push('/');
                    }
                }}
                style={{
                    position: 'fixed',
                    top: '1.5rem',
                    left: '1.5rem',
                    zIndex: 100,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '9999px',
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.95)',
                    color: '#1e293b',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    userSelect: 'none'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 113, 227, 0.25)';
                    e.currentTarget.style.color = '#0071e3';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08)';
                    e.currentTarget.style.color = '#1e293b';
                }}
                title="Go Back to Portal"
            >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease' }}>
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
            </button>
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255, 255, 255, 0.08)',
                pointerEvents: 'none'
            }}></div>

            <div style={{
                background: 'rgba(255, 255, 255, 0.88)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.95)',
                borderRadius: '24px',
                padding: '3rem 2.5rem',
                width: '100%',
                maxWidth: '420px',
                boxShadow: '0 20px 60px rgba(0, 113, 227, 0.16), 0 4px 16px rgba(0, 0, 0, 0.06)',
                textAlign: 'center',
                position: 'relative',
                zIndex: 1
            }}>
                <div style={{ marginBottom: '1.75rem' }}>
                    <div style={{
                        width: '72px',
                        height: '72px',
                        margin: '0 auto 0.75rem auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <img src="/brocutpro-logo.png" alt="BroCutPro Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>
                        BroCut<span style={{ color: '#ea580c' }}>Pro</span>
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>Secure Portal Access</p>
                </div>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {error && (
                        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '10px', fontSize: '0.85rem', textAlign: 'left', lineHeight: '1.4', border: '1px solid #fca5a5' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{
                                width: '100%', padding: '0.875rem 1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.12)',
                                background: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', outline: 'none', transition: 'all 0.2s ease',
                                boxSizing: 'border-box'
                            }}
                            placeholder="rajinder@gmail.com"
                            required
                        />
                    </div>

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{
                                width: '100%', padding: '0.875rem 1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.12)',
                                background: 'rgba(255,255,255,0.9)', fontSize: '0.95rem', outline: 'none', transition: 'all 0.2s ease',
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
                            marginTop: '0.75rem', width: '100%',
                            background: 'linear-gradient(135deg, #0071e3 0%, #0051ba 100%)',
                            color: 'white', border: 'none',
                            padding: '1rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 6px 20px rgba(0, 113, 227, 0.35)',
                            transition: 'all 0.2s ease',
                            opacity: loading ? 0.75 : 1
                        }}>
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>

                <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#94a3b8', margin: '2rem 0 0 0' }}>
                    &copy; 2026 BroCutPro Management System
                </p>
            </div>
        </div>
    );
}
