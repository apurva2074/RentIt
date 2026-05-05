// src/firebaseAdmin.js
const admin = require('firebase-admin');
const fs = require('fs');

function getFirebasePrivateKey() {
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const privateKeyPlain = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKeyBase64) {
    console.log('📦 Using Base64-encoded private key');
    try {
      const decoded = Buffer.from(privateKeyBase64, 'base64').toString('utf-8');
      // Validate it looks like a PEM key
      if (!decoded.includes('-----BEGIN PRIVATE KEY-----')) {
        console.warn('⚠️ Decoded key does not contain BEGIN PRIVATE KEY marker');
      }
      return decoded;
    } catch (err) {
      console.error('❌ Failed to decode Base64 private key:', err.message);
      throw err;
    }
  }

  if (privateKeyPlain) {
    console.log('📝 Using plain text private key – fixing newlines');
    // Replace literal '\n' with actual newline characters
    let fixed = privateKeyPlain.replace(/\\n/g, '\n');
    // Ensure it has proper PEM markers
    if (!fixed.includes('-----BEGIN PRIVATE KEY-----')) {
      fixed = '-----BEGIN PRIVATE KEY-----\n' + fixed;
    }
    if (!fixed.includes('-----END PRIVATE KEY-----')) {
      fixed = fixed + '\n-----END PRIVATE KEY-----';
    }
    return fixed;
  }

  return null;
}

let serviceAccount;
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = getFirebasePrivateKey();

if (projectId && clientEmail && privateKey) {
  serviceAccount = { projectId, clientEmail, privateKey };
  console.log('✅ Service account created from environment variables');
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log('✅ Service account loaded from JSON string');
  } catch (err) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
    throw err;
  }
} else {
  // Attempt to load from file (local development only – do not rely on this in production)
  const possiblePaths = [
    '/etc/secrets/firebase-service-account.json',
    '/etc/secrets/serviceAccountKey.json',
    './serviceAccountKey.json',
  ];
  let loaded = false;
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      try {
        serviceAccount = JSON.parse(fs.readFileSync(path, 'utf8'));
        console.log(`✅ Service account loaded from file: ${path}`);
        loaded = true;
        break;
      } catch (err) {
        console.warn(`⚠️ Failed to parse ${path}:`, err.message);
      }
    }
  }
  if (!loaded) {
    throw new Error('No Firebase credentials found. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or FIREBASE_PRIVATE_KEY_BASE64)');
  }
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.projectId || projectId,
});

const db = admin.firestore();
const auth = admin.auth();

console.log('✅ Firebase Admin SDK initialized successfully');

module.exports = { admin, db, auth };
