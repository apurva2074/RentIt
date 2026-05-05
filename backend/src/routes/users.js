// backend/src/routes/users.js
const express = require("express");
const { verifyTokenMiddleware } = require("../middleware/auth");
const logger = require('../utils/logger');
const { getWishlistCollection } = require("../utils/dataStandardization");
const { validate, schemas } = require("../middleware/validation");
const { logActivity } = require("../utils/activityLogger");

module.exports = ({ admin, db }) => {
  const router = express.Router();

  // Test endpoint (no auth required)
  router.get("/test", (req, res) => {
    console.log("🔍 TEST ENDPOINT - Backend is reachable!");
    console.log("🔹 Request received at:", new Date().toISOString());
    console.log("🔹 Request headers:", req.headers);
    console.log("🔹 Request origin:", req.headers.origin);
    
    return res.json({
      message: "Backend is working!",
      timestamp: new Date().toISOString(),
      headers: req.headers
    });
  });

  // Create or update user profile (owner/tenant)
  router.post("/profile", async (req, res) => {
    try {
      // 1) Check token
      const hdr = req.headers.authorization || "";
      const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
      if (!token) return res.status(401).json({ message: "Missing token" });

      // 2) Verify Firebase ID token
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;
      const email = decoded.email || '';

      // 3) Validate body
      const { name, phone, role } = req.body || {};
      if (!name || !role) {
        return res.status(400).json({ message: "name and role are required" });
      }
      if (!["owner", "tenant"].includes(role)) {
        return res.status(400).json({ message: "role must be 'owner' or 'tenant'" });
      }

      // 4) Write to Firestore
      await db.collection("users").doc(uid).set(
        {
          uid,
          email,
          name,
          phone: phone || "",
          role,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.json({ message: "Profile created successfully" });
    } catch (err) {
      console.error("users/profile error:", err);
      return res.status(500).json({ message: err.message || "Server error" });
    }
  });

  // Get current user profile
  router.get("/profile", verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.auth.uid;
      const userDoc = await db.collection("users").doc(userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      const userData = userDoc.data();
      
      return res.json({
        id: userDoc.id,
        email: req.auth.email,
        ...userData
      });
    } catch (err) {
      console.error("GET profile error:", err);
      return res.status(500).json({ message: err.message || "Server error" });
    }
  });

  // Update current user profile
  router.put("/profile", verifyTokenMiddleware, validate(schemas.userProfile()), async (req, res) => {
    try {
      const userId = req.auth.uid;
      const validatedData = req.validatedBody;
      
      // Extract validated fields
      const {
        name,
        phone,
        address,
        city,
        state,
        pincode,
        profilePicture
      } = validatedData;

      // Get existing user data
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const existingData = userDoc.data();
      
      // Backend validation
      const validationErrors = [];
      
      // Name validation
      if (name !== undefined) {
        if (!name.trim()) {
          validationErrors.push("Name is required");
        } else if (name.trim().length < 2) {
          validationErrors.push("Name must be at least 2 characters long");
        } else if (name.trim().length > 100) {
          validationErrors.push("Name must be less than 100 characters");
        } else if (!/^[a-zA-Z\s.]+$/.test(name.trim())) {
          validationErrors.push("Name can only contain letters, spaces, and dots");
        }
      }

      // Phone validation
      if (phone !== undefined && phone.trim()) {
        const phoneRegex = /^[6-9]\d{9}$/; // Indian mobile number format
        if (!phoneRegex.test(phone.trim().replace(/\D/g, ''))) {
          validationErrors.push("Please enter a valid 10-digit mobile number starting with 6-9");
        }
      }

      // Address validation
      if (address !== undefined && address.trim()) {
        if (address.trim().length < 5) {
          validationErrors.push("Address must be at least 5 characters long");
        } else if (address.trim().length > 500) {
          validationErrors.push("Address must be less than 500 characters");
        }
      }

      // City validation
      if (city !== undefined && city.trim()) {
        if (city.trim().length < 2) {
          validationErrors.push("City must be at least 2 characters long");
        } else if (city.trim().length > 50) {
          validationErrors.push("City must be less than 50 characters");
        } else if (!/^[a-zA-Z\s]+$/.test(city.trim())) {
          validationErrors.push("City can only contain letters and spaces");
        }
      }

      // State validation
      if (state !== undefined && state.trim()) {
        if (state.trim().length < 2) {
          validationErrors.push("State must be at least 2 characters long");
        } else if (state.trim().length > 50) {
          validationErrors.push("State must be less than 50 characters");
        } else if (!/^[a-zA-Z\s]+$/.test(state.trim())) {
          validationErrors.push("State can only contain letters and spaces");
        }
      }

      // PIN Code validation
      if (pincode !== undefined && pincode.trim()) {
        const pincodeRegex = /^\d{6}$/;
        if (!pincodeRegex.test(pincode.trim())) {
          validationErrors.push("PIN code must be exactly 6 digits");
        }
      }

      // Profile picture validation
      if (profilePicture !== undefined && profilePicture.trim()) {
        try {
          new URL(profilePicture);
          if (!profilePicture.startsWith('http')) {
            validationErrors.push("Profile picture must be a valid URL");
          }
        } catch {
          validationErrors.push("Profile picture must be a valid URL");
        }
      }

      // Return validation errors if any
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationErrors
        });
      }

      // Prepare update data
      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Only update fields that are provided
      if (name !== undefined) updateData.name = name.trim();
      if (phone !== undefined) updateData.phone = phone.trim();
      if (address !== undefined) updateData.address = address.trim();
      if (city !== undefined) updateData.city = city.trim();
      if (state !== undefined) updateData.state = state.trim();
      if (pincode !== undefined) updateData.pincode = pincode.trim();
      if (profilePicture !== undefined) updateData.profilePicture = profilePicture.trim();

      // Update profile
      await db.collection("users").doc(userId).update(updateData);

      // Log profile update activity
      await logActivity(userId, 'UPDATE', 'profile', userId, `Updated profile information`, {
        updatedFields: Object.keys(updateData),
        previousData: {
          name: existingData.name,
          phone: existingData.phone,
          address: existingData.address,
          city: existingData.city,
          state: existingData.state,
          pincode: existingData.pincode
        },
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip || req.connection.remoteAddress
      });

      // Get updated profile
      const updatedDoc = await db.collection("users").doc(userId).get();
      const updatedData = updatedDoc.data();

      return res.json({
        success: true,
        message: "Profile updated successfully",
        profile: {
          id: userId,
          email: req.auth.email,
          ...updatedData
        }
      });
    } catch (err) {
      console.error("UPDATE profile error:", err);
      return res.status(500).json({ message: err.message || "Server error" });
    }
  });

  // Upload profile picture
  router.post("/profile/picture", verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.auth.uid;
      const { profilePicture } = req.body;

      if (!profilePicture) {
        return res.status(400).json({ message: "Profile picture URL is required" });
      }

      // Update profile picture
      await db.collection("users").doc(userId).update({
        profilePicture: profilePicture,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Log profile picture update
      await logActivity(userId, 'UPDATE', 'profile', userId, `Updated profile picture`, {
        hasProfilePicture: !!profilePicture,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip || req.connection.remoteAddress
      });

      return res.json({
        message: "Profile picture updated successfully",
        profilePicture: profilePicture
      });
    } catch (err) {
      console.error("UPDATE profile picture error:", err);
      return res.status(500).json({ message: err.message || "Server error" });
    }
  });

  // Get user dashboard
  router.get("/dashboard", verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.auth.uid;
      
      // Initialize dashboard data
      const dashboardData = {
        rentedProperty: null,
        rentAmount: 0,
        nextRentDueDate: null,
        rentStatus: 'none',
        wishlistCount: 0,
        activeChatsCount: 0,
        profileCompletion: 0
      };

      try {
        // 1. Get currently rented property
        const rentalAgreementsQuery = await db.collection("rental_agreements")
          .where("tenantId", "==", userId)
          .where("status", "==", "active")
          .limit(1)
          .get();

        if (!rentalAgreementsQuery.empty) {
          const rentalAgreement = rentalAgreementsQuery.docs[0].data();
          const propertyId = rentalAgreement.propertyId;
          
          // Get property details
          const propertyDoc = await db.collection("properties").doc(propertyId).get();
          if (propertyDoc.exists) {
            const property = propertyDoc.data();
            
            // Get owner details with enhanced name resolution
            let ownerDetails = null;
            if (property.owner_uid) {
              try {
                // First try to get from Firestore users collection
                const ownerDoc = await db.collection("users").doc(property.owner_uid).get();
                
                let displayName = 'Property Owner';
                if (ownerDoc.exists) {
                  const ownerData = ownerDoc.data();
                  displayName = ownerData.name || 'Property Owner';
                  
                  // If name is generic or missing, try to get from Firebase Auth
                  if (!ownerData.name || ownerData.name === 'User' || ownerData.name.length < 2) {
                    try {
                      const authUser = await admin.auth().getUser(property.owner_uid);
                      if (authUser.displayName && authUser.displayName !== 'User') {
                        displayName = authUser.displayName;
                        console.log(`🔹 Using Firebase Auth display name for owner: ${displayName}`);
                      } else if (authUser.email) {
                        // Extract name from email as last resort
                        const emailName = authUser.email.split('@')[0];
                        displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
                        console.log(`🔹 Using email-derived name for owner: ${displayName}`);
                      }
                    } catch (authError) {
                      console.warn(`🔹 Could not fetch Firebase Auth owner: ${authError.message}`);
                    }
                  }
                  
                  ownerDetails = {
                    uid: property.owner_uid,
                    name: displayName,
                    email: ownerData.email || authUser?.email || '',
                    phone: ownerData.phone || ''
                  };
                } else {
                  // Fallback to Firebase Auth if no Firestore doc
                  try {
                    const authUser = await admin.auth().getUser(property.owner_uid);
                    let displayName = authUser.displayName || 'Property Owner';
                    if (!authUser.displayName || authUser.displayName === 'User' || authUser.displayName.length < 2) {
                      if (authUser.email) {
                        const emailName = authUser.email.split('@')[0];
                        displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
                      }
                    }
                    ownerDetails = {
                      uid: property.owner_uid,
                      name: displayName,
                      email: authUser.email || '',
                      phone: ''
                    };
                  } catch (authError) {
                    console.warn(`🔹 Could not fetch any owner data: ${authError.message}`);
                  }
                }
              } catch (error) {
                console.error('Error fetching owner details:', error);
              }
            }
            
            dashboardData.rentedProperty = {
              id: propertyId,
              title: property.title,
              address: property.address,
              type: property.type,
              bedrooms: property.bedrooms,
              images: []
            };
            
            dashboardData.ownerDetails = ownerDetails;
            dashboardData.rentAmount = rentalAgreement.rentAmount;
            dashboardData.rentStartDate = rentalAgreement.startDate;
            dashboardData.agreementStatus = rentalAgreement.status || 'active';
            dashboardData.nextRentDueDate = rentalAgreement.nextPaymentDate;
            
            // Add agreement details
            dashboardData.agreementDetails = {
              id: rentalAgreement.id,
              agreementId: rentalAgreement.agreementId || `AGR-${Date.now()}`,
              startDate: rentalAgreement.startDate,
              endDate: rentalAgreement.endDate,
              rentAmount: rentalAgreement.rentAmount,
              securityDeposit: rentalAgreement.securityDeposit || 0,
              terms: rentalAgreement.terms || 'Standard rental agreement terms apply',
              status: rentalAgreement.status || 'active',
              createdAt: rentalAgreement.createdAt,
              signedAt: rentalAgreement.signedAt,
              documentUrl: rentalAgreement.documentUrl || null
            };
            
            // Check rent status
            const now = new Date();
            const dueDate = rentalAgreement.nextPaymentDate.toDate ? 
              rentalAgreement.nextPaymentDate.toDate() : 
              new Date(rentalAgreement.nextPaymentDate);
            
            dashboardData.rentStatus = dueDate > now ? 'paid' : 'pending';
          }
        }

        // 2. Get wishlist count
        const wishlistQuery = await db.collection(getWishlistCollection())
          .where("tenantId", "==", userId)
          .get();
        
        dashboardData.wishlistCount = wishlistQuery.size;

        // 3. Get active chats count - Use tenant-specific filtering like the chat endpoint
        console.log("🔍 DASHBOARD - Getting active chats count for user:", userId);
        
        // Query for chats where user is explicitly the tenant
        const tenantChatsQuery = await db.collection("chats")
          .where("tenantId", "==", userId)
          .get();
        
        console.log("🔹 DASHBOARD - Found tenant chats:", tenantChatsQuery.size);
        
        // Query for chats where user is the owner (for property owners)
        const ownerChatsQuery = await db.collection("chats")
          .where("ownerId", "==", userId)
          .get();
        
        console.log("🔹 DASHBOARD - Found owner chats:", ownerChatsQuery.size);
        
        // Combine and deduplicate results
        const allChats = new Map();
        
        // Process tenant chats
        for (const doc of tenantChatsQuery.docs) {
          allChats.set(doc.id, { doc, role: 'tenant' });
        }
        
        // Process owner chats (only add if not already added as tenant)
        for (const doc of ownerChatsQuery.docs) {
          if (!allChats.has(doc.id)) {
            allChats.set(doc.id, { doc, role: 'owner' });
          }
        }
        
        console.log("🔹 DASHBOARD - Total unique chats:", allChats.size);
        
        // Apply the same filtering logic as the chat endpoint
        let validChats = 0;
        for (const [chatId, { doc, role }] of allChats) {
          const chatData = doc.data();
          
          // Skip disabled chats
          if (chatData.status === "disabled") {
            console.log("🔹 DASHBOARD - Skipping disabled chat:", chatId);
            continue;
          }
          
          // Verify property exists for all chats (both tenant and owner roles)
          try {
            const propertyDoc = await db.collection("properties").doc(chatData.propertyId).get();
            if (!propertyDoc.exists) {
              console.log("🔹 DASHBOARD - Skipping chat - property does not exist:", chatId, "propertyId:", chatData.propertyId);
              continue;
            }
            
            // For owner roles, verify property ownership
            if (role === "owner") {
              if (propertyDoc.data().owner_uid !== userId) {
                console.log("🔹 DASHBOARD - Skipping chat - user does not own property:", chatId);
                continue;
              }
            }
          } catch (propertyError) {
            console.log("🔹 DASHBOARD - Error verifying property existence:", propertyError.message);
            continue;
          }
          
          // For new users, filter out suspicious chats (no messages, recently created)
          const hasNoMessages = !chatData.lastMessage;
          const recentlyCreated = chatData.createdAt && 
            typeof chatData.createdAt.toDate === "function" && 
            (Date.now() - chatData.createdAt.toDate().getTime()) < 60000;
          
          if (hasNoMessages || recentlyCreated) {
            console.log("🔹 DASHBOARD - Filtering suspicious chat:", chatId, {
              hasNoMessages,
              recentlyCreated
            });
            continue;
          }
          
          validChats++;
          console.log("🔹 DASHBOARD - Valid chat counted:", chatId);
        }
        
        dashboardData.activeChatsCount = validChats;
        console.log("🔹 DASHBOARD - Final active chats count:", validChats);

        // 4. Calculate profile completion
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const fields = ['name', 'phone', 'address', 'city', 'state', 'pincode'];
          let filledFields = 0;
          
          fields.forEach(field => {
            if (userData[field] && userData[field].toString().trim().length > 0) {
              filledFields++;
            }
          });
          
          dashboardData.profileCompletion = Math.round((filledFields / fields.length) * 100);
        }

      } catch (firestoreError) {
        console.error("Firestore error in dashboard:", firestoreError);
      }

      return res.json({
        success: true,
        data: dashboardData
      });

    } catch (err) {
      console.error("Get user dashboard error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard data",
        error: err.message,
      });
    }
  });

  // GET /api/users/documents
  router.get("/documents", verifyTokenMiddleware, async (req, res) => {
    try {
      const userId = req.auth.uid;
      console.log(`🔹 Getting documents for user: ${userId}`);
      
      const userDoc = await db.collection("tenant_documents").doc(userId).get();
      
      if (!userDoc.exists) {
        console.log(`🔹 No documents found for user: ${userId}`);
        return res.json({
          verified: false,
          tenantDetails: null,
          documents: null
        });
      }
      
      const docData = userDoc.data();
      console.log(`🔹 Found documents for user: ${userId}, verified: ${docData.verified}`);
      
      return res.json({
        verified: docData.verified || false,
        tenantDetails: docData.tenantDetails || null,
        documents: docData.documents || null
      });
    } catch (err) {
      console.error("GET user documents error:", err);
      return res.status(500).json({
        message: "Failed to fetch user documents",
        error: err.message
      });
    }
  });

  // GET /api/users/:userId – get user profile (name, email, etc.)
