import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, KeyRound, Mail, Lock, User, Globe, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations';

export default function Login() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('code'); // 'code' | 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [createdCode, setCreatedCode] = useState(null);

  // Forms
  const [accessCode, setAccessCode] = useState('MB-1001');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [patientName, setPatientName] = useState('');
  const [nativeLanguage, setNativeLanguage] = useState('en-US');

  const handleSaveUser = (userData) => {
    localStorage.setItem('mb_userId', userData._id || 'usr_' + Date.now());
    localStorage.setItem('mb_userEmail', userData.email || email);
    localStorage.setItem('mb_accessCode', userData.accessCode || accessCode);
    localStorage.setItem('mb_patientName', userData.patientName || patientName || 'Elder Patient');
    if (userData.nativeLanguage) {
      localStorage.setItem('mb_nativeLanguage', userData.nativeLanguage);
    }
  };

  // 1. Patient Member ID / Access Code Sign-In
  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode }),
      });
      if (res.ok) {
        const data = await res.json();
        handleSaveUser(data);
        navigate('/patient');
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Invalid Family Access Code');
      }
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Caregiver Email/Password Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        handleSaveUser(data);
        navigate('/caregiver');
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Invalid email or password');
      }
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. New Family Account Registration (Creates brand new clean family room)
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, patientName, nativeLanguage }),
      });
      if (res.ok) {
        const data = await res.json();
        handleSaveUser(data);
        navigate('/caregiver');
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Registration failed. Please check details and try again.');
      }
    } catch (err) {
      setErrorMessage('Connection error. Could not connect to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const useQuickDemo = (destination = '/patient') => {
    const demoData = {
      _id: 'usr_demo_100',
      email: 'demo@memorybridge.com',
      patientName: 'Tanisha',
      accessCode: 'MB-1001',
      nativeLanguage: 'en-US',
    };
    handleSaveUser(demoData);
    navigate(destination);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none font-sans">
      
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-lg bg-[#1E293B] border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6 relative z-10">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center mx-auto text-indigo-400 shadow-inner">
            <Brain className="w-9 h-9" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">MemoryBridge</h1>
          <p className="text-sm text-slate-400 font-medium">Select how you would like to sign in:</p>
        </div>

        {/* 1-CLICK INSTANT DEMO SIGN-IN */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/40 p-4 rounded-2xl space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-300 text-sm font-bold">
            <Sparkles className="w-4 h-4" /> 1-Click Quick Demo Sign-In
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => useQuickDemo('/patient')}
              className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-xl text-xs shadow transition-all flex items-center justify-center gap-1.5"
            >
              Patient View &rarr;
            </button>
            <button
              onClick={() => useQuickDemo('/caregiver')}
              className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow transition-all flex items-center justify-center gap-1.5"
            >
              Caregiver Portal &rarr;
            </button>
          </div>
        </div>

        {/* ERROR MESSAGE DISPLAY */}
        {errorMessage && (
          <div className="bg-rose-500/20 border border-rose-500/40 p-3 rounded-2xl text-rose-300 text-xs font-bold text-center">
            {errorMessage}
          </div>
        )}

        {/* ACCOUNT CREATED CONFIRMATION MODAL */}
        {createdCode ? (
          <div className="bg-emerald-500/20 border-2 border-emerald-400 p-5 rounded-2xl space-y-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-extrabold text-white">🎉 New Family Account Created!</h3>
            <p className="text-xs text-slate-300">
              Your new family account has been initialized with a <strong>100% Clean Slate (0 visitors, 0 reminders)</strong>.
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-xs uppercase font-bold text-slate-400 block mb-1">Your Patient Member Code:</span>
              <span className="text-2xl font-mono font-extrabold text-emerald-400 tracking-widest">{createdCode}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Enter this Member Code into the Patient Mirror View device to pair camera detection!
            </p>
            <button
              onClick={() => navigate('/caregiver')}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-sm transition-all shadow-lg"
            >
              Enter Caregiver Portal &rarr;
            </button>
          </div>
        ) : (
          <>
            {/* SIMPLE SIGN-IN MODE TABS */}
            <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold">
              <button
                onClick={() => { setActiveTab('code'); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl transition-all ${
                  activeTab === 'code' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                🔑 Member Code
              </button>
              <button
                onClick={() => { setActiveTab('login'); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl transition-all ${
                  activeTab === 'login' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                📧 Caregiver Login
              </button>
              <button
                onClick={() => { setActiveTab('register'); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl transition-all ${
                  activeTab === 'register' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                ✨ New Family
              </button>
            </div>

        {/* MODE 1: FAMILY CODE */}
        {activeTab === 'code' && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
              <label className="block text-xs font-bold uppercase text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-400" /> Enter 6-Digit Family Code
              </label>
              <input
                type="text"
                required
                maxLength={7}
                placeholder="MB-1001"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-2xl rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-400 uppercase"
              />
              <p className="text-xs text-slate-400 text-center font-medium">
                Enter your family code to launch the Patient Mirror Camera.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
            >
              {loading ? 'Launching...' : 'Launch Patient Mirror View'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* MODE 2: CAREGIVER LOGIN */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-3">
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
            >
              {loading ? 'Signing in...' : 'Enter Caregiver Portal'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* MODE 3: NEW FAMILY REGISTER */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Patient Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Tanisha"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Caregiver Email</label>
              <input
                type="email"
                required
                placeholder="caregiver@family.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Patient Native Language</label>
              <select
                value={nativeLanguage}
                onChange={(e) => setNativeLanguage(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
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
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-2 mt-2"
            >
              {loading ? 'Creating Account...' : 'Create Family Account'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
        </>
        )}

      </div>
    </div>
  );
}
