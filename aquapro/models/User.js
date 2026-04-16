// models/User.js
// Each user identified by phone number (unique ID)
// One admin, multiple users. Each user has multiple ponds (projects).

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // Phone number = unique user ID
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\+?\d{10,15}$/, 'Enter a valid phone number'],
    },

    email: { type: String, trim: true, lowercase: true },

    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user',
    },

    // References to all ponds owned by this user
    ponds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
