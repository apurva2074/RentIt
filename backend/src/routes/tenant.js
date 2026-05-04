// backend/src/routes/tenant.js
// Tenant Management System

const express = require("express");
const multer = require("multer");
const { verifyTokenMiddleware } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleBasedAccess");

module.exports = ({ admin, db }) => {
  const router = express.Router();

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  // ================= CHECK TENANT DOCUMENTS =================
  // GET /api/tenant/documents/check/:userId
  router.get("/documents/check/:userId", verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.auth.uid;

      // Security check: only user can check their own documents
      if (userId !== currentUserId) {
        return res.status(403).json({ 
          message: "Access denied - can only check your own documents" 
        });
      }

      const tenantRef = db.collection("tenantDetails").doc(userId);
      const tenantSnap = await tenantRef.get();
      
      if (!tenantSnap.exists) {
        return res.status(200).json({
          success: true,
          data: {
            hasRequiredDocuments: false,
            message: "Tenant details not found"
          }
        });
      }

      const tenantData = tenantSnap.data();
      
      // Check if ALL required fields are present for rental validation
      const hasRequiredDocuments = !!(
        tenantData.fullName && 
        tenantData.phone && 
        tenantData.idProofUrl
      );
      
      return res.status(200).json({
        success: true,
        data: {
          hasRequiredDocuments,
          idProofUrl: tenantData.idProofUrl || null,
          message: hasRequiredDocuments ? "Tenant has all required documents for rental" : "Please complete your profile (name, phone, and government ID) before renting"
        }
      });

    } catch (error) {
      console.error("Check tenant documents error:", error);
      return res.status(500).json({ 
        message: "Server error checking documents", 
        error: error.message 
      });
    }
  });

  // ================= GET TENANT DETAILS =================
  // GET /api/tenant/details/:userId
  router.get("/details/:userId", verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.auth.uid;

      // Security check: only user can access their own details
      if (userId !== currentUserId) {
        return res.status(403).json({ 
          message: "Access denied - can only access your own details" 
        });
      }

      const tenantRef = db.collection("tenantDetails").doc(userId);
      const tenantSnap = await tenantRef.get();
      
      if (!tenantSnap.exists) {
        // Create empty tenant details document for first-time users
        await tenantRef.set({
          uid: userId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        return res.status(200).json({
          success: false,
          message: "No existing documents found",
          data: null
        });
      }

      const tenantData = tenantSnap.data();
      
      return res.status(200).json({
        success: true,
        data: tenantData
      });

    } catch (error) {
      console.error("Get tenant details error:", error);
      return res.status(500).json({
        message: "Failed to fetch tenant details",
        error: error.message
      });
    }
  });

  // ================= POST TENANT DETAILS =================
  // POST /api/tenant/details
  router.post("/details", verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const tenantId = req.auth.uid;
      
      console.log('POST /api/tenant/details called');
      console.log('Tenant ID:', tenantId);
      console.log('Request body:', req.body);
      
      const {
        fullName,
        dob,
        phone,
        address,
        idType,
        idProofUrl
      } = req.body;

      console.log(`Saving tenant details for: ${tenantId}`);

      // Always save/overwrite the tenant document - this ensures single source of truth
      const tenantData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Always include these fields to ensure complete data
        fullName: fullName || '',
        dob: dob || '',
        phone: phone || '',
        address: address || '',
        idType: idType || '',
        idProofUrl: idProofUrl || ''
      };

      console.log('Tenant data to save:', tenantData);

      // Use set with merge to update existing document or create new one
      const tenantRef = db.collection("tenantDetails").doc(tenantId);
      await tenantRef.set(tenantData, { merge: true });

      console.log(`Tenant details saved/updated to Firestore for: ${tenantId}`);
      console.log('Document path:', tenantRef.path);

      return res.status(200).json({
        success: true,
        message: "Tenant details saved successfully",
        data: tenantData
      });

    } catch (error) {
      console.error("Save tenant details error:", error);
      return res.status(500).json({
        message: "Failed to save tenant details",
        error: error.message
      });
    }
  });

  // ================= UPLOAD DOCUMENT =================
  // POST /api/tenant/upload-document
  router.post("/upload-document", upload.single('file'), verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const tenantId = req.auth.uid;
      
      console.log('Upload request received');
      console.log('Tenant ID:', tenantId);
      console.log('req.file exists:', !!req.file);
      console.log('req.body:', req.body);
      
      // Ensure userId matches authenticated UID
      if (!tenantId) {
        return res.status(401).json({
          message: "User not authenticated"
        });
      }
      
      if (req.file) {
        console.log('File details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          message: "No file uploaded"
        });
      }

      const file = req.file;
      const { documentType } = req.body;

      if (!documentType) {
        return res.status(400).json({
          message: "Document type is required"
        });
      }

      // Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const fileName = `userDocuments/${tenantId}/${Date.now()}_${file.originalname}`;
      const fileUpload = bucket.file(fileName);

      console.log('Uploading to Firebase Storage:', fileName);
      console.log('Bucket:', bucket.name);

      await fileUpload.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          metadata: {
            originalName: file.originalname,
            uploadedBy: tenantId,
            documentType: documentType
          }
        }
      });

      const [downloadURL] = await fileUpload.getSignedUrl({
        action: 'read',
        expires: '03-01-2500'
      });

      console.log(`Document uploaded to Firebase Storage for tenant: ${tenantId}, type: ${documentType}`);
      console.log('Download URL:', downloadURL);

      return res.status(200).json({
        success: true,
        documentUrl: downloadURL,
        fileName: fileName
      });

    } catch (error) {
      console.error("Document upload error:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        stack: error.stack,
        tenantId: tenantId,
        fileName: req.file?.originalname,
        fileSize: req.file?.size,
        documentType: req.body?.documentType
      });
      
      // Prevent crash by ensuring we always return a response
      if (!res.headersSent) {
        return res.status(500).json({
          message: "Failed to upload document",
          error: error.message,
          details: error.code
        });
      }
    }
  });

  return router;
};
