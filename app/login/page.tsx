'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    sendPasswordResetEmail 
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function Login() {
    const [mode, setMode] = useState<'signin' | 'register'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [infoMsg, setInfoMsg] = useState('');
    const [canRegisterPrompt, setCanRegisterPrompt] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleAuth = async (overrideMode?: 'signin' | 'register') => {
        const currentMode = overrideMode || mode;
        setError('');
        setInfoMsg('');
        setCanRegisterPrompt(false);

        const cleanEmail = email.trim();
        if (!cleanEmail || !password) {
            setError('Please enter both your email address and password.');
            return;
        }

        if (password.length < 6) {
            setError('Password must contain at least 6 characters.');
            return;
        }

        setLoading(true);
        try {
            let idToken = '';
            let registeredEmail = cleanEmail;

            if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
                if (currentMode === 'register') {
                    // Register the new user in Firebase Auth
                    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
                    idToken = await userCredential.user.getIdToken();
                    registeredEmail = userCredential.user.email || cleanEmail;
                } else {
                    // Sign in existing registered user
                    try {
                        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
                        idToken = await userCredential.user.getIdToken();
                        registeredEmail = userCredential.user.email || cleanEmail;
                    } catch (signInErr: unknown) {
                        const fbErr = signInErr as { code?: string; message?: string };
                        if (fbErr?.code === 'auth/invalid-credential' || fbErr?.code === 'auth/user-not-found') {
                            setCanRegisterPrompt(true);
                            throw new Error('Account not found or password incorrect. If this is a new user, you can register it below.');
                        }
                        throw signInErr;
                    }
                }
            } else {
                throw new Error('Firebase authentication service is not configured.');
            }

            // Sync verified session with server API route
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: registeredEmail, token: idToken })
            });

            const data = await res.json();
            if (!data.success) {
                throw new Error(data.message || 'Login verification failed.');
            }

            // Issue session cookies only after verified credentials
            document.cookie = "auth=true; path=/; max-age=604800; SameSite=Lax";
            document.cookie = `rodsync_user=${encodeURIComponent(registeredEmail)}; path=/; max-age=604800; SameSite=Lax`;

            window.location.href = '/';
        } catch (authErr: unknown) {
            console.error('Authentication rejected:', authErr);
            const fbErr = authErr as { code?: string; message?: string };

            let message = 'Authentication failed. Please verify your credentials.';
            if (fbErr?.code === 'auth/email-already-in-use') {
                message = 'This email is already registered in Firebase. Please use Sign In with your existing password.';
                setMode('signin');
            } else if (fbErr?.code === 'auth/weak-password') {
                message = 'Password should contain at least 6 characters.';
            } else if (fbErr?.code === 'auth/invalid-email') {
                message = 'Please provide a valid email address.';
            } else if (fbErr?.code === 'auth/user-disabled') {
                message = 'This account has been deactivated. Please contact your administrator.';
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

    const handleForgotPassword = async () => {
        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setError('Please enter your email address in the field above to receive a password reset link.');
            return;
        }

        try {
            setError('');
            await sendPasswordResetEmail(auth, cleanEmail);
            setInfoMsg(`Password reset email sent to ${cleanEmail}. Please check your inbox.`);
        } catch (resetErr: unknown) {
            const fbErr = resetErr as { code?: string; message?: string };
            setError(fbErr?.message || 'Failed to send password reset email. Confirm the email address is correct.');
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
                padding: '2.5rem 2.5rem',
                width: '100%',
                maxWidth: '430px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.05)',
                textAlign: 'center'
            }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1f36', marginBottom: '0.2rem' }}>
                        Rod<span style={{ color: '#2563eb' }}>Sync</span>
                    </h1>
                    <p style={{ color: '#4b5563', fontSize: '0.95rem' }}>Secure Portal Access</p>
                </div>

                {/* Mode Selector (Sign In vs Register) */}
                <div style={{
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '12px',
                    padding: '4px',
                    marginBottom: '1.25rem',
                    border: '1px solid rgba(0, 0, 0, 0.05)'
                }}>
                    <button
                        type="button"
                        onClick={() => { setMode('signin'); setError(''); setInfoMsg(''); setCanRegisterPrompt(false); }}
                        style={{
                            flex: 1,
                            padding: '0.55rem',
                            border: 'none',
                            borderRadius: '9px',
                            background: mode === 'signin' ? '#2563eb' : 'transparent',
                            color: mode === 'signin' ? '#ffffff' : '#4b5563',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Sign In
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('register'); setError(''); setInfoMsg(''); setCanRegisterPrompt(false); }}
                        style={{
                            flex: 1,
                            padding: '0.55rem',
                            border: 'none',
                            borderRadius: '9px',
                            background: mode === 'register' ? '#2563eb' : 'transparent',
                            color: mode === 'register' ? '#ffffff' : '#4b5563',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Register
                    </button>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleAuth(); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                    {error && (
                        <div style={{
                            backgroundColor: '#fee2e2',
                            color: '#b91c1c',
                            padding: '0.75rem',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            textAlign: 'left',
                            lineHeight: 1.4
                        }}>
                            {error}
                            {canRegisterPrompt && (
                                <button
                                    type="button"
                                    onClick={() => handleAuth('register')}
                                    style={{
                                        display: 'block',
                                        marginTop: '0.5rem',
                                        backgroundColor: '#2563eb',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '0.45rem 0.75rem',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        width: '100%',
                                        textAlign: 'center'
                                    }}
                                >
                                    ✨ Register &quot;{email}&quot; with this password now
                                </button>
                            )}
                        </div>
                    )}

                    {infoMsg && (
                        <div style={{
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            padding: '0.75rem',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            textAlign: 'left'
                        }}>
                            {infoMsg}
                        </div>
                    )}

                    <div style={{ textAlign: 'left' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                            Email Address
                        </label>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Password</label>
                            {mode === 'signin' && (
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        color: '#2563eb',
                                        cursor: 'pointer',
                                        padding: 0,
                                        textDecoration: 'underline'
                                    }}
                                >
                                    Forgot?
                                </button>
                            )}
                        </div>
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
                            marginTop: '0.5rem', width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none',
                            padding: '1rem', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', transition: 'background-color 0.2s ease, transform 0.1s ease',
                            opacity: loading ? 0.7 : 1
                        }}>
                        {loading ? 'Authenticating (Async)...' : mode === 'signin' ? 'Sign In' : 'Create & Register Account'}
                    </button>
                </form>

                <p style={{ marginTop: '1.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
                    &copy; 2026 RodSync Management System
                </p>
            </div>
        </div>
    );
}
