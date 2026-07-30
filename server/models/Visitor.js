const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Unknown Visitor',
      trim: true,
    },
    relationship: {
      type: String,
      default: 'Unspecified',
      trim: true,
    },
    contextNote: {
      type: String,
      default: '',
      trim: true,
    },
    faceDescriptor: {
      type: [Number],
      default: [],
    },
    photoThumbnail: {
      type: String,
      required: true,
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Visitor', visitorSchema);
