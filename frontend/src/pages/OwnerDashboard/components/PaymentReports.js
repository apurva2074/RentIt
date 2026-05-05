import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import './PaymentReports.css';

const PaymentReports = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const exportToCSV = async () => {
    if (!user) return;

    try {
      setExporting(true);
      setError(null);

      const token = await user.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/payments/export-csv`, {
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
        a.download = `payments_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to export payments');
      }
    } catch (error) {
      console.error('Error exporting payments:', error);
      setError('Failed to export payments. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="payment-reports-container">
      <div className="reports-header">
        <h2>Payment Reports</h2>
        <p className="reports-description">
          Export and analyze your payment data with comprehensive reports.
        </p>
      </div>

      <div className="reports-content">
        <div className="export-section">
          <div className="export-card">
            <div className="export-info">
              <div className="export-icon">📊</div>
              <div className="export-details">
                <h3>Export Payment Data</h3>
                <p>
                  Download all payment records for your properties in CSV format. 
                  Includes payment details, tenant information, and property data.
                </p>
                <div className="export-features">
                  <div className="feature-item">
                    <span className="feature-icon">✓</span>
                    <span>All payment transactions</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">✓</span>
                    <span>Tenant details</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">✓</span>
                    <span>Property information</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">✓</span>
                    <span>Invoice availability</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">✓</span>
                    <span>Payment timestamps</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="export-action">
              <button 
                className="export-button"
                onClick={exportToCSV}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <div className="export-spinner"></div>
                    Exporting...
                  </>
                ) : (
                  <>
                    <span className="export-button-icon">📥</span>
                    Export to CSV
                  </>
                )}
              </button>
              
              <p className="export-note">
                CSV file can be opened in Excel, Google Sheets, or any spreadsheet application.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
            <button className="retry-button" onClick={exportToCSV} disabled={exporting}>
              Retry
            </button>
          </div>
        )}

        <div className="reports-info">
          <h3>Report Information</h3>
          <div className="info-grid">
            <div className="info-item">
              <h4>📈 Data Included</h4>
              <ul>
                <li>Payment amounts and dates</li>
                <li>Tenant names and contact information</li>
                <li>Property titles and addresses</li>
                <li>Payment status and method</li>
                <li>Razorpay transaction IDs</li>
                <li>Invoice availability status</li>
              </ul>
            </div>
            
            <div className="info-item">
              <h4>🔍 Use Cases</h4>
              <ul>
                <li>Financial analysis and accounting</li>
                <li>Tenant payment tracking</li>
                <li>Property performance metrics</li>
                <li>Tax reporting</li>
                <li>Business intelligence</li>
                <li>Payment reconciliation</li>
              </ul>
            </div>
            
            <div className="info-item">
              <h4>⚡ Quick Tips</h4>
              <ul>
                <li>Export data monthly for regular reporting</li>
                <li>Use filters in spreadsheet software for analysis</li>
                <li>Combine with property data for insights</li>
                <li>Keep records for tax purposes</li>
                <li>Monitor payment patterns and trends</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="reports-stats">
          <h3>Quick Stats</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">💰</div>
              <div className="stat-info">
                <h4>Total Revenue</h4>
                <p className="stat-value">View in Analytics</p>
                <small>Track your earnings over time</small>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">👥</div>
              <div className="stat-info">
                <h4>Active Tenants</h4>
                <p className="stat-value">View in Dashboard</p>
                <small>Monitor tenant activity</small>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">🏠</div>
              <div className="stat-info">
                <h4>Property Performance</h4>
                <p className="stat-value">View in Analytics</p>
                <small>Analyze property metrics</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentReports;
