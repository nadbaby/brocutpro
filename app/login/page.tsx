'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Login() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const checkSession = async () => {
            try {
                if (typeof document !== 'undefined') {
                    const hasAuthCookie = document.cookie
                        .split(';')
                        .some((c) => c.trim().startsWith('auth=true'));
                    if (hasAuthCookie) {
                        router.replace('/');
                        return;
                    }
                }
            } catch (err) {
                console.error('Session check error:', err);
            } finally {
                setCheckingSession(false);
            }
        };

        checkSession();
    }, [router]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) {
            setError('Please enter both your email and password.');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }

        setLoading(true);

        try {
            let userToken = '';

            // Asynchronous Firebase Authentication
            if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
                if (isSignUp) {
                    const userCred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
                    userToken = await userCred.user.getIdToken();
                    setSuccessMsg('Account created successfully! Redirecting...');
                } else {
                    try {
                        const userCred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
                        userToken = await userCred.user.getIdToken();
                    } catch (authErr: unknown) {
                        const firebaseErr = authErr as { code?: string; message?: string };
                        if (
                            firebaseErr?.code === 'auth/invalid-credential' ||
                            firebaseErr?.code === 'auth/user-not-found' ||
                            firebaseErr?.code === 'auth/wrong-password'
                        ) {
                            throw new Error(
                                'Invalid email or password. If you do not have an account yet, switch to "Create Account" below.'
                            );
                        } else if (firebaseErr?.code === 'auth/too-many-requests') {
                            throw new Error('Access temporarily blocked due to multiple failed attempts. Please try again later.');
                        }
                        throw authErr;
                    }
                }
            }

            // Asynchronously sync session to backend API route & set HTTP cookies
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmedEmail, token: userToken })
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Authentication failed. Please try again.');
            }

            // Ensure client-side cookie is set directly as fallback
            document.cookie = 'auth=true; path=/; max-age=604800; SameSite=Lax';
            document.cookie = `rodsync_user=${encodeURIComponent(trimmedEmail)}; path=/; max-age=604800; SameSite=Lax`;

            // Redirect user to the dashboard
            window.location.href = '/';
        } catch (err: unknown) {
            console.error('Authentication error:', err);
            const errObj = err as { code?: string; message?: string };
            let displayMessage = 'An unexpected error occurred during authentication.';

            if (errObj?.code === 'auth/invalid-email') {
                displayMessage = 'Please provide a valid email address format.';
            } else if (errObj?.code === 'auth/email-already-in-use') {
                displayMessage = 'An account with this email already exists. Please switch to Sign In.';
            } else if (errObj?.code === 'auth/weak-password') {
                displayMessage = 'Password should contain at least 6 characters.';
            } else if (errObj?.code === 'auth/network-request-failed') {
                displayMessage = 'Network connection error. Please check your internet connection.';
            } else if (errObj?.message) {
                displayMessage = errObj.message;
            }

            setError(displayMessage);
            setLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#94a3b8',
                fontFamily: 'Inter, system-ui, sans-serif'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '20px',
                        height: '20px',
                        border: '2px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#3b82f6',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                    }}></div>
                    <span>Checking authentication session...</span>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(ellipse at top, #1e293b, #0f172a 80%)',
            padding: '1.5rem',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <div style={{
                background: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '24px',
                padding: '2.5rem 2rem',
                width: '100%',
                maxWidth: '430px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.1)',
                textAlign: 'center'
            }}>
                {/* Logo & Header */}
                <div style={{ marginBottom: '1.75rem' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        boxShadow: '0 8px 16px rgba(37, 99, 235, 0.35)',
                        marginBottom: '1rem',
                        color: '#fff'
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="9" y1="21" x2="9" y2="9"></line>
                        </svg>
                    </div>
                    <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
                        Rod<span style={{ color: '#38bdf8' }}>Sync</span>
                    </h1>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 500 }}>
                        Steel & Rod Stock Management System
                    </p>
                    <div style={{
                        display: 'inline-block',
                        marginTop: '0.5rem',
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#38bdf8',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase'
                    }}>
                        🔒 Compulsory Login Required
                    </div>
                </div>

                {/* Tab switcher: Sign In vs Create Account */}
                <div style={{
                    display: 'flex',
                    background: 'rgba(15, 23, 42, 0.6)',
                    padding: '4px',
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                    <button
                        type="button"
                        onClick={() => { setIsSignUp(false); setError(''); setSuccessMsg(''); }}
                        style={{
                            flex: 1,
                            padding: '0.6rem 0',
                            borderRadius: '8px',
                            border: 'none',
                            background: !isSignUp ? '#2563eb' : 'transparent',
                            color: !isSignUp ? '#ffffff' : '#94a3b8',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        onClick={() => { setIsSignUp(true); setError(''); setSuccessMsg(''); }}
                        style={{
                            flex: 1,
                            padding: '0.6rem 0',
                            borderRadius: '8px',
                            border: 'none',
                            background: isSignUp ? '#2563eb' : 'transparent',
                            color: isSignUp ? '#ffffff' : '#94a3b8',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Create Account
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                    {error && (
                        <div style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.15)',
                            color: '#86efac',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            textAlign: 'left'
                        }}>
                            {successMsg}
                        </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                            Email Address
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem 1rem 0.85rem 2.6rem',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    background: 'rgba(15, 23, 42, 0.7)',
                                    color: '#f8fafc',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    transition: 'all 0.2s ease'
                                }}
                                placeholder="operator@rodsync.com"
                                required
                            />
                            <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>
                                Password
                            </label>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Min 6 characters
                            </span>
                        </div>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem 2.8rem 0.85rem 2.6rem',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255, 255, 255, 0.12)',
                                    background: 'rgba(15, 23, 42, 0.7)',
                                    color: '#f8fafc',
                                    fontSize: '0.95rem',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    transition: 'all 0.2s ease'
                                }}
                                placeholder="••••••••"
                                required
                            />
                            <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '0.75rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    padding: '4px'
                                }}
                                title={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                        <line x1="1" y1="1" x2="23" y2="23"></line>
                                    </svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '0.5rem',
                            width: '100%',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.95rem',
                            borderRadius: '12px',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: loading ? 0.8 : 1
                        }}
                    >
                        {loading ? (
                            <>
                                <div style={{
                                    width: '18px',
                                    height: '18px',
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: '#fff',
                                    borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite'
                                }}></div>
                                <span>{isSignUp ? 'Creating Account (Async)...' : 'Authenticating (Async)...'}</span>
                            </>
                        ) : (
                            <>
                                <span>{isSignUp ? 'Create Account & Access Portal' : 'Sign In to RodSync'}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <polyline points="12 5 19 12 12 19"></polyline>
                                </svg>
                            </>
                        )}
                    </button>
                </form>

                <div style={{ marginTop: '1.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.25rem' }}>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                        {isSignUp ? (
                            <>
                                Already have credentials?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setIsSignUp(false); setError(''); }}
                                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    Sign In here
                                </button>
                            </>
                        ) : (
                            <>
                                First time user?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setIsSignUp(true); setError(''); }}
                                    style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                >
                                    Create a new account
                                </button>
                            </>
                        )}
                    </p>
                </div>

                <p style={{ marginTop: '1.25rem', fontSize: '0.75rem', color: '#475569' }}>
                    &copy; 2026 RodSync Management System &bull; All Rights Reserved
                </p>
            </div>
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                input:focus {
                    border-color: #38bdf8 !important;
                    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2) !important;
                }
            `}</style>
        </div>
    );
}
