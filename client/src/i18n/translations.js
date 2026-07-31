export const TRANSLATIONS = {
  'en-US': {
    langCode: 'en-US',
    label: 'English',
    flag: '🇺🇸',
    cueHeader: 'THIS IS YOUR {relationship}, {name}',
    cueSubtext: '"{contextNote}"',
    recognizedAudio: 'This is your {relationship}, {name}. {contextNote}',
    unrecognizedPrompt: 'A visitor is here with you.',
    unrecognizedAudio: 'A visitor is here with you. A snapshot has been sent to your caregiver queue.',
    waitingTitle: 'Waiting for Visitor...',
    waitingDescription: 'Look into the camera. Unrecognized faces are captured for caregiver verification.',
    patientMirrorTitle: 'Patient Mirror View',
    caregiverPortalLink: 'Caregiver Portal',
    dailyReminders: 'Daily Reminders',
    completed: 'Completed',
    demoTrigger: 'Demo Cue Trigger',
    captureSnapshot: 'Capture Unknown Snapshot',
    aiGuardActive: 'AI Face Guard Active',
  },
  'hi-IN': {
    langCode: 'hi-IN',
    label: 'हिंदी',
    flag: '🇮🇳',
    cueHeader: 'यह आपके {relationship}, {name} हैं',
    cueSubtext: '"{contextNote}"',
    recognizedAudio: 'यह आपके {relationship}, {name} हैं। {contextNote}',
    unrecognizedPrompt: 'एक अतिथि आपके साथ है।',
    unrecognizedAudio: 'एक अतिथि आपके साथ है। देखभालकर्ता को सूचना भेज दी गई है।',
    waitingTitle: 'अतिथि की प्रतीक्षा में...',
    waitingDescription: 'कैमरे में देखें। अपरिचित चेहरों को सुरक्षा के लिए रिकॉर्ड किया जाता है।',
    patientMirrorTitle: 'पेशेंट मिरर व्यू',
    caregiverPortalLink: 'केयरगिवर पोर्टल',
    dailyReminders: 'दैनिक रिमाइंडर',
    completed: 'पूर्ण',
    demoTrigger: 'डेमो ट्रिगर',
    captureSnapshot: 'अज्ञात फोटो लें',
    aiGuardActive: 'एआई फेस गार्ड सक्रिय',
  },
  'mr-IN': {
    langCode: 'mr-IN',
    label: 'मराठी',
    flag: '🇮🇳',
    cueHeader: 'हे तुमचे {relationship}, {name} आहेत',
    cueSubtext: '"{contextNote}"',
    recognizedAudio: 'हे तुमचे {relationship}, {name} आहेत. {contextNote}',
    unrecognizedPrompt: 'एक पाहुणे तुमच्या सोबत आहेत.',
    unrecognizedAudio: 'एक पाहुणे तुमच्या सोबत आहेत. काळजीवाहूंस माहिती पाठवली आहे.',
    waitingTitle: 'पाहुण्यांची वाट पाहत आहे...',
    waitingDescription: 'कॅमेऱ्याकडे पहा. अनोळखी चेहरे नोंदवले जातात.',
    patientMirrorTitle: 'पेशंट मिरर व्ह्यू',
    caregiverPortalLink: 'केअरगिव्हर पोर्टल',
    dailyReminders: 'दैनिक आठवणी',
    completed: 'पूर्ण',
    demoTrigger: 'डेमो ट्रिगर',
    captureSnapshot: 'अनोळखी फोटो घ्या',
    aiGuardActive: 'एआय सुरक्षा सक्रिय',
  },
  'es-ES': {
    langCode: 'es-ES',
    label: 'Español',
    flag: '🇪🇸',
    cueHeader: 'ESTE ES TU {relationship}, {name}',
    cueSubtext: '"{contextNote}"',
    recognizedAudio: 'Este es tu {relationship}, {name}. {contextNote}',
    unrecognizedPrompt: 'Un visitante está aquí contigo.',
    unrecognizedAudio: 'Un visitante está aquí contigo. Se ha enviado una foto a tu cuidador.',
    waitingTitle: 'Esperando visitante...',
    waitingDescription: 'Mira a la cámara. Las caras no reconocidas se guardan para verificación.',
    patientMirrorTitle: 'Vista Espejo del Paciente',
    caregiverPortalLink: 'Portal del Cuidador',
    dailyReminders: 'Recordatorios Diarios',
    completed: 'Completados',
    demoTrigger: 'Prueba de Demostración',
    captureSnapshot: 'Capturar Foto Desconocida',
    aiGuardActive: 'Guardia Facial IA Activa',
  },
};

// Relationship dictionary mapping standard English to Native translations
export const RELATIONSHIP_TRANSLATIONS = {
  Nephew: { 'en-US': 'Nephew', 'hi-IN': 'भतीजा', 'mr-IN': 'पुतण्या', 'es-ES': 'Sobrino' },
  Niece: { 'en-US': 'Niece', 'hi-IN': 'भतीजी', 'mr-IN': 'पुतणी', 'es-ES': 'Sobrina' },
  Daughter: { 'en-US': 'Daughter', 'hi-IN': 'बेटी', 'mr-IN': 'मुलगी', 'es-ES': 'Hija' },
  Son: { 'en-US': 'Son', 'hi-IN': 'बेटा', 'mr-IN': 'मुलगा', 'es-ES': 'Hijo' },
  Doctor: { 'en-US': 'Doctor', 'hi-IN': 'डॉक्टर', 'mr-IN': 'डॉक्टर', 'es-ES': 'Doctor/a' },
  Caregiver: { 'en-US': 'Caregiver', 'hi-IN': 'देखभालकर्ता', 'mr-IN': 'काळजीवाहू', 'es-ES': 'Cuidador/a' },
  Friend: { 'en-US': 'Friend', 'hi-IN': 'मित्र', 'mr-IN': 'मित्र', 'es-ES': 'Amigo/a' },
  Brother: { 'en-US': 'Brother', 'hi-IN': 'भाई', 'mr-IN': 'भाऊ', 'es-ES': 'Hermano' },
  Sister: { 'en-US': 'Sister', 'hi-IN': 'बहन', 'mr-IN': 'बहीण', 'es-ES': 'Hermana' },
};

export const getLocalizedText = (langCode, key, params = {}) => {
  const dict = TRANSLATIONS[langCode] || TRANSLATIONS['en-US'];
  let template = dict[key] || TRANSLATIONS['en-US'][key] || '';

  Object.keys(params).forEach((paramKey) => {
    template = template.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), params[paramKey]);
  });

  return template;
};

export const getLocalizedRelationship = (relationship, langCode) => {
  if (RELATIONSHIP_TRANSLATIONS[relationship]) {
    return RELATIONSHIP_TRANSLATIONS[relationship][langCode] || relationship;
  }
  return relationship;
};
