const express = require('express');
const router = express.Router();
const { admin, db } = require('../firebaseAdmin');
const { verifyTokenMiddleware } = require('../middleware/auth');

// Razorpay integration
const Razorpay = require("razorpay");
const crypto = require("crypto");

// PDF generation
const PDFDocument = require('pdfkit');

// Initialize Razorpay instance
console.log("🔍 RAZORPAY DEBUG: Key ID from env:", process.env.RAZORPAY_KEY_ID);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper function to generate PDF invoice
const generateInvoice = async (paymentData, booking, property) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        try {
          const pdfData = Buffer.concat(buffers);
          const fileName = `invoices/invoice_${paymentData.bookingId}_${Date.now()}.pdf`;
          
          // Store PDF in Firestore as base64 (simpler than Cloud Storage for this implementation)
          const pdfBase64 = pdfData.toString('base64');
          
          // Update payment record with invoice data
          await db.collection('payments').doc(paymentData.paymentId).update({
            invoiceBase64: pdfBase64,
            invoiceFileName: fileName,
            invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          console.log('✅ INVOICE: PDF generated successfully for booking:', paymentData.bookingId);
          resolve({ fileName, pdfBase64 });
        } catch (error) {
          console.error('🚨 INVOICE: Error saving PDF:', error);
          reject(error);
        }
      });

      // PDF Content
      doc.fontSize(20).text('RentIt - Payment Invoice', { align: 'center' });
      doc.moveDown();
      
      doc.fontSize(12).text(`Invoice Number: INV-${paymentData.bookingId.toUpperCase()}`, { align: 'right' });
      doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'right' });
      doc.moveDown();
      
      // Payment Details
      doc.fontSize(14).text('Payment Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Booking ID: ${paymentData.bookingId}`);
      doc.text(`Payment ID: ${paymentData.razorpay_payment_id}`);
      doc.text(`Order ID: ${paymentData.razorpay_order_id}`);
      doc.text(`Payment Method: Razorpay`);
      doc.text(`Payment Date: ${new Date().toLocaleDateString('en-IN')}`);
      doc.moveDown();
      
      // Property Details
      doc.fontSize(14).text('Property Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Property Title: ${property?.title || 'N/A'}`);
      doc.text(`Property ID: ${booking.propertyId}`);
      if (property?.address) {
        const address = typeof property.address === 'string' 
          ? property.address 
          : `${property.address?.line || ''}, ${property.address?.city || ''}, ${property.address?.state || ''}`;
        doc.text(`Address: ${address}`);
      }
      doc.moveDown();
      
      // Amount Breakdown
      doc.fontSize(14).text('Amount Breakdown', { underline: true });
      doc.fontSize(12);
      doc.text(`Security Deposit: ₹${paymentData.amount.toLocaleString('en-IN')}`);
      doc.text(`Total Amount: ₹${paymentData.amount.toLocaleString('en-IN')}`);
      doc.moveDown();
      
      // Status
      doc.fontSize(14).text('Payment Status', { underline: true });
      doc.fontSize(12);
      doc.text(`Status: ${paymentData.status.toUpperCase()}`);
      doc.text(`Verification: Completed`);
      doc.moveDown();
      
      // Footer
      doc.fontSize(10).text('This is a computer-generated invoice.', { align: 'center' });
      doc.text('Thank you for choosing RentIt!', { align: 'center' });
      
      doc.end();
    } catch (error) {
      console.error('🚨 INVOICE: Error generating PDF:', error);
      reject(error);
    }
  });
};

