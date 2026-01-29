# 🔐 Encryptio Password Manager - Browser Extension

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)]()
[![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Security](https://img.shields.io/badge/security-hardened-success.svg)](#-security-features)
[![License](https://img.shields.io/badge/license-proprietary-red.svg)]()

Enterprise-grade browser extension for secure password management with intelligent autofill and native integration with the [encryptio.it](https://encryptio.it) platform.

---

## 📋 Table of Contents

- [Features](#-features)
- [Security Features](#-security-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Usage](#-usage)
- [Workflow](#-workflow)
- [Technical Requirements](#-technical-requirements)
- [Development](#-development)
- [Security Policy](#-security-policy)
- [FAQ](#-faq)

---

## ✨ Features

### 🎯 Core Features

- **Intelligent Autofill**: Automatic credential filling on any website
- **Dashboard Integration**: Direct click-to-fill from encryptio.it dashboard
- **Password Generator**: Secure password creation (20+ characters, high entropy)
- **Vault Sync**: Real-time synchronization with cloud vault
- **Smart Matching**: Intelligent URL recognition with subdomain handling
- **Visual Feedback**: Real-time operation status overlays
- **Multi-Tab Support**: Simultaneous multi-session management

### 🚀 Advanced Features

- **Dynamic Script Injection**: Content script loaded only when needed
- **Auto Token Refresh**: Automatic API token renewal
- **Credential Expiration**: 5-minute TTL for temporary credentials
- **Session Management**: 15-minute inactivity timeout with auto-lock
- **Rate Limiting**: 5 requests/minute per endpoint with 5-min lockout
- **Retry Logic**: Automatic retry for pages with dynamic rendering
- **Framework Compatibility**: React, Vue, Angular, vanilla JS support
- **Cross-Origin Safety**: Strict API origin validation
- **Audit Logging**: Complete security event tracking
- **Clipboard Security**: Auto-clear after 30 seconds

---

## 🛡️ Security Features

### 🔒 Encryption & Cryptography

#### **1. In-Memory Encryption for Temporary Credentials**

Temporary credentials saved for autofill are protected with AES-256-GCM encryption:

```
Session Key (In-Memory)
    ↓
AES-256-GCM + Random IV
    ↓
chrome.storage.local (Encrypted)
    ↓
On-Demand Decryption
    ↓
Autofill (Credentials never in plaintext in storage)
```

**Technical Details**:
- Algorithm: **AES-256-GCM** (Galois/Counter Mode)
- Key: Generated with `crypto.subtle.generateKey()` (non-extractable)
- IV: 12 random bytes per operation
- Persistence: Key lost on extension restart
- TTL: Credentials removed after 5 minutes

**Implementation**: `crypto.js` (lines 6-74)

```javascript
// Session key generation (in-memory only)
async function getSessionKey() {
    if (!sessionKey) {
        sessionKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false, // Non-extractable
            ['encrypt', 'decrypt']
        );
    }
    return sessionKey;
}
```

---

#### **2. Vault Password Encryption**

For passwords stored in the vault with encrypted format:

```
Master Password (PBKDF2)
    ↓
100,000 Iterations SHA-256
    ↓
AES-256-GCM Key
    ↓
Password Decryption
```

**Technical Details**:
- Key derivation: **PBKDF2** with 100,000 iterations
- Hash: SHA-256
- Salt: Unique per password
- Format: `salt:iv:encrypted` (Base64)

**Implementation**: `crypto.js` (lines 76-139)

---

### 🔐 Authentication & Authorization

#### **3. Token-Based Authentication**

JWT Bearer token authentication system:

```
Login to encryptio.it
    ↓
Automatic API Token (/api/v1/token/auto)
    ↓
chrome.storage.local (Token)
    ↓
Authorization: Bearer <token>
    ↓
Vault API Access
```

**Security**:
- Token stored in `chrome.storage.local` (extension-isolated)
- Token validation before every operation
- Auto-refresh on expiration
- Automatic removal of invalid tokens

**Implementation**: `popup.js` (lines 631-728)

---

#### **4. Master Key Requirement**

The `getMasterPassword()` function **requires** explicit master key configuration with no fallback mechanism:

```javascript
async function getMasterPassword() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['master_key'], (result) => {
            if (result.master_key) {
                resolve(result.master_key);
            } else {
                reject(new Error('Master key not configured'));
            }
        });
    });
}
```

**Security Benefits**:
- ✅ No unsafe fallback to auth tokens
- ✅ Explicit configuration required
- ✅ Clear error messaging
- ✅ Prevents JWT misuse as encryption key

**Implementation**: `crypto.js` (lines 141-156)

---

### 🛡️ Attack Protection

#### **5. Content Security Policy (CSP)**

Protection of extension pages from XSS and code injection:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; base-uri 'self'; form-action 'none';"
}
```

**Restrictions**:
- ✅ Scripts: Only from extension (`'self'`)
- ✅ Objects/Embeds: Only from extension
- ✅ Base URI: Only from extension
- ❌ Form Actions: Completely disabled
- ❌ Inline Scripts: Blocked
- ❌ eval(): Blocked

**Implementation**: `manifest.json` (lines 36-38)

---

#### **6. XSS Prevention (Sanitization)**

All dynamic outputs use secure DOM APIs:

```javascript
// ❌ VULNERABLE
overlay.innerHTML = `<span>${message}</span>`;

// ✅ SECURE
const span = document.createElement('span');
span.textContent = message; // Auto-escaped
overlay.appendChild(span);
```

**Protections**:
- Zero use of `innerHTML` with dynamic content
- `textContent` for all user-facing text
- `createElement()` + `appendChild()` for DOM manipulation
- `escapeHtml()` for edge cases

**Implementation**: `content.js` (lines 66-75), `popup.js` (lines 562-566)

---

#### **7. API Origin Validation**

Strict validation of API calls to prevent MITM and malicious redirects:

```javascript
function secureFetch(url, options) {
    // 1. PRE-REQUEST validation
    if (!validateApiOrigin(url)) {
        throw new Error('Unauthorized origin');
    }

    const response = await fetch(url, options);

    // 2. POST-RESPONSE validation (redirect protection)
    if (!validateApiOrigin(response.url)) {
        throw new Error('Response from unauthorized origin');
    }

    return response;
}
```

**Authorized Domains**:
- `encryptio.it`
- `www.encryptio.it`
- `*.encryptio.it` (subdomains)

**Protections**:
- ✅ Target URL validation
- ✅ Response URL validation (handles redirects)
- ✅ DNS spoofing protection
- ✅ MITM redirect protection

**Implementation**: `popup.js` (lines 221-249), `encryptio-detector.js` (lines 10-38)

---

### 🔒 Privacy & Isolation

#### **8. Dynamic Content Script Injection**

Content scripts are injected dynamically only when needed, following the principle of least privilege:

```javascript
// Injected only when user clicks on password
await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    files: ['utils.js', 'crypto.js', 'content.js']
});
```

**Benefits**:
- 🔒 Reduced attack surface
- 🚀 Improved performance
- 🕵️ Privacy: no execution on unrelated sites
- ⚡ Lazy loading

**Implementation**:
- `manifest.json` (lines 26-31) - Only encryptio.it pre-loaded
- `background.js` (lines 45-69) - Dynamic injection functions
- `popup.js` (lines 99-123) - Injection on demand

---

#### **9. Zero Sensitive Logging**

All logging of sensitive data has been eliminated:

```javascript
// ❌ NEVER
console.log('Token:', token.substring(0, 20) + '...');
console.log('Password:', password);

// ✅ ALWAYS
console.log('[Encryptio] Operation completed successfully');
console.log('[Encryptio] Authentication established');
```

**Protections**:
- ❌ No API tokens in console
- ❌ No passwords (not even partial)
- ❌ No complete usernames
- ✅ Only generic status messages

**Implementation**: `content.js` (lines 263, 424), `popup.js` (line 308)

---

#### **10. Storage Isolation**

Extension data is isolated from web content:

```
chrome.storage.local (Extension-isolated)
    ├─ auth_token (API Token)
    ├─ master_key (Master Key)
    └─ encryptio_autofill_* (Encrypted credentials, TTL 5min)
```

**Security**:
- ✅ Not accessible from web pages
- ✅ Not accessible from other extensions
- ✅ Automatic cleanup after TTL
- ✅ Removal of credentials without timestamp

**Implementation**: `background.js` (lines 7-36)

---

#### **11. HMAC Integrity Verification**

All encrypted temporary data includes HMAC-SHA256 for integrity verification:

```javascript
// Encryption with HMAC
const encrypted = await encryptTemporaryData(data);
// Format: "encryptedData:hmacSignature"

// Decryption with verification
const data = await decryptTemporaryData(encrypted);
// Throws error if HMAC verification fails (tampering detected)
```

**Protection**:
- ✅ Detects tampering of encrypted storage
- ✅ HMAC-SHA256 signature
- ✅ Static integrity key
- ✅ Backward compatible with legacy format

**Implementation**: `crypto.js` (lines 23-149)

---

#### **12. Session Timeout & Auto-Lock**

Automatic session invalidation after inactivity:

```
Last Activity Timestamp
    ↓
15 Minutes Inactivity
    ↓
Auto-Lock: Clear token + credentials
    ↓
Notify User
```

**Features**:
- ⏱️ 15-minute inactivity timeout
- 🔄 Activity tracked on every message
- 🧹 Automatic cleanup of sensitive data
- 🔔 User notification
- 🔁 Check every 60 seconds

**Implementation**: `background.js` (lines 6-64)

---

#### **13. Rate Limiting**

Protects against brute force and abuse:

```javascript
apiRateLimiter: {
    maxRequests: 5,         // Max requests per window
    windowMs: 60000,        // 1 minute window
    lockoutMs: 300000       // 5 minute lockout
}
```

**Protection**:
- 🚦 5 requests/minute per endpoint
- 🔒 5-minute lockout after limit exceeded
- 📊 Per-endpoint tracking (not global)
- ⏱️ Sliding window
- 💬 Clear error messages

**Implementation**: `popup.js` (lines 218-342)

---

#### **14. Input Validation**

Advanced validation with SQL injection protection:

**Username Validation**:
- Max 255 characters
- Control character removal
- SQL pattern detection (OR/AND, UNION, DROP, --, /*, etc.)

**Password Validation**:
- Max 1024 characters (passphrase support)
- Null byte removal only
- Empty check

**Implementation**: `utils.js` (lines 6-64), `content.js` (lines 280-296)

---

#### **15. Secure Master Key Storage**

Master key stored in session storage (cleared on browser close):

```javascript
// Priority 1: chrome.storage.session (secure)
chrome.storage.session.get(['master_key'])

// Fallback: auto-migrate from local storage
// No more unsafe token fallback
```

**Security**:
- ✅ Session storage (cleared on browser close)
- ✅ Auto-migration from local storage
- ✅ Min 8 character requirement
- ❌ No token fallback

**Implementation**: `crypto.js` (lines 145-186)

---

#### **16. Certificate Pinning (Application-Level)**

HTTPS validation and certificate awareness:

```javascript
// Validate HTTPS connection
if (!response.url.startsWith('https://')) {
    throw new Error('Non-HTTPS connection detected');
}
```

**Limitations**:
- ⚠️ Full cert pinning not supported in Manifest V3
- ✅ HTTPS enforcement
- ✅ Origin validation
- ✅ Application-level checks

**Implementation**: `popup.js` (lines 265-342)

---

#### **17. Audit Logging**

Complete security event tracking:

**Events Tracked**:
- Login/Logout
- Vault access
- Autofill operations
- Password generation
- Session expiration
- Authentication failures
- Rate limit hits
- Integrity failures
- Certificate validation failures

**Features**:
- 📝 1000 event retention
- 🔍 Filterable by type/date
- 📤 JSON export capability
- 🧹 User-controlled clearing
- 📊 Statistics dashboard

**Implementation**: `audit.js` (complete module)

---

#### **18. Error Message Sanitization**

Generic user-facing errors, detailed logging in console:

```javascript
// ❌ BEFORE
throw new Error(`HTTP ${status}: ${errorText.substring(0, 200)}`);

// ✅ AFTER
console.error('[API Error]', status, statusText); // Detailed
throw new Error('Request failed. Please check your connection.'); // Generic
```

**Protection**:
- ✅ No stack traces to users
- ✅ No internal error details
- ✅ Context-appropriate messages
- ✅ Detailed console logs for debugging

**Implementation**: `popup.js` (lines 512-562)

---

#### **19. Clipboard Auto-Clear**

Automatic clipboard clearing for generated passwords:

```
Copy Password
    ↓
Show "Will auto-clear in 30s" notification
    ↓
30 Seconds
    ↓
Verify still in clipboard
    ↓
Clear clipboard
    ↓
Notify user "Clipboard cleared"
```

**Features**:
- ⏰ 30-second auto-clear
- 🔍 Verification before clear
- 🔔 Before/after notifications
- 🧹 Cancel on new copy
- ⚠️ Permission-aware

**Implementation**: `popup.js` (lines 254-295)

---

#### **20. No External Dependencies**

Zero external resource loading:

```javascript
// ❌ BEFORE (Tracking risk)
<img src="https://www.google.com/s2/favicons?domain=${domain}">

// ✅ AFTER (Zero tracking)
<img src="icon.png"> // Local fallback only
```

**Benefits**:
- 🕵️ No tracking (Google favicons removed)
- 🔒 No CDN dependencies
- ⚡ Faster loading
- 🛡️ CSP compliant
- 📦 Self-contained

**Implementation**: `popup.js` (lines 577-604)

---

## 🏗️ Architecture

### Component Overview

```
┌────────────────────────────────────────────┐
│                 BROWSER TAB                │
├────────────────────────────────────────────┤
│                                            │
│  ┌──────────────┐        ┌──────────────┐  │
│  │  Popup UI    │◄──────►│  Content     │  │
│  │  (popup.js)  │        │  Script      │  │
│  └──────┬───────┘        │ (content.js) │  │
│         │                └───────▲──────┘  │
│         │                        │         │
│         │                        │         │
│  ┌──────▼────────────────────────┴──────┐  │
│  │   Background Service Worker          │  │
│  │       (background.js)                │  │
│  └──────────────┬───────────────────────┘  │
│                 │                          │
└─────────────────┼──────────────────────────┘
                  │
         ┌────────▼────────┐
         │  chrome.storage │
         │  (Encrypted)    │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  Crypto Module  │
         │   (crypto.js)   │
         └─────────────────┘
                  │
         ┌────────▼────────┐
         │ Encryptio API   │
         │ (encryptio.it)  │
         └─────────────────┘
```

### File Structure

```
encryptio-extension/
├── manifest.json           # Extension configuration (Manifest V3)
├── background.js           # Service worker (messaging, cleanup)
├── popup.html              # Extension popup UI
├── popup.js                # Popup logic (vault, auth)
├── style.css               # UI styles
├── content.js              # Content script (autofill)
├── encryptio-detector.js   # Dashboard detector for encryptio.it
├── crypto.js               # AES-256-GCM encryption module
├── utils.js                # Utilities (URL matching, cleanup)
├── icons/                  # Extension icons (16/32/48/128px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── logo.png                # Primary logo
├── icon.png                # Fallback icon
├── README.md               # Documentation (this file)
└── SECURITY_IMPROVEMENTS.md # Security changelog
```

---

## 🚀 Installation

### Prerequisites

- Google Chrome 88+ / Microsoft Edge 88+ / Brave 1.20+
- Account on [encryptio.it](https://encryptio.it)
- (Optional) Master key configured for encrypted passwords

### Developer Mode Installation

1. **Open Chrome Extensions**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)

2. **Load extension**:
   - Click "Load unpacked"
   - Select the `encryptio-extension/` folder

3. **Verify installation**:
   - Encryptio icon visible in toolbar
   - Click icon → popup should open

### Production Installation (Coming Soon)

Extension will be available on:
- [Chrome Web Store](https://chrome.google.com/webstore)
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons)

---

## 📖 Usage

### 1️⃣ Authentication

**First Use**:

1. Open [encryptio.it](https://www.encryptio.it/auth/login)
2. Login with your credentials
3. Open the extension (click icon)
4. API token is automatically obtained

**Automatic Authentication**:
- Extension detects if you're logged into encryptio.it
- API token automatically generated via `/api/v1/token/auto`
- Token securely saved in `chrome.storage.local`

---

### 2️⃣ Autofill from Dashboard

**Fastest Method**:

1. Go to [encryptio.it/user/dashboard](https://www.encryptio.it/user/dashboard)
2. View your passwords
3. **Click the URL link** of any password
4. 🎉 New tab opens with credentials **auto-filled**!

**Behind the Scenes**:
```
Click link → Fetch vault → Match URL → Encrypt credentials
    ↓
Save to storage (encrypted) → Open new tab
    ↓
Content script injected → Decrypt → Fill fields → Cleanup
```

---

### 3️⃣ Autofill from Popup

**Manual Method**:

1. Navigate to desired login site
2. Click Encryptio icon in toolbar
3. **Search** for password in vault (search bar)
4. Click **"Insert"** on desired password
5. 🎉 Credentials automatically filled!

**Smart Suggestions**:
- Extension detects current domain
- Passwords for current site shown at top ("Suggestions for this site")
- Case-insensitive search by name/username

---

### 4️⃣ Password Generator

1. Open extension popup
2. Click **"🎲 Generator"** tab
3. Click **"Generate New"**
4. Secure password generated (20 characters, high entropy)
5. Click **"Copy"** to copy to clipboard

**Generated Password Features**:
- Length: 20 characters
- Characters: `a-z`, `A-Z`, `0-9`, special symbols
- Entropy: ~132 bits
- CSPRNG: Browser-native secure random

---

## 🔄 Workflow

### Complete Autofill Flow

```
┌────────────────────────────────────────────────────┐
│  1. USER CLICKS PASSWORD LINK ON DASHBOARD         │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  2. encryptio-detector.js INTERCEPTS CLICK         │
│     - Prevents default behavior                    │
│     - Obtains API token                            │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  3. FETCH VAULT API (secureFetch)                  │
│     - Pre/post request origin validation           │
│     - Authorization: Bearer <token>                │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  4. URL MATCHING                                   │
│     - Normalize target URL                         │
│     - Find exact/domain match in vault             │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  5. CREDENTIAL ENCRYPTION                          │
│     - encryptTemporaryData(credentials)            │
│     - Save to chrome.storage.local (encrypted)     │
│     - Key: encryptio_autofill_<url_hash>           │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  6. OPEN NEW TAB                                   │
│     - chrome.tabs.create({ url: targetUrl })       │
│     - Background listener active                   │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  7. CONTENT SCRIPT INJECTION                       │
│     - Tab loaded → inject utils.js, crypto.js,     │
│       content.js                                   │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  8. CONTENT SCRIPT EXECUTES                        │
│     - Read chrome.storage.local                    │
│     - Decrypt credentials (decryptTemporaryData)   │
│     - Match current URL with credentials           │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  9. AUTOFILL FIELDS                                │
│     - Find login fields (intelligent selectors)    │
│     - Fill username + password                     │
│     - Trigger events for JS frameworks             │
│     - Show success overlay                         │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│  10. CLEANUP                                       │
│     - Remove credentials from storage              │
│     - Background cleanup after 5 min (TTL)         │
└────────────────────────────────────────────────────┘
```

---

## 🔧 Technical Requirements

### Browser Compatibility

| Browser           | Minimum Version | Manifest V3 | Support |
|-------------------|-----------------|-------------|---------|
| Google Chrome     | 88+             | ✅          | ✅ Full  |
| Microsoft Edge    | 88+             | ✅          | ✅ Full  |
| Brave             | 1.20+           | ✅          | ✅ Full  |
| Opera             | 74+             | ✅          | ⚠️ Untested |
| Firefox           | N/A             | ❌          | ❌ No (partial MV3) |

### API Requirements

- **Encryptio Backend API**:
  - `POST /password/api/v1/token/auto` - Automatic token
  - `GET /password/api/v1/vault` - Vault retrieval
  - HTTPS required
  - CORS configured for extension

### Permissions

```json
{
  "permissions": [
    "storage",        // chrome.storage.local for tokens/credentials
    "activeTab",      // Active tab access for autofill
    "notifications",  // Browser notifications
    "scripting"       // Dynamic content script injection
  ],
  "host_permissions": [
    "https://*.encryptio.it/*",  // encryptio.it API
    "http://*/*",                // Autofill on HTTP sites
    "https://*/*"                // Autofill on HTTPS sites
  ]
}
```

---

## 👨‍💻 Development

### Environment Setup

```bash
# No build required (vanilla JS)
# Load extension in Chrome Developer Mode
```

### Code Structure

**Languages**:
- JavaScript ES6+ (vanilla, no frameworks)
- HTML5
- CSS3

**Architectural Patterns**:
- **Message Passing**: Communication between background ↔ content script ↔ popup
- **Event-Driven**: Listeners on DOM, Chrome APIs, storage changes
- **Async/Await**: All I/O operations asynchronous
- **Singleton**: Single in-memory session key

### Testing

**Recommended Manual Tests**:

1. **Storage Encryption**:
   ```javascript
   // In DevTools console (background script)
   chrome.storage.local.get(null, (data) => {
       console.log(data);
       // Verify encryptio_autofill_* is encrypted
   });
   ```

2. **Content Script Injection**:
   - Verify script NOT in DOM before autofill
   - Verify injection after clicking "Insert"

3. **API Validation**:
   - Modify `secureFetch()` to use different domain
   - Verify it throws "Unauthorized origin" error

4. **CSP Violations**:
   - Open popup → DevTools → Console
   - Look for CSP violations (should be none)

### Debugging

**Background Script**:
```
chrome://extensions/ → Encryptio → "Inspect service worker view"
```

**Popup**:
```
Right-click on popup → "Inspect"
```

**Content Script**:
```
Open DevTools on webpage → Console
Logs prefixed with [Encryptio]
```

---

## 🔒 Security Policy

### Vulnerability Reporting

**DO NOT open public issues for security vulnerabilities.**

Send reports to: **info@encryptio.it**

Include:
- Detailed vulnerability description
- Steps to reproduce
- Potential impact
- (Optional) Proof of concept

### Response Time

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: Within 30 days (severity-dependent)
- **Public Disclosure**: 90 days after fix

---

## ❓ FAQ

### Q: Does the extension work offline?
**A**: Partially. Password generator works offline. Autofill requires connection to fetch vault from API.

### Q: Where are passwords stored?
**A**: Passwords are **not** stored in the extension. They're retrieved in real-time from the cloud vault on encryptio.it. Only temporary credentials (TTL 5min) are saved encrypted in `chrome.storage.local`.

### Q: What happens if I restart the browser?
**A**: The session key (in-memory) is lost. Encrypted temporary credentials become inaccessible. Background worker generates new key on next use.

### Q: Does the extension read my passwords?
**A**: The extension accesses passwords **only when explicitly requested** for autofill. Passwords transit in plaintext **only in memory** during field filling. No logging, no third-party transmission.

### Q: Can I use the extension on Firefox?
**A**: Not yet. Firefox supports Manifest V3 only partially. Planned for future version.

### Q: Is the extension open source?
**A**: Code available for review but proprietary license. Do not redistribute without authorization.

### Q: How do I configure the master key?
**A**: Currently master key must be manually configured in `chrome.storage.local`. UI for master key configuration planned for future release.

### Q: Is the extension PCI-DSS compliant?
**A**: The extension implements security best practices including encryption at rest and in transit. Full PCI-DSS compliance requires backend infrastructure compliance.

---

## 📜 License

Copyright © 2026 Encryptio. All rights reserved.

Code available for review but **not open source**. Redistribution, modification, or commercial use not authorized without explicit permission.

---

## 🤝 Credits

**Developed by**: Encryptio Security Team
**Backend API**: [encryptio.it](https://encryptio.it)
**Crypto Libraries**: Web Crypto API (native browser)
**Standards**: OWASP, NIST, ISO 27001

---

## 📞 Support

- **Email**: info@encryptio.it

---

<div align="center">

**🔐 Encryptio - Enterprise Security, Consumer Simplicity**

[![Website](https://img.shields.io/badge/website-encryptio.it-blue)](https://encryptio.it)

Made with 🛡️ in Italy

</div>
