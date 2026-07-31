import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Bell,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Eye,
  Plus,
  RefreshCw,
  Radio,
  X,
  Globe,
  Droplets,
  Pill,
  Sparkles
} from 'lucide-react';
import { TRANSLATIONS, RELATIONSHIP_TRANSLATIONS } from '../i18n/translations';

export default function CaregiverDashboard() {
  const [unknownQueue, setUnknownQueue] = useState([]);
  const [registeredDirectory, setRegisteredDirectory] = useState([]);
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'directory' | 'settings'
  const [loading, setLoading] = useState(true);
  const [notificationMsg, setNotificationMsg] = useState(null);

  // Real-time Socket & Alerts Drawer State
  const [socketConnected, setSocketConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Registration Form State
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    relationship: 'Nephew',
    contextNote: '',
    preferredLanguage: 'en-US',
  });

  // Settings State
  const [patientLanguage, setPatientLanguage] = useState('en-US');
  const socketRef = useRef(null);

  const showNotification = (msg) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(null), 5000);
  };

  // Play audio chime for alerts
  const playAlertChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  };

  // Socket.io Setup
  useEffect(() => {
    const socketUrl = window.location.origin.includes('localhost')
      ? 'http://localhost:5000'
      : window.location.origin;

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('⚡ Caregiver Socket connected:', socket.id);
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    // Real-Time Socket Event Listeners
    socket.on('UNKNOWN_VISITOR_DETECTED', (data) => {
      console.log('🚨 Caregiver received UNKNOWN_VISITOR_DETECTED event:', data);
      playAlertChime();
      
      const newAlert = {
        id: Date.now(),
        type: 'UNKNOWN_VISITOR',
        title: 'Unrecognized Visitor Detected',
        message: 'Camera captured an unrecognized face on Patient Mirror.',
        timestamp: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
        data,
      };

      setNotifications((prev) => [newAlert, ...prev]);
      setUnreadCount((prev) => prev + 1);
      showNotification('📸 New Unrecognized Visitor snapshot received!');
      fetchData();
    });

    socket.on('MISSED_MEDICATION_ALERT', (data) => {
      playAlertChime();
      const newAlert = {
        id: Date.now(),
        type: 'MEDICATION',
        title: 'Missed Medication Alert',
        message: data.message || 'Scheduled medication window passed without verification.',
        timestamp: new Date().toLocaleTimeString(),
      };
      setNotifications((prev) => [newAlert, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    socket.on('HYDRATION_CHECK_ALERT', (data) => {
      playAlertChime();
      const newAlert = {
        id: Date.now(),
        type: 'HYDRATION',
        title: 'Hydration Reminder Triggered',
        message: data.message || 'No water intake logged for > 3 hours.',
        timestamp: new Date().toLocaleTimeString(),
      };
      setNotifications((prev) => [newAlert, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [unknownRes, registeredRes, settingsRes] = await Promise.all([
        fetch('/api/visitors?registered=false'),
        fetch('/api/visitors?registered=true'),
        fetch('/api/settings'),
      ]);

      if (unknownRes.ok) setUnknownQueue(await unknownRes.json());
      if (registeredRes.ok) setRegisteredDirectory(await registeredRes.json());
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.nativeLanguage) setPatientLanguage(s.nativeLanguage);
      }
    } catch (err) {
      console.error('Error fetching caregiver data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectSnapshot = (visitor) => {
    setSelectedSnapshot(visitor);
    setFormData({
      name: visitor.name !== 'Unrecognized Person' ? visitor.name : '',
      relationship: 'Nephew',
      contextNote: '',
      preferredLanguage: visitor.preferredLanguage || 'en-US',
    });
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSnapshot || !formData.name || !formData.relationship) {
      showNotification('⚠️ Please enter a Name and Relationship');
      return;
    }

    try {
      const payload = {
        id: selectedSnapshot._id,
        name: formData.name,
        relationship: formData.relationship,
        contextNote: formData.contextNote,
        preferredLanguage: formData.preferredLanguage,
        faceDescriptor: selectedSnapshot.faceDescriptor,
        photoThumbnail: selectedSnapshot.photoThumbnail,
      };

      const res = await fetch('/api/visitors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showNotification(`✅ Registered ${formData.name} to Memory Bank!`);
        setSelectedSnapshot(null);
        setFormData({ name: '', relationship: 'Nephew', contextNote: '', preferredLanguage: 'en-US' });
        fetchData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        showNotification(`⚠️ Save Error: ${errJson.error || res.statusText}`);
      }
    } catch (err) {
      showNotification(`❌ Error registering visitor: ${err.message}`);
    }
  };

  const handleDeleteVisitor = async (id, name) => {
    if (!window.confirm(`Delete ${name} from memory bank?`)) return;
    try {
      const res = await fetch(`/api/visitors/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`🗑️ Removed ${name}`);
        fetchData();
      }
    } catch (err) {
      console.error('Error deleting visitor:', err);
    }
  };

  const handleUpdateLanguage = async (newLang) => {
    try {
      setPatientLanguage(newLang);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nativeLanguage: newLang }),
      });
      if (res.ok) {
        showNotification(`🌐 Updated Patient Language to ${TRANSLATIONS[newLang]?.label}`);
        if (socketRef.current) {
          socketRef.current.emit('PATIENT_SETTINGS_UPDATED', { nativeLanguage: newLang });
        }
      }
    } catch (err) {}
  };

  const triggerTestMedicationAlert = () => {
    if (socketRef.current) {
      socketRef.current.emit('MISSED_MEDICATION_EVENT', {
        message: 'Afternoon pill window (3:30 PM) passed without verification.',
      });
    }
  };

  const triggerTestHydrationAlert = () => {
    if (socketRef.current) {
      socketRef.current.emit('HYDRATION_CHECK_EVENT', {
        message: 'No hydration event detected for 3 hours.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col relative overflow-x-hidden">
      
      {/* Toast Notification Banner */}
      {notificationMsg && (
        <div className="fixed top-6 right-6 z-50 bg-[#1E293B] text-emerald-300 border border-emerald-500/50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-semibold text-sm animate-bounce-short">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* FLOATING CAREGIVER NOTIFICATION DRAWER REQUIREMENT */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#1E293B] border-l border-slate-700 h-full p-6 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Bell className="w-6 h-6 text-emerald-400" /> Caregiver Notifications
              </h3>
              <button
                onClick={() => {
                  setIsDrawerOpen(false);
                  setUnreadCount(0);
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {notifications.length === 0 ? (
                <div className="text-center text-slate-500 py-12">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No new notifications yet.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      n.type === 'UNKNOWN_VISITOR'
                        ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                        : n.type === 'MEDICATION'
                        ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                        : 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <p className="font-bold text-sm">{n.title}</p>
                      <span className="text-[10px] font-mono opacity-70">{n.timestamp}</span>
                    </div>
                    <p className="text-xs mt-1 text-slate-300">{n.message}</p>
                    {n.data && n.data.photoThumbnail && (
                      <img
                        src={n.data.photoThumbnail}
                        alt="Alert Snapshot"
                        className="mt-3 w-24 h-24 object-cover rounded-xl border border-slate-700"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOP REAL-TIME HEADER */}
      <header className="w-full bg-[#1E293B]/80 backdrop-blur border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-4">
          <Link
            to="/patient"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-2 text-sm font-bold"
          >
            <Eye className="w-4 h-4 text-emerald-400" /> Patient View
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-white tracking-tight hidden sm:block">Caregiver Portal</h1>
            {/* LIVE WEBSOCKET STATUS BADGE REQUIREMENT */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                socketConnected
                  ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-400'
                  : 'bg-rose-950/80 border border-rose-500/50 text-rose-400'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`} />
              {socketConnected ? '🟢 System Online' : '🔴 Socket Disconnected'}
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIsDrawerOpen(true);
              setUnreadCount(0);
            }}
            className="relative p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all"
            title="Open Notification Drawer"
          >
            <Bell className="w-5 h-5 text-emerald-400" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-8">
        
        {/* TOP METRICS & QUICK ACTIONS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#1E293B] border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold text-slate-400">Unrecognized Queue</p>
              <p className="text-3xl font-extrabold text-rose-400 mt-1">{unknownQueue.length}</p>
            </div>
            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-[#1E293B] border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-bold text-slate-400">Memory Directory</p>
              <p className="text-3xl font-extrabold text-emerald-400 mt-1">{registeredDirectory.length}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* PATIENT NATIVE LANGUAGE SELECTOR REQUIREMENT */}
          <div className="bg-[#1E293B] border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
            <p className="text-xs uppercase font-bold text-slate-400 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-indigo-400" /> Patient Native Voice
            </p>
            <div className="flex gap-1.5 mt-2">
              {Object.keys(TRANSLATIONS).map((langKey) => (
                <button
                  key={langKey}
                  onClick={() => handleUpdateLanguage(langKey)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    patientLanguage === langKey
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {TRANSLATIONS[langKey].flag} {langKey.split('-')[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* SIMULATION TEST BUTTONS */}
          <div className="bg-[#1E293B] border border-slate-800 p-4 rounded-2xl flex flex-col justify-between space-y-2">
            <p className="text-xs uppercase font-bold text-slate-400">Test Alert Triggers</p>
            <div className="flex items-center gap-2">
              <button
                onClick={triggerTestMedicationAlert}
                className="flex-1 py-1.5 px-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
              >
                <Pill className="w-3.5 h-3.5" /> Pill Alert
              </button>
              <button
                onClick={triggerTestHydrationAlert}
                className="flex-1 py-1.5 px-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
              >
                <Droplets className="w-3.5 h-3.5" /> Water Alert
              </button>
            </div>
          </div>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex border-b border-slate-800 space-x-6">
          <button
            onClick={() => setActiveTab('queue')}
            className={`pb-3 text-sm font-extrabold flex items-center gap-2 transition-all border-b-2 ${
              activeTab === 'queue'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" /> Unrecognized Queue ({unknownQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`pb-3 text-sm font-extrabold flex items-center gap-2 transition-all border-b-2 ${
              activeTab === 'directory'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Registered Memory Bank ({registeredDirectory.length})
          </button>
        </div>

        {/* SECTION 1: UNRECOGNIZED VISITORS QUEUE & TAGGING FORM */}
        {activeTab === 'queue' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Queue List */}
            <div className="lg:col-span-7 space-y-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-rose-400" /> Recent Unknown Snapshots
              </h2>

              {unknownQueue.length === 0 ? (
                <div className="bg-[#1E293B] border border-slate-800 p-8 rounded-2xl text-center space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto opacity-80" />
                  <p className="text-base font-bold text-white">Queue Empty</p>
                  <p className="text-xs text-slate-400">All visitors have been recognized or tagged.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {unknownQueue.map((visitor) => (
                    <div
                      key={visitor._id}
                      onClick={() => handleSelectSnapshot(visitor)}
                      className={`bg-[#1E293B] border-2 p-4 rounded-2xl cursor-pointer transition-all ${
                        selectedSnapshot?._id === visitor._id
                          ? 'border-emerald-400 bg-slate-800 shadow-xl'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-950 mb-3 border border-slate-800 relative">
                        <img
                          src={visitor.photoThumbnail}
                          alt="Snapshot"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-2 right-2 bg-slate-900/80 px-2 py-1 rounded-md text-[10px] font-mono text-slate-300">
                          {new Date(visitor.lastSeen || visitor.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-white">Unrecognized Visitor</p>
                          <p className="text-xs text-slate-400">Captured by Camera</p>
                        </div>
                        <button className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/30 hover:bg-emerald-500/30">
                          Tag Person
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Tagging Form */}
            <div className="lg:col-span-5">
              <div className="bg-[#1E293B] border border-slate-800 p-6 rounded-3xl sticky top-24 space-y-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <UserPlus className="w-5 h-5 text-emerald-400" /> Identify & Register Profile
                </h3>

                {selectedSnapshot ? (
                  <form onSubmit={handleRegisterSubmit} className="space-y-4">
                    <div className="flex items-center gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
                      <img
                        src={selectedSnapshot.photoThumbnail}
                        alt="Thumbnail"
                        className="w-16 h-16 object-cover rounded-xl border border-slate-700"
                      />
                      <div>
                        <p className="text-xs uppercase font-bold text-slate-400">Snapshot Selected</p>
                        <p className="text-xs font-mono text-slate-300">
                          {new Date(selectedSnapshot.lastSeen || selectedSnapshot.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rahul Sharma"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Relationship</label>
                      <select
                        value={formData.relationship}
                        onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
                      >
                        {Object.keys(RELATIONSHIP_TRANSLATIONS).map((rel) => (
                          <option key={rel} value={rel}>{rel}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Context Note</label>
                      <textarea
                        rows={3}
                        placeholder="e.g. He lives in Pune and visits on Tuesdays."
                        value={formData.contextNote}
                        onChange={(e) => setFormData({ ...formData, contextNote: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Preferred Language</label>
                      <select
                        value={formData.preferredLanguage}
                        onChange={(e) => setFormData({ ...formData, preferredLanguage: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400"
                      >
                        {Object.keys(TRANSLATIONS).map((langKey) => (
                          <option key={langKey} value={langKey}>
                            {TRANSLATIONS[langKey].flag} {TRANSLATIONS[langKey].label} ({langKey})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl shadow-lg transition-all"
                    >
                      Save to Memory Bank
                    </button>
                  </form>
                ) : (
                  <div className="py-12 text-center text-slate-500">
                    <UserPlus className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-semibold">Select a snapshot on the left to tag and save.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* SECTION 2: REGISTERED MEMORY BANK DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Registered Known Visitors
            </h2>

            {registeredDirectory.length === 0 ? (
              <div className="bg-[#1E293B] border border-slate-800 p-12 rounded-3xl text-center space-y-2">
                <Users className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-[#FFFDD0] font-bold text-lg">No Registered Visitors</p>
                <p className="text-xs text-slate-400">Tag snapshots from the Unrecognized Queue to build your memory bank.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {registeredDirectory.map((visitor) => (
                  <div key={visitor._id} className="bg-[#1E293B] border border-slate-800 p-5 rounded-3xl space-y-4 hover:border-slate-700 transition-all shadow-lg">
                    <div className="aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800">
                      <img
                        src={visitor.photoThumbnail}
                        alt={visitor.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-extrabold text-white">{visitor.name}</h3>
                        <span className="inline-block mt-1 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-full text-xs font-bold">
                          {visitor.relationship}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteVisitor(visitor._id, visitor.name)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete from memory bank"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-sm text-slate-300 font-medium">"{visitor.contextNote || 'No context note added.'}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