// POST /api/payments/create-order
// Create Razorpay order for payment
router.post('/create-order', verifyTokenMiddleware, async (req, res) => {
  try {
    console.log('🔍 RAZORPAY DEBUG: Creating order for user:', req.auth?.uid);
    
    const { bookingId } = req.body;
    const userId = req.auth.uid;

    console.log('🔍 RAZORPAY DEBUG: Request data:', { bookingId, userId });

    // Validate required fields
    if (!bookingId) {
      console.log('🔍 RAZORPAY DEBUG: Missing booking ID');
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Fetch booking from Firestore
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    
    if (!bookingDoc.exists) {
      console.log('🔍 RAZORPAY DEBUG: Booking not found:', bookingId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookingDoc.data();
    console.log('🔍 RAZORPAY DEBUG: Found booking:', { 
      id: bookingId, 
      status: booking.status, 
      tenantId: booking.tenantId 
    });

    // Ensure booking is in correct status
    if (booking.status !== "pending_payment") {
      console.log('🔍 RAZORPAY DEBUG: Invalid booking status:', booking.status);
      return res.status(400).json({
        success: false,
        message: `Booking is ${booking.status}. Payment is not required.`
      });
    }

    // Check if payment is deferred (pay later option)
    if (booking.paymentDeferred) {
      console.log('🔍 RAZORPAY DEBUG: Payment is deferred for booking:', bookingId);
      return res.status(400).json({
        success: false,
        message: 'Payment is deferred. You can pay later by the due date.'
      });
    }

    // Ensure only tenant can pay
    if (req.auth.uid !== booking.tenantId) {
      console.log('🔍 RAZORPAY DEBUG: Access denied. Tenant:', booking.tenantId, 'User:', req.auth.uid);
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only pay for your own bookings.'
      });
    }

    // Calculate amount - only charge security deposit for initial payment
    const amount = booking.proposedDeposit || booking.propertyDetails?.securityDeposit || 0;
    
    if (amount <= 0) {
      console.log('🔍 RAZORPAY DEBUG: Invalid amount:', amount);
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    console.log('🔍 RAZORPAY DEBUG: Creating order for security deposit amount:', amount);

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: bookingId,
      notes: {
        bookingId: bookingId,
        tenantId: booking.tenantId,
        ownerId: booking.ownerId,
        propertyId: booking.propertyId
      }
    });

    console.log('🔍 RAZORPAY DEBUG: Order created successfully:', order.id);

    return res.json({
      success: true,
      orderId: order.id,
      amount: amount,
      currency: "INR",
      key: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('🚨 RAZORPAY ERROR: Failed to create order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
});

// POST /api/payments/verify
// Verify Razorpay payment and update booking status
router.post('/verify', verifyTokenMiddleware, async (req, res) => {
  try {
    console.log('🔍 RAZORPAY DEBUG: Verifying payment for user:', req.auth?.uid);
    
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = req.body;

    console.log('🔍 RAZORPAY DEBUG: Payment verification data:', {
      razorpay_order_id,
      razorpay_payment_id,
      bookingId
    });

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingId) {
      console.log('🔍 RAZORPAY DEBUG: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification details'
      });
    }

    // Fetch booking to get details
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    
    if (!bookingDoc.exists) {
      console.log('🔍 RAZORPAY DEBUG: Booking not found:', bookingId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookingDoc.data();

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log('🔍 RAZORPAY DEBUG: Signature verification:', {
      body,
      expectedSignature,
      receivedSignature: razorpay_signature
    });

    if (expectedSignature !== razorpay_signature) {
      console.log('🔍 RAZORPAY DEBUG: Invalid signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Signature is valid - verify payment status with Razorpay
    console.log('🔍 RAZORPAY DEBUG: Verifying payment status with Razorpay');

    try {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      console.log('🔍 RAZORPAY DEBUG: Payment details:', {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        order_id: payment.order_id
      });

      if (payment.status !== 'captured') {
        console.log('🔍 RAZORPAY DEBUG: Payment not captured, status:', payment.status);
        return res.status(400).json({
          success: false,
          message: `Payment status is ${payment.status}, not captured. Property will not be marked as rented.`
        });
      }

      console.log('🔍 RAZORPAY DEBUG: Payment successfully captured, proceeding with updates');
    } catch (err) {
      console.error('🚨 RAZORPAY ERROR: Error fetching payment from Razorpay:', err);
      return res.status(500).json({ 
        success: false, 
        message: 'Payment verification failed - unable to confirm payment status' 
      });
    }

    // Signature is valid and payment is captured - store payment and update booking
    console.log('🔍 RAZORPAY DEBUG: Storing security deposit payment:', amount);

    // Use security deposit amount for payment record
    const amount = booking.proposedDeposit || booking.propertyDetails?.securityDeposit || 0;

    // Store payment in Firestore
    const paymentData = {
      bookingId,
      tenantId: booking.tenantId,
      ownerId: booking.ownerId,
      propertyId: booking.propertyId,
      razorpay_order_id,
      razorpay_payment_id,
      amount,
      currency: "INR",
      status: "completed",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Store payment and get the payment document reference
    const paymentRef = await db.collection('payments').add(paymentData);
    console.log('🔍 RAZORPAY DEBUG: Payment stored:', paymentData);

    // Get current property status for audit log
    const propertyDoc = await db.collection('properties').doc(booking.propertyId).get();
    const oldPropertyStatus = propertyDoc.exists ? propertyDoc.data().status : 'unknown';
    const property = propertyDoc.exists ? propertyDoc.data() : null;

    // Update booking status to confirmed
    await db.collection('bookings').doc(bookingId).update({
      status: 'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentId: razorpay_payment_id,
      paymentStatus: 'captured',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('🔍 RAZORPAY DEBUG: Booking updated to confirmed');

    // Update property availability to rented
    await db.collection('properties').doc(booking.propertyId).update({
      status: 'rented',
      rentedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('🔍 RAZORPAY DEBUG: Property updated to rented');

    // Log audit trail for property status change
    await db.collection('property_audit_log').add({
      propertyId: booking.propertyId,
      bookingId: bookingId,
      oldStatus: oldPropertyStatus,
      newStatus: 'rented',
      reason: 'payment_captured_verified',
      triggeredBy: 'payment_verification',
      userId: booking.tenantId,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: amount,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update agreement status to confirmed
    const agreementQuery = await db.collection('agreements')
      .where('bookingId', '==', bookingId)
      .get();

    if (!agreementQuery.empty) {
      const agreementDoc = agreementQuery.docs[0];
      await agreementDoc.ref.update({
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('🔍 RAZORPAY DEBUG: Agreement updated to confirmed');
    }

    // Create notification for tenant
    await db.collection('notifications').add({
      userId: booking.tenantId,
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Your security deposit of ₹${(amount).toLocaleString()} has been received. Your booking is confirmed.`,
      bookingId: bookingId,
      propertyId: booking.propertyId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create notification for owner
    await db.collection('notifications').add({
      userId: booking.ownerId,
      type: 'payment_received',
      title: 'Payment Received',
      message: `Tenant has paid the security deposit for property ${booking.propertyDetails?.title || booking.propertyId}.`,
      bookingId: bookingId,
      propertyId: booking.propertyId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Generate PDF Invoice
    try {
      console.log('🔍 INVOICE: Generating PDF invoice for booking:', bookingId);
      const invoiceData = {
        ...paymentData,
        paymentId: paymentRef.id
      };
      
      await generateInvoice(invoiceData, booking, property);
      console.log('✅ INVOICE: Invoice generated successfully');
    } catch (invoiceError) {
      console.error('🚨 INVOICE: Failed to generate invoice:', invoiceError);
      // Don't fail the payment if invoice generation fails
    }

    return res.json({
      success: true,
      message: 'Payment verified and booking confirmed',
      bookingId: bookingId,
      paymentId: razorpay_payment_id,
      amount: amount
    });

  } catch (error) {
    console.error('🚨 RAZORPAY ERROR: Failed to verify payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
});

// POST /api/payments/abandon
// Handle abandoned payment attempts for analytics and cleanup
router.post('/abandon', verifyTokenMiddleware, async (req, res) => {
  try {
    console.log('🔍 RAZORPAY DEBUG: Payment abandoned by user');
    
    const { bookingId, orderId, reason } = req.body;
    const userId = req.auth.uid;

    // Validate required fields
    if (!bookingId || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and Order ID are required'
      });
    }

    // Fetch booking to verify ownership
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    
    if (!bookingDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookingDoc.data();

    // Ensure only tenant can abandon their own payment
    if (userId !== booking.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Log abandoned payment attempt
    await db.collection('payment_abandon_log').add({
      bookingId,
      orderId,
      reason: reason || 'unknown',
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Optionally update booking status if it's still pending_payment
    if (booking.status === 'pending_payment') {
      await db.collection('bookings').doc(bookingId).update({
        status: 'pending_signature',
        paymentAbandonedAt: admin.firestore.FieldValue.serverTimestamp(),
        paymentAbandonedReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log('✅ RAZORPAY DEBUG: Payment abandonment logged:', { bookingId, orderId, reason });

    return res.json({
      success: true,
      message: 'Payment abandonment recorded'
    });

  } catch (error) {
    console.error('🚨 RAZORPAY ERROR: Failed to record payment abandonment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment abandonment',
      error: error.message
    });
  }
});

// POST /api/payments/webhook
// Handle Razorpay webhook events for payment status updates
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    console.log('🔍 RAZORPAY WEBHOOK: Received webhook event');
    
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      console.error('🚨 RAZORPAY WEBHOOK: RAZORPAY_WEBHOOK_SECRET not configured');
      return res.status(500).send('Webhook secret not configured');
    }

    const signature = req.headers['x-razorpay-signature'];
    const body = req.body.toString();

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('🚨 RAZORPAY WEBHOOK: Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    const event = JSON.parse(body);
    console.log('🔍 RAZORPAY WEBHOOK: Event type:', event.event);

    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      case 'order.paid':
        await handleOrderPaid(event.payload.order.entity);
        break;
      default:
        console.log('🔍 RAZORPAY WEBHOOK: Unhandled event type:', event.event);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('🚨 RAZORPAY WEBHOOK: Error processing webhook:', error);
    res.status(500).send('Webhook processing failed');
  }
});

// Helper function to handle payment captured events
async function handlePaymentCaptured(payment) {
  console.log('🔍 RAZORPAY WEBHOOK: Handling payment captured:', payment.id);
  
  try {
    // Find booking by payment ID
    const paymentsQuery = await db.collection('payments')
      .where('razorpay_payment_id', '==', payment.id)
      .get();

    if (paymentsQuery.empty) {
      console.log('🔍 RAZORPAY WEBHOOK: No booking found for payment:', payment.id);
      return;
    }

    const paymentDoc = paymentsQuery.docs[0];
    const paymentData = paymentDoc.data();
    const bookingId = paymentData.bookingId;

    // Check if booking is already confirmed
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (!bookingDoc.exists) {
      console.log('🔍 RAZORPAY WEBHOOK: Booking not found:', bookingId);
      return;
    }

    const booking = bookingDoc.data();
    if (booking.status === 'confirmed') {
      console.log('🔍 RAZORPAY WEBHOOK: Booking already confirmed:', bookingId);
      return;
    }

    // Update payment record
    await paymentDoc.ref.update({
      status: 'captured',
      capturedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update booking status
    await db.collection('bookings').doc(bookingId).update({
      status: 'confirmed',
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentId: payment.id,
      paymentStatus: 'captured',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update property status
    await db.collection('properties').doc(booking.propertyId).update({
      status: 'rented',
      rentedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update agreement status
    const agreementQuery = await db.collection('agreements')
      .where('bookingId', '==', bookingId)
      .get();

    if (!agreementQuery.empty) {
      const agreementDoc = agreementQuery.docs[0];
      await agreementDoc.ref.update({
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Log audit trail
    await db.collection('property_audit_log').add({
      propertyId: booking.propertyId,
      bookingId: bookingId,
      oldStatus: 'available',
      newStatus: 'rented',
      reason: 'payment_captured_webhook',
      triggeredBy: 'razorpay_webhook',
      paymentId: payment.id,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ RAZORPAY WEBHOOK: Payment captured and booking confirmed:', bookingId);
  } catch (error) {
    console.error('🚨 RAZORPAY WEBHOOK: Error handling payment captured:', error);
  }
}

// Helper function to handle payment failed events
async function handlePaymentFailed(payment) {
  console.log('🔍 RAZORPAY WEBHOOK: Handling payment failed:', payment.id);
  
  try {
    // Find booking by payment ID
    const paymentsQuery = await db.collection('payments')
      .where('razorpay_payment_id', '==', payment.id)
      .limit(1)
      .get();

    if (paymentsQuery.empty) {
      console.log('🔍 RAZORPAY WEBHOOK: No booking found for failed payment:', payment.id);
      return;
    }

    const paymentDoc = paymentsQuery.docs[0];
    const paymentData = paymentDoc.data();
    const bookingId = paymentData.bookingId;

    // Update payment record
    await paymentDoc.ref.update({
      status: 'failed',
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      failureReason: payment.error_description || 'Payment failed'
    });

    // Revert booking status if it was accidentally marked as confirmed
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    if (bookingDoc.exists) {
      const booking = bookingDoc.data();
      
      if (booking.status === 'confirmed') {
        console.log('🔍 RAZORPAY WEBHOOK: Reverting accidentally confirmed booking:', bookingId);
        
        await db.collection('bookings').doc(bookingId).update({
          status: 'pending_signature',
          revertedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Revert property status if it was accidentally marked as rented
        const propertyDoc = await db.collection('properties').doc(booking.propertyId).get();
        if (propertyDoc.exists && propertyDoc.data().status === 'rented') {
          await db.collection('properties').doc(booking.propertyId).update({
            status: 'available',
            revertedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        // Log audit trail
        await db.collection('property_audit_log').add({
          propertyId: booking.propertyId,
          bookingId: bookingId,
          oldStatus: 'rented',
          newStatus: 'available',
          reason: 'payment_failed_webhook_revert',
          triggeredBy: 'razorpay_webhook',
          paymentId: payment.id,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    console.log('✅ RAZORPAY WEBHOOK: Payment failure handled:', bookingId);
  } catch (error) {
    console.error('🚨 RAZORPAY WEBHOOK: Error handling payment failed:', error);
  }
}

// Helper function to handle order paid events
async function handleOrderPaid(order) {
  console.log('🔍 RAZORPAY WEBHOOK: Handling order paid:', order.id);
  // Order paid events are handled by payment.captured events
  // This is a fallback handler
}

// GET /api/payments/invoice/:paymentId
// Download PDF invoice for a payment
router.get('/invoice/:paymentId', verifyTokenMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.auth.uid;

    console.log('🔍 INVOICE: Requesting invoice for payment:', paymentId);

    // Fetch payment document
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    
    if (!paymentDoc.exists) {
      console.log('🔍 INVOICE: Payment not found:', paymentId);
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const payment = paymentDoc.data();

    // Verify user owns this payment (tenant or owner)
    if (payment.tenantId !== userId && payment.ownerId !== userId) {
      console.log('🔍 INVOICE: Access denied for user:', userId);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if invoice exists
    if (!payment.invoiceBase64) {
      console.log('🔍 INVOICE: Invoice not generated for payment:', paymentId);
      return res.status(404).json({
        success: false,
        message: 'Invoice not available'
      });
    }

    // Convert base64 back to buffer
    const pdfBuffer = Buffer.from(payment.invoiceBase64, 'base64');
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${payment.invoiceFileName || `invoice_${paymentId}.pdf`}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log('✅ INVOICE: Sending invoice for payment:', paymentId);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('🚨 INVOICE: Error downloading invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download invoice',
      error: error.message
    });
  }
});

// GET /api/payments/status/:orderId
// Check payment status for an order
router.get('/status/:orderId', verifyTokenMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.auth.uid;

    console.log('🔍 PAYMENT STATUS: Checking status for order:', orderId);

    // Find payment by order ID
    const paymentsQuery = await db.collection('payments')
      .where('razorpay_order_id', '==', orderId)
      .limit(1)
      .get();

    if (paymentsQuery.empty) {
      console.log('🔍 PAYMENT STATUS: No payment found for order:', orderId);
      return res.json({
        success: true,
        status: 'pending',
        message: 'Payment not yet initiated'
      });
    }

    const paymentDoc = paymentsQuery.docs[0];
    const payment = paymentDoc.data();

    // Verify user owns this payment
    if (payment.tenantId !== userId) {
      console.log('🔍 PAYMENT STATUS: Access denied for user:', userId);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    console.log('✅ PAYMENT STATUS: Found payment with status:', payment.status);
    
    return res.json({
      success: true,
      status: payment.status,
      paymentId: payment.razorpay_payment_id,
      bookingId: payment.bookingId,
      message: `Payment status: ${payment.status}`
    });

  } catch (error) {
    console.error('🚨 PAYMENT STATUS: Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check payment status',
      error: error.message
    });
  }
});

// POST /api/payments/defer-payment
// Allow owner to defer payment for a booking
router.post('/defer-payment', verifyTokenMiddleware, async (req, res) => {
  try {
    const { bookingId, paymentDueDays } = req.body;
    const userId = req.auth.uid;

    console.log('🔍 PAYMENT DEFER: Deferring payment for booking:', bookingId);

    // Validate required fields
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    // Fetch booking
    const bookingDoc = await db.collection('bookings').doc(bookingId).get();
    
    if (!bookingDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookingDoc.data();

    // Ensure only owner can defer payment
    if (userId !== booking.ownerId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only property owners can defer payments.'
      });
    }

    // Ensure booking is in correct status
    if (booking.status !== 'pending_payment') {
      return res.status(400).json({
        success: false,
        message: `Cannot defer payment for booking with status: ${booking.status}`
      });
    }

    // Calculate payment due date (default 7 days)
    const dueDays = paymentDueDays || 7;
    const paymentDueDate = new Date();
    paymentDueDate.setDate(paymentDueDate.getDate() + dueDays);

    // Update booking with payment deferral
    await bookingDoc.ref.update({
      paymentDeferred: true,
      paymentDueDate: paymentDueDate,
      paymentDeferredAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create notification for tenant
    await db.collection('notifications').add({
      userId: booking.tenantId,
      type: 'payment_deferred',
      title: 'Payment Deferred',
      message: `Your payment has been deferred. Please pay by ${paymentDueDate.toLocaleDateString('en-IN')}.`,
      bookingId: bookingId,
      propertyId: booking.propertyId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ PAYMENT DEFER: Payment deferred successfully for booking:', bookingId);

    return res.json({
      success: true,
      message: 'Payment deferred successfully',
      paymentDueDate: paymentDueDate,
      bookingId: bookingId
    });

  } catch (error) {
    console.error('🚨 PAYMENT DEFER: Error deferring payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to defer payment',
      error: error.message
    });
  }
});

// GET /api/payments/my-payments
// Get all payments for the current tenant
router.get('/my-payments', verifyTokenMiddleware, async (req, res) => {
  try {
    const userId = req.auth.uid;

    console.log('🔍 PAYMENT HISTORY: Fetching payments for tenant:', userId);

    // Fetch all payments for this tenant
    const paymentsQuery = await db.collection('payments')
      .where('tenantId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    const payments = [];
    
    for (const doc of paymentsQuery.docs) {
      const payment = doc.data();
      
      // Get property details for each payment
      let propertyTitle = 'Unknown Property';
      if (payment.propertyId) {
        const propertyDoc = await db.collection('properties').doc(payment.propertyId).get();
        if (propertyDoc.exists) {
          propertyTitle = propertyDoc.data().title || 'Unknown Property';
        }
      }

      // Get booking details
      let bookingStatus = 'unknown';
      if (payment.bookingId) {
        const bookingDoc = await db.collection('bookings').doc(payment.bookingId).get();
        if (bookingDoc.exists) {
          bookingStatus = bookingDoc.data().status || 'unknown';
        }
      }

      payments.push({
        id: doc.id,
        ...payment,
        propertyTitle,
        bookingStatus,
        createdAt: payment.createdAt?.toDate(),
        paidAt: payment.paidAt?.toDate(),
        hasInvoice: !!payment.invoiceBase64
      });
    }

    console.log(`✅ PAYMENT HISTORY: Found ${payments.length} payments for tenant:`, userId);

    return res.json({
      success: true,
      payments: payments,
      count: payments.length
    });

  } catch (error) {
    console.error('🚨 PAYMENT HISTORY: Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
    });
  }
});

// GET /api/payments/export-csv
// Export payments to CSV for owners
router.get('/export-csv', verifyTokenMiddleware, async (req, res) => {
  try {
    const userId = req.auth.uid;

    console.log('🔍 CSV EXPORT: Exporting payments for owner:', userId);

    // Fetch all properties owned by this user
    const propertiesQuery = await db.collection('properties')
      .where('owner_uid', '==', userId)
      .get();

    if (propertiesQuery.empty) {
      return res.status(404).json({
        success: false,
        message: 'No properties found for this owner'
      });
    }

    const propertyIds = propertiesQuery.docs.map(doc => doc.id);

    // Fetch all payments for these properties
    const paymentsQuery = await db.collection('payments')
      .where('propertyId', 'in', propertyIds)
      .orderBy('createdAt', 'desc')
      .get();

    const payments = [];
    
    for (const doc of paymentsQuery.docs) {
      const payment = doc.data();
      
      // Get property details
      let propertyTitle = 'Unknown Property';
      let propertyAddress = 'Unknown Address';
      
      if (payment.propertyId) {
        const propertyDoc = await db.collection('properties').doc(payment.propertyId).get();
        if (propertyDoc.exists) {
          const property = propertyDoc.data();
          propertyTitle = property.title || 'Unknown Property';
          
          if (property.address) {
            propertyAddress = typeof property.address === 'string' 
              ? property.address 
              : `${property.address?.line || ''}, ${property.address?.city || ''}, ${property.address?.state || ''}`;
          }
        }
      }

      // Get tenant details
      let tenantName = 'Unknown Tenant';
      let tenantEmail = 'Unknown Email';
      
      if (payment.tenantId) {
        const tenantDoc = await db.collection('users').doc(payment.tenantId).get();
        if (tenantDoc.exists) {
          const tenant = tenantDoc.data();
          tenantName = tenant.name || 'Unknown Tenant';
          tenantEmail = tenant.email || 'Unknown Email';
        }
      }

      payments.push({
        ...payment,
        propertyTitle,
        propertyAddress,
        tenantName,
        tenantEmail,
        createdAt: payment.createdAt?.toDate(),
        paidAt: payment.paidAt?.toDate()
      });
    }

    // Generate CSV
    const csvHeaders = [
      'Payment ID',
      'Booking ID',
      'Property Title',
      'Property Address',
      'Tenant Name',
      'Tenant Email',
      'Amount (₹)',
      'Currency',
      'Status',
      'Payment Method',
      'Razorpay Payment ID',
      'Razorpay Order ID',
      'Created At',
      'Paid At',
      'Invoice Available'
    ];

    const csvRows = payments.map(payment => [
      payment.id || '',
      payment.bookingId || '',
      `"${payment.propertyTitle.replace(/"/g, '""')}"`,
      `"${payment.propertyAddress.replace(/"/g, '""')}"`,
      `"${payment.tenantName.replace(/"/g, '""')}"`,
      `"${payment.tenantEmail.replace(/"/g, '""')}"`,
      payment.amount || 0,
      payment.currency || 'INR',
      payment.status || 'unknown',
      'Razorpay',
      payment.razorpay_payment_id || '',
      payment.razorpay_order_id || '',
      payment.createdAt ? payment.createdAt.toLocaleString('en-IN') : '',
      payment.paidAt ? payment.paidAt.toLocaleString('en-IN') : '',
      payment.invoiceBase64 ? 'Yes' : 'No'
    ]);

    // Convert to CSV string
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Set headers for CSV download
    const fileName = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    console.log(`✅ CSV EXPORT: Generated CSV with ${payments.length} payments for owner:`, userId);

    res.send(csvContent);

  } catch (error) {
    console.error('🚨 CSV EXPORT: Error exporting payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export payments',
      error: error.message
    });
  }
});

module.exports = router;
