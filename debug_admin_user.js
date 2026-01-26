const mongoose = require("mongoose");
const User = require("./models/User");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/swissproject";

async function run() {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const email = "admin@example.com";

        // Select +password to include the hidden field
        const user = await User.findOne({ email: email }).select("+password");

        if (!user) {
            console.error(`❌ Admin user '${email}' NOT FOUND in database!`);
        } else {
            console.log(`✅ Admin user found: ${user.email}`);
            console.log(`   _id: ${user._id}`);
            console.log(`   role: ${user.role}`);
            console.log(`   authProvider: ${user.authProvider}`); // Should be undefined based on model, but checking if it exists in doc

            if (!user.password) {
                console.error("❌ CRITICAL: 'password' field is MISSING/NULL in database!");
            } else {
                console.log(`   password hash: ${user.password.substring(0, 10)}... (length: ${user.password.length})`);

                // Test 1: Compare with WRONG password
                const isMatchWrong = await bcrypt.compare("wrong_password", user.password);
                console.log(`\n🧪 Test bcrypt('wrong_password', hash): ${isMatchWrong} (Expect: false)`);
                if (isMatchWrong) {
                    console.error("❌ CRITICAL: 'wrong_password' VALIDATED SUCCESSFULLY against this hash!");
                }

                // Test 2: Compare with CORRECT password
                const isMatchCorrect = await bcrypt.compare("admin123", user.password);
                console.log(`🧪 Test bcrypt('admin123', hash): ${isMatchCorrect} (Expect: true)`);
            }
        }

        await mongoose.disconnect();

    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

run();
