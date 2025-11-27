# Troubleshooting Guide

## Common Backend Errors

### 1. MongoDB Connection Error

**Error:** `MongoDB connection error: connect ECONNREFUSED`

**Solution:**
- Make sure MongoDB is running
- Check if MongoDB service is started: `mongod` or `brew services start mongodb-community`
- Verify `MONGODB_URI` in `.env` file
- For MongoDB Atlas, check your connection string and IP whitelist

### 2. JWT_SECRET Not Set

**Error:** `JWT_SECRET is not set`

**Solution:**
- The server now auto-generates a default JWT_SECRET for development
- For production, set `JWT_SECRET` in `.env` file with a strong random string
- Example: `JWT_SECRET=your_super_secret_key_minimum_32_characters_long`

### 3. Email Service Errors

**Error:** `Email credentials not configured`

**Solution:**
- Email service is optional - the app will work without it
- To enable emails, set `EMAIL_USER` and `EMAIL_PASS` in `.env`
- For Gmail, use App Password (not regular password)

### 4. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::5000`

**Solution:**
- Change `PORT` in `.env` file to a different port (e.g., 5001)
- Or kill the process using port 5000:
  - Windows: `netstat -ano | findstr :5000` then `taskkill /PID <PID> /F`
  - Mac/Linux: `lsof -ti:5000 | xargs kill`

### 5. Module Not Found

**Error:** `Cannot find module 'xyz'`

**Solution:**
- Run `npm install` in the backend directory
- Check if all dependencies are listed in `package.json`
- Delete `node_modules` and `package-lock.json`, then run `npm install` again

### 6. Order Model Error

**Error:** `Cannot read property 'countDocuments' of undefined`

**Solution:**
- This has been fixed in the latest version
- The Order model now handles this gracefully with fallback

## Server Won't Start

1. Check if MongoDB is running
2. Check `.env` file exists and has correct values
3. Check if port 5000 is available
4. Check console for specific error messages
5. Verify all dependencies are installed: `npm install`

## API Not Responding

1. Check if server is running: `http://localhost:5000/api/health`
2. Check CORS configuration in `server.js`
3. Verify `FRONTEND_URL` in `.env` matches your frontend URL
4. Check browser console for CORS errors

## File Upload Issues

1. Check if `backend/uploads` directory exists
2. Verify file size limits (100MB max)
3. Check file type restrictions
4. Verify multer configuration

## Database Issues

1. Check MongoDB connection string
2. Verify database name in connection string
3. Check if collections are created automatically
4. Use MongoDB Compass to verify data

## Socket.io Connection Issues

1. Verify Socket.io server is running
2. Check CORS configuration for Socket.io
3. Verify `FRONTEND_URL` in `.env`
4. Check browser console for connection errors

## Still Having Issues?

1. Check the console logs for specific error messages
2. Verify all environment variables are set
3. Make sure MongoDB is running
4. Check if all dependencies are installed
5. Try restarting the server


