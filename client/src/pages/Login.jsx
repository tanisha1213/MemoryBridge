import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, KeyRound, Mail, Lock, Sparkles, CheckCircle2, ArrowRight, ShieldCheck, Copy, Check } from 'lucide-react';
import { TRANSLATIONS } from '../i18n/translations';

export default function Login() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register' | 'code'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [createdCode, setCreatedCode] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form Fields
  const [accessCode, setAccessCode] = useState('MB-1001');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  // 1. Caregiver Log In (Existing Account)
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
        setErrorMessage(err.error || 'Invalid email or password. Please try again.');
      }
    } catch (err) {
      setErrorMessage('Connection error. Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  // 2. New Family Sign Up (Generates Unique Member Code + Clean Slate)
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    // Validate Confirm Password
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter passwords.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, patientName, nativeLanguage }),
      });
      if (res.ok) {
        const data = await res.json();
        handleSaveUser(data);
        setCreatedCode(data.accessCode);
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMessage(err.error || 'Registration failed. Email may already be in use.');
      }
    } catch (err) {
      setErrorMessage('Connection error. Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Patient Mirror Access Code Login
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
        setErrorMessage(err.error || 'Invalid Member Access Code');
      }
    } catch (err) {
      setErrorMessage('Connection error. Please try again.');
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <p className="text-sm text-slate-400 font-medium">Smart AI Memory Companion & Patient Mirror</p>
        </div>

        {/* 1-CLICK INSTANT DEMO SIGN-IN */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/40 p-4 rounded-2xl space-y-3 text-center">
          <div className="flex items-center justify-center gap-2 text-amber-300 text-sm font-bold">
            <Sparkles className="w-4 h-4" /> Quick Demo Sign-In
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
          <div className="bg-rose-500/20 border border-rose-500/40 p-3.5 rounded-2xl text-rose-300 text-xs font-bold text-center">
            {errorMessage}
          </div>
        )}

        {/* ACCOUNT CREATED SUCCESS MODAL WITH PATIENT MEMBER CODE */}
        {createdCode ? (
          <div className="bg-emerald-500/10 border-2 border-emerald-500/60 p-6 rounded-2xl space-y-4 text-center animate-fade-in">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-xl font-extrabold text-white">🎉 Account Created Successfully!</h3>
            <p className="text-xs text-slate-300">
              Your new family account is live with a <strong>100% Clean Slate</strong>.
            </p>
            
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs uppercase font-bold text-slate-400 block">Your Patient Member Access Code:</span>
              <div className="flex items-center justify-center gap-3">
                <span className="text-3xl font-mono font-extrabold text-emerald-400 tracking-widest">{createdCode}</span>
                <button
                  onClick={() => copyToClipboard(createdCode)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-all"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Enter this Member Code into the <strong>Member Code</strong> tab on the Patient's tablet/device to link camera detection!
            </p>

            <button
              onClick={() => navigate('/caregiver')}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              Enter Caregiver Portal <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* TABS FOR LOGIN / SIGN UP / MEMBER CODE */}
            <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 text-xs font-bold">
              <button
                onClick={() => { setActiveTab('login'); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl transition-all ${
                  activeTab === 'login' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => { setActiveTab('register'); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl transition-all ${
                  activeTab === 'register' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign Up
              </button>
              <button
                onClick={() => { setActiveTab('code'); setErrorMessage(null); }}
                className={`flex-1 py-2.5 rounded-xl transition-all ${
                  activeTab === 'code' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                🔑 Member Code
              </button>
            </div>

            {/* TAB 1: LOG IN */}
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
                      placeholder="caregiver@email.com"
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
                  {loading ? 'Logging in...' : 'Log In to Caregiver Portal'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* TAB 2: SIGN UP */}
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
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-400" /> Caregiver Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="caregiver@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
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
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Confirm Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                  {loading ? 'Creating Account...' : 'Sign Up & Get Member Code'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* TAB 3: MEMBER CODE LOGIN (FOR PATIENT MIRROR DEVICE) */}
            {activeTab === 'code' && (
              <form onSubmit={handleCodeSubmit} className="space-y-4">
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <label className="block text-xs font-bold uppercase text-slate-300 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-indigo-400" /> Enter 6-Digit Member Code
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
                    Enter the Member Code to link this mirror view to your caregiver.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-2"
                >
                  {loading ? 'Linking...' : 'Launch Patient Mirror View'} <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </>
        )}

      </div>
    </div>
  );
}
