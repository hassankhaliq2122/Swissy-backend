const mongoose = require("mongoose");
const User = require("./models/User");
const dotenv = require("dotenv");

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/swissproject";

async function run() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        // 1. Remove ANY existing admins that might be confusing things
        const emailsToRemove = [
            "admin@example.com",
            "hassankhaliq123@gmail.com",
            "admin_verify_test@example.com"
        ];

        console.log(`Removing users: ${emailsToRemove.join(", ")}...`);
        await User.deleteMany({ email: { $in: emailsToRemove } });

        // 2. Create the correct admin user
        const adminEmail = "admin@example.com";
        const adminPass = "admin123";

        console.log(`Creating fresh admin: ${adminEmail} / ${adminPass}`);
        await User.create({
            name: 'Admin',
            username: 'admin', // Added required field
            email: adminEmail,
            password: adminPass,
            role: 'admin',
            isActive: true,
            authProvider: 'local'
        });

        console.log("✅ Admin account reset successfully.");
        console.log("---------------------------------------------------");
        console.log("PLEASE RESTART YOUR BACKEND SERVER NOW.");
        console.log("Then login with:");
        console.log(`Email: ${adminEmail}`);
        console.log(`Password: ${adminPass}`);
        console.log("---------------------------------------------------");

        await mongoose.disconnect();

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

run();
