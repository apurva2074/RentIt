import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getBookingDetails } from "../../services/rentalService";
import "./TenantPayment.css";
import Header from "../../MyComponent/Header";

export default function TenantPaymentPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('upi');
  const [verificationTriggered, setVerificationTriggered] = useState(false);
  const [error, setError] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    // Check if bookingId exists
    if (!bookingId) {
      navigate("/dashboard");
      return;
    }

    // Wait for auth to complete
    if (authLoading) {
      return;
    }

    // Only redirect to login if auth is complete and user is missing
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchBooking = async () => {
      try {
        setLoading(true);
        const bookingData = await getBookingDetails(bookingId);
        
        // Check if booking belongs to current user
        if (bookingData.booking.tenantId !== user.uid) {
          throw new Error('Access denied');
        }

        // Check if booking is in correct status for payment
        if (bookingData.booking.status !== 'pending_payment') {
          throw new Error(`Booking is ${bookingData.booking.status}. Payment is not required.`);
        }

        setBooking(bookingData);
      } catch (error) {
        console.error("Error fetching booking:", error);
        alert(error.message || 'Failed to load booking details');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [user, authLoading, bookingId, navigate]);

  // Payment status polling function
  const startPaymentPolling = (orderId) => {
    console.log('🔍 Starting payment status polling for order:', orderId);
    setPolling(true);

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/status/${orderId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        });

        const result = await response.json();
        
        if (result.success) {
          console.log('🔍 Payment status poll result:', result.status);
          
          if (result.status === 'completed' || result.status === 'captured') {
            clearInterval(pollInterval);
            setPolling(false);
            setError(null);
            alert('Payment Successful! Your booking has been confirmed.');
            navigate(`/tenant/agreement/${bookingId}`);
          } else if (result.status === 'failed') {
            clearInterval(pollInterval);
            setPolling(false);
            setError('Payment failed. Please try again or use a different payment method.');
            setProcessing(false);
          }
        }
      } catch (error) {
        console.error('🔍 Payment status poll error:', error);
      }
    }, 3000); // Poll every 3 seconds

    // Stop polling after 2 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setPolling(false);
      console.log('🔍 Payment polling timeout reached');
    }, 120000);
  };

  const getRazorpayMethodConfig = () => {
    switch (selectedPaymentMethod) {
      case 'upi':
        return {
          config: {
            display: {
              blocks: {
                upi: {
                  name: "Pay using UPI",
                  instruments: [
                    {
                      method: "upi"
                    }
                  ]
                }
              },
              sequence: ["upi"],
              preferences: {
                show_default_blocks: false
              }
            }
          },
          method: {
            upi: true
          }
        };
      case 'card':
        return {
          config: {
            display: {
              blocks: {
                card: {
                  name: "Pay using Card",
                  instruments: [
                    { method: "card" }
                  ]
                }
              },
              sequence: ["card"],
              preferences: {
                show_default_blocks: false
              }
            }
          }
        };
      case 'netbanking':
        return {
          config: {
            display: {
              blocks: {
                netbanking: {
                  name: "Pay using Net Banking",
                  instruments: [
                    { method: "netbanking" }
                  ]
                }
              },
              sequence: ["netbanking"],
              preferences: {
                show_default_blocks: false
              }
            }
          }
        };
      case 'wallet':
        return {
          config: {
            display: {
              blocks: {
                wallet: {
                  name: "Pay using Wallet",
                  instruments: [
                    { method: "wallet" }
                  ]
                }
              },
              sequence: ["wallet"],
              preferences: {
                show_default_blocks: false
              }
            }
          }
        };
      default:
        return {};
    }
  };

  const handlePayment = async () => {
    // We always have a selected method (default: 'upi')
    console.log('🔍 Selected payment method:', selectedPaymentMethod);

    setProcessing(true);
    setVerificationTriggered(false);
    setError(null);
    try {
      // Step 1: Call backend to create Razorpay order
      console.log('🔍 Creating Razorpay order for booking:', bookingId);
      const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/create-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookingId
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create payment order');
      }

      console.log('🔍 Razorpay order created:', result);

      // Start payment status polling
      startPaymentPolling(result.orderId);

      // Step 2: Initialize Razorpay checkout
      const options = {
        key: result.key,
        amount: result.amount * 100, // Convert to paise
        currency: "INR",
        name: "RentIt",
        description: "Security Deposit Payment",
        order_id: result.orderId,
        
        ...getRazorpayMethodConfig(),
        
        // Removed duplicate to fix build error - keeping the better version below
        // prefill: {
        //   name: user.displayName || "Tenant",
        //   email: user.email || "",
        //   contact: user.phoneNumber || ""
        // },
        
        notes: {
          bookingId: bookingId,
          type: "security_deposit"
        },
        handler: async function (response) {
          if (verificationTriggered) return;
          setVerificationTriggered(true);
          console.log('🔍 Razorpay payment successful:', response);
          
          try {
            // Step 3: Verify payment with backend
            const verifyResponse = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/verify`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${await user.getIdToken()}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                ...response,
                bookingId
              })
            });

            const verifyResult = await verifyResponse.json();
            
            if (verifyResult.success) {
              setError(null);
              alert('Payment Successful! Your booking has been confirmed.');
              navigate(`/tenant/agreement/${bookingId}`);
            } else {
              const errorMessage = verifyResult.message || 'Payment verification failed. Please try again.';
              setError(errorMessage);
              setVerificationTriggered(false); // Allow retry
              setProcessing(false);
            }
          } catch (error) {
            console.error('Payment verification error:', error);
            const errorMessage = error.response?.data?.message || 
                               error.message || 
                               'Payment verification failed. Please try again.';
            setError(errorMessage);
            setVerificationTriggered(false); // Allow retry
            setProcessing(false);
          }
        },
        prefill: {
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
          contact: user.phoneNumber || ''
        },
        theme: {
          color: "#007bff",
          backdrop_color: "#ffffff"
        },
        modal: {
          ondismiss: function() {
            if (verificationTriggered) return;
            console.log('🔍 Razorpay modal dismissed without payment');
            // Optionally call an "abandon" endpoint for analytics
            fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/abandon`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${user.getIdToken()}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ 
                bookingId,
                orderId: result.orderId,
                reason: 'modal_dismissed'
              })
            }).catch(console.error);
            setProcessing(false);
          },
          escape: function() {
            if (verificationTriggered) return;
            console.log('🔍 Razorpay modal escaped without payment');
            // Optionally call an "abandon" endpoint for analytics
            fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/abandon`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${user.getIdToken()}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ 
                bookingId,
                orderId: result.orderId,
                reason: 'modal_escaped'
              })
            }).catch(console.error);
            setProcessing(false);
          }
        }
      };

      // Show helpful message before opening Razorpay
      alert("You will be asked to enter your phone number for secure payment verification. Your details have been pre-filled for convenience.");

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (error) {
      console.error("Payment error:", error);
      setError('Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  const calculateTotalAmount = () => {
    if (!booking) return 0;
    
    // Only charge security deposit for initial payment
    const deposit = booking.booking.proposedDeposit || 0;
    return deposit;
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="tenant-payment-loading">
          <div className="loading-container">
            <div className="spinner"></div>
            <h3>Loading Payment Details...</h3>
            <p>Preparing your payment information</p>
          </div>
        </div>
      </>
    );
  }

  if (!booking) {
    return (
      <>
        <Header />
        <div className="tenant-payment-error">
          <div className="error-container">
            <h2>Booking Not Found</h2>
            <p>The booking you're trying to pay for doesn't exist.</p>
            <button onClick={() => navigate('/dashboard')} className="btn-primary">
              Go to Dashboard
            </button>
          </div>
        </div>
      </>
    );
  }

  const totalAmount = calculateTotalAmount();

  // Check if payment is deferred
  const isPaymentDeferred = booking?.booking?.paymentDeferred;
  const paymentDueDate = booking?.booking?.paymentDueDate;

  return (
    <>
      <Header />
      
      <div className="tenant-payment-wrapper">
        <div className="tenant-payment-container">
          {/* Booking Summary Card */}
          <div className="booking-summary-card">
            <h1>Complete Your Rental Booking</h1>
            <div className="property-info">
              <h2>{booking.property.title}</h2>
              <p className="address">
                {typeof booking.property.address === 'string' 
                  ? booking.property.address 
                  : `${booking.property.address?.line || ''}, ${booking.property.address?.city || ''}, ${booking.property.address?.state || ''}`
                }
              </p>
            </div>
          </div>

          {/* Payment Details Card */}
          <div className="payment-details-card">
            <h2>Payment Details</h2>
            <div className="payment-breakdown">
              <div className="payment-row">
                <span>Monthly Rent:</span>
                <span>₹{booking.booking.proposedRent?.toLocaleString() || 0} <small style={{color: '#666', fontSize: '12px'}}>(to be paid monthly)</small></span>
              </div>
              <div className="payment-row">
                <span>Security Deposit:</span>
                <span>₹{booking.booking.proposedDeposit?.toLocaleString() || 0}</span>
              </div>
              <div className="payment-row">
                <span>Lease Duration:</span>
                <span>{booking.booking.tenantDetails?.leaseDuration || 1} months</span>
              </div>
              <div className="payment-row total">
                <span>Security Deposit (Payable Now):</span>
                <span>₹{totalAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Payment Deferred Banner */}
          {isPaymentDeferred && (
            <div className="payment-deferred-banner">
              <div className="deferred-content">
                <span className="deferred-icon">⏰</span>
                <div className="deferred-text">
                  <h4>Payment Deferred</h4>
                  <p>Your payment has been deferred. Please complete the payment by {new Date(paymentDueDate).toLocaleDateString('en-IN')}.</p>
                </div>
              </div>
            </div>
          )}

          {/* Payment Breakdown */}
          <div className="payment-breakdown-card">
            <h3>Payment Breakdown</h3>
            <div className="breakdown-item">
              <span>
                Security Deposit 
                <span className="tooltip-icon" title="Refundable at the end of tenancy, subject to property condition">ⓘ</span>
              </span>
              <span>₹{booking.booking.proposedDeposit?.toLocaleString() || 0}</span>
            </div>
            <div className="breakdown-item total">
              <span>Total Amount to Pay</span>
              <span>₹{(booking.booking.proposedDeposit || 0).toLocaleString()}</span>
            </div>
            <p className="payment-note">
              * Only security deposit is collected now. Monthly rent will be due later.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="payment-error-card">
              <div className="error-content">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
              <button className="retry-button" onClick={handlePayment} disabled={processing}>
                Retry Payment
              </button>
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="payment-method-card">
            <h2>Select Payment Method</h2>
            <div className="payment-options">
              <div 
                className={`payment-option ${selectedPaymentMethod === 'upi' ? 'selected' : ''}`}
                onClick={() => setSelectedPaymentMethod('upi')}
              >
                <div className="payment-icon">📱</div>
                <div className="payment-content">
                  <h3>UPI</h3>
                  <p>Pay using UPI apps like GPay, PhonePe, Paytm</p>
                </div>
              </div>
              
              <div 
                className={`payment-option ${selectedPaymentMethod === 'card' ? 'selected' : ''}`}
                onClick={() => setSelectedPaymentMethod('card')}
              >
                <div className="payment-icon">💳</div>
                <div className="payment-content">
                  <h3>Credit/Debit Card</h3>
                  <p>Pay securely with your credit or debit card</p>
                </div>
              </div>
              
              <div 
                className={`payment-option ${selectedPaymentMethod === 'netbanking' ? 'selected' : ''}`}
                onClick={() => setSelectedPaymentMethod('netbanking')}
              >
                <div className="payment-icon">🏦</div>
                <div className="payment-content">
                  <h3>Net Banking</h3>
                  <p>Pay through your bank's net banking portal</p>
                </div>
              </div>
              
              <div 
                className={`payment-option ${selectedPaymentMethod === 'wallet' ? 'selected' : ''}`}
                onClick={() => setSelectedPaymentMethod('wallet')}
              >
                <div className="payment-icon">👛</div>
                <div className="payment-content">
                  <h3>Wallet</h3>
                  <p>Pay using popular wallet services</p>
                </div>
              </div>
            </div>
          </div>

          {/* Proceed to Pay Button */}
          <div className="payment-action">
            <button 
              className="proceed-to-pay-btn"
              onClick={handlePayment}
              disabled={processing || polling}
            >
              {processing || polling ? (
                <>
                  <div className="payment-spinner"></div>
                  {polling ? 'Checking Payment...' : 'Processing...'}
                </>
              ) : (
                <>
                  Proceed to Pay ₹{totalAmount.toLocaleString()}
                </>
              )}
            </button>
            
            <p className="security-note">
              🔒 Your payment information is secure and encrypted
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
