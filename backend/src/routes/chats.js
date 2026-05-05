// backend/src/routes/chats.js
// Usage: const chatsRouter = require('./routes/chats')({ admin, db });
// then app.use('/api/chats', chatsRouter);

const express = require("express");
const { verifyTokenMiddleware } = require("../middleware/auth");
const logger = require('../utils/logger');

module.exports = ({ admin, db }) => {
  const router = express.Router();

  // Test endpoint
  router.get("/test", (req, res) => {
    res.json({ message: "Chat API is working", timestamp: new Date().toISOString() });
  });

  // POST /api/chats - Create or get existing chat between tenant and owner
  router.post("/", verifyTokenMiddleware, async (req, res) => {
    try {
      // STEP 1️⃣: Extract and validate request data
      const currentUserId = req.auth.uid;
      const { propertyId, ownerId } = req.body;

      logger.log("Chat creation request:", { currentUserId, propertyId, ownerId });
      logger.log("🚨 CRITICAL DEBUG - Chat Creation Analysis:");
      logger.log("🔹 Current User (tenant):", currentUserId);
      logger.log("🔹 Property ID:", propertyId);
      logger.log("🔹 Owner ID:", ownerId);
      logger.log("🔹 Request Body:", req.body);
      logger.log("🔹 Auth Token User:", req.auth?.uid);
      logger.log("🔹 User Email:", req.auth?.email);

      // Validate required fields
      if (!propertyId || !ownerId) {
        return res.status(400).json({ 
          message: "propertyId and ownerId are required",
          code: "MISSING_FIELDS"
        });
      }

      // STEP 2️⃣: Verify user authentication and role
      if (!currentUserId) {
        return res.status(401).json({ 
          message: "User not authenticated",
          code: "NOT_AUTHENTICATED"
        });
      }

      // STEP 2️⃣: Fetch and validate property
      const propertyRef = db.collection("properties").doc(propertyId);
      const propertySnap = await propertyRef.get();
      
      if (!propertySnap.exists) {
        logger.log("Property not found:", propertyId);
        return res.status(404).json({ 
          message: "Property not found",
          code: "PROPERTY_NOT_FOUND"
        });
      }

      const propertyData = propertySnap.data();
      logger.log("Property found:", { propertyId, owner_uid: propertyData.owner_uid });

      // STEP 2️⃣: Validate property ownership
      if ((propertyData.ownerId || propertyData.owner_uid) !== ownerId) {
        return res.status(403).json({ 
          message: "Invalid property owner",
          code: "INVALID_OWNER"
        });
      }

      // STEP 2️⃣: Check if user is tenant (not owner of this property)
      if ((propertyData.ownerId || propertyData.owner_uid) === currentUserId) {
        return res.status(403).json({ 
          message: "Property owners cannot initiate chat with themselves",
          code: "OWNER_SELF_CHAT"
        });
      }

      // STEP 2️⃣: Check if chat already exists (same property, same tenant, same owner)
      const chatsRef = db.collection("chats");
      const existingChatQuery = await chatsRef
        .where("propertyId", "==", propertyId)
        .where("tenantId", "==", currentUserId)
        .where("ownerId", "==", ownerId)
        .get();

      logger.log("🔍 EXISTING CHAT CHECK:");
      logger.log("🔹 Query results:", existingChatQuery.size);
      
      if (!existingChatQuery.empty) {
        const existingChat = existingChatQuery.docs[0];
        const existingChatData = existingChat.data();
        logger.log("🔹 Found existing chat:", existingChat.id);
        logger.log("🔹 Existing chat data:", {
          propertyId: existingChatData.propertyId,
          tenantId: existingChatData.tenantId,
          ownerId: existingChatData.ownerId,
          createdAt: existingChatData.createdAt
        });
        
        // Return existing chat
        const chatDoc = existingChatQuery.docs[0];
        logger.log("Returning existing chat:", chatDoc.id);
        return res.json({
          chatId: chatDoc.id,
          ...chatDoc.data(),
          isNew: false
        });
      }

      // ADDITIONAL SAFEGUARD: Check for ANY existing chat for this property and tenant
      // This prevents duplicate chats even if ownerId somehow differs
      const anyExistingChatQuery = await chatsRef
        .where("propertyId", "==", propertyId)
        .where("tenantId", "==", currentUserId)
        .get();

      logger.log("🔍 ADDITIONAL SAFEGUARD CHECK:");
      logger.log("🔹 Any existing chats for this property/tenant:", anyExistingChatQuery.size);
      
      if (!anyExistingChatQuery.empty) {
        logger.log("⚠️  FOUND EXISTING CHAT FOR PROPERTY/TENANT - PREVENTING DUPLICATE");
        const existingChat = anyExistingChatQuery.docs[0];
        const existingChatData = existingChat.data();
        logger.log("🔹 Returning existing chat instead of creating duplicate:", existingChat.id);
        
        return res.json({
          chatId: existingChat.id,
          ...existingChatData,
          isNew: false,
          warning: "Duplicate chat creation prevented"
        });
      }

      logger.log("🔹 No existing chat found, creating new chat...");

      // STEP 3️⃣: Create new chat record
      const newChatData = {
        propertyId,
        ownerId,
        tenantId: currentUserId,
        participants: [currentUserId, ownerId],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: null,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        status: "active", // active, readonly, disabled
        propertyStatus: propertyData.status || "available" // available, rented
      };

      logger.log("🔹 Creating new chat with data:", newChatData);
      
      const newChat = await chatsRef.add(newChatData);

      logger.log("🚨 NEW CHAT CREATED:", newChat.id);
      logger.log("🔹 Chat created for:", {
        propertyId,
        tenantId: currentUserId,
        ownerId,
        propertyTitle: propertyData.title
      });

      // Get the created chat
      const createdChat = await newChat.get();
      
      return res.status(201).json({
        chatId: createdChat.id,
        ...createdChat.data(),
        isNew: true
      });
    } catch (err) {
      logger.error("Create chat error:", err);
      return res.status(500).json({ 
        message: "Server error", 
        error: err.message,
        code: "INTERNAL_ERROR"
      });
    }
  });

  // GET /api/chats - Get user's chats (Inbox)
  router.get("/", verifyTokenMiddleware, async (req, res) => {
    try {
      // STEP 4️⃣: Authenticate user
      const currentUserId = req.auth.uid;
      logger.log("Getting chats for user:", currentUserId);

      if (!currentUserId) {
        return res.status(401).json({ 
          message: "User not authenticated",
          code: "NOT_AUTHENTICATED"
        });
      }

      // STEP 4️⃣: Fetch chats where user is tenant OR owner
      // OPTIMIZATION: Use more specific queries for better performance with large datasets
      let chatsQuery;
      
      // First try tenant-specific query (most common case for tenants)
      logger.log("Fetching chats for user:", currentUserId, "optimizing for performance...");
      
      // Query for chats where user is explicitly the tenant
      const tenantChatsQuery = await db.collection("chats")
        .where("tenantId", "==", currentUserId)
        .get();
      
      logger.log("Found tenant chats:", tenantChatsQuery.size);
      
      // DETAILED LOGGING: Log each tenant chat found
      tenantChatsQuery.docs.forEach(doc => {
        const chatData = doc.data();
        logger.log("TENANT CHAT FOUND:", {
          chatId: doc.id,
          propertyId: chatData.propertyId,
          tenantId: chatData.tenantId,
          ownerId: chatData.ownerId,
          lastMessage: chatData.lastMessage
        });
      });
      
      // Query for chats where user is the owner (for property owners)
      const ownerChatsQuery = await db.collection("chats")
        .where("ownerId", "==", currentUserId)
        .get();
      
      logger.log("Found owner chats:", ownerChatsQuery.size);
      
      // DETAILED LOGGING: Log each owner chat found
      ownerChatsQuery.docs.forEach(doc => {
        const chatData = doc.data();
        logger.log("OWNER CHAT FOUND:", {
          chatId: doc.id,
          propertyId: chatData.propertyId,
          tenantId: chatData.tenantId,
          ownerId: chatData.ownerId,
          lastMessage: chatData.lastMessage
        });
      });
      
      // Combine results and remove duplicates (in case user is both tenant and owner of same chat)
      const allChats = new Map();
      
      // CRITICAL: Only include tenant chats for tenant users
      // This ensures tenants only see chats they initiated, regardless of ownership
      logger.log("Processing tenant chats...");
      for (const doc of tenantChatsQuery.docs) {
        const chatData = doc.data();
        logger.log("Adding tenant chat:", doc.id, "for property:", chatData.propertyId);
        allChats.set(doc.id, { doc, role: 'tenant' });
      }
      
      // SAFETY CHECK: Only process owner chats if user actually owns properties
      // This prevents tenants from seeing owner chats for the same owner
      logger.log("Checking for owner chats...");
      let hasOwnerChats = false;
      for (const doc of ownerChatsQuery.docs) {
        const chatData = doc.data();
        logger.log("Found potential owner chat:", doc.id, "for property:", chatData.propertyId);
        
        // CRITICAL: Verify this user actually owns the property in this chat
        try {
          const propertyDoc = await db.collection("properties").doc(chatData.propertyId).get();
          if (propertyDoc.exists) {
            const propertyOwner = propertyDoc.data().ownerId || propertyDoc.data().owner_uid;
            if (propertyOwner === currentUserId) {
              logger.log("User actually owns property, adding owner chat:", doc.id);
              allChats.set(doc.id, { doc, role: 'owner' });
              hasOwnerChats = true;
            } else {
              logger.log("User does NOT own property (owner mismatch), skipping owner chat:", doc.id);
            }
          } else {
            logger.log("Property not found, skipping owner chat:", doc.id);
          }
        } catch (propertyError) {
          logger.log("Error verifying property ownership for owner chat:", propertyError.message);
        }
      }
      
      logger.log("User has owner chats:", hasOwnerChats);
      logger.log("Total unique chats after filtering:", allChats.size);

      // OPTIMIZATION: Collect property IDs for batch fetching
      const propertyIds = [];
      const otherUserIds = new Set();

      const chats = [];
      for (const [chatId, { doc, role }] of allChats) {
        const chatData = doc.data();
        logger.log("Processing chat:", chatId, "role:", role, chatData);
        
        // Use the pre-determined role from our optimized query
        const userRole = role;
        
        // STEP 8️⃣: Business Rules - Check if chat should be accessible
        if (chatData.status === "disabled") {
          logger.log("Skipping disabled chat:", chatId);
          continue; // Skip disabled chats
        }
        
        // OPTIMIZATION: Skip additional verification since we already queried with specific tenantId/ownerId
        // The queries ensure user is either tenant or owner, no need for additional checks
        
        // ADDITIONAL: For owner roles, still verify property ownership for security
        if (userRole === "owner") {
          // Verify this user actually owns the property in this chat
          try {
            const propertyDoc = await db.collection("properties").doc(chatData.propertyId).get();
            if (!propertyDoc.exists || propertyDoc.data().owner_uid !== currentUserId) {
              logger.log("Skipping chat - user does not actually own property:", chatId);
              continue;
            }
          } catch (propertyError) {
            logger.log("Error verifying property ownership:", propertyError.message);
            continue;
          }
        }
        
        // ADDITIONAL: For tenant roles, verify property exists
        if (userRole === "tenant") {
          try {
            const propertyDoc = await db.collection("properties").doc(chatData.propertyId).get();
            if (!propertyDoc.exists) {
              logger.log("Skipping chat - property does not exist:", chatId, "propertyId:", chatData.propertyId);
              continue;
            }
          } catch (propertyError) {
            logger.log("Error verifying property existence for tenant chat:", propertyError.message);
            continue;
          }
        }
        
        // STEP 8️⃣: Business Rules - Check property status
        if (chatData.propertyStatus === "rented" && chatData.status === "readonly") {
          logger.log("Chat is read-only due to rented property:", chatId);
          // Mark as read-only but still include in list
        }
        
        // Collect property ID for batch fetching
        propertyIds.push(chatData.propertyId);
        
        // Collect other user ID for batch fetching
        const otherUserId = chatData.ownerId === currentUserId ? chatData.tenantId : chatData.ownerId;
        otherUserIds.add(otherUserId);

        chats.push({
          chatId: doc.id,
          ...chatData,
          userRole, // Add user's role in this chat
          isReadonly: chatData.status === "readonly" || chatData.propertyStatus === "rented"
        });
      }

      // OPTIMIZATION: Batch fetch properties to avoid N+1 queries
      let properties = {};
      if (propertyIds.length > 0) {
        try {
          logger.log("Batch fetching", propertyIds.length, "properties");
          const propertiesQuery = await db.collection("properties")
            .where(admin.firestore.FieldPath.documentId(), "in", propertyIds)
            .get();
          
          propertiesQuery.forEach(doc => {
            properties[doc.id] = doc.data();
          });
          logger.log("Fetched", Object.keys(properties).length, "properties");
        } catch (batchError) {
          logger.log("Batch property fetch failed, falling back to individual queries:", batchError.message);
          // Fallback to individual queries if batch fails (Firestore limit 10 items)
          for (const propertyId of propertyIds) {
            try {
              const propertyDoc = await db.collection("properties").doc(propertyId).get();
              if (propertyDoc.exists) {
                properties[propertyId] = propertyDoc.data();
              }
            } catch (individualError) {
              logger.log("Failed to fetch property", propertyId, ":", individualError.message);
            }
          }
        }
      }

      // OPTIMIZATION: Batch fetch users to avoid N+1 queries
      let users = {};
      if (otherUserIds.size > 0) {
        try {
          logger.log("Batch fetching", otherUserIds.size, "users");
          const usersQuery = await db.collection("users")
            .where(admin.firestore.FieldPath.documentId(), "in", Array.from(otherUserIds))
            .get();
          
          usersQuery.forEach(doc => {
            users[doc.id] = doc.data();
          });
          logger.log("Fetched", Object.keys(users).length, "users");
        } catch (batchError) {
          logger.log("Batch user fetch failed, falling back to individual queries:", batchError.message);
          // Fallback to individual queries
          for (const userId of otherUserIds) {
            try {
              const userDoc = await db.collection("users").doc(userId).get();
              if (userDoc.exists) {
                users[userId] = userDoc.data();
              }
            } catch (individualError) {
              logger.log("Failed to fetch user", userId, ":", individualError.message);
            }
          }
        }
      }

      // Attach property and user data to chats
      for (const chat of chats) {
        // Attach property data
        const propertyData = properties[chat.propertyId];
        chat.property = propertyData ? {
          ...propertyData,
          title: propertyData.title || "Untitled Property",
          // Attach only necessary UI fields
          address: propertyData.address,
          rent: propertyData.rent,
          bedrooms: propertyData.bedrooms,
          type: propertyData.type,
          status: propertyData.status
        } : null;

        // Attach other user data
        const otherUserId = chat.ownerId === currentUserId ? chat.tenantId : chat.ownerId;
        const otherUserData = users[otherUserId];
        
        if (otherUserData) {
          let displayName = otherUserData.name;
          
          // If name is missing or generic, try Firebase Auth
          if (!displayName || displayName === 'User' || displayName.length < 2) {
            try {
              const authUser = await admin.auth().getUser(otherUserId);
              if (authUser.displayName && authUser.displayName !== 'User') {
                displayName = authUser.displayName;
                logger.log(`🔹 Using Firebase Auth display name for ${otherUserId}: ${displayName}`);
              } else if (authUser.email) {
                const emailName = authUser.email.split('@')[0];
                displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
                logger.log(`🔹 Using email-derived name for ${otherUserId}: ${displayName}`);
              }
            } catch (authError) {
              logger.warn(`🔹 Could not fetch Firebase Auth user ${otherUserId}: ${authError.message}`);
            }
          }
          
          chat.otherUser = {
            ...otherUserData,
            name: displayName || "Unknown User",
            email: otherUserData.email
          };
        } else {
          chat.otherUser = null;
        }
      }

      // Sort chats by lastMessageTime in descending order (client-side sorting)
      chats.sort((a, b) => {
        const timeA = a.lastMessageTime && typeof a.lastMessageTime.toDate === "function" 
          ? a.lastMessageTime.toDate().getTime() : 0;
        const timeB = b.lastMessageTime && typeof b.lastMessageTime.toDate === "function" 
          ? b.lastMessageTime.toDate().getTime() : 0;
        return timeB - timeA;
      });

      logger.log("=== FINAL CHAT ANALYSIS FOR TENANT:", currentUserId, "===");
      logger.log("Total chats being processed:", chats.length);
      
      // CRITICAL DEBUG: Check if this is a new user scenario
      if (chats.length > 0) {
        logger.log("🚨 NEW USER DEBUG - Found", chats.length, "chats for user:", currentUserId);
        logger.log("🔹 Checking if user should have any chats...");
        
        chats.forEach((chat, index) => {
          logger.log(`\n--- CHAT ${index + 1} ANALYSIS ---`);
          logger.log("Chat ID:", chat.chatId);
          logger.log("Property ID:", chat.propertyId);
          logger.log("Property Title:", chat.property?.title);
          logger.log("Tenant ID:", chat.tenantId);
          logger.log("Owner ID:", chat.ownerId);
          logger.log("Current User ID:", currentUserId);
          logger.log("User Role:", chat.userRole);
          logger.log("Is Tenant Chat?", chat.tenantId === currentUserId);
          logger.log("Is Owner Chat?", chat.ownerId === currentUserId);
          logger.log("Should Tenant See This?", chat.tenantId === currentUserId || chat.ownerId === currentUserId);
          logger.log("Last Message:", chat.lastMessage);
          logger.log("Chat Created At:", chat.createdAt && typeof chat.createdAt.toDate === "function" ? chat.createdAt.toDate() : chat.createdAt);
          logger.log("----------------------------");
        });
      } else {
        logger.log("✅ CORRECT: New user has 0 chats");
      }
      
      logger.log("\n=== SUMMARY ===");
      const tenantOnlyChats = chats.filter(chat => chat.tenantId === currentUserId);
      const ownerOnlyChats = chats.filter(chat => chat.ownerId === currentUserId && chat.tenantId !== currentUserId);
      logger.log("Chats where user is TENANT:", tenantOnlyChats.length);
      logger.log("Chats where user is OWNER:", ownerOnlyChats.length);
      logger.log("Total chats returned:", chats.length);
      logger.log("==================\n");

      // Determine user's primary role and filter appropriately
      const isOwner = ownerChatsQuery.size > 0 &&
        [...allChats.values()].some(({role}) => role === 'owner');

      const finalChats = isOwner
        ? chats.filter(c => c.ownerId === currentUserId)
        : chats.filter(c => c.tenantId === currentUserId);

      return res.json({ 
        chats: finalChats, 
        count: finalChats.length, 
        userRole: isOwner ? 'owner' : 'tenant' 
      });
    } catch (err) {
      logger.error("Get chats error - Full error:", err);
      logger.error("Error stack:", err.stack);
      return res.status(500).json({ 
        message: "Server error", 
        error: err.message,
        code: "INTERNAL_ERROR"
      });
    }
  });

  // GET /api/chats/:chatId - Get specific chat with messages
  router.get("/:chatId", verifyTokenMiddleware, async (req, res) => {
    try {
      // STEP 5️⃣: Authenticate user
      const currentUserId = req.auth.uid;
      const { chatId } = req.params;

      if (!currentUserId) {
        return res.status(401).json({ 
          message: "User not authenticated",
          code: "NOT_AUTHENTICATED"
        });
      }

      // STEP 5️⃣: Get chat details
      const chatDoc = await db.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        return res.status(404).json({ 
          message: "Chat not found",
          code: "CHAT_NOT_FOUND"
        });
      }

      const chatData = chatDoc.data();

      // STEP 5️⃣: Validate user is tenant or owner of this chat
      if (!chatData.participants.includes(currentUserId)) {
        return res.status(403).json({ 
          message: "Access denied - You are not a participant in this chat",
          code: "ACCESS_DENIED"
        });
      }

      // STEP 8️⃣: Business Rules - Check chat status
      if (chatData.status === "disabled") {
        return res.status(403).json({ 
          message: "Chat has been disabled",
          code: "CHAT_DISABLED"
        });
      }

      // STEP 5️⃣: Get messages
      const messagesQuery = await db.collection("chats").doc(chatId).collection("messages")
        .orderBy("timestamp", "asc")
        .get();

      const messages = messagesQuery.docs.map(doc => ({
        messageId: doc.id,
        ...doc.data()
      }));

      // STEP 5️⃣: Get property details
      let propertyData = null;
      try {
        const propertyDoc = await db.collection("properties").doc(chatData.propertyId).get();
        propertyData = propertyDoc.exists ? propertyDoc.data() : null;
      } catch (propertyError) {
        logger.log("Error fetching property data:", propertyError.message);
      }

      // STEP 5️⃣: Get other participant's info
      const otherUserId = chatData.ownerId === currentUserId ? chatData.tenantId : chatData.ownerId;
      let otherUserData = null;
      
      try {
        const otherUserDoc = await db.collection("users").doc(otherUserId).get();
        otherUserData = otherUserDoc.exists ? otherUserDoc.data() : null;
      } catch (userError) {
        logger.log("Error fetching user data:", userError.message);
      }

      // Determine user's role in this chat
      const userRole = chatData.ownerId === currentUserId ? "owner" : "tenant";

      // STEP 8️⃣: Business Rules - Check if chat is read-only
      const isReadonly = chatData.status === "readonly" || chatData.propertyStatus === "rented";

      return res.json({
        chatId,
        ...chatData,
        messages,
        property: propertyData,
        otherUser: otherUserData,
        userRole,
        isReadonly,
        canSendMessage: !isReadonly && chatData.status === "active"
      });
    } catch (err) {
      logger.error("Get chat error:", err);
      return res.status(500).json({ 
        message: "Server error", 
        error: err.message,
        code: "INTERNAL_ERROR"
      });
    }
  });

  // POST /api/chats/:chatId/messages - Send message
  router.post("/:chatId/messages", verifyTokenMiddleware, async (req, res) => {
    try {
      // STEP 6️⃣: Authenticate user
      const currentUserId = req.auth.uid;
      const { chatId } = req.params;
      const { message } = req.body;

      if (!currentUserId) {
        return res.status(401).json({ 
          message: "User not authenticated",
          code: "NOT_AUTHENTICATED"
        });
      }

      // STEP 6️⃣: Validate request data
      if (!message || !message.trim()) {
        return res.status(400).json({ 
          message: "Message is required",
          code: "MISSING_MESSAGE"
        });
      }

      // STEP 6️⃣: Check message length
      if (message.trim().length > 1000) {
        return res.status(400).json({ 
          message: "Message too long (max 1000 characters)",
          code: "MESSAGE_TOO_LONG"
        });
      }

      // STEP 6️⃣: Get chat details and validate user belongs to chat
      const chatDoc = await db.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        return res.status(404).json({ 
          message: "Chat not found",
          code: "CHAT_NOT_FOUND"
        });
      }

      const chatData = chatDoc.data();

      // STEP 6️⃣: Check if user belongs to chat
      if (!chatData.participants.includes(currentUserId)) {
        return res.status(403).json({ 
          message: "Access denied - You are not a participant in this chat",
          code: "ACCESS_DENIED"
        });
      }

      // STEP 8️⃣: Business Rules - Check if user can send messages
      const isOwner = chatData.ownerId === currentUserId;
      const isReadonly = chatData.status === "readonly" || chatData.propertyStatus === "rented";
      
      // Allow owners to always reply to their chats, even if property is rented
      // Tenants cannot send messages if property is rented
      if (isReadonly && !isOwner) {
        return res.status(403).json({ 
          message: "Cannot send messages to read-only chat",
          code: "READONLY_CHAT"
        });
      }

      if (chatData.status === "disabled") {
        return res.status(403).json({ 
          message: "Chat has been disabled",
          code: "CHAT_DISABLED"
        });
      }

      // STEP 6️⃣: Sanitize message
      const sanitizedMessage = message.trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .substring(0, 1000); // Ensure max length

      // STEP 6️⃣: Save message with proper structure
      const messageRef = await db.collection("chats").doc(chatId).collection("messages").add({
        chatId: chatId,
        senderId: currentUserId,
        senderRole: chatData.ownerId === currentUserId ? "owner" : "tenant",
        message: sanitizedMessage,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false, // Message is unread initially
        readAt: null,
        edited: false,
        editedAt: null,
        deleted: false,
        deletedAt: null
      });

      // STEP 6️⃣: Update chat's last message
      await db.collection("chats").doc(chatId).update({
        lastMessage: sanitizedMessage,
        lastMessageTime: admin.firestore.FieldValue.serverTimestamp(),
        lastMessageSenderId: currentUserId
      });

      // STEP 6️⃣: Get the created message
      const createdMessage = await messageRef.get();

      logger.log("Message sent successfully:", createdMessage.id);

      return res.status(201).json({
        messageId: createdMessage.id,
        ...createdMessage.data(),
        senderRole: chatData.ownerId === currentUserId ? "owner" : "tenant"
      });
    } catch (err) {
      logger.error("Send message error:", err);
      return res.status(500).json({ 
        message: "Server error", 
        error: err.message,
        code: "INTERNAL_ERROR"
      });
    }
  });

  // POST /api/chats/:chatId/typing - Send typing indicator
  router.post("/:chatId/typing", verifyTokenMiddleware, async (req, res) => {
    try {
      const currentUserId = req.auth.uid;
      const { chatId } = req.params;
      const { isTyping } = req.body;

      // Get chat details
      const chatDoc = await db.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const chatData = chatDoc.data();

      // Check if user is participant
      if (!chatData.participants.includes(currentUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Update typing indicator in chat document
      const typingField = `typingIndicators.${currentUserId}`;
      await db.collection("chats").doc(chatId).update({
        [typingField]: {
          isTyping: isTyping || false,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }
      });

      return res.json({ success: true });
    } catch (err) {
      logger.error("Typing indicator error:", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  });

  // POST /api/chats/:chatId/read - Mark messages as read
  router.post("/:chatId/read", verifyTokenMiddleware, async (req, res) => {
    try {
      const currentUserId = req.auth.uid;
      const { chatId } = req.params;

      logger.log("Mark messages as read request:", { currentUserId, chatId });

      // Get chat details
      const chatDoc = await db.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        logger.log("Chat not found:", chatId);
        return res.status(404).json({ message: "Chat not found" });
      }

      const chatData = chatDoc.data();
      logger.log("Chat found, participants:", chatData.participants);

      // Check if user is participant
      if (!chatData.participants.includes(currentUserId)) {
        logger.log("Access denied for user:", currentUserId);
        return res.status(403).json({ message: "Access denied" });
      }

      // Mark unread messages as read
      // Get all messages from other users first, then filter for unread ones
      const messagesQuery = await db.collection("chats").doc(chatId).collection("messages")
        .where("senderId", "!=", currentUserId)
        .get();

      logger.log("Found messages from other users:", messagesQuery.size);

      // Filter for unread messages in the application code
      const unreadMessages = messagesQuery.docs.filter(doc => {
        const messageData = doc.data();
        return messageData.read !== true;
      });

      logger.log("Found unread messages to mark as read:", unreadMessages.length);

      const batch = db.batch();
      unreadMessages.forEach(doc => {
        batch.update(doc.ref, {
          read: true,
          readAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      if (unreadMessages.length > 0) {
        await batch.commit();
      }

      // Update last read timestamp for user
      const readField = `lastRead.${currentUserId}`;
      await db.collection("chats").doc(chatId).update({
        [readField]: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.log("Messages marked as read successfully");
      return res.json({ success: true, messagesMarked: unreadMessages.length });
    } catch (err) {
      logger.error("Mark as read error:", err);
      logger.error("Full error stack:", err.stack);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  });

  // POST /api/chats/:chatId/messages/:messageId/reaction - Add reaction to message
  router.post("/:chatId/messages/:messageId/reaction", verifyTokenMiddleware, async (req, res) => {
    try {
      const currentUserId = req.auth.uid;
      const { chatId, messageId } = req.params;
      const { emoji } = req.body;

      if (!emoji) {
        return res.status(400).json({ message: "Emoji is required" });
      }

      // Get chat details
      const chatDoc = await db.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const chatData = chatDoc.data();

      // Check if user is participant
      if (!chatData.participants.includes(currentUserId)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get message
      const messageDoc = await db.collection("chats").doc(chatId).collection("messages").doc(messageId).get();
      
      if (!messageDoc.exists) {
        return res.status(404).json({ message: "Message not found" });
      }

      const messageData = messageDoc.data();
      const reactions = messageData.reactions || [];

      // Check if user already reacted with this emoji
      const existingReactionIndex = reactions.findIndex(
        r => r.userId === currentUserId && r.emoji === emoji
      );

      if (existingReactionIndex !== -1) {
        // Remove existing reaction
        reactions.splice(existingReactionIndex, 1);
      } else {
        // Add new reaction
        reactions.push({
          userId: currentUserId,
          emoji,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Update message with reactions
      await messageDoc.ref.update({ reactions });

      return res.json({ success: true, reactions });
    } catch (err) {
      logger.error("Reaction error:", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  });

  // POST /api/chats/mark-all-read - Mark all messages as read for the current user
  router.post("/mark-all-read", verifyTokenMiddleware, async (req, res) => {
    const currentUserId = req.auth.uid;
    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      // Fetch all chat IDs where user is a participant
      const chatsQuery = await db.collection("chats")
        .where("participants", "array-contains", currentUserId)
        .get();

      if (chatsQuery.empty) {
        return res.json({ success: true, markedCount: 0 });
      }

      const batch = db.batch();
      let totalMarked = 0;

      for (const chatDoc of chatsQuery.docs) {
        const chatId = chatDoc.id;
        // Get all messages in this chat not sent by current user and not already read
        const messagesQuery = await db.collection("chats").doc(chatId).collection("messages")
          .where("senderId", "!=", currentUserId)
          .where("read", "==", false)
          .get();

        messagesQuery.forEach(msgDoc => {
          batch.update(msgDoc.ref, {
            read: true,
            readAt: admin.firestore.FieldValue.serverTimestamp()
          });
          totalMarked++;
        });
      }

      if (totalMarked > 0) {
        await batch.commit();
      }

      res.json({ success: true, markedCount: totalMarked });
    } catch (err) {
      console.error("Error marking all messages as read:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  });

  return router;
};
