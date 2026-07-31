const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: 'Unrecognized Person',
      trim: true,
    },
    relationship: {
      type: String,
      default: 'Unknown',
      trim: true,
    },
    contextNote: {
      type: String,
      default: '',
      trim: true,
    },
    preferredLanguage: {
      type: String,
      default: 'en-US',
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
