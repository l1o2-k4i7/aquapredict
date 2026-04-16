// controllers/UserControl.js
// Handles user signup / login by phone number

const User = require('../models/User');

// ─── POST /api/user/register ──────────────────────────────────────────────────
// Body: { name, phone, email, role }
// Phone number is the unique user ID
const registerUser = async (req, res) => {
  try {
    const { name, phone, email, role } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'name and phone are required' });
    }

    // Check if already registered
    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already registered',
        userId: existing._id,
      });
    }

    const user = await User.create({ name, phone, email, role });

    return res.status(201).json({
      success: true,
      message: '✅ User registered',
      data: { _id: user._id, name: user.name, phone: user.phone, role: user.role },
    });

  } catch (error) {
    console.error('❌ registerUser error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/user/login ─────────────────────────────────────────────────────
// Body: { phone }
// Simple phone-based login (offline system, no JWT needed)
const loginUser = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'phone is required' });
    }

    const user = await User.findOne({ phone }).populate('ponds', 'pondName lastRealtime latestTestId');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please register first.' });
    }

    return res.status(200).json({
      success: true,
      message: '✅ Login success',
      data: user,
    });

  } catch (error) {
    console.error('❌ loginUser error:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/user/:userId ────────────────────────────────────────────────────
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('ponds', 'pondName lastRealtime tests latestTestId')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/user/all (admin only) ──────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).populate('ponds', 'pondName').lean();
    return res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { registerUser, loginUser, getUser, getAllUsers };
