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
  Radio,
  ChevronDown
} from 'lucide-react';
import {
  TRANSLATIONS,
  getLocalizedText,
  getLocalizedRelationship,
  getLocalizedContextNote
} from '../i18n/translations';

const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export default function PatientMirror() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  // System & Language states
  const [currentLang, setCurrentLang] = useState(() => {
    return localStorage.getItem('mb_nativeLanguage') || 'hi-IN';
  });
  const [isDataLoaded, setIsDataLoaded] = useState(false);
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
  const [voicesLoaded, setVoicesLoaded] = useState(false);

  // Reminders
  const [reminders, setReminders] = useState([]);

  // Tracking refs
  const lastSpokenPersonIdRef = useRef(null);
  const lastSpokenTimeRef = useRef(0);
  const lastUnknownSpokenTimeRef = useRef(0);
  const lastUnknownCaptureTimeRef = useRef(0);
  const activeRecognizedUserRef = useRef(null); // Currently recognized person ID
  const spokenUserRef = useRef(null); // Prevents duplicate audio repeats per encounter
  const isSpeakingRef = useRef(false); // Strict single-speech execution lock
  const unknownFrameCounterRef = useRef(0); // How many consecutive unknown frames
  const isSnapshotLockedRef = useRef(false); // Prevents taking duplicate photos
  const snapshotCooldownTimerRef = useRef(null);
  const spokenCountRef = useRef(0);
  const noFaceFramesCountRef = useRef(0);
  const isProcessingFrameRef = useRef(false);

  // Track face boxes across frames to prevent ID flickering
  const trackedFacesRef = useRef({});

  // Calculate Intersection over Union (IoU) to match bounding boxes between frames
  const calculateIoU = (boxA, boxB) => {
    if (!boxA || !boxB) return 0;
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    if (interArea === 0) return 0;

    const boxAArea = boxA.width * boxA.height;
    const boxBArea = boxB.width * boxB.height;

    return interArea / (boxAArea + boxBArea - interArea);
  };

  // Cosine Similarity replacing raw Euclidean Distance for high accuracy
  const getCosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length !== 128 || vecB.length !== 128) return -1;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < 128; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return -1;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const getMostFrequent = (arr) => {
    if (!arr || !arr.length) return null;
    const counts = {};
    arr.forEach((x) => {
      if (x) counts[x] = (counts[x] || 0) + 1;
    });
    let maxItem = null;
    let maxCount = -1;
    Object.keys(counts).forEach((item) => {
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        maxItem = item;
      }
    });
    return maxItem;
  };

  const t = (key, params = {}) => getLocalizedText(currentLang, key, params);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // COMPUTER VISION: Torso Bounding Box & Outfit Color Feature Extraction
  const extractOutfitColorVector = (video, faceBox) => {
    try {
      const videoW = video.videoWidth || 1280;
      const videoH = video.videoHeight || 720;

      const torsoX = Math.max(0, Math.floor(faceBox.x - faceBox.width * 0.2));
      const torsoY = Math.min(videoH - 1, Math.floor(faceBox.y + faceBox.height));
      const torsoW = Math.min(videoW - torsoX, Math.floor(faceBox.width * 1.4));
      const torsoH = Math.min(videoH - torsoY, Math.floor(faceBox.height * 1.8));

      if (torsoW <= 5 || torsoH <= 5) return [0.5, 0.5, 0.5];

      const offCanvas = document.createElement('canvas');
      offCanvas.width = 32;
      offCanvas.height = 32;
      const ctx = offCanvas.getContext('2d');
      ctx.drawImage(video, torsoX, torsoY, torsoW, torsoH, 0, 0, 32, 32);

      const imgData = ctx.getImageData(0, 0, 32, 32).data;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < imgData.length; i += 4) {
        rSum += imgData[i];
        gSum += imgData[i + 1];
        bSum += imgData[i + 2];
        count++;
      }

      return count > 0
        ? [
            parseFloat((rSum / (count * 255)).toFixed(3)),
            parseFloat((gSum / (count * 255)).toFixed(3)),
            parseFloat((bSum / (count * 255)).toFixed(3)),
          ]
        : [0.5, 0.5, 0.5];
    } catch (e) {
      return [0.5, 0.5, 0.5];
    }
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
      setSocketConnected(true);
      const userId = localStorage.getItem('mb_userId');
      const accessCode = localStorage.getItem('mb_accessCode');
      socket.emit('JOIN_FAMILY_ROOM', { userId, accessCode });
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('VISITOR_REGISTERED', (data) => {
      showToast('✨ New visitor added to memory bank!');
      fetchData();
    });

    socket.on('REMINDER_ADDED', () => {
      fetchData();
    });

    socket.on('PATIENT_SETTINGS_UPDATED', (data) => {
      if (data && data.nativeLanguage) {
        setCurrentLang(data.nativeLanguage);
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
        setModelStatus('Loading neural network models...');
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models').catch(() => faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_CDN)),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models').catch(() => faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_CDN)),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models').catch(() => faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_CDN)),
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models').catch(() => faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_CDN)),
        ]);

        setIsModelLoaded(true);
        setModelStatus('AI Face Detector Ready');
      } catch (err) {
        console.warn('Model load fallback to CDN...', err);
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
    const accessCode = localStorage.getItem('mb_accessCode');
    return {
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(accessCode ? { 'x-family-code': accessCode } : {}),
    };
  };

  const fetchData = async () => {
    try {
      const headers = getAuthHeaders();
      const [visitorsRes, remindersRes] = await Promise.all([
        fetch('/api/visitors?registered=true', { headers }),
        fetch('/api/reminders', { headers }),
      ]);

      if (visitorsRes.ok) {
        const vList = await visitorsRes.json();
        setRegisteredVisitors(vList);
        setIsDataLoaded(true);
      }
      if (remindersRes.ok) setReminders(await remindersRes.json());
    } catch (err) {
      console.error('Error fetching patient mirror data:', err);
    }
  };

  const userId = localStorage.getItem('mb_userId');
  const accessCode = localStorage.getItem('mb_accessCode') || 'MB-1001';

  useEffect(() => {
    // Reset all local state & active tracking refs on account/family change
    setRegisteredVisitors([]);
    setReminders([]);
    setRecognizedPerson(null);
    setIsUnknownPresent(false);
    setDetectionDistance(null);

    activeRecognizedUserRef.current = null;
    isSnapshotLockedRef.current = false;
    unknownFrameCounterRef.current = 0;
    noFaceFramesCountRef.current = 0;
    spokenCountRef.current = 0;
    lastSpokenPersonIdRef.current = null;

    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [userId, accessCode]);

  // Mobile Gesture Initialization & WebAudio Unlock
  const initializeMobileEngine = async () => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const silentUtterance = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(silentUtterance);
      }

      const constraints = {
        video: {
          facingMode: 'user', // Front camera on mobile
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            setCameraActive(true);
            setCameraError(null);
          } catch (e) {}
        };
      }
    } catch (err) {
      console.error('Mobile Camera Init Failed:', err);
      setCameraError('Camera Permission Denied. Please allow camera in browser settings.');
    }
  };

  // Start mobile-optimized webcam feed
  useEffect(() => {
    let stream = null;

    async function startCamera() {
      try {
        setCameraError(null);

        const constraints = {
          video: {
            facingMode: 'user', // Front camera on mobile
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { max: 15 }, // Cap frame rate to save mobile battery & GPU
          },
          audio: false,
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            try {
              await videoRef.current.play();
              setCameraActive(true);
            } catch (e) {}
          };
        }
      } catch (err) {
        console.error('Mobile Camera Error:', err);
        setCameraError('Camera access denied or not supported on this browser. Please allow camera permissions in settings.');
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Continuous face detection loop with Temporal Smoothing & Recognition Locks
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

        // IF NO FACE DETECTED: Unlock snapshot lockout after 3 consecutive empty frames (~1.5s)
        if (!detection) {
          noFaceFramesCountRef.current += 1;
          if (noFaceFramesCountRef.current >= 3) {
            unknownFrameCounterRef.current = 0;
            activeRecognizedUserRef.current = null;
            spokenUserRef.current = null; // Reset audio memory lock when frame empties
            isSnapshotLockedRef.current = false;
            setRecognizedPerson(null);
            setIsUnknownPresent(false);
            setDetectionDistance(null);
            spokenCountRef.current = 0;
            lastSpokenPersonIdRef.current = null;
          }
          return;
        }

        // Face is present -> reset empty frame counter
        noFaceFramesCountRef.current = 0;

        const box = detection.detection.box;
        const liveDescriptor = detection.descriptor;
        const liveOutfitVector = extractOutfitColorVector(video, box);

        let bestMatch = null;
        let maxSimilarity = -1;

        // MULTI-VECTOR MATCHING ENGINE: Evaluate Cosine Similarity against ALL stored pose vectors per person
        registeredVisitors.forEach((visitor) => {
          if (visitor.faceDescriptors && Array.isArray(visitor.faceDescriptors) && visitor.faceDescriptors.length > 0) {
            visitor.faceDescriptors.forEach((descriptorArray) => {
              if (descriptorArray && descriptorArray.length === 128) {
                const sim = getCosineSimilarity(liveDescriptor, descriptorArray);
                if (sim > maxSimilarity) {
                  maxSimilarity = sim;
                  bestMatch = visitor;
                }
              }
            });
          } else if (visitor.faceDescriptor && visitor.faceDescriptor.length === 128) {
            const sim = getCosineSimilarity(liveDescriptor, visitor.faceDescriptor);
            if (sim > maxSimilarity) {
              maxSimilarity = sim;
              bestMatch = visitor;
            }
          }
        });

        // 1. Match this face to an existing tracked bounding box in the previous frame
        const currentTracked = { ...trackedFacesRef.current };
        let matchedTrackKey = null;
        let maxIoU = 0;

        Object.keys(currentTracked).forEach((key) => {
          const iou = calculateIoU(box, currentTracked[key]?.box);
          if (iou > 0.4 && iou > maxIoU) {
            maxIoU = iou;
            matchedTrackKey = key;
          }
        });

        // 2. Strict Similarity Threshold (> 0.82 for Cosine Similarity)
        const identifiedVisitor = bestMatch && maxSimilarity > 0.82 ? bestMatch : null;
        const candidateId = identifiedVisitor ? String(identifiedVisitor._id) : 'UNKNOWN';

        // 3. Smooth identity using a 5-frame rolling voting window
        const trackId = matchedTrackKey || `face_${Date.now()}_${Math.random()}`;
        const history = currentTracked[trackId]?.votes || [];
        const newHistory = [...history.slice(-4), candidateId]; // Keep last 5 frames
        const winningId = getMostFrequent(newHistory);

        const winningVisitor = winningId !== 'UNKNOWN' ? registeredVisitors.find((v) => String(v._id) === String(winningId)) : null;

        trackedFacesRef.current = {
          [trackId]: {
            box,
            votes: newHistory,
            activeVisitor: winningVisitor,
          },
        };

        // =========================================================
        // 🟢 1. RECOGNIZED USER (Strict Cosine Similarity > 0.82 & Majority Vote Winner)
        // =========================================================
        if (winningVisitor && maxSimilarity > 0.82) {
          unknownFrameCounterRef.current = 0;

          if (activeRecognizedUserRef.current !== winningVisitor._id) {
            activeRecognizedUserRef.current = winningVisitor._id;
            setRecognizedPerson(winningVisitor);
            setIsUnknownPresent(false);
            setDetectionDistance(maxSimilarity.toFixed(2));
            speakRecognition(winningVisitor, currentLang);
          } else {
            setRecognizedPerson(winningVisitor);
            setIsUnknownPresent(false);
            setDetectionDistance(maxSimilarity.toFixed(2));
          }
          // Exit loop, DO NOT proceed to snapshot checks
          return;
        }

        // =========================================================
        // 🟡 2. MOVEMENT / POSE SHIFT GUARD
        // =========================================================
        // If we ALREADY recognized this person, hold the lock through minor movement
        if (activeRecognizedUserRef.current !== null) {
          unknownFrameCounterRef.current += 1;
          
          // Require at least 5 consecutive unknown frames (~4 seconds) before losing recognition
          if (unknownFrameCounterRef.current < 5) {
            return;
          }
          activeRecognizedUserRef.current = null;
        }

        // =========================================================
        // 🔴 3. CONFIRMED UNKNOWN PERSON
        // =========================================================
        unknownFrameCounterRef.current += 1;
        console.log(`🟡 Unknown Frame Counter: ${unknownFrameCounterRef.current} | Lock State: ${isSnapshotLockedRef.current}`);

        // Trigger unknown snapshot only after 3 consecutive unknown frames (~3 seconds)
        if (unknownFrameCounterRef.current >= 3 && !isSnapshotLockedRef.current) {
          console.log("🚀 TRIGGERING SNAPSHOT CAPTURE...");
          isSnapshotLockedRef.current = true; // Synchronous Lockout BEFORE Vercel API network call fires!
          speakUnknownAlert(currentLang);
          captureAndPostUnknownVisitor(Array.from(liveDescriptor), liveOutfitVector, false);

          if (snapshotCooldownTimerRef.current) clearTimeout(snapshotCooldownTimerRef.current);
          snapshotCooldownTimerRef.current = setTimeout(() => {
            console.log("🔓 Unlocking Snapshot Lock after 20 seconds");
            isSnapshotLockedRef.current = false;
            unknownFrameCounterRef.current = 0;
          }, 20000); // 20-second cooldown lock
        }
      } catch (err) {
        // Silent catch
      } finally {
        isProcessingFrameRef.current = false;
      }
    };

    let timerId = null;
    let isCancelled = false;

    const runLoop = async () => {
      if (isCancelled) return;

      if (cameraActive && isModelLoaded && !isProcessingFrameRef.current) {
        await detectFaces();
      }

      if (!isCancelled) {
        timerId = setTimeout(runLoop, 600);
      }
    };

    if (cameraActive && isModelLoaded) {
      runLoop();
    }

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [cameraActive, isModelLoaded, registeredVisitors, currentLang, voicesLoaded]);

  // Pre-load browser voices on mount & handle Vercel voice engine initialization
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) setVoicesLoaded(true);
      }
    };
    loadVoices();
    if ('speechSynthesis' in window && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // 1. High-Quality Neural Voice Selector
  const getBestVoice = (langCode) => {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;

    const targetClean = langCode.replace('_', '-').toLowerCase();
    const primaryPrefix = targetClean.split('-')[0];

    // Filter for exact language + neural/natural voice names
    let match = voices.find(
      (v) =>
        v.lang.replace('_', '-').toLowerCase() === targetClean &&
        (v.name.includes('Google') ||
          v.name.includes('Natural') ||
          v.name.includes('Online') ||
          v.name.includes('Neural') ||
          v.name.includes('Swara') ||
          v.name.includes('Madhur') ||
          v.name.includes('Hemant') ||
          v.name.includes('Kalpana'))
    );

    if (!match) {
      match = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === targetClean);
    }

    if (!match) {
      match = voices.find((v) => v.lang.toLowerCase().startsWith(primaryPrefix));
    }

    return match || null;
  };

  // 2. Strict Single-Speech Execution (Fallback)
  const speakFluentText = (text, langCode = 'hi-IN') => {
    if (!('speechSynthesis' in window) || !text) return;

    window.speechSynthesis.cancel();

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      const bestVoice = getBestVoice(langCode);

      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.lang = langCode;
      utterance.rate = 0.85;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        isSpeakingRef.current = false;
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
      };

      isSpeakingRef.current = true;
      window.speechSynthesis.speak(utterance);
    }, 50);
  };

  // 3. High-Fidelity Neural Audio Player (Streams from /api/tts/stream)
  const playCleanVoice = (text, langCode, visitorId) => {
    if (!text) return;

    // 🔒 STRICT CHECK: Prevent re-triggering the same sentence
    if (spokenUserRef.current === visitorId) return;
    spokenUserRef.current = visitorId;

    if (window.currentAudio) {
      try {
        window.currentAudio.pause();
      } catch (e) {}
      window.currentAudio = null;
    }

    const lang = langCode.startsWith('mr') ? 'mr' : langCode.startsWith('hi') ? 'hi' : 'en';
    const audioUrl = `/api/tts/stream?text=${encodeURIComponent(text)}&lang=${lang}`;

    const audio = new Audio(audioUrl);
    window.currentAudio = audio;
    audio.play().catch((err) => {
      console.warn('Backend audio stream playback fallback to Web Speech API:', err.message);
      speakFluentText(text, langCode);
    });
  };

  // 4. Grammatically Correct Multi-Lingual Messages
  const speakRecognition = (visitor, selectedLang = currentLang) => {
    if (!visitor) return;

    const relationship = getLocalizedRelationship(visitor.relationship, selectedLang) || 'परिचित';

    let text = '';
    if (selectedLang === 'hi-IN') {
      text = `यह आपके ${relationship}, ${visitor.name} हैं।`;
    } else if (selectedLang === 'mr-IN') {
      text = `हे तुमचे ${relationship}, ${visitor.name} आहेत।`;
    } else {
      text = `This is your ${relationship}, ${visitor.name}.`;
    }

    playCleanVoice(text, selectedLang, visitor._id);
  };

  const speakUnknownAlert = (selectedLang = currentLang) => {
    let text = '';
    if (selectedLang === 'hi-IN') {
      text = 'एक नए व्यक्ति आए हैं। सूचना भेज दी गई है।';
    } else if (selectedLang === 'mr-IN') {
      text = 'एक नवीन व्यक्ती आली आहे. माहिती पाठवली आहे।';
    } else {
      text = 'A new visitor has arrived. A notification has been sent.';
    }

    playCleanVoice(text, selectedLang, 'UNKNOWN_ALERT');
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

    spokenUserRef.current = null;
    if (recognizedPerson) {
      speakRecognition(recognizedPerson, newLang);
    } else {
      const phrases = {
        'en-US': 'Language set to English',
        'hi-IN': 'भाषा हिंदी में सेट की गई है',
        'mr-IN': 'भाषा मराठीमध्ये सेट केली आहे',
      };
      speakFluentText(phrases[newLang] || 'Language updated', newLang);
    }
  };

  // Capture Base64 frame snapshot & Emit Socket.io UNKNOWN_VISITOR_EVENT
  const captureAndPostUnknownVisitor = async (liveDescriptor = null, liveOutfitVector = null, isManual = false) => {
    try {
      showToast(isManual ? '📸 Capturing manual snapshot...' : '📸 Unrecognized face detected! Capturing...');

      const canvas = document.createElement('canvas');
      // Downscale mobile frame resolution to 480x360 to prevent WebGL/GPU memory crashes
      canvas.width = 480;
      canvas.height = 360;
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
        ctx.arc(240, 150, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0e7ff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Unrecognized Visitor Snapshot', 240, 250);
        ctx.font = '14px sans-serif';
        ctx.fillText(new Date().toLocaleTimeString(), 240, 280);
      }

      const photoThumbnail = canvas.toDataURL('image/jpeg', 0.5);
      const dummyDescriptor = Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.1);
      const userId = localStorage.getItem('mb_userId');
      const accessCode = localStorage.getItem('mb_accessCode');
      const headers = getAuthHeaders();

      // Emit Real-Time Socket Event to Caregiver Portal
      if (socketRef.current) {
        socketRef.current.emit('UNKNOWN_VISITOR_EVENT', {
          userId,
          familyCode: accessCode,
          photoThumbnail,
          faceDescriptor: liveDescriptor || dummyDescriptor,
          outfitVector: liveOutfitVector || [],
          cameraId: 'patient_mirror_1',
          timestamp: new Date(),
        });
      }

      // REST API Post to /api/visitors/:familyCode/unknown
      const activeFamilyCode = accessCode || 'MB-1001';
      const res = await fetch(`/api/visitors/${activeFamilyCode}/unknown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          userId,
          familyCode: activeFamilyCode,
          photoThumbnail,
          faceDescriptor: liveDescriptor || dummyDescriptor,
          outfitVector: liveOutfitVector || [],
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

        {/* PROFESSIONAL LANGUAGE SELECTOR DROPDOWN */}
        <div className="relative flex items-center">
          <select
            value={currentLang}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-[#0A192F] text-amber-100 font-extrabold text-xs py-2 px-3 pl-8 pr-8 rounded-xl border border-amber-300 shadow-md cursor-pointer focus:outline-none appearance-none hover:bg-slate-800 transition-all"
          >
            {Object.keys(TRANSLATIONS).map((langKey) => (
              <option key={langKey} value={langKey} className="bg-[#0A192F] text-white py-1">
                {TRANSLATIONS[langKey].flag} {TRANSLATIONS[langKey].label}
              </option>
            ))}
          </select>
          <Globe className="w-4 h-4 text-amber-300 absolute left-2.5 pointer-events-none" />
          <ChevronDown className="w-4 h-4 text-amber-300 absolute right-2.5 pointer-events-none" />
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
              webkit-playsinline="true"
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
