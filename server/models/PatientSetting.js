const mongoose = require('mongoose');

const medicationScheduleSchema = new mongoose.Schema({
  pillName: { type: String, required: true },
  targetTime: { type: String, required: true },
  isTaken: { type: Boolean, default: false },
});

const patientSettingSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      default: 'Elder Care Patient',
      trim: true,
    },
    nativeLanguage: {
      type: String,
      default: 'en-US',
      enum: ['en-US', 'hi-IN', 'mr-IN', 'es-ES'],
    },
    caregiverPhone: {
      type: String,
      default: '+1234567890',
    },
    medicationSchedules: [medicationScheduleSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('PatientSetting', patientSettingSchema);
