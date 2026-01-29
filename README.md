# 🔐 Encryptio Password Manager - Browser Extension

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)]()
[![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Security](https://img.shields.io/badge/security-hardened-success.svg)](#-security-overview)
[![License](https://img.shields.io/badge/license-proprietary-red.svg)]()

Secure browser extension for password management with intelligent autofill, integrated with [encryptio.it](https://encryptio.it).

---

## 📋 What is Encryptio?

Encryptio Password Manager is a Chrome/Edge browser extension that securely stores and autofills your passwords. It works seamlessly with your Encryptio.it account to provide:

- ✅ **One-click autofill** from your dashboard
- ✅ **Secure password generation** (20+ characters)
- ✅ **Zero-knowledge encryption** (your passwords never leave your device unencrypted)
- ✅ **Cross-site compatibility** (works on all websites)

---

## 🚀 Quick Start

### Installation

1. **Download** the extension from Chrome Web Store *(coming soon)* or load unpacked in Developer Mode
2. **Log in** to [encryptio.it](https://www.encryptio.it/auth/login)
3. **Click the Encryptio icon** in your browser toolbar
4. **Start using** - the extension automatically syncs with your vault

### First Use

1. Open [your dashboard](https://www.encryptio.it/user/dashboard)
2. Click any website URL from your saved passwords
3. **That's it!** The new tab opens with credentials already filled in

---

## ✨ Features

### 🎯 For Users

- **One-Click Autofill**: Click a password link on your dashboard → new tab opens with login filled
- **Smart Password Generator**: Generate strong passwords (20 characters, high entropy)
- **Universal Compatibility**: Works on all websites, including React/Vue/Angular apps
- **Visual Feedback**: Real-time overlays show what's happening
- **Automatic Cleanup**: Credentials automatically removed after use

### 🔒 Security Features

- **Military-Grade Encryption**: AES-256-GCM with HMAC integrity verification
- **Zero-Knowledge**: Passwords only decrypted when needed, in memory only
- **Session Protection**: Auto-lock after 15 minutes of inactivity
- **Rate Limiting**: Protection against brute force attacks
- **Input Validation**: Prevents SQL injection and malicious input
- **No External Tracking**: Zero dependencies on external services

---

## 📖 How to Use

### Method 1: Autofill from Dashboard (Recommended)

1. Go to [encryptio.it/user/dashboard](https://www.encryptio.it/user/dashboard)
2. Find the password you want to use
3. **Click the website URL**
4. New tab opens → credentials automatically filled ✅

### Method 2: Autofill from Popup

1. Navigate to the login page
2. Click the **Encryptio icon** in toolbar
3. Search for your password
4. Click **"Insert"**
5. Credentials filled automatically ✅

### Method 3: Password Generator

1. Click the **Encryptio icon**
2. Go to **"Generator"** tab
3. Click **"Generate New"**
4. Click **"Copy"** to copy the password
5. Password auto-clears from clipboard after 30 seconds 🔒

---

## 🔐 Security Overview

Encryptio uses industry-standard security practices:

| Feature | Description |
|---------|-------------|
| **Encryption** | AES-256-GCM (military-grade) |
| **Key Derivation** | PBKDF2 with 100,000 iterations |
| **Integrity** | HMAC-SHA256 verification |
| **Storage** | Isolated browser storage (not accessible by websites) |
| **Session** | 15-minute auto-lock on inactivity |
| **Cleanup** | Automatic removal of temporary credentials |

### What We DON'T Do

- ❌ Store passwords in plaintext
- ❌ Send passwords to external servers unencrypted
- ❌ Track your browsing activity
- ❌ Use third-party analytics
- ❌ Load external resources (no CDN dependencies)

### Chrome Web Store Compliance

- ✅ Manifest V3 (latest Chrome extension standard)
- ✅ Content Security Policy enforced
- ✅ No eval() or inline scripts
- ✅ All permissions justified and documented
- ✅ No data collection or telemetry

---

## 🛠️ Requirements

- **Browser**: Chrome 88+, Edge 88+, or Brave 1.20+
- **Account**: Active account on [encryptio.it](https://encryptio.it)
- **Internet**: Required for syncing vault (autofill works offline after initial sync)

---

## ❓ FAQ

### How secure is my data?

Your passwords are encrypted with AES-256-GCM before storage. The encryption keys never leave your device. Even Encryptio cannot decrypt your passwords without your master key.

### Does it work offline?

Password generation works offline. Autofill requires initial vault sync but can work with cached data.

### Can websites access my passwords?

No. Passwords are stored in browser extension storage, which is completely isolated from web pages. No website can access your vault.

### What happens if I reload the extension?

You'll see a message asking you to reload the page. This is normal - simply refresh the page (F5) and continue using.

### Does it work on all websites?

Yes. The extension is compatible with all login forms, including single-page applications built with React, Vue, Angular, etc.

### How do I configure the master key?

Master key configuration is currently manual via extension storage. A UI for this is planned for a future release.

---

## 🆘 Support

- **Email**: info@encryptio.it
- **Security Issues**: info@encryptio.it (confidential)

---

## 🔒 Privacy Policy

Encryptio Password Manager extension:

- Does NOT collect telemetry or analytics
- Does NOT track browsing history
- Does NOT send data to third parties
- Only communicates with encryptio.it API for vault sync

All data processing happens locally on your device.

---

## 📄 Permissions Explained

The extension requires these permissions:

| Permission | Why We Need It |
|------------|----------------|
| `storage` | Store encrypted credentials locally |
| `activeTab` | Access current tab to fill login forms |
| `notifications` | Show success/error messages |
| `scripting` | Inject autofill script into web pages |
| `host_permissions` | Access encryptio.it API and target websites for autofill |

**We never access more than necessary.** Scripts only run when explicitly triggered by you.

---

## 📜 License

Copyright © 2026 Encryptio. All rights reserved.

This software is proprietary. Redistribution or modification without authorization is prohibited.

---

## 📚 For Developers

Technical documentation, architecture details, and implementation specifics are available in [TECHNICAL.md](./TECHNICAL.md).

---

<div align="center">

**🔐 Encryptio - Secure Password Management Made Simple**

[![Website](https://img.shields.io/badge/website-encryptio.it-blue)](https://encryptio.it)

Made with 🛡️ in Italy

</div>
