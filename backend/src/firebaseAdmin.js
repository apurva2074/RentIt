// src/firebaseAdmin.js
const admin = require("firebase-admin");

// Helper function to get Firebase private key from multiple sources
function getFirebasePrivateKey() {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (privateKeyBase64) {
    // Decode from Base64
    const decoded = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    console.log('Using Base64 decoded private key');
    return decoded;
  } else if (privateKey) {
    // Handle escaped newlines in plain text (e.g., from .env)
    const cleanedKey = privateKey.replace(/\\n/g, '\n');
    console.log('Using plain text private key');
    return cleanedKey;
  } else {
    console.log('No private key found in environment variables');
    return null;
  }
}

// Initialize Firebase Admin with environment-based configuration
let serviceAccount;

// For production (Render), check for secret file first, then environment variables
if (process.env.NODE_ENV === 'production' || process.env.DEV_MODE === 'false') {
  console.log('=== Firebase Production Setup ===');
  
  // Try to read from secret file first (Render)
  const fs = require('fs');
  const path = require('path');
  
  try {
    // Check multiple possible secret file paths
    const possiblePaths = [
      '/etc/secrets/firebase-service-account.json',
      '/etc/secrets/serviceAccountKey.json',
      '/etc/secrets/firebase-serviceAccountKey.json',
      '/tmp/serviceAccountKey.json',
      './serviceAccountKey.json'
    ];
    
    let secretFilePath = null;
    for (const path of possiblePaths) {
      console.log(`Checking secret file path: ${path}`);
      if (fs.existsSync(path)) {
        secretFilePath = path;
        console.log(`Found Firebase secret file at: ${path}`);
        break;
      }
    }
    
    if (secretFilePath) {
      console.log('Using Firebase secret file from Render');
      const secretContent = fs.readFileSync(secretFilePath, 'utf8');
      console.log('Secret file content length:', secretContent.length);
      
      try {
        // Parse JSON with proper handling of private key newlines
        serviceAccount = JSON.parse(secretContent);
        console.log('Successfully parsed Firebase secret JSON');
        
        // Debug: Check private key format
        if (serviceAccount.private_key) {
          console.log('Private key exists in secret file');
          console.log('Private key starts with -----BEGIN:', serviceAccount.private_key.startsWith('-----BEGIN'));
          
          // Fix the private key by ensuring proper newlines
          if (serviceAccount.private_key.includes('\\n')) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
          console.log('Private key contains actual newlines:', serviceAccount.private_key.includes('\n'));
        }
      } catch (parseError) {
        console.error('Failed to parse secret JSON:', parseError.message);
        console.error('Attempting to fix JSON formatting...');
        
        // Try to fix common JSON issues
        try {
          // Remove any control characters and fix formatting
          const cleanedContent = secretContent
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\\n/g, '\\n') // Escape newlines in JSON
            .replace(/\n/g, '\\n');  // Convert actual newlines to escaped newlines
          
          serviceAccount = JSON.parse(cleanedContent);
          console.log('Successfully parsed Firebase secret JSON after cleaning');
          
          // Fix private key newlines
          if (serviceAccount.private_key && serviceAccount.private_key.includes('\\n')) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
        } catch (secondError) {
          console.error('Failed to parse even after cleaning:', secondError.message);
          console.error('Secret content preview:', secretContent.substring(0, 200) + '...');
          throw new Error('Unable to parse Firebase secret file. Please check the JSON format.');
        }
      }
    } else {
      // Fallback to environment variables
      console.log('No secret file found, using Firebase environment variables');
      
      const privateKey = getFirebasePrivateKey();
      
      if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
        throw new Error('Missing required Firebase environment variables. Please check FIREBASE_PRIVATE_KEY_BASE64 or FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID, and FIREBASE_CLIENT_EMAIL');
      }
      
      // Create service account object using helper function
      serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "firebase-admin-key",
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || "115408859884381730014",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`,
        universe_domain: "googleapis.com"
      };
      
      console.log('Service account created from environment variables');
      console.log('Private key exists:', !!serviceAccount.private_key);
      console.log('Private key starts with -----BEGIN:', serviceAccount.private_key.startsWith('-----BEGIN'));
    }
  } catch (error) {
    console.error('Error loading Firebase credentials:', error.message);
    throw error;
  }
} else {
  // Fallback to local file for development
  console.log('Using local service account key file');
  serviceAccount = require("../serviceAccountKey.json");
}

const firebaseConfig = {
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || "rentit-562ce",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID || "rentit-562ce"}.firebasestorage.app`
};

admin.initializeApp(firebaseConfig);

const db = admin.firestore();
module.exports = { admin, db };
