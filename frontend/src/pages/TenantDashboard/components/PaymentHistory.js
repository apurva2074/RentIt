import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import './PaymentHistory.css';

const PaymentHistory = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPaymentHistory();
  }, [user]);

  const fetchPaymentHistory = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/my-payments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        setPayments(result.payments || []);
      } else {
        setError(result.message || 'Failed to fetch payment history');
      }
    } catch (error) {
      console.error('Error fetching payment history:', error);
      setError('Failed to fetch payment history');
    } finally {
      setLoading(false);
    }
  };

  const downloadInvoice = async (paymentId) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/invoice/${paymentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice_${paymentId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to download invoice');
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Failed to download invoice');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      completed: { color: '#28a745', label: 'Completed' },
      captured: { color: '#28a745', label: 'Captured' },
      failed: { color: '#dc3545', label: 'Failed' },
      pending: { color: '#ffc107', label: 'Pending' }
    };

    const config = statusConfig[status] || { color: '#6c757d', label: status };
    
    return (
      <span 
        className="status-badge" 
        style={{ backgroundColor: config.color }}
      >
        {config.label}
      </span>
    );
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="payment-history-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading payment history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="payment-history-container">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
          <button className="retry-button" onClick={fetchPaymentHistory}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="payment-history-container">
        <div className="empty-state">
          <span className="empty-icon">📄</span>
          <h3>No Payment History</h3>
          <p>You haven't made any payments yet. Your payment history will appear here once you complete your first payment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-history-container">
      <div className="payment-history-header">
        <h2>Payment History</h2>
        <p className="payment-count">{payments.length} payment{payments.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="payments-table-container">
        <table className="payments-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Property</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Booking ID</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="payment-row">
                <td className="date-cell">
                  {formatDate(payment.paidAt || payment.createdAt)}
                </td>
                <td className="property-cell">
                  <div className="property-info">
                    <span className="property-title">{payment.propertyTitle}</span>
                  </div>
                </td>
                <td className="amount-cell">
                  <span className="amount">₹{payment.amount?.toLocaleString('en-IN') || 0}</span>
                </td>
                <td className="status-cell">
                  {getStatusBadge(payment.status)}
                </td>
                <td className="booking-cell">
                  <span className="booking-id">{payment.bookingId}</span>
                </td>
                <td className="invoice-cell">
                  {payment.hasInvoice ? (
                    <button 
                      className="download-invoice-btn"
                      onClick={() => downloadInvoice(payment.id)}
                      title="Download Invoice"
                    >
                      📄 Download
                    </button>
                  ) : (
                    <span className="no-invoice">Not Available</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="payment-summary">
        <div className="summary-item">
          <span className="summary-label">Total Paid:</span>
          <span className="summary-value">
            ₹{payments
              .filter(p => p.status === 'completed' || p.status === 'captured')
              .reduce((sum, p) => sum + (p.amount || 0), 0)
              .toLocaleString('en-IN')}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Successful Payments:</span>
          <span className="summary-value">
            {payments.filter(p => p.status === 'completed' || p.status === 'captured').length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PaymentHistory;
