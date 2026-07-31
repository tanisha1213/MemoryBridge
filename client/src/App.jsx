import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import PatientMirror from './pages/PatientMirror';
import CaregiverDashboard from './pages/CaregiverDashboard';
import Login from './pages/Login';
import { Heart, Camera, LayoutDashboard, ShieldCheck, UserCheck } from 'lucide-react';

function LandingPage() {
  const userId = localStorage.getItem('mb_userId');
  const patientName = localStorage.getItem('mb_patientName') || 'Tanisha';
  const accessCode = localStorage.getItem('mb_accessCode') || 'MB-1001';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-3xl w-full text-center space-y-8 z-10">
        
        {/* User Account Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/80 border border-slate-700/80 p-3.5 px-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <div className="text-left">
              <p className="text-xs text-slate-400 font-bold uppercase">Active Family Profile</p>
              <p className="text-sm font-extrabold text-white">{patientName} ({accessCode})</p>
            </div>
          </div>
          <Link
            to="/login"
            className="px-4 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all"
          >
            Switch Account / Code
          </Link>
        </div>

        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            MemoryBridge
          </h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
            A real-time, browser-native dementia memory assistant and caregiver portal. Empowering connection with dignity and safety.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <Link
            to="/patient"
            className="group p-8 rounded-2xl bg-gradient-to-b from-amber-50 to-amber-100 text-slate-900 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col items-center text-center border-2 border-amber-200"
          >
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5 text-amber-800 group-hover:scale-110 transition-transform">
              <Camera className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Patient Mirror View</h2>
            <p className="text-slate-700 text-sm leading-relaxed mb-6">
              Warm cream layout with live webcam feed, real-time facial recognition, giant high-contrast cue cards, and soft voice announcements.
            </p>
            <span className="mt-auto inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 text-amber-200 font-semibold text-sm shadow-md group-hover:bg-slate-800 transition-colors">
              Launch Patient Mirror &rarr;
            </span>
          </Link>

          <Link
            to="/caregiver"
            className="group p-8 rounded-2xl bg-slate-800/90 border border-slate-700/80 hover:border-indigo-500/50 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5 text-indigo-400 group-hover:scale-110 transition-transform">
              <LayoutDashboard className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Caregiver Portal</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Manage unrecognized visitor queue, tag & register family & friends, and set daily reminders for patient care.
            </p>
            <span className="mt-auto inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md group-hover:bg-indigo-500 transition-colors">
              Open Dashboard &rarr;
            </span>
          </Link>
        </div>

        <div className="pt-6 text-xs text-slate-500 flex items-center justify-center gap-4 border-t border-slate-800">
          <span>🔒 Privacy-First • Local WebGL Detection</span>
          <span>•</span>
          <span>Multi-User Isolated Storage</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/patient" element={<PatientMirror />} />
        <Route path="/caregiver" element={<CaregiverDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
