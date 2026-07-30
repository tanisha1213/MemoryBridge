import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Bell,
  Clock,
  Trash2,
  CheckCircle2,
  Camera,
  ShieldCheck,
  Plus,
  Tag,
  FileText,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  Eye,
  Sparkles,
  X
} from 'lucide-react';

export default function CaregiverDashboard() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'directory' | 'reminders'

  // Data states
  const [unknownQueue, setUnknownQueue] = useState([]);
  const [registeredVisitors, setRegisteredVisitors] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  // Registration Modal State
  const [selectedVisitorForRegistration, setSelectedVisitorForRegistration] = useState(null);
  const [regForm, setRegForm] = useState({
    name: '',
    relationship: '',
    contextNote: '',
  });

  // Manual Add Visitor Form State
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    name: '',
    relationship: '',
    contextNote: '',
    photoThumbnail: '',
  });

  // Reminder Form State
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('02:00 PM');

  // Load all dashboard data
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [unknownRes, registeredRes, remindersRes] = await Promise.all([
        fetch('/api/visitors?registered=false'),
        fetch('/api/visitors?registered=true'),
        fetch('/api/reminders'),
      ]);

      if (unknownRes.ok) setUnknownQueue(await unknownRes.json());
      if (registeredRes.ok) setRegisteredVisitors(await registeredRes.json());
      if (remindersRes.ok) setReminders(await remindersRes.json());
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    // Auto refresh queue and directory every 4 seconds
    const interval = setInterval(fetchAllData, 4000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Open registration modal for an unrecognized snapshot
  const openRegisterModal = (visitor) => {
    setSelectedVisitorForRegistration(visitor);
    setRegForm({
      name: visitor.name !== 'Unrecognized Person' ? visitor.name : '',
      relationship: visitor.relationship !== 'Unknown' ? visitor.relationship : '',
      contextNote: visitor.contextNote !== 'Captured by patient camera' ? visitor.contextNote : '',
    });
  };

  // Submit Registration Form
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVisitorForRegistration || !regForm.name || !regForm.relationship) {
      showToast('Name and Relationship are required.');
      return;
    }

    try {
      const payload = {
        id: selectedVisitorForRegistration._id,
        name: regForm.name,
        relationship: regForm.relationship,
        contextNote: regForm.contextNote,
        photoThumbnail: selectedVisitorForRegistration.photoThumbnail,
        faceDescriptor: selectedVisitorForRegistration.faceDescriptor || [],
      };

      const res = await fetch('/api/visitors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(`Successfully registered ${regForm.name} as ${regForm.relationship}!`);
        setSelectedVisitorForRegistration(null);
        fetchAllData();
      } else {
        showToast('Error registering visitor');
      }
    } catch (err) {
      console.error('Registration error:', err);
      showToast('Network error during registration');
    }
  };

  // Delete a visitor record
  const handleDeleteVisitor = async (id) => {
    if (!window.confirm('Are you sure you want to remove this visitor record?')) return;
    try {
      const res = await fetch(`/api/visitors/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Visitor deleted');
        fetchAllData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Add Reminder
  const handleAddReminder = async (e) => {
    e.preventDefault();
    if (!newReminderTitle || !newReminderTime) return;

    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newReminderTitle, time: newReminderTime }),
      });

      if (res.ok) {
        showToast('New reminder created for patient mirror view');
        setNewReminderTitle('');
        fetchAllData();
      }
    } catch (err) {
      console.error('Add reminder error:', err);
    }
  };

  // Delete Reminder
  const handleDeleteReminder = async (id) => {
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Reminder removed');
        fetchAllData();
      }
    } catch (err) {
      console.error('Delete reminder error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      
      {/* Toast Notification Banner */}
      {actionMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          {actionMessage}
        </div>
      )}

      {/* Modern Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-white">MemoryBridge</h1>
                <p className="text-xs text-indigo-400 font-semibold">Caregiver Command Center</p>
              </div>
            </Link>

            {/* Quick Status Pill Requirement */}
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              🟢 Patient Camera Active
            </div>
          </div>

          {/* Navigation Tabs Requirement */}
          <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/70 overflow-x-auto">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'queue'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Users className="w-4 h-4" />
              Visitor Queue
              {unknownQueue.length > 0 && (
                <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-amber-500 text-slate-900 font-extrabold">
                  {unknownQueue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'directory'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              Registered Directory ({registeredVisitors.length})
            </button>

            <button
              onClick={() => setActiveTab('reminders')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'reminders'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Bell className="w-4 h-4" />
              Daily Reminders ({reminders.length})
            </button>
          </div>

          {/* Patient View Switcher */}
          <Link
            to="/patient"
            className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-bold transition-all"
          >
            <Camera className="w-4 h-4" /> Switch to Patient Mirror
          </Link>

        </div>
      </header>

      {/* Main Container Spacing Requirement (max-w-7xl mx-auto p-8) */}
      <main className="max-w-7xl mx-auto p-8 space-y-8">

        {/* Dashboard Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/50 border border-slate-800 p-6 rounded-3xl">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Caregiver Management</h2>
            <p className="text-sm text-slate-400 mt-1">
              Identify unrecognized face captures, maintain the family memory directory, and coordinate daily reminders.
            </p>
          </div>
          <button
            onClick={fetchAllData}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-semibold flex items-center gap-2 transition-colors self-start md:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
          </button>
        </div>

        {/* TAB 1: UNRECOGNIZED VISITOR QUEUE */}
        {activeTab === 'queue' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" /> Unrecognized Visitor Queue
                </h3>
                <p className="text-sm text-slate-400">
                  Photos captured automatically by the patient's mirror camera when an unknown face is detected.
                </p>
              </div>
            </div>

            {unknownQueue.length === 0 ? (
              <div className="bg-slate-800/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-xl font-bold text-white">No Unrecognized Visitors in Queue</h4>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  When someone unrecognized steps in front of the patient mirror, their snapshot will appear here for identification and memory note tagging.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {unknownQueue.map((visitor) => (
                  <div
                    key={visitor._id}
                    className="bg-slate-800 border border-slate-700/80 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between group hover:border-indigo-500/50 transition-all"
                  >
                    <div className="relative aspect-video bg-slate-900 overflow-hidden">
                      <img
                        src={visitor.photoThumbnail}
                        alt="Unrecognized Visitor"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs font-extrabold shadow">
                        Needs Identification
                      </div>
                      <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur text-slate-300 text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(visitor.lastSeen || visitor.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-lg font-bold text-white mb-1">Unknown Visitor</h4>
                        <p className="text-xs text-slate-400">Captured by Patient Mirror AI</p>
                      </div>

                      <div className="pt-2 flex items-center gap-3">
                        <button
                          onClick={() => openRegisterModal(visitor)}
                          className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all"
                        >
                          <Tag className="w-4 h-4" /> Tag & Save Visitor
                        </button>
                        <button
                          onClick={() => handleDeleteVisitor(visitor._id)}
                          className="p-3 rounded-xl bg-slate-700/60 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors"
                          title="Discard snapshot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REGISTERED DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" /> Registered Memory Directory
                </h3>
                <p className="text-sm text-slate-400">
                  Friends, family, and caregivers registered with 128-dimensional facial descriptors and memory context notes.
                </p>
              </div>
            </div>

            {registeredVisitors.length === 0 ? (
              <div className="bg-slate-800/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
                <Users className="w-12 h-12 text-slate-600 mx-auto" />
                <h4 className="text-xl font-bold text-white">No Registered Visitors Yet</h4>
                <p className="text-sm text-slate-400">
                  Tag visitors from the Visitor Queue to start building the patient's recognition directory.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {registeredVisitors.map((visitor) => (
                  <div
                    key={visitor._id}
                    className="bg-slate-800 border border-slate-700/80 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-between hover:border-emerald-500/50 transition-all"
                  >
                    <div className="relative aspect-video bg-slate-900 overflow-hidden">
                      {visitor.photoThumbnail ? (
                        <img
                          src={visitor.photoThumbnail}
                          alt={visitor.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-950 text-indigo-400 font-bold text-2xl">
                          {visitor.name.charAt(0)}
                        </div>
                      )}
                      <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-emerald-500 text-slate-950 text-xs font-extrabold shadow">
                        {visitor.relationship}
                      </div>
                    </div>

                    <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        <h4 className="text-xl font-extrabold text-white">{visitor.name}</h4>
                        <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-700/60">
                          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1">Memory Cue Note</p>
                          <p className="text-sm text-slate-200 leading-relaxed italic">
                            "{visitor.contextNote || 'No specific memory note added.'}"
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-700/60">
                        <span className="flex items-center gap-1 text-emerald-400 font-medium">
                          <Sparkles className="w-3.5 h-3.5" /> 128-D Face Encoded
                        </span>
                        <button
                          onClick={() => handleDeleteVisitor(visitor._id)}
                          className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Remove from directory"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: DAILY REMINDERS */}
        {activeTab === 'reminders' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Create Reminder Form */}
            <div className="lg:col-span-5 bg-slate-800 border border-slate-700/80 p-6 rounded-3xl space-y-6 shadow-xl">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-400" /> Create Patient Reminder
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Add schedule prompts that render on the patient's mirror screen.
                </p>
              </div>

              <form onSubmit={handleAddReminder} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">Reminder Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Drink Water or Take Afternoon Medicine"
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">Scheduled Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 2:00 PM"
                    value={newReminderTime}
                    onChange={(e) => setNewReminderTime(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  <Bell className="w-4 h-4" /> Add Daily Reminder
                </button>
              </form>
            </div>

            {/* Active Reminders List */}
            <div className="lg:col-span-7 bg-slate-800 border border-slate-700/80 p-6 rounded-3xl space-y-6 shadow-xl">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-400" /> Active Patient Reminders ({reminders.length})
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Live checklist shown on the Patient Mirror screen.
                </p>
              </div>

              {reminders.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No active reminders created yet.</p>
              ) : (
                <div className="space-y-3">
                  {reminders.map((reminder) => (
                    <div
                      key={reminder._id}
                      className="p-4 rounded-2xl bg-slate-900 border border-slate-700/80 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            reminder.isCompleted ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'
                          }`}
                        />
                        <div>
                          <p className={`font-bold text-base ${reminder.isCompleted ? 'text-slate-400 line-through' : 'text-white'}`}>
                            {reminder.title}
                          </p>
                          <p className="text-xs text-slate-400">{reminder.time}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteReminder(reminder._id)}
                        className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete reminder"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* REGISTRATION MODAL FOR UNRECOGNIZED VISITOR */}
      {selectedVisitorForRegistration && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-fade-in relative">
            <button
              onClick={() => setSelectedVisitorForRegistration(null)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 border-b border-slate-700 pb-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 shrink-0">
                <img
                  src={selectedVisitorForRegistration.photoThumbnail}
                  alt="Snapshot"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Identify & Register Visitor</h3>
                <p className="text-xs text-indigo-400 font-semibold">128-D Face Features Captured</p>
              </div>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Relationship <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nephew, Daughter, Doctor, Primary Caregiver"
                  value={regForm.relationship}
                  onChange={(e) => setRegForm({ ...regForm, relationship: e.target.value })}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Context Memory Note (Spoken to patient)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. He lives in Pune and visits on Tuesdays."
                  value={regForm.contextNote}
                  onChange={(e) => setRegForm({ ...regForm, contextNote: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm font-medium"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedVisitorForRegistration(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" /> Save Visitor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
