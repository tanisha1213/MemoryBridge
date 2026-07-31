const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
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
    familyCode: {
      type: String,
      default: 'MB-1001',
      index: true,
    },
    faceDescriptors: {
      type: [[Number]],
      default: [],
    },
    faceDescriptor: {
      type: [Number],
      default: [],
    },
    outfitVector: {
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
