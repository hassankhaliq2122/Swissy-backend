const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/swissproject', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('MongoDB Connected');

    // Check if admin already exists
    // Check if admin already exists
    const adminEmail = "admin@example.com";
    const adminPassword = "admin123";

    const adminExists = await User.findOne({ email: adminEmail });
    if (adminExists) {
      console.log(`Admin already exists: ${adminEmail}`);
      process.exit(0);
    }

    // Create admin user
    // Note: User.create triggers the pre('save') hook which hashes the password
    const admin = await User.create({
      name: 'Admin',
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      isActive: true
    });

    console.log('✅ Admin created successfully!');
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
    console.log('⚠️  Please change the password after first login.');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();


