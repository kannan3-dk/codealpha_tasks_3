import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.ts';
import { useToast } from '../../contexts/ToastContext.tsx';
import { formatSupabaseError } from '../../lib/errorHandler.ts';
import { KanbanSquare, ArrowRight, Loader2, Eye, EyeOff, Check, X } from 'lucide-react';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Live validation checks
  const usernameRegex = /^[a-z0-9_]{3,30}$/;
  const isUsernameValid = usernameRegex.test(username);
  const isPasswordValid = password.length >= 6;

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Force lowercase for username
    const val = e.target.value.toLowerCase().replace(/\s+/g, '');
    setUsername(val);
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();
    const cleanDisplayName = displayName.trim() || cleanUsername;

    if (!cleanEmail || !cleanUsername || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (!usernameRegex.test(cleanUsername)) {
      setErrorMessage('Username must be 3-30 characters long and contain only lowercase letters, numbers, and underscores.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Proactively check if username is already taken in profiles table
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (!checkError && existingUser) {
        setErrorMessage(`The username "@${cleanUsername}" is already taken. Please choose another.`);
        setSubmitting(false);
        return;
      }

      // 2. Call Supabase signUp with required user data
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanDisplayName,
          },
        },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('user already exists') || error.status === 422) {
          setErrorMessage('An account with this email already exists. Try logging in instead.');
        } else if (msg.includes('password') || msg.includes('weak') || msg.includes('least 6')) {
          setErrorMessage('Password is too weak. Please use at least 6 characters.');
        } else if (msg.includes('username') || msg.includes('unique')) {
          setErrorMessage('This username is already taken.');
        } else {
          setErrorMessage(formatSupabaseError(error, error.message));
        }
        setSubmitting(false);
        return;
      }

      if (data?.session) {
        showToast('Account created successfully! Welcome to Taskboard.', 'success');
        navigate('/');
      } else if (data?.user) {
        // Confirmation email required
        showToast('Account created! If email confirmation is enabled, please verify your email before logging in.', 'info');
        navigate('/login');
      }
    } catch (err: unknown) {
      setErrorMessage(formatSupabaseError(err, 'An unexpected error occurred during sign up.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
            <KanbanSquare className="w-7 h-7" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-slate-900">
          Create your Taskboard account
        </h2>
        <p className="mt-1.5 text-center text-sm text-slate-500">
          Start organizing your team's projects in seconds
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5 font-bold">!</span>
              <p className="leading-snug">{errorMessage}</p>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email address <span className="text-rose-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="username" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Username <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">3–30 chars (a-z, 0-9, _)</span>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-sm">
                  @
                </span>
                <input
                  id="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="alex_dev"
                  maxLength={30}
                  className="w-full pl-8 pr-9 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                />
                {username.length > 0 && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    {isUsernameValid ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <X className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="displayName" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Morgan"
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Password <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">Min 6 characters</span>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || !isUsernameValid || !isPasswordValid || !email}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
