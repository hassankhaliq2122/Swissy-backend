const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const router = express.Router();

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
      !company ||
      !areaOfInterest ||
      !country ||
      !password ||
      !street ||
      !city ||
      !state ||
      !zipCode
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
      country: country.trim(),
      password,
      role: 'customer', // IMPORTANT: Only customers registered here
      address: {
        street: street.trim(),
        city: city.trim(),
        state: state.trim(),
        zipCode: zipCode.trim(),
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

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/username and password',
      });
    }

    const normalizedIdentifier = identifier.toLowerCase().trim();

    const user = await User.findOne({
      $or: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    });

    if (!user)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);

    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Account is inactive' });

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        employeeRole: user.employeeRole, // Only exists for employees/admin
      },
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login',
    });
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
