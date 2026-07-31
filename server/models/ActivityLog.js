const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      default: 'patient_1',
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ['UNKNOWN_VISITOR', 'MEDICATION_TAKEN', 'HYDRATION_LOGGED', 'ITEM_FOUND', 'MISSED_MEDICATION', 'HYDRATION_CHECK'],
    },
    eventData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