router.get('/:userId', verifyTokenMiddleware, async (req, res) => {
  const { userId } = req.params;
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userData = doc.data();
    
    // Return the actual name from Firestore, with fallbacks
    let displayName = userData.name || 'Property Owner';
    
    // If name is missing or generic, try Firebase Auth
    if (!userData.name || userData.name === 'User' || userData.name.length < 2) {
      try {
        const authUser = await admin.auth().getUser(userId);
        if (authUser.displayName && authUser.displayName !== 'User') {
          displayName = authUser.displayName;
          console.log(`🔹 Using Firebase Auth display name: ${displayName}`);
        } else if (authUser.email) {
          const emailName = authUser.email.split('@')[0];
          displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
          console.log(`🔹 Using email-derived name: ${displayName}`);
        }
      } catch (authError) {
        console.warn(`🔹 Could not fetch Firebase Auth user: ${authError.message}`);
      }
    }
    
    // Return only safe fields
    res.json({
      uid: userId,
      name: displayName,
      email: userData.email || null,
      role: userData.role || null,
      createdAt: userData.createdAt || null,
      phone: userData.phone || '',
      profilePicture: userData.profilePicture || null
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  // PUT /api/users/:userId/public-key
// Store the public key of the authenticated user
router.put('/:userId/public-key', verifyTokenMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { publicKey } = req.body;

  // Security: only the user themselves can set their public key
  if (req.auth.uid !== userId) {
    return res.status(403).json({ error: 'Forbidden – you cannot set public key for another user' });
  }

  if (!publicKey || typeof publicKey !== 'string') {
    return res.status(400).json({ error: 'Invalid publicKey' });
  }

  try {
    await db.collection('users').doc(userId).set({ publicKey }, { merge: true });
    logger.log(`Public key saved for user: ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving public key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:userId/public-key
// Retrieve the public key of any user (only for authenticated requests)
router.get('/:userId/public-key', verifyTokenMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const publicKey = doc.data().publicKey || null;
    res.json({ publicKey });
  } catch (err) {
    console.error('Error fetching public key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  return router;
};
