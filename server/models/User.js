const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    patientName: {
      type: String,
      default: 'Elder Patient',
      trim: true,
    },
    accessCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    nativeLanguage: {
      type: String,
      default: 'en-US',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
