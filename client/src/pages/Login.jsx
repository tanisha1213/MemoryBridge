import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, KeyRound, Mail, Lock, User, Globe, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations';

export default function Login() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('code'); // 'code' | 'login' | 'register'
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Forms
  const [accessCode, setAccessCode] = useState('MB-1001');
  const [email, setEmail] = useState('demo@memorybridge.com');
  const [password, setPassword] = useState('password123');
  const [patientName, setPatientName] = useState('Tanisha');
  const [nativeLanguage, setNativeLanguage] = useState('en-US');

  const handleSaveUser = (userData) => {
    localStorage.setItem('mb_userId', userData._id);
    localStorage.setItem('mb_userEmail', userData.email || 'demo@memorybridge.com');
    localStorage.setItem('mb_accessCode', userData.accessCode || 'MB-1001');
    localStorage.setItem('mb_patientName', userData.patientName || 'Tanisha');
    localStorage.setItem('mb_nativeLanguage', userData.nativeLanguage || 'en-US');
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode }),
      });
      const data = await res.json();
      if (res.ok) {
        handleSaveUser(data);
        navigate('/patient');
      } else {
        setError(data.error || 'Invalid Family Access Code');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        handleSaveUser(data);
        navigate('/caregiver');
      } else {
        setError(data.error || 'Invalid login credentials');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, patientName, nativeLanguage }),
      });
      const data = await res.json();
      if (res.ok) {
        handleSaveUser(data);
        navigate('/caregiver');
      } else {
        setError(data.error || 'Failed to create account');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const useQuickDemo = () => {
    const demoData = {
      _id: 'usr_demo_100',
      email: 'demo@memorybridge.com',
      patientName: 'Tanisha',
      accessCode: 'MB-1001',
      nativeLanguage: 'en-US',
    };
    handleSaveUser(demoData);
    navigate('/patient');
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none font-sans">
      
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-[#1E293B] border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center mx-auto text-indigo-400 shadow-inner">
            <Brain className="w-9 h-9" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">MemoryBridge</h1>
          <p className="text-xs text-slate-400 font-semibold">Lightweight Dementia Memory Assistant & Caregiver Portal</p>
        </div>

        {/* Quick Demo Login Pill */}
        <button
          onClick={useQuickDemo}
          className="w-full py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
        >
          <Sparkles className="w-4 h-4 text-amber-400" /> Instant Demo Sign-In (Tanisha Profile)
        </button>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-rose-950/60 border border-rose-500/50 text-rose-200 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth Mode Tabs */}
        <div className="flex bg-slate-900 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
          <button
            onClick={() => { setActiveTab('code'); setError(null); }}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'code' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Family Code
          </button>
          <button
            onClick={() => { setActiveTab('login'); setError(null); }}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'login' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Caregiver Login
          </button>
          <button
            onClick={() => { setActiveTab('register'); setError(null); }}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'register' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            New Family
          </button>
        </div>

        {/* TAB 1: FAMILY ACCESS CODE LOGIN */}
        {activeTab === 'code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" /> Enter 6-Digit Family Access Code
              </label>
              <input
                type="text"
                required
                maxLength={7}
                placeholder="e.g. MB-1001"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-900 border border-slate-700 text-white font-mono text-center tracking-widest text-2xl rounded-2xl px-4 py-3 focus:outline-none focus:border-indigo-400 uppercase"
              />
              <p className="text-[11px] text-slate-400 text-center mt-2 font-medium">
                Quick device sign-in for patient mirror webcam stations.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-2xl shadow-lg transition-all text-sm"
            >
              {loading ? 'Authenticating...' : 'Launch Patient Mirror View'}
            </button>
          </form>
        )}

        {/* TAB 2: CAREGIVER EMAIL & PASSWORD LOGIN */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" /> Caregiver Email
              </label>
              <input
                type="email"
                required
                placeholder="demo@memorybridge.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" /> Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl shadow-lg transition-all text-sm"
            >
              {loading ? 'Logging in...' : 'Enter Caregiver Portal'}
            </button>
          </form>
        )}

        {/* TAB 3: REGISTER NEW FAMILY */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-400" /> Patient Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Tanisha"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" /> Caregiver Email
              </label>
              <input
                type="email"
                required
                placeholder="caregiver@family.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" /> Create Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" /> Patient Native Language
              </label>
              <select
                value={nativeLanguage}
                onChange={(e) => setNativeLanguage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                {Object.keys(TRANSLATIONS).map((langKey) => (
                  <option key={langKey} value={langKey}>
                    {TRANSLATIONS[langKey].flag} {TRANSLATIONS[langKey].label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-2xl shadow-lg transition-all text-sm"
            >
              {loading ? 'Creating Family Account...' : 'Register & Generate Family Code'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
