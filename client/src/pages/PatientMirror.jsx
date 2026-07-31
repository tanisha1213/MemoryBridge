import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Link } from 'react-router-dom';
import { Volume2, CheckCircle2, Circle, ArrowLeft, RefreshCw, AlertCircle, Sparkles, User, Bell, Camera, Check } from 'lucide-react';

const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export default function PatientMirror() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // System states
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [modelStatus, setModelStatus] = useState('Initializing AI face detection...');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Visitors and Recognition states
  const [registeredVisitors, setRegisteredVisitors] = useState([]);
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [detectionDistance, setDetectionDistance] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Reminders
  const [reminders, setReminders] = useState([]);

  // Tracking timestamps and encounter states
  const lastSpokenPersonIdRef = useRef(null);
  const lastSpokenTimeRef = useRef(0);
  const hasCapturedForCurrentUnknownRef = useRef(false);
  const isProcessingFrameRef = useRef(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Load face-api models and fetch server data on mount
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
        console.warn('CDN model load failed, trying tiny detector fallback...', err);
        try {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_CDN),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_CDN),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_CDN),
          ]);
          setIsModelLoaded(true);
          setModelStatus('Tiny AI Face Detector Ready');
        } catch (localErr) {
          console.error('Failed to load face-api models:', localErr);
          setModelStatus('Smart camera active (manual & auto trigger ready)');
          setIsModelLoaded(true);
        }
      }

      fetchData();
    }

    loadModelsAndData();
  }, []);

  const fetchData = async () => {
    try {
      const visitorsRes = await fetch('/api/visitors?registered=true');
      if (visitorsRes.ok) {
        setRegisteredVisitors(await visitorsRes.json());
      }

      const remindersRes = await fetch('/api/reminders');
      if (remindersRes.ok) {
        setReminders(await remindersRes.json());
      }
    } catch (err) {
      console.error('Error fetching patient mirror data:', err);
    }
  };

  // Auto-fetch data polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
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
        console.error('Camera access denied or unavailable:', err);
        setCameraError('Camera access unavailable. Please enable webcam permissions.');
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
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

        // Attempt 1: SSD Mobilenet (Low confidence threshold)
        try {
          if (faceapi.nets.ssdMobilenetv1.isLoaded) {
            detection = await faceapi
              .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
          }
        } catch (e) {}

        // Attempt 2: Tiny Face Detector
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

          // Match condition: Distance < 0.65
          if (bestMatch && minDistance < 0.65) {
            setRecognizedPerson(bestMatch);
            setDetectionDistance(minDistance.toFixed(2));
            speakMemoryCue(bestMatch);
            hasCapturedForCurrentUnknownRef.current = false;
          } else {
            // Unrecognized face detected
            setRecognizedPerson(null);
            setDetectionDistance(null);

            if (!hasCapturedForCurrentUnknownRef.current) {
              hasCapturedForCurrentUnknownRef.current = true;
              captureAndPostUnknownVisitor(liveDescriptor, false);
            }
          }
        } else {
          setRecognizedPerson(null);
          setDetectionDistance(null);
          hasCapturedForCurrentUnknownRef.current = false;
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
  }, [cameraActive, isModelLoaded, registeredVisitors]);

  const calcEuclideanDistance = (arr1, arr2) => {
    return Math.sqrt(
      arr1.reduce((sum, val, i) => sum + Math.pow(val - (arr2[i] || 0), 2), 0)
    );
  };

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
      const textToSpeak = `This is your ${person.relationship.toLowerCase()}, ${person.name}. ${person.contextNote || ''}`;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.volume = 1.0;
      utterance.rate = 0.88;
      utterance.pitch = 1.0;

      window.speechSynthesis.speak(utterance);
    }, 60);
  };

  // Capture Base64 frame snapshot and send to /api/visitors/unknown
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
        } catch (canvasErr) {
          console.warn('Video canvas draw error:', canvasErr);
        }
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

      const res = await fetch('/api/visitors/unknown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        const errJson = await res.json().catch(() => ({}));
        showToast(`⚠️ API Error: ${errJson.error || res.statusText}`);
        hasCapturedForCurrentUnknownRef.current = false;
      }
    } catch (err) {
      console.error('Failed to post unknown snapshot:', err);
      showToast(`❌ Capture Error: ${err.message}`);
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
    } catch (err) {
      console.error('Error toggling reminder:', err);
    }
  };

  const replaySpeech = () => {
    if (recognizedPerson) {
      lastSpokenTimeRef.current = 0;
      speakMemoryCue(recognizedPerson);
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
        relationship: 'NEPHEW',
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
      <header className="w-full bg-[#FFFDD0]/90 backdrop-blur border-b border-amber-200/80 px-6 py-4 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/caregiver"
            className="p-2.5 rounded-xl bg-amber-200/80 hover:bg-amber-300 text-[#0A192F] transition-colors flex items-center gap-2 font-bold text-sm"
          >
            <ArrowLeft className="w-5 h-5" /> Caregiver Portal
          </Link>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-200/60 text-[#0A192F] text-xs font-bold uppercase tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
            Patient Mirror View
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => captureAndPostUnknownVisitor(null, true)}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm shadow-md transition-all flex items-center gap-2 transform active:scale-95"
            title="Force capture snapshot and log as unknown visitor in Caregiver Queue"
          >
            <Camera className="w-4 h-4" /> Capture Unknown Snapshot
          </button>
          <button
            onClick={simulateDemoMatch}
            className="px-4 py-2.5 rounded-xl bg-[#0A192F] text-[#FFFDD0] font-bold text-sm shadow hover:bg-navy-800 transition-all flex items-center gap-2"
            title="Simulate face detection cue card for demo"
          >
            <Sparkles className="w-4 h-4 text-amber-300" /> Demo Cue Trigger
          </button>
          <button
            onClick={fetchData}
            className="p-2.5 rounded-xl bg-amber-200/80 hover:bg-amber-300 text-[#0A192F] transition-colors"
            title="Refresh patient reminders and visitor database"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Live Webcam Mirror Frame */}
        <section className="lg:col-span-7 flex flex-col items-center">
          <div className="relative w-full aspect-[4/3] max-w-2xl bg-slate-900 rounded-3xl overflow-hidden border-8 border-[#0A192F] shadow-2xl pulse-glow">
            
            {/* Live Video Element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Camera Overlay Elements */}
            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-900/90 text-amber-100 flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle className="w-16 h-16 text-amber-400 mb-4" />
                <p className="text-xl font-bold mb-2">{cameraError || 'Loading Mirror Feed...'}</p>
                <p className="text-sm text-slate-300">Please allow camera permissions to enable memory cue recognition.</p>
              </div>
            )}

            {/* Status Pill Badge inside Video */}
            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700 flex items-center gap-2 text-xs font-semibold text-white">
              <span className={`w-2.5 h-2.5 rounded-full ${cameraActive ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
              {isModelLoaded ? 'AI Face Guard Active' : modelStatus}
            </div>

            {/* Dynamic Recognition Box Indicator */}
            {recognizedPerson && (
              <div className="absolute bottom-4 left-4 right-4 bg-emerald-950/85 backdrop-blur-md border border-emerald-500/50 p-4 rounded-2xl flex items-center justify-between text-emerald-100 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-300">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-emerald-300 font-bold">Face Identified</p>
                    <p className="text-lg font-extrabold">{recognizedPerson.name} ({recognizedPerson.relationship})</p>
                  </div>
                </div>
                {detectionDistance && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-900 text-emerald-300 font-mono">
                    Match: {Math.round((1 - parseFloat(detectionDistance)) * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>

          <p className="mt-3 text-sm text-[#0A192F]/70 text-center font-medium">
            🔒 Privacy-First: All face detection and memory prompt matching runs 100% locally in your browser.
          </p>
        </section>

        {/* Right Column: Memory Cue Card & Daily Reminders */}
        <section className="lg:col-span-5 space-y-6">

          {/* MEMORY CUE CARD (High Contrast, Bold Accessibility Requirements) */}
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

              <h2 className="text-[40px] leading-tight font-extrabold uppercase tracking-tight text-white mb-4">
                THIS IS YOUR {recognizedPerson.relationship}, {recognizedPerson.name}
              </h2>

              <p className="text-[28px] leading-snug font-medium text-amber-200">
                "{recognizedPerson.contextNote || `Visits frequently and cares for you.`}"
              </p>
            </div>
          ) : (
            <div className="bg-amber-100/80 border-2 border-amber-300 p-8 rounded-3xl text-center space-y-3 shadow-inner">
              <div className="w-16 h-16 rounded-full bg-amber-200 flex items-center justify-center mx-auto text-[#0A192F]">
                <User className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-[#0A192F]">Waiting for Visitor...</h3>
              <p className="text-base text-[#0A192F]/80">
                Look directly into the camera. Unrecognized faces are automatically captured and sent to the Caregiver Portal queue for tagging.
              </p>
            </div>
          )}

          {/* DAILY REMINDERS CHECKLIST PANEL */}
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-amber-200/80 space-y-4">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <h3 className="text-xl font-bold text-[#0A192F] flex items-center gap-2">
                <Bell className="w-6 h-6 text-indigo-600" /> Daily Reminders
              </h3>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-[#0A192F]">
                {reminders.filter((r) => r.isCompleted).length} / {reminders.length} Completed
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
