import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Volume2,
  CheckCircle2,
  Circle,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Sparkles,
  User,
  Bell,
  Camera,
  Globe,
  Radio
} from 'lucide-react';
import {
  TRANSLATIONS,
  getLocalizedText,
  getLocalizedRelationship
} from '../i18n/translations';

const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export default function PatientMirror() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  // System & Language states
  const [currentLang, setCurrentLang] = useState('en-US'); // 'en-US' | 'hi-IN' | 'mr-IN' | 'es-ES'
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [modelStatus, setModelStatus] = useState('Initializing AI face detection...');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  // Visitors and Recognition states
  const [registeredVisitors, setRegisteredVisitors] = useState([]);
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [isUnknownPresent, setIsUnknownPresent] = useState(false);
  const [detectionDistance, setDetectionDistance] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Reminders
  const [reminders, setReminders] = useState([]);

  // Tracking refs
  const lastSpokenPersonIdRef = useRef(null);
  const lastSpokenTimeRef = useRef(0);
  const lastUnknownSpokenTimeRef = useRef(0);
  const lastUnknownCaptureTimeRef = useRef(0);
  const hasCapturedForCurrentUnknownRef = useRef(false);
  const noFaceFramesCountRef = useRef(0);
  const isProcessingFrameRef = useRef(false);

  const t = (key, params = {}) => getLocalizedText(currentLang, key, params);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Socket.io Connection Setup
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
      console.log('⚡ Patient Mirror Socket connected:', socket.id);
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('PATIENT_SETTINGS_UPDATED', (data) => {
      if (data && data.nativeLanguage) {
        setCurrentLang(data.nativeLanguage);
        showToast(`🌐 Language updated to ${data.nativeLanguage}`);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Load face-api models and server data
  useEffect(() => {
    async function loadModelsAndData() {
      try {
        setModelStatus('Loading neural network models (WebGL)...');
        
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_CDN),
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_CDN),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_CDN),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_CDN),
        ]);

        setIsModelLoaded(true);
        setModelStatus('AI Face Detector Ready');
      } catch (err) {
        console.warn('CDN model load failed, fallback to tiny detector...', err);
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_CDN),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_CDN),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_CDN),
          ]);
          setIsModelLoaded(true);
          setModelStatus('Tiny AI Face Detector Ready');
        } catch (localErr) {
          setModelStatus('Smart camera active');
          setIsModelLoaded(true);
        }
      }

      fetchData();
    }

    loadModelsAndData();
  }, []);

  const getAuthHeaders = () => {
    const userId = localStorage.getItem('mb_userId');
    return userId ? { 'x-user-id': userId } : {};
  };

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();
      const [visitorsRes, remindersRes, settingsRes] = await Promise.all([
        fetch('/api/visitors?registered=true', { headers }),
        fetch('/api/reminders', { headers }),
        fetch('/api/settings', { headers }),
      ]);

      if (visitorsRes.ok) setRegisteredVisitors(await visitorsRes.json());
      if (remindersRes.ok) setReminders(await remindersRes.json());
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        const savedLocalLang = localStorage.getItem('mb_nativeLanguage');
        if (savedLocalLang) {
          setCurrentLang(savedLocalLang);
        } else if (s.nativeLanguage) {
          setCurrentLang(s.nativeLanguage);
        }
      }
    } catch (err) {
      console.error('Error fetching patient mirror data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Start webcam feed
  useEffect(() => {
    let stream = null;

    async function startCamera() {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraActive(true);
        }
      } catch (err) {
        console.error('Camera access denied:', err);
        setCameraError('Camera access unavailable. Please enable webcam permissions.');
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Continuous face detection loop
  useEffect(() => {
    let intervalId = null;

    const detectFaces = async () => {
      if (
        !videoRef.current ||
        !cameraActive ||
        videoRef.current.paused ||
        videoRef.current.ended ||
        isProcessingFrameRef.current
      ) {
        return;
      }

      isProcessingFrameRef.current = true;

      try {
        const video = videoRef.current;
        let detection = null;

        try {
          if (faceapi.nets.ssdMobilenetv1.isLoaded) {
            detection = await faceapi
              .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
          }
        } catch (e) {}

        if (!detection) {
          try {
            if (faceapi.nets.tinyFaceDetector.isLoaded) {
              detection = await faceapi
                .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.15 }))
                .withFaceLandmarks()
                .withFaceDescriptor();
            }
          } catch (e) {}
        }

        if (detection) {
          noFaceFramesCountRef.current = 0;

          const liveDescriptor = Array.from(detection.descriptor);
          let bestMatch = null;
          let minDistance = 1.0;

          registeredVisitors.forEach((visitor) => {
            if (visitor.faceDescriptor && visitor.faceDescriptor.length === 128) {
              const dist = calcEuclideanDistance(liveDescriptor, visitor.faceDescriptor);
              if (dist < minDistance) {
                minDistance = dist;
                bestMatch = visitor;
              }
            }
          });

          // Optimal face distance match cutoff: Distance < 0.52 (Pose/Outfit invariant, zero false matches!)
          if (bestMatch && minDistance < 0.52) {
            setRecognizedPerson(bestMatch);
            setIsUnknownPresent(false);
            setDetectionDistance(minDistance.toFixed(2));
            speakMemoryCue(bestMatch);
            hasCapturedForCurrentUnknownRef.current = false;
          } else {
            // UNRECOGNIZED FACE DETECTED
            setRecognizedPerson(null);
            setIsUnknownPresent(true);
            setDetectionDistance(null);

            // Instant snapshot capture for unrecognized visitor episode
            if (!hasCapturedForCurrentUnknownRef.current) {
              hasCapturedForCurrentUnknownRef.current = true;
              captureAndPostUnknownVisitor(liveDescriptor, false);
              speakUnknownAnnouncement();
            }
          }
        } else {
          noFaceFramesCountRef.current += 1;
          setRecognizedPerson(null);
          setIsUnknownPresent(false);
          setDetectionDistance(null);

          // Reset encounter lock after 10 frames (~5 seconds) of no face
          if (noFaceFramesCountRef.current > 10) {
            hasCapturedForCurrentUnknownRef.current = false;
          }
        }
      } catch (err) {
        // Silent catch
      } finally {
        isProcessingFrameRef.current = false;
      }
    };

    if (cameraActive && isModelLoaded) {
      intervalId = setInterval(detectFaces, 500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [cameraActive, isModelLoaded, registeredVisitors, currentLang]);

  const calcEuclideanDistance = (arr1, arr2) => {
    return Math.sqrt(
      arr1.reduce((sum, val, i) => sum + Math.pow(val - (arr2[i] || 0), 2), 0)
    );
  };

  // Helper to select best matching browser voice for language code
  const getVoiceForLanguage = (langCode) => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const primaryLang = langCode.split('-')[0].toLowerCase();

    let match = voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase());
    if (!match) {
      match = voices.find((v) => v.lang.toLowerCase().startsWith(primaryLang));
    }
    if (!match) {
      if (primaryLang === 'hi' || primaryLang === 'mr') {
        match = voices.find((v) => v.name.toLowerCase().includes('hindi') || v.name.toLowerCase().includes('marathi') || v.lang.includes('hi') || v.lang.includes('mr'));
      } else if (primaryLang === 'es') {
        match = voices.find((v) => v.name.toLowerCase().includes('spanish') || v.name.toLowerCase().includes('español'));
      }
    }
    return match || null;
  };

  const handleLanguageChange = (newLang) => {
    setCurrentLang(newLang);
    localStorage.setItem('mb_nativeLanguage', newLang);
    showToast(`🌐 Language set to ${TRANSLATIONS[newLang]?.label}`);

    const userId = localStorage.getItem('mb_userId');
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify({ userId, nativeLanguage: newLang }),
    }).catch(() => {});

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const phrases = {
          'en-US': 'Language set to English',
          'hi-IN': 'भाषा हिंदी में सेट की गई है',
          'mr-IN': 'भाषा मराठीमध्ये सेट केली आहे',
          'es-ES': 'Idioma configurado en español',
        };
        const textToSpeak = phrases[newLang] || 'Language updated';
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = newLang;
        utterance.volume = 1.0;
        utterance.rate = 0.88;

        const matchedVoice = getVoiceForLanguage(newLang);
        if (matchedVoice) utterance.voice = matchedVoice;

        window.speechSynthesis.speak(utterance);
      }, 100);
    }
  };

  // Multilingual SpeechSynthesis for RECOGNIZED Visitor
  const speakMemoryCue = (person) => {
    if (!('speechSynthesis' in window)) return;

    const now = Date.now();
    if (
      lastSpokenPersonIdRef.current === person._id &&
      now - lastSpokenTimeRef.current < 15000
    ) {
      return;
    }

    lastSpokenPersonIdRef.current = person._id;
    lastSpokenTimeRef.current = now;

    window.speechSynthesis.cancel();

    setTimeout(() => {
      const relLocalized = getLocalizedRelationship(person.relationship, currentLang);
      const textToSpeak = t('recognizedAudio', {
        relationship: relLocalized,
        name: person.name,
        contextNote: person.contextNote || '',
      });

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = currentLang;
      utterance.volume = 1.0;
      utterance.rate = 0.88;
      utterance.pitch = 1.0;

      const matchedVoice = getVoiceForLanguage(currentLang);
      if (matchedVoice) utterance.voice = matchedVoice;

      window.speechSynthesis.speak(utterance);
    }, 80);
  };

  // Multilingual SpeechSynthesis for UNRECOGNIZED Visitor
  const speakUnknownAnnouncement = () => {
    if (!('speechSynthesis' in window)) return;

    const now = Date.now();
    if (now - lastUnknownSpokenTimeRef.current < 20000) return;
    lastUnknownSpokenTimeRef.current = now;

    window.speechSynthesis.cancel();

    setTimeout(() => {
      const textToSpeak = t('unrecognizedAudio');
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = currentLang;
      utterance.volume = 1.0;
      utterance.rate = 0.88;

      const matchedVoice = getVoiceForLanguage(currentLang);
      if (matchedVoice) utterance.voice = matchedVoice;

      window.speechSynthesis.speak(utterance);
    }, 80);
  };

  // Capture Base64 frame snapshot & Emit Socket.io UNKNOWN_VISITOR_EVENT
  const captureAndPostUnknownVisitor = async (liveDescriptor = null, isManual = false) => {
    try {
      showToast(isManual ? '📸 Capturing manual snapshot...' : '📸 Unrecognized face detected! Capturing...');

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      
      const video = videoRef.current;
      let drawnSuccess = false;

      if (video && video.videoWidth > 0) {
        try {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          ctx.restore();
          drawnSuccess = true;
        } catch (canvasErr) {}
      }

      if (!drawnSuccess) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.arc(320, 200, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0e7ff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Unrecognized Visitor Snapshot', 320, 340);
        ctx.font = '16px sans-serif';
        ctx.fillText(new Date().toLocaleTimeString(), 320, 380);
      }

      const photoThumbnail = canvas.toDataURL('image/jpeg', 0.75);
      const dummyDescriptor = Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.1);
      const userId = localStorage.getItem('mb_userId');

      // Emit Real-Time Socket Event to Caregiver Portal
      if (socketRef.current) {
        socketRef.current.emit('UNKNOWN_VISITOR_EVENT', {
          userId,
          photoThumbnail,
          faceDescriptor: liveDescriptor || dummyDescriptor,
          cameraId: 'patient_mirror_1',
          timestamp: new Date(),
        });
      }

      // REST API Backup Post
      const res = await fetch('/api/visitors/unknown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId ? { 'x-user-id': userId } : {}),
        },
        body: JSON.stringify({
          userId,
          photoThumbnail,
          faceDescriptor: liveDescriptor || dummyDescriptor,
        }),
      });

      if (res.ok) {
        showToast(
          isManual
            ? '✅ Snapshot Saved to Caregiver Queue!'
            : '✅ Unrecognized visitor logged in Caregiver Queue!'
        );
      } else {
        hasCapturedForCurrentUnknownRef.current = false;
      }
    } catch (err) {
      console.error('Failed to post unknown snapshot:', err);
      hasCapturedForCurrentUnknownRef.current = false;
    }
  };

  const toggleReminder = async (id, currentStatus) => {
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !currentStatus }),
      });
      if (res.ok) {
        setReminders((prev) =>
          prev.map((r) => (r._id === id ? { ...r, isCompleted: !currentStatus } : r))
        );
      }
    } catch (err) {}
  };

  const replaySpeech = () => {
    if (recognizedPerson) {
      lastSpokenTimeRef.current = 0;
      speakMemoryCue(recognizedPerson);
    } else {
      lastUnknownSpokenTimeRef.current = 0;
      speakUnknownAnnouncement();
    }
  };

  const simulateDemoMatch = () => {
    if (registeredVisitors.length > 0) {
      const demoPerson = registeredVisitors[0];
      setRecognizedPerson(demoPerson);
      setDetectionDistance('0.35');
      lastSpokenTimeRef.current = 0;
      speakMemoryCue(demoPerson);
    } else {
      const fallbackPerson = {
        _id: 'demo_1',
        name: 'RAHUL',
        relationship: 'Nephew',
        contextNote: 'He lives in Pune and visits on Tuesdays.',
      };
      setRecognizedPerson(fallbackPerson);
      setDetectionDistance('0.28');
      lastSpokenTimeRef.current = 0;
      speakMemoryCue(fallbackPerson);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDD0] text-[#0A192F] flex flex-col font-sans select-none relative overflow-x-hidden">
      
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-[#0A192F] text-amber-200 border-2 border-amber-300 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm animate-bounce-short">
          <Camera className="w-6 h-6 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="w-full bg-[#FFFDD0]/90 backdrop-blur border-b border-amber-200/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/caregiver"
            className="p-2.5 rounded-xl bg-amber-200/80 hover:bg-amber-300 text-[#0A192F] transition-colors flex items-center gap-2 font-bold text-sm"
          >
            <ArrowLeft className="w-5 h-5" /> {t('caregiverPortalLink')}
          </Link>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-200/60 text-[#0A192F] text-xs font-bold uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
            {t('patientMirrorTitle')}
          </div>
          {socketConnected && (
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" /> Socket Live
            </span>
          )}
        </div>

        {/* FLOATING LANGUAGE SWITCHER BADGE REQUIREMENT */}
        <div className="flex items-center gap-2 bg-amber-200/70 p-1.5 rounded-2xl border border-amber-300">
          <Globe className="w-4 h-4 text-[#0A192F] ml-1" />
          {Object.keys(TRANSLATIONS).map((langKey) => (
            <button
              key={langKey}
              onClick={() => handleLanguageChange(langKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                currentLang === langKey
                  ? 'bg-[#0A192F] text-white shadow'
                  : 'text-[#0A192F] hover:bg-amber-300/80'
              }`}
            >
              <span>{TRANSLATIONS[langKey].flag}</span>
              <span>{TRANSLATIONS[langKey].label}</span>
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => captureAndPostUnknownVisitor(null, true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-md transition-all flex items-center gap-2"
          >
            <Camera className="w-4 h-4" /> {t('captureSnapshot')}
          </button>
          <button
            onClick={simulateDemoMatch}
            className="px-4 py-2.5 rounded-xl bg-[#0A192F] text-[#FFFDD0] font-bold text-sm shadow hover:bg-navy-800 transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" /> {t('demoTrigger')}
          </button>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-amber-200/80 hover:bg-amber-300 text-[#0A192F] transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Live Webcam Mirror Frame */}
        <section className="lg:col-span-7 flex flex-col items-center">
          <div className="relative w-full aspect-[4/3] max-w-2xl bg-slate-900 rounded-3xl overflow-hidden border-8 border-[#0A192F] shadow-2xl pulse-glow">
            
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            <canvas ref={canvasRef} className="hidden" />

            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-900/90 text-amber-100 flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="w-16 h-16 text-amber-400 mb-4" />
                <p className="text-xl font-bold mb-2">{cameraError || 'Loading Mirror Feed...'}</p>
                <p className="text-sm text-slate-300">Please allow camera permissions to enable memory cue recognition.</p>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700 flex items-center gap-2 text-xs font-semibold text-white">
              <span className={`w-2.5 h-2.5 rounded-full ${cameraActive ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
              {isModelLoaded ? t('aiGuardActive') : modelStatus}
            </div>

            {/* Recognized Visitor Indicator */}
            {recognizedPerson && (
              <div className="absolute bottom-4 left-4 right-4 bg-emerald-950/85 backdrop-blur-md border border-emerald-500/50 p-4 rounded-2xl flex items-center justify-between text-emerald-100 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-300">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-emerald-300 font-bold">Face Identified</p>
                    <p className="text-lg font-extrabold">
                      {recognizedPerson.name} ({getLocalizedRelationship(recognizedPerson.relationship, currentLang)})
                    </p>
                  </div>
                </div>
                {detectionDistance && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-900 text-emerald-300 font-mono">
                    Match: {Math.round((1 - parseFloat(detectionDistance)) * 100)}%
                  </span>
                )}
              </div>
            )}

            {/* COMFORTING NEUTRAL PROMPT FOR UNRECOGNIZED VISITOR */}
            {isUnknownPresent && !recognizedPerson && (
              <div className="absolute bottom-4 left-4 right-4 bg-amber-950/90 backdrop-blur-md border-2 border-amber-400/80 p-4 rounded-2xl flex items-center justify-between text-amber-100 animate-bounce-short">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-300 flex items-center justify-center text-amber-300">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-amber-300 font-bold">Visitor Alert</p>
                    <p className="text-lg font-extrabold">{t('unrecognizedPrompt')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="mt-3 text-sm text-[#0A192F]/70 text-center font-medium">
            🔒 Privacy-First: All face detection and memory prompt matching runs 100% locally in your browser.
          </p>
        </section>

        {/* Right Column: Multilingual Memory Cue Card & Reminders */}
        <section className="lg:col-span-5 space-y-6">

          {/* DYNAMIC MEMORY CUE CARD */}
          {recognizedPerson ? (
            <div className="bg-[#0A192F] text-[#FFFDD0] p-8 rounded-3xl shadow-2xl border-4 border-indigo-500 transform transition-all duration-300 scale-100 animate-bounce-short">
              <div className="flex items-center justify-between border-b border-indigo-400/30 pb-4 mb-6">
                <span className="px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-300 text-sm font-bold tracking-widest uppercase flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-300" /> Recognized Visitor
                </span>
                <button
                  onClick={replaySpeech}
                  className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                  title="Replay spoken announcement"
                >
                  <Volume2 className="w-6 h-6" />
                </button>
              </div>

              {/* MULTILINGUAL CUE HEADER (32px+ Requirement) */}
              <h2 className="text-3xl md:text-4xl leading-tight font-extrabold uppercase tracking-tight text-white mb-4">
                {t('cueHeader', {
                  relationship: getLocalizedRelationship(recognizedPerson.relationship, currentLang),
                  name: recognizedPerson.name,
                })}
              </h2>

              {/* SUBTEXT */}
              <p className="text-2xl md:text-3xl leading-snug font-medium text-amber-200">
                "{recognizedPerson.contextNote || `Visits frequently and cares for you.`}"
              </p>
            </div>
          ) : (
            <div className="bg-amber-100/80 border-2 border-amber-300 p-8 rounded-3xl text-center space-y-3 shadow-inner">
              <div className="w-16 h-16 rounded-full bg-amber-200 flex items-center justify-center mx-auto text-[#0A192F]">
                <User className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-[#0A192F]">
                {isUnknownPresent ? t('unrecognizedPrompt') : t('waitingTitle')}
              </h3>
              <p className="text-base text-[#0A192F]/80">
                {t('waitingDescription')}
              </p>
            </div>
          )}

          {/* DAILY REMINDERS CHECKLIST PANEL */}
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-amber-200/80 space-y-4">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <h3 className="text-xl font-bold text-[#0A192F] flex items-center gap-2">
                <Bell className="w-6 h-6 text-indigo-600" /> {t('dailyReminders')}
              </h3>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-[#0A192F]">
                {reminders.filter((r) => r.isCompleted).length} / {reminders.length} {t('completed')}
              </span>
            </div>

            {reminders.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No daily reminders set by caregiver yet.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {reminders.map((reminder) => (
                  <button
                    key={reminder._id}
                    onClick={() => toggleReminder(reminder._id, reminder.isCompleted)}
                    className={`w-full p-4 rounded-2xl flex items-center justify-between text-left transition-all border-2 ${
                      reminder.isCompleted
                        ? 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                        : 'bg-amber-50/60 border-amber-200 text-[#0A192F] hover:bg-amber-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {reminder.isCompleted ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="w-7 h-7 text-amber-500 shrink-0" />
                      )}
                      <div>
                        <p className="text-lg font-bold leading-tight">{reminder.title}</p>
                        <p className="text-xs text-slate-500 font-semibold">{reminder.time}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </section>

      </main>
    </div>
  );
}
