const admin = require('firebase-admin');
const serviceAccount = require('../src/firebaseAdmin.js');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || 'rentit-4b3b5'
  });
}

const db = admin.firestore();

/**
 * Cleanup stale payment orders and revert accidental property status changes
 * This should be run as a scheduled job (e.g., every hour)
 */
async function cleanupStaleOrders() {
  console.log('🔍 CLEANUP: Starting stale orders cleanup');
  
  try {
    // Find bookings stuck in pending_payment for more than 30 minutes
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    
    const staleBookingsQuery = await db.collection('bookings')
      .where('status', '==', 'pending_payment')
      .where('createdAt', '<', cutoffTime)
      .get();

    console.log(`🔍 CLEANUP: Found ${staleBookingsQuery.size} stale bookings`);

    for (const doc of staleBookingsQuery.docs) {
      const booking = doc.data();
      const bookingId = doc.id;
      
      console.log(`🔍 CLEANUP: Processing stale booking: ${bookingId}`);
      
      try {
        // Update booking status back to pending_signature
        await doc.ref.update({
          status: 'pending_signature',
          paymentAttemptExpired: true,
          paymentExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Check if property was accidentally marked as rented
        if (booking.propertyId) {
          const propertyDoc = await db.collection('properties').doc(booking.propertyId).get();
          
          if (propertyDoc.exists && propertyDoc.data().status === 'rented') {
            console.log(`🔍 CLEANUP: Reverting property ${booking.propertyId} from rented to available`);
            
            // Revert property status
            await db.collection('properties').doc(booking.propertyId).update({
              status: 'available',
              revertedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Log audit trail for property reversion
            await db.collection('property_audit_log').add({
              propertyId: booking.propertyId,
              bookingId: bookingId,
              oldStatus: 'rented',
              newStatus: 'available',
              reason: 'stale_payment_cleanup',
              triggeredBy: 'cleanup_script',
              userId: booking.tenantId,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }

        // Log booking cleanup
        await db.collection('booking_cleanup_log').add({
          bookingId: bookingId,
          propertyId: booking.propertyId,
          tenantId: booking.tenantId,
          oldStatus: 'pending_payment',
          newStatus: 'pending_signature',
          reason: 'payment_attempt_expired',
          triggeredBy: 'cleanup_script',
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ CLEANUP: Successfully reverted booking ${bookingId}`);
      } catch (error) {
        console.error(`🚨 CLEANUP: Error processing booking ${bookingId}:`, error);
      }
    }

    // Also check for properties marked as rented without confirmed payments
    await cleanupOrphanedRentedProperties();

    console.log('✅ CLEANUP: Stale orders cleanup completed');
  } catch (error) {
    console.error('🚨 CLEANUP: Error in cleanup process:', error);
  }
}

/**
 * Find properties marked as rented but without confirmed payments
 */
async function cleanupOrphanedRentedProperties() {
  console.log('🔍 CLEANUP: Checking for orphaned rented properties');
  
  try {
    // Find all rented properties
    const rentedPropertiesQuery = await db.collection('properties')
      .where('status', '==', 'rented')
      .get();

    console.log(`🔍 CLEANUP: Found ${rentedPropertiesQuery.size} rented properties to check`);

    for (const propertyDoc of rentedPropertiesQuery.docs) {
      const property = propertyDoc.data();
      const propertyId = propertyDoc.id;
      
      // Look for confirmed bookings for this property
      const confirmedBookingsQuery = await db.collection('bookings')
        .where('propertyId', '==', propertyId)
        .where('status', '==', 'confirmed')
        .get();

      if (confirmedBookingsQuery.empty) {
        console.log(`🔍 CLEANUP: Found orphaned rented property: ${propertyId}`);
        
        // Check if there are any pending payments for this property
        const pendingBookingsQuery = await db.collection('bookings')
          .where('propertyId', '==', propertyId)
          .where('status', '==', 'pending_payment')
          .get();

        if (pendingBookingsQuery.empty) {
          console.log(`🔍 CLEANUP: No active bookings found, reverting property ${propertyId} to available`);
          
          // Revert property to available
          await propertyDoc.ref.update({
            status: 'available',
            revertedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Log audit trail
          await db.collection('property_audit_log').add({
            propertyId: propertyId,
            oldStatus: 'rented',
            newStatus: 'available',
            reason: 'orphaned_property_cleanup',
            triggeredBy: 'cleanup_script',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
  } catch (error) {
    console.error('🚨 CLEANUP: Error in orphaned properties cleanup:', error);
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupStaleOrders()
    .then(() => {
      console.log('✅ CLEANUP: Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('🚨 CLEANUP: Script failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupStaleOrders, cleanupOrphanedRentedProperties };
