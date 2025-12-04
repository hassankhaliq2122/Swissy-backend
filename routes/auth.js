const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();
const { OAuth2Client } = require("google-auth-library");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
/**
 * ==========================
 * JWT Token Helper
 * ==========================
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};


/**
 * ==========================
 * Google Login
 * POST /api/auth/google
 * ==========================
 */
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token missing",
      });
    }

    // Verify token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const googleEmail = payload.email?.toLowerCase().trim();
    const googleName = payload.name?.trim();
    const googlePicture = payload.picture;

    if (!googleEmail) {
      return res.status(400).json({
        success: false,
        message: "Unable to get Google email",
      });
    }

    // Find existing user
    let user = await User.findOne({ email: googleEmail });

    // If user doesn't exist → create account
    if (!user) {
      user = await User.create({
        name: googleName,
        username: googleEmail.split("@")[0], // auto username
        email: googleEmail,
        password: null, // No password for Google accounts
        role: "customer",
        isVerified: true,
        authProvider: "google",
        googleAvatar: googlePicture,
      });
    }

    // Generate JWT
    const jwtToken = generateToken(user._id);

    return res.json({
      success: true,
      message: "Google login successful",
      token: jwtToken,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        googleAvatar: user.googleAvatar || null,
      },
    });
  } catch (error) {
    console.error("❌ Google Login Error:", error);
    return res.status(500).json({
      success: false,
      message: "Google login failed",
    });
  }
});


/**
 * ==========================
 * Register (Customer)
 * POST /api/auth/register
 * ==========================
 */
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      username,
      email,
      phone,
      company,
      areaOfInterest,
      country,
      password,
      street,
      city,
      state,
      zipCode,
    } = req.body;

    if (
      !name ||
      !username ||
      !email ||
      !phone ||
      !company ||
      !areaOfInterest ||
      !password
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Please fill all required fields' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      if (existingUser.username === normalizedUsername) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
    }

    const user = await User.create({
      name: name.trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      phone: phone || undefined,
      company: company.trim(),
      areaOfInterest: areaOfInterest.trim(),
      country: country ? country.trim() : '',
      password,
      role: 'customer', // IMPORTANT: Only customers registered here
      address: {
        street: street ? street.trim() : '',
        city: city ? city.trim() : '',
        state: state ? state.trim() : '',
        zipCode: zipCode ? zipCode.trim() : '',
      },
      isVerified: true,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration',
    });
  }
});

/**
 * ==========================
 * Login (Admin + Employees + Customers)
 * POST /api/auth/login
 * ==========================
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'Email/username and password required' });

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }]
    }).select('+password');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.authProvider === 'local') {
      if (!user.password) throw new Error('Password not set for local user');
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Allow all roles to login (admin, employee, customer)
    if (!['admin', 'employee', 'customer'].includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * ==========================
 * Get Current User
 * GET /api/auth/me
 * ==========================
 */
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
});

module.exports = router;
