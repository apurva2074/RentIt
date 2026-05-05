// backend/src/routes/rentals.js
// Professional Rental Management System

const express = require("express");
const { verifyTokenMiddleware } = require("../middleware/auth");
const { requireRole } = require("../middleware/roleBasedAccess");
const { ErrorHandler } = require("../middleware/errorHandler");
const { getOwnerId, setOwnerId, standardizeStatus, isPropertyAvailable } = require("../utils/dataStandardization");

module.exports = ({ admin, db }) => {
  const router = express.Router();

  // Helper function to remove undefined values
  const removeUndefined = (obj) => {
    const cleaned = {};
    for (const key in obj) {
      if (obj[key] !== undefined && obj[key] !== null) {
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          cleaned[key] = removeUndefined(obj[key]);
        } else {
          cleaned[key] = obj[key];
        }
      }
    }
    return cleaned;
  };

  // ================= CREATE RENTAL BOOKING =================
  // POST /api/rentals/create-booking
  router.post("/create-booking", verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const tenantId = req.auth.uid;
      const {
        propertyId,
        tenantDetails,
        agreementType,
        agreementDocument,
        agreementPreview,
        propertyDetails
      } = req.body;

      console.log(`Creating rental booking for tenant ${tenantId}, property ${propertyId}`);
      console.log('Request body:', req.body);
      
      // Extract proposed values from request
      const { proposedRent, proposedDeposit } = req.body;
      console.log("Proposed values:", proposedRent, proposedDeposit);

      // Check if tenant has completed their details
      const tenantDetailsRef = db.collection("tenantDetails").doc(tenantId);
      const tenantDetailsSnap = await tenantDetailsRef.get();
      
      if (!tenantDetailsSnap || !tenantDetailsSnap.exists) {
        return res.status(400).json({
          message: "Please complete your rental documents before booking"
        });
      }

      const tenantData = tenantDetailsSnap.data();
      
      // TEMPORARY DIAGNOSTIC LOGGING
      console.log('🔍 TENANT VALIDATION DATA:', {
        uid: tenantId,
        fullName: tenantData.fullName,
        phone: tenantData.phone,
        idProofUrl: tenantData.idProofUrl,
        fullObject: JSON.stringify(tenantData, null, 2)
      });
      
      // Validate required tenant profile fields before allowing rental request
      let hasRequiredProfile = !!(
        tenantData.fullName && 
        tenantData.phone && 
        tenantData.idProofUrl
      );
      
      // FALLBACK: Check tenants collection if idProofUrl missing from tenantDetails
      if (!hasRequiredProfile && (!tenantData.idProofUrl || tenantData.idProofUrl === '')) {
        console.log('🔍 FALLBACK: Checking tenants collection for idProofUrl');
        try {
          const tenantsRef = db.collection('tenants').doc(tenantId);
          const tenantsSnap = await tenantsRef.get();
          
          if (tenantsSnap.exists) {
            const tenantsData = tenantsSnap.data();
            console.log('🔍 TENANTS COLLECTION DATA:', {
              idProofVerificationStatus: tenantsData.idProofVerificationStatus,
              hasVerification: !!tenantsData.idProofVerificationStatus
            });
            
            // If tenants collection has verified ID proof, consider profile complete
            if (tenantsData.idProofVerificationStatus === 'approved') {
              hasRequiredProfile = !!(
                tenantData.fullName && 
                tenantData.phone
              );
              console.log('🔍 FALLBACK PASSED: Using tenants collection verification');
            }
          }
        } catch (fallbackError) {
          console.error('🔍 FALLBACK ERROR:', fallbackError);
        }
      }
      
      console.log('🔍 VALIDATION RESULT:', {
        hasRequiredProfile,
        fullName: !!tenantData.fullName,
        phone: !!tenantData.phone,
        idProofUrl: !!tenantData.idProofUrl
      });
      
      if (!hasRequiredProfile) {
        return res.status(400).json({
          message: "Please complete your profile and upload Government ID before sending rental request."
        });
      }

      // Validate required fields
      console.log('Validating required fields:');
      console.log('propertyId:', propertyId);
      console.log('tenantDetails:', tenantDetails);
      console.log('agreementType:', agreementType);
      
      if (!propertyId || !tenantDetails || !agreementType) {
        console.log('Missing required fields detected');
        return res.status(400).json({
          message: "Missing required fields: propertyId, tenantDetails, agreementType"
        });
      }

      // Get property document
      const propertyRef = db.collection("properties").doc(propertyId);
      const propertySnap = await propertyRef.get();
      
      if (!propertySnap || !propertySnap.exists) {
        return res.status(404).json({ message: "Property not found" });
      }

      const property = propertySnap.data();

      // Check if property is available for rent using standardized helper
      if (!isPropertyAvailable(property.status)) {
        return res.status(400).json({
          message: 'Property is not available for rent',
          propertyStatus: property.status,
          availableStatuses: ['ACTIVE', 'active', 'approved', 'available', 'Available']
        });
      }

      // Check if tenant already has an ACTIVE booking for this property
      const existingBooking = await db.collection("bookings")
        .where("propertyId", "==", propertyId)
        .where("tenantId", "==", tenantId)
        .where("status", "in", ["pending_payment", "confirmed", "active"])
        .get();
      
      if (!existingBooking.empty) {
        return res.status(400).json({ 
          message: "You already have an active booking for this property" 
        });
      }

      // If there are failed bookings, delete them first
      const failedBookings = await db.collection("bookings")
        .where("propertyId", "==", propertyId)
        .where("tenantId", "==", tenantId)
        .where("status", "in", ["pending", "cancelled"])
        .get();
      
      if (!failedBookings.empty) {
        console.log(`Cleaning up ${failedBookings.size} failed bookings for tenant ${tenantId}`);
        const batch = db.batch();
        failedBookings.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      // Create rental booking record
      const bookingData = {
        propertyId,
        tenantId,
        ownerId: getOwnerId(property), // Use standardized helper
        tenantDetails: {
          fullName: tenantDetails.fullName,
          phone: tenantDetails.phone,
          email: tenantDetails.email,
          currentAddress: tenantDetails.currentAddress,
          occupation: tenantDetails.occupation,
          moveInDate: tenantDetails.moveInDate,
          leaseDuration: parseInt(tenantDetails.leaseDuration)
        },
        propertyDetails: {
          title: propertyDetails.title,
          rent: propertyDetails.rent,
          securityDeposit: propertyDetails.securityDeposit,
          address: propertyDetails.address,
          type: property.type
        },
        // Store proposed values separately
        proposedRent: proposedRent || propertyDetails.rent,
        proposedDeposit: proposedDeposit || propertyDetails.securityDeposit,
        agreementType, // 'builtin' or 'manual'
        agreementDocument: agreementDocument || null,
        agreementPreview: agreementPreview || null,
        status: 'pending', // Initial status - pending approval
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Remove undefined values before saving to Firestore
      const cleanedBookingData = removeUndefined(bookingData);
      console.log('Cleaned booking data:', cleanedBookingData);

      const bookingRef = await db.collection("bookings").add(cleanedBookingData);
      const bookingId = bookingRef.id;

      console.log(`Rental booking created with ID: ${bookingId}`);
      
      // Get the created booking document for verification
      const newBooking = await db.collection("bookings").doc(bookingId).get();
      console.log("Booking created:", newBooking.id, newBooking.data());
      
      // Verify proposed values were saved
      const savedBookingData = newBooking.data();
      console.log("Saved proposed values:", savedBookingData.proposedRent, savedBookingData.proposedDeposit);
      
      // Verify required fields
      const bookingDataForVerification = newBooking.data();
      console.log("Booking verification - Required fields:");
      console.log("- tenantId:", bookingDataForVerification.tenantId);
      console.log("- ownerId:", bookingDataForVerification.ownerId);
      console.log("- propertyId:", bookingDataForVerification.propertyId);
      console.log("- proposedRent (rent):", bookingDataForVerification.propertyDetails?.rent);
      console.log("- proposedDeposit (securityDeposit):", bookingDataForVerification.propertyDetails?.securityDeposit);
      console.log("- moveInDate:", bookingDataForVerification.tenantDetails?.moveInDate);
      console.log("- status:", bookingDataForVerification.status);

      // Create agreement record
      const agreementData = {
        bookingId,
        propertyId,
        tenantId,
        ownerId: property.owner_uid,
        agreementType,
        agreementDocument: agreementDocument || null,
        agreementPreview: agreementPreview || null,
        status: 'pending', // Agreement pending payment confirmation
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const agreementRef = await db.collection("agreements").add(agreementData);
      const agreementId = agreementRef.id;

      // Create notification for owner using standardized helper
      await db.collection("notifications").add({
        userId: getOwnerId(property),
        type: 'new_rental_booking',
        title: 'New Rental Booking Request',
        message: `New rental booking request received for ${property.title}`,
        bookingId: bookingId,
        propertyId: propertyId,
        tenantId: tenantId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Create or update chat between tenant and owner using standardized helper
      const propertyOwnerId = getOwnerId(property);
      const chatId = [tenantId, propertyOwnerId].sort().join('_');
      const chatRef = db.collection("chats").doc(chatId);
      
      await chatRef.set({
        participants: [tenantId, propertyOwnerId],
        tenantId,
        ownerId: propertyOwnerId,
        propertyId: propertyId,
        propertyTitle: property.title,
        lastMessage: {
          text: `Rental booking initiated for ${property.title}`,
          senderId: 'system',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          type: 'system'
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`Chat created/updated: ${chatId}`);

      return res.status(201).json({
        message: "Rental request sent to owner for approval.",
        bookingId: bookingId,
        agreementId: agreementId,
        chatId: chatId,
        status: "pending",
        nextStep: "dashboard"
      });

    } catch (err) {
      console.error("Create rental booking error:", err);
      return res.status(500).json({
        message: "Failed to create rental booking",
        error: err.message,
      });
    }
  });

  // ================= GET BOOKING DETAILS =================
  // GET /api/rentals/booking/:bookingId
  router.get("/booking/:bookingId", verifyTokenMiddleware, async (req, res) => {
    try {
      const { bookingId } = req.params;
      const userId = req.auth.uid;

      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingSnap = await bookingRef.get();
      
      if (!bookingSnap.exists) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const booking = bookingSnap.data();

      // Security check: only tenant or owner can access booking
      if (booking.tenantId !== userId && booking.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get related property details
      const propertyRef = await db.collection("properties").doc(booking.propertyId).get();
      const property = propertyRef && propertyRef.exists ? propertyRef.data() : null;

      // Get related agreement details
      const agreementQuery = await db.collection("agreements")
        .where("bookingId", "==", bookingId)
        .get();
      
      const agreement = agreementQuery.empty ? null : {
        id: agreementQuery.docs[0].id,
        ...agreementQuery.docs[0].data()
      };

      return res.json({
        booking: {
          id: bookingId,
          ...booking
        },
        property,
        agreement
      });

    } catch (err) {
      console.error("Get booking details error:", err);
      return res.status(500).json({
        message: "Failed to get booking details",
        error: err.message,
      });
    }
  });

  // ================= GET TENANT BOOKINGS =================
  // GET /api/rentals/tenant/bookings
  router.get("/tenant/bookings", verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const tenantId = req.auth.uid;

      const bookingsQuery = await db.collection("bookings")
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .get();

      const bookings = [];
      
      for (const doc of bookingsQuery.docs) {
        const booking = { id: doc.id, ...doc.data() };
        
        // Get property details
        const propertyRef = await db.collection("properties").doc(booking.propertyId).get();
        if (propertyRef.exists) {
          booking.property = propertyRef.data();
        }
        
        bookings.push(booking);
      }

      return res.json(bookings);

    } catch (err) {
      console.error("Get tenant bookings error:", err);
      return res.status(500).json({
        message: "Failed to get tenant bookings",
        error: err.message,
      });
    }
  });

  // ================= GET OWNER BOOKINGS =================
  // GET /api/rentals/owner/bookings
  router.get("/owner/bookings", verifyTokenMiddleware, requireRole('owner'), async (req, res) => {
    try {
      const ownerId = req.auth.uid;

      const bookingsQuery = await db.collection("bookings")
        .where("ownerId", "==", ownerId)
        .orderBy("createdAt", "desc")
        .get();

      const bookings = [];
      
      for (const doc of bookingsQuery.docs) {
        const booking = { id: doc.id, ...doc.data() };
        
        // Get property details
        const propertyRef = await db.collection("properties").doc(booking.propertyId).get();
        if (propertyRef.exists) {
          booking.property = propertyRef.data();
        }
        
        // Get tenant details (limited info)
        const tenantRef = await db.collection("users").doc(booking.tenantId).get();
        if (tenantRef.exists) {
          const tenantData = tenantRef.data();
          booking.tenant = {
            id: booking.tenantId,
            name: tenantData.name,
            email: tenantData.email,
            phone: tenantData.phone
          };
        }
        
        bookings.push(booking);
      }

      return res.json(bookings);

    } catch (err) {
      console.error("Get owner bookings error:", err);
      return res.status(500).json({
        message: "Failed to get owner bookings",
        error: err.message,
      });
    }
  });

  // ================= GET OWNER RENTAL REQUESTS =================
  // GET /api/rentals/owner/requests
  router.get("/owner/requests", verifyTokenMiddleware, requireRole('owner'), async (req, res) => {
    try {
      const ownerId = req.auth.uid;
      
      console.log("🔍 DEBUG: Fetching ALL bookings for owner:", ownerId);

      // Step 1: Fetch ALL bookings for this owner (no status filter)
      const allBookingsQuery = await db.collection("bookings")
        .where("ownerId", "==", ownerId)
        .orderBy("createdAt", "desc")
        .get();

      console.log("🔍 DEBUG: Found total bookings count:", allBookingsQuery.docs.length);
      console.log("🔍 DEBUG: Raw booking data:", allBookingsQuery.docs.map(doc => ({ 
        id: doc.id, 
        ownerId: doc.data().ownerId,
        tenantId: doc.data().tenantId,
        status: doc.data().status,
        propertyId: doc.data().propertyId
      })));

      // Step 2: Split bookings into categories
      const allBookings = [];
      
      for (const doc of allBookingsQuery.docs) {
        const booking = { id: doc.id, ...doc.data() };
        
        // Get property details
        const propertyRef = await db.collection("properties").doc(booking.propertyId).get();
        const property = propertyRef.exists ? propertyRef.data() : null;
        
        // Get tenant details – preserve booking's data, only supplement missing fields
        let tenantDetails = booking.tenantDetails || {};

        // If fullName is missing, try to fetch from users or tenantDetails
        if (!tenantDetails.fullName && booking.tenantId) {
          // First try users collection (signup data)
          const userRef = await db.collection("users").doc(booking.tenantId).get();
          if (userRef.exists) {
            const userData = userRef.data();
            tenantDetails.fullName = userData.name || userData.fullName || null;
            tenantDetails.email = userData.email || tenantDetails.email;
            tenantDetails.phone = userData.phone || tenantDetails.phone;
          }
          
          // Fallback to tenantDetails collection if still missing fullName
          if (!tenantDetails.fullName) {
            const tenantRef = await db.collection("tenantDetails").doc(booking.tenantId).get();
            if (tenantRef.exists) {
              const tenantData = tenantRef.data();
              tenantDetails.fullName = tenantData.fullName || tenantData.name || tenantDetails.fullName;
              tenantDetails.phone = tenantData.phone || tenantDetails.phone;
              tenantDetails.email = tenantData.email || tenantDetails.email;
            }
          }
        }

        // Ensure defaults if still missing
        tenantDetails = {
          fullName: tenantDetails.fullName || 'Unknown Tenant',
          email: tenantDetails.email || 'Unknown',
          phone: tenantDetails.phone || 'Unknown',
          ...(tenantDetails.currentAddress && { currentAddress: tenantDetails.currentAddress }),
          ...(tenantDetails.occupation && { occupation: tenantDetails.occupation }),
          ...(tenantDetails.moveInDate && { moveInDate: tenantDetails.moveInDate }),
          ...(tenantDetails.leaseDuration && { leaseDuration: tenantDetails.leaseDuration })
        };
        
        const enrichedBooking = {
          id: booking.id,
          ...booking,
          propertyDetails: property ? {
            title: property.title,
            rent: property.rent,
            securityDeposit: property.securityDeposit || property.rent * 2,
            address: property.address,
            type: property.type
          } : null,
          tenantDetails: tenantDetails
        };
        
        allBookings.push(enrichedBooking);
      }

      // Step 3: Categorize bookings
      const pendingRequests = allBookings.filter(booking => booking.status === 'pending');
      const activeAgreements = allBookings.filter(booking => 
        ['approved_by_owner', 'pending_payment', 'confirmed', 'active'].includes(booking.status)
      );
      const completedBookings = allBookings.filter(booking => 
        ['completed', 'cancelled'].includes(booking.status)
      );

      console.log("🔍 DEBUG: Categorized bookings:");
      console.log("- Pending requests:", pendingRequests.length);
      console.log("- Active agreements:", activeAgreements.length);
      console.log("- Completed bookings:", completedBookings.length);

      return res.json({
        success: true,
        data: {
          allBookings,
          pendingRequests,
          activeAgreements,
          completedBookings,
          summary: {
            total: allBookings.length,
            pending: pendingRequests.length,
            active: activeAgreements.length,
            completed: completedBookings.length
          }
        }
      });

    } catch (err) {
      console.error("Get owner rental requests error:", err);
      return res.status(500).json({
        message: "Failed to fetch rental requests",
        error: err.message
      });
    }
  });

  // ================= UPDATE BOOKING STATUS =================
  // PATCH /api/rentals/booking/:bookingId/status
  router.patch("/booking/:bookingId/status", verifyTokenMiddleware, async (req, res) => {
    try {
      console.log("🔍 DEBUG: Incoming PATCH request to booking status");
      console.log("🔍 DEBUG: Booking ID:", req.params.bookingId);
      console.log("🔍 DEBUG: Request body:", JSON.stringify(req.body, null, 2));
      console.log("🔍 DEBUG: User ID:", req.auth?.uid);
      
      const { bookingId } = req.params;
      const { status, paymentId } = req.body;
      const userId = req.auth.uid;

      console.log("🔍 DEBUG: Extracted values:", { bookingId, status, paymentId, userId });

      if (!status) {
        console.log("🔍 DEBUG: 400 - Status is required");
        return res.status(400).json({ 
          error: "Status is required",
          message: "Status is required" 
        });
      }

      const validStatuses = ['pending', 'pending_signature', 'approved_by_owner', 'pending_payment', 'confirmed', 'rejected', 'cancelled', 'completed'];
      console.log("🔍 DEBUG: Valid statuses:", validStatuses);
      console.log("🔍 DEBUG: Requested status:", status);
      console.log("🔍 DEBUG: Status validation:", validStatuses.includes(status));

      if (!validStatuses.includes(status)) {
        console.log("🔍 DEBUG: 400 - Invalid status");
        return res.status(400).json({ 
          error: "Invalid status",
          message: `Invalid status: ${status}. Valid statuses: ${validStatuses.join(', ')}` 
        });
      }

      console.log("🔍 DEBUG: Status validation passed");

      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingSnap = await bookingRef.get();
      
      if (!bookingSnap.exists) {
        console.log("🔍 DEBUG: 404 - Booking not found");
        return res.status(404).json({ 
          error: "Booking not found",
          message: `Booking with ID ${bookingId} not found` 
        });
      }

      const booking = bookingSnap.data();
      console.log("🔍 DEBUG: Found booking:", booking);

      // Security check: only tenant or owner can update booking
      if (booking.tenantId !== userId && booking.ownerId !== userId) {
        console.log("🔍 DEBUG: 403 - Access denied");
        console.log("🔍 DEBUG: Booking tenantId:", booking.tenantId);
        console.log("🔍 DEBUG: Booking ownerId:", booking.ownerId);
        console.log("🔍 DEBUG: Request userId:", userId);
        return res.status(403).json({ 
          error: "Access denied",
          message: "Only booking owner or tenant can update booking status" 
        });
      }

      console.log("🔍 DEBUG: Access check passed");

      // Only owner can approve booking
      if (status === 'approved_by_owner' && booking.ownerId !== userId) {
        console.log("🔍 DEBUG: 403 - Only owner can approve booking");
        return res.status(403).json({ 
          error: "Only owner can approve booking",
          message: "Only owner can approve booking" 
        });
      }

      console.log("🔍 DEBUG: Owner approval check passed");

      // Prepare update data
      const updateData = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      console.log("🔍 DEBUG: Update data prepared:", updateData);

      if (paymentId) {
        updateData.paymentId = paymentId;
        console.log("🔍 DEBUG: Added paymentId to update data:", paymentId);
      }

      // Add status-specific timestamps
      if (status === 'approved_by_owner') {
        updateData.approvedByOwnerAt = admin.firestore.FieldValue.serverTimestamp();
        console.log("🔍 DEBUG: Added approvedByOwnerAt timestamp");
      } else if (status === 'pending_signature') {
        updateData.pendingSignatureAt = admin.firestore.FieldValue.serverTimestamp();
        console.log("🔍 DEBUG: Added pendingSignatureAt timestamp");
      } else if (status === 'confirmed') {
        updateData.confirmedAt = admin.firestore.FieldValue.serverTimestamp();
        console.log("🔍 DEBUG: Added confirmedAt timestamp");
      } else if (status === 'cancelled') {
        updateData.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.cancelledBy = userId;
        console.log("🔍 DEBUG: Added cancelledAt timestamp and cancelledBy");
      } else if (status === 'completed') {
        updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
        console.log("🔍 DEBUG: Added completedAt timestamp");
      }

      console.log("🔍 DEBUG: Final update data:", updateData);
      console.log("🔍 DEBUG: Executing Firestore update...");

      await bookingRef.update(updateData);

      console.log("🔍 DEBUG: Firestore update completed successfully");

      // Create notification
      const notificationUserId = userId === booking.tenantId ? booking.ownerId : booking.tenantId;
      await db.collection("notifications").add({
        userId: notificationUserId,
        type: `booking_${status}`,
        title: `Booking ${status}`,
        message: `Rental booking has been ${status}`,
        bookingId: bookingId,
        propertyId: booking.propertyId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log("🔍 DEBUG: Notification created successfully");

      const response = {
        success: true,
        message: "Booking status updated successfully",
        bookingId,
        status,
        updatedBooking: {
          id: bookingId,
          ...booking,
          ...updateData
        }
      };

      console.log("🔍 DEBUG: Sending response:", response);
      return res.json(response);

    } catch (error) {
      console.error("🔍 DEBUG: PATCH booking error:", error);
      console.error("🔍 DEBUG: Error stack:", error.stack);
      return res.status(500).json({
        success: false,
        error: "Failed to update booking status",
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // ================= GET AGREEMENT DETAILS =================
  // GET /api/rentals/agreement/:agreementId
  router.get("/agreement/:agreementId", verifyTokenMiddleware, async (req, res) => {
    try {
      const { agreementId } = req.params;
      const userId = req.auth.uid;

      const agreementRef = db.collection("agreements").doc(agreementId);
      const agreementSnap = await agreementRef.get();
      
      if (!agreementSnap.exists) {
        return res.status(404).json({ message: "Agreement not found" });
      }

      const agreement = agreementSnap.data();

      // Security check: only tenant or owner can access agreement
      if (agreement.tenantId !== userId && agreement.ownerId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get related booking details
      const bookingRef = await db.collection("bookings").doc(agreement.bookingId).get();
      const booking = bookingRef.exists ? bookingRef.data() : null;

      return res.json({
        agreement: {
          id: agreementId,
          ...agreement
        },
        booking
      });

    } catch (err) {
      console.error("Get agreement details error:", err);
      return res.status(500).json({
        message: "Failed to get agreement details",
        error: err.message,
      });
    }
  });

  // ================= GET TENANT AGREEMENTS =================
  // GET /api/agreements/tenant/:tenantId
  router.get("/tenant/:tenantId", verifyTokenMiddleware, requireRole('tenant'), async (req, res) => {
    try {
      const { tenantId } = req.params;
      const userId = req.auth.uid;

      // Security check: users can only access their own agreements
      if (tenantId !== userId) {
        return res.status(403).json({ message: "Access denied: You can only access your own agreements" });
      }

      console.log(`Fetching agreements for tenant: ${tenantId}`);

      // Query Firestore agreements collection
      const agreementsQuery = await db.collection("agreements")
        .where("tenantDetails.tenantId", "==", tenantId)
        .get();

      const agreements = [];
      
      for (const doc of agreementsQuery.docs) {
        const agreement = doc.data();
        agreements.push({
          id: doc.id,
          ...agreement
        });
      }

      console.log(`Found ${agreements.length} agreements for tenant ${tenantId}`);

      return res.json(agreements);

    } catch (err) {
      console.error("Get tenant agreements error:", err);
      return res.status(500).json({
        message: "Failed to fetch tenant agreements",
        error: err.message,
      });
    }
  });

  return router;
};
