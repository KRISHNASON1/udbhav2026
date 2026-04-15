# 🔄 Restart Your Servers

The issue was that environment variables weren't being loaded. This has been fixed!

## ✅ What Was Fixed:

1. ✅ Installed `dotenv` package
2. ✅ Updated `server.js` to load `.env` file
3. ✅ Added environment variable verification on startup
4. ✅ Improved error logging

## 🚀 Restart Instructions:

### Step 1: Stop All Running Servers
Press `Ctrl+C` in both terminal windows to stop the servers.

### Step 2: Restart API Server (Terminal 1)
```bash
npm run dev:api
```

You should see:
```
✅ UDBHAV'26 server running on port 8080
📦 Environment check:
   - MONGODB_URI: ✓ Set
   - RAZORPAY_KEY_ID: ✓ Set
   - RAZORPAY_KEY_SECRET: ✓ Set
```

⚠️ **If you see "✗ Missing"** for any variable, check your `.env` file!

### Step 3: Restart Vite Dev Server (Terminal 2)
```bash
npm run dev
```

### Step 4: Test Payment
Open: http://localhost:5173/register

---

## 🧪 Test the Payment Flow:

1. Fill out the registration form
2. Check both agreement checkboxes
3. Click "Pay ₹800 Securely"
4. Razorpay should open successfully
5. Use test card: **4111 1111 1111 1111**
6. CVV: **123**, Expiry: Any future date

---

## 🐛 If You Still See Errors:

### Check Terminal 1 (API Server) for errors
Look for detailed error messages like:
- "Razorpay keys not configured"
- "Could not create payment order"

### Verify .env File:
```bash
cat .env
```

Should contain:
```
MONGODB_URI=mongodb+srv://...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

### Check Razorpay Dashboard:
- Go to https://dashboard.razorpay.com/
- Verify your test mode keys are correct
- Check if test mode is enabled
