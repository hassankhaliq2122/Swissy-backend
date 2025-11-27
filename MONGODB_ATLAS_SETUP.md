# MongoDB Atlas Setup Guide

## Step 1: Create MongoDB Atlas Account

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for a free account (or sign in if you already have one)
3. Create a new project (or use existing)

## Step 2: Create a Cluster

1. Click "Build a Database" or "Create a Cluster"
2. Choose the FREE tier (M0 Sandbox)
3. Select a cloud provider and region (choose closest to you)
4. Click "Create Cluster" (takes 3-5 minutes)

## Step 3: Create Database User

1. Go to "Database Access" in the left sidebar
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Enter username and password (save these!)
5. Set user privileges to "Atlas admin" or "Read and write to any database"
6. Click "Add User"

## Step 4: Whitelist Your IP Address

1. Go to "Network Access" in the left sidebar
2. Click "Add IP Address"
3. For development, click "Allow Access from Anywhere" (0.0.0.0/0)
   - **Note:** For production, use specific IP addresses only
4. Click "Confirm"

## Step 5: Get Connection String

1. Go to "Database" in the left sidebar
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Select "Node.js" as driver
5. Copy the connection string
6. It will look like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

## Step 6: Update Your .env File

1. Create a `.env` file in the `backend` directory (if not exists)
2. Add your MongoDB Atlas connection string:

```env
PORT=5000
MONGODB_URI=mongodb+srv://yourusername:yourpassword@cluster0.xxxxx.mongodb.net/swissproject?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d

# Email Configuration (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

**Important:**
- Replace `yourusername` with your database username
- Replace `yourpassword` with your database password
- Replace `cluster0.xxxxx` with your actual cluster name
- Add `/swissproject` before the `?` to specify the database name
- Make sure to URL-encode special characters in password (use `%40` for `@`, `%23` for `#`, etc.)

## Step 7: Test Connection

1. Start your backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. You should see:
   ```
   MongoDB Connected
   Database: swissproject
   Server running on port 5000
   ```

## Troubleshooting

### Connection Timeout
- Check if your IP is whitelisted in MongoDB Atlas
- Verify your connection string is correct
- Check if firewall is blocking the connection

### Authentication Failed
- Verify username and password are correct
- Make sure password is URL-encoded if it has special characters
- Check if the database user has proper permissions

### Network Error
- Check your internet connection
- Verify MongoDB Atlas cluster is running (not paused)
- Try pinging: `ping cluster0.xxxxx.mongodb.net`

### Database Not Found
- The database will be created automatically when you first insert data
- Make sure the database name in the connection string is correct

## Security Best Practices

1. **Never commit `.env` file to git** - it's already in `.gitignore`
2. **Use environment variables** in production
3. **Restrict IP access** - don't use 0.0.0.0/0 in production
4. **Use strong passwords** for database users
5. **Enable MongoDB Atlas authentication** and use strong credentials
6. **Regularly rotate** database passwords

## Free Tier Limits

MongoDB Atlas Free Tier (M0) includes:
- 512 MB storage
- Shared RAM and vCPU
- No credit card required
- Perfect for development and small projects

## Need Help?

- MongoDB Atlas Documentation: https://docs.atlas.mongodb.com/
- MongoDB University: https://university.mongodb.com/
- Check server logs for specific error messages


