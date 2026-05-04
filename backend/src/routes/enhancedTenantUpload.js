const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { admin, db } = require('../firebaseAdmin');
const { verifyTokenMiddleware } = require('../middleware/auth');
const DocumentVerificationService = require('../services/documentVerificationService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/tenant-documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.round(Math.random() * 1E9)}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'), false);
    }
  }
});

// Initialize document verification service
const verificationService = new DocumentVerificationService();

/**
 * POST /api/tenant/upload-document-enhanced
 * Enhanced document upload with AI verification status tracking
 */
router.post('/upload-document-enhanced', verifyTokenMiddleware, upload.single('file'), async (req, res) => {
  try {
    console.log("UPLOAD STARTED - Enhanced Tenant Upload");
    
    if (!req.file) {
      console.log("UPLOAD FAILED: No file provided");
      return res.status(400).json({
        success: false,
        message: 'No document file provided'
      });
    }

    const { documentType } = req.body;
    const userId = req.auth.uid;
    const filePath = req.file.path;
    const originalName = req.file.originalname;

    console.log("FILE:", req.file);
    console.log('ENHANCED UPLOAD: Processing document for user:', userId);
    console.log('ENHANCED UPLOAD: Document type:', documentType);
    console.log('ENHANCED UPLOAD: File:', originalName);

    // STEP 1: Store initial document record with "uploaded" status
    const documentRecord = {
      userId: userId,
      documentType: documentType,
      fileName: originalName,
      filePath: filePath,
      documentUrl: `/uploads/tenant-documents/${req.file.filename}`,
      status: 'uploaded',
      reason: '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      fileSize: req.file && req.file.size ? req.file.size : 0,
      mimeType: req.file && req.file.mimetype ? req.file.mimetype : "application/octet-stream"
    };

    // Safe object cleanup before saving - ADD ONLY THIS
    const cleanedData = Object.fromEntries(
      Object.entries(documentRecord).filter(([_, v]) => v !== undefined)
    );

    // Log data before save - ADD ONLY THIS
    console.log("DATA BEFORE SAVE:", cleanedData);

    // STEP 2: Trigger AI verification BEFORE saving
    console.log('AI VERIFICATION: Starting verification before save');
    console.log("Running Python script...");
    
    // Verify document using AI service
    const verificationResult = await verificationService.verifyDocument(filePath);
    
    console.log('AI VERIFICATION: Result:', verificationResult);
    console.log("Python script execution completed.");

    // STEP 3: Check verification result - only save if approved
    if (verificationResult.status !== 'Approved') {
      console.log("BLOCKING SAVE - AI FAILED");
      console.log('AI VERIFICATION FAILED: Document not approved');
      // Clean up uploaded file
      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
      
      return res.status(400).json({
        success: false,
        message: 'Document verification failed',
        aiStatus: verificationResult.status
      });
    }

    // STEP 4: Save to Firestore only AFTER successful verification
    console.log('AI VERIFICATION SUCCESS: Saving document to Firestore');
    
    // Update document record with verification result
    cleanedData.status = 'approved';
    cleanedData.reason = verificationResult.message || 'Document approved';
    cleanedData.verifiedAt = admin.firestore.FieldValue.serverTimestamp();

    // Wrap Firestore save with error handling - ADD ONLY THIS
    let docRef;
    try {
      console.log("SAVING DOCUMENT - AI PASSED");
      docRef = await db.collection('documents').add(cleanedData);
      console.log("FIRESTORE SAVE SUCCESS: Document ID", docRef.id);
    } catch (firestoreError) {
      console.error("FIRESTORE ERROR:", firestoreError);
      throw firestoreError;
    }
    console.log('ENHANCED UPLOAD: Document saved after verification with ID:', docRef.id);

    // STEP 5: Update tenant's document record in their profile
    await updateTenantDocumentRecord(userId, documentType, {
      documentUrl: documentRecord.documentUrl,
      verificationStatus: 'approved',
      verificationReason: verificationResult.message || 'Document approved',
      verifiedAt: new Date()
    });

    // STEP 6: Also save to tenantDetails collection for rental validation
    if (documentType === 'idProof') {
      console.log('🔍 UPDATING TENANT DETAILS with idProofUrl');
      const tenantDetailsRef = db.collection('tenantDetails').doc(userId);
      await tenantDetailsRef.set({
        idProofUrl: documentRecord.documentUrl,
        idProofVerified: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('✅ TENANT DETAILS UPDATED with idProofUrl:', documentRecord.documentUrl);
    }

    console.log("UPLOAD COMPLETED - Enhanced Tenant Upload");

    res.json({
      success: true,
      documentId: docRef.id,
      documentUrl: documentRecord.documentUrl,
      status: 'approved',
      message: 'Document uploaded and verified successfully',
      verificationResult: verificationResult,
      uploadedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('🚨 ENHANCED UPLOAD ERROR:', error);

    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('🚨 ENHANCED UPLOAD: Cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Document upload failed'
    });
  }
});

/**
 * GET /api/tenant/documents-status
 * Get user's documents with verification status
 */
router.get('/documents-status', verifyTokenMiddleware, async (req, res) => {
  try {
    const userId = req.auth.uid;

    const documentsSnapshot = await db.collection('documents')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const documents = documentsSnapshot.docs.map(doc => ({
      documentId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
      verifiedAt: doc.data().verifiedAt?.toDate()
    }));

    res.json({
      success: true,
      documents: documents
    });

  } catch (error) {
    console.error('🚨 DOCUMENTS STATUS ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents status'
    });
  }
});

/**
 * DELETE /api/tenant/delete-document/:id
 * Delete a document from Firestore and optionally from storage
 */
router.delete('/delete-document/:id', verifyTokenMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth.uid;

    console.log('DELETE DOCUMENT: Deleting document:', id, 'for user:', userId);

    // Get document to verify ownership and get file path
    const docRef = db.collection('documents').doc(id);
    const docSnapshot = await docRef.get();

    if (!docSnapshot.exists) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const documentData = docSnapshot.data();

    // Verify user owns this document
    if (documentData.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own documents'
      });
    }

    // Optional: Delete file from storage if filePath exists
    if (documentData.filePath) {
      try {
        const fs = require('fs');
        if (fs.existsSync(documentData.filePath)) {
          fs.unlinkSync(documentData.filePath);
          console.log('DELETE DOCUMENT: File deleted from storage:', documentData.filePath);
        }
      } catch (fileError) {
        console.warn('DELETE DOCUMENT: Could not delete file from storage:', fileError.message);
        // Continue with Firestore deletion even if file deletion fails
      }
    }

    // Delete from Firestore
    await docRef.delete();

    console.log('DELETE DOCUMENT: Document deleted successfully:', id);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('DELETE DOCUMENT ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
});

/**
 * Helper function to update tenant's document record
 */
async function updateTenantDocumentRecord(userId, documentType, verificationData) {
  try {
    const tenantRef = db.collection('tenants').doc(userId);
    const tenantDoc = await tenantRef.get();

    if (tenantDoc.exists) {
      const updateData = {};
      updateData[`${documentType}VerificationStatus`] = verificationData.verificationStatus;
      updateData[`${documentType}VerificationReason`] = verificationData.verificationReason;
      updateData[`${documentType}VerifiedAt`] = verificationData.verifiedAt;

      await tenantRef.update(updateData);
      console.log('🔍 TENANT RECORD: Updated verification status for', documentType);
    }
  } catch (error) {
    console.error('🚨 TENANT RECORD UPDATE ERROR:', error);
  }
}

module.exports = router;
