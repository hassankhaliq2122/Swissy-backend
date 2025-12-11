const mongoose = require("mongoose");
const dotenv = require("dotenv");
const readline = require("readline");
const twilio = require("twilio");
const User = require("./models/User");

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

const generateVerificationCode = () =>
  Math.floor(100000 + Math.random() * 900000);

const client = new twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendSMSCode = async (phone, code) => {
  await client.messages.create({
    body: `Your admin verification code is: ${code}`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
};

const createAdmin = async () => {
  const name = await question("Enter admin name: ");
  const email = await question("Enter admin email: ");
  const password = await question("Enter admin password: ");
  const phone = await question("Enter admin phone number (optional): ");
  const twoFAEmailAnswer = await question("Enable 2FA for email? (yes/no): ");
  const twoFASMSAnswer = await question("Enable 2FA for SMS? (yes/no): ");

  const twoFA = {
    email: twoFAEmailAnswer.toLowerCase() === "yes",
    sms: twoFASMSAnswer.toLowerCase() === "yes",
  };

  // Generate codes
  const emailCode = twoFA.email ? generateVerificationCode() : null;
  const smsCode = twoFA.sms ? generateVerificationCode() : null;

  if (twoFA.email) {
    // await sendEmailCode(email, emailCode);
    console.log("📧 Email verification code sent!");
  }
  if (twoFA.sms && phone) {
    await sendSMSCode(phone, smsCode);
    console.log("📱 SMS verification code sent!");
  }

  // Verify codes
  if (twoFA.email) {
    const enteredEmailCode = await question(
      "Enter the email verification code: "
    );
    if (parseInt(enteredEmailCode) !== emailCode) {
      console.log("❌ Email verification failed. Admin not created.");
      return false;
    }
  }

  if (twoFA.sms && phone) {
    const enteredSMSCode = await question("Enter the SMS verification code: ");
    if (parseInt(enteredSMSCode) !== smsCode) {
      console.log("❌ SMS verification failed. Admin not created.");
      return false;
    }
  }

  // Check if admin exists
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`⚠️ Admin already exists: ${email}`);
    return false;
  }

  // Create admin
  await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role: "admin",
    isActive: true,
    phone: phone || "",
    twoFA,
  });

  console.log(`✅ Admin created successfully: ${email}`);
  return true;
};

// Connect to DB and start
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/swissproject")
  .then(async () => {
    console.log("✅ Connected to DB");

    const numAdmins = parseInt(
      await question("How many admins do you want to create? ")
    );

    for (let i = 0; i < numAdmins; i++) {
      console.log(`\n--- Creating admin ${i + 1} of ${numAdmins} ---`);
      await createAdmin();
    }

    console.log("\n🎉 Admin creation process finished!");
    rl.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ DB Connection Error:", err.message);
    rl.close();
    process.exit(1);
  });
