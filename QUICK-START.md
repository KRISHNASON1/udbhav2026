# Quick Start Guide

## 🚀 Start Development (2 Terminals Required)

### Terminal 1: Start API Server
```bash
npm run dev:api
```
✅ Express server will start on http://localhost:8080

### Terminal 2: Start Vite Dev Server
```bash
npm run dev
```
✅ Vite dev server will start on http://localhost:5173

### Open Browser
```
http://localhost:5173/register
```

---

## 🎯 How It Works

- **Vite (port 5173)**: Serves your HTML/CSS/JS with hot reload
- **Express (port 8080)**: Handles API requests (`/api/*`)
- **Proxy**: Vite automatically forwards `/api/*` requests to Express

---

## ✅ Testing Payment

1. Fill the registration form
2. Check agreement boxes
3. Click "Pay ₹800 Securely"
4. Razorpay test card: `4111 1111 1111 1111`
5. CVV: `123`, Expiry: Any future date

---

## 📦 Production Build

```bash
npm run prod
```

This builds the project and starts the server on port 8080.

---

## ⚠️ Common Issues

**"API 404 Error"**
- Make sure Express server is running (`npm run dev:api`)
- Check that both terminals are running

**"Cannot connect to database"**
- Check `.env` file has `MONGODB_URI`
- Verify MongoDB Atlas network access

**"Payment gateway error"**
- Check `.env` has `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
- Use test mode keys for development
