import React, { useState, useEffect } from "react";
import "./OwnerChat.css";
import { useNavigate } from "react-router-dom";
import { auth } from "../../../firebase/auth";
import { getUserChats } from "../../../services/chatService";

export default function OwnerChat() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchChats();
  }, [user, navigate]);

  const fetchChats = async () => {
    try {
      console.log("Fetching owner chats...");
      const response = await getUserChats();
      console.log("Received owner chats response:", response);
      
      // Handle new response structure
      const chatsData = response.chats || response;
      console.log("Setting chats in state:", chatsData);
      setChats(chatsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching chats:', error);
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    }
  };

  const getMessagePreview = (message) => {
    if (!message) return 'No messages yet';
    if (typeof message === 'string') return message;
    if (typeof message === 'object') {
      // Try common property names
      return message.text || message.message || message.content || JSON.stringify(message);
    }
    return 'New message';
  };

  const filteredChats = (chats || []).filter(chat => {
    const tenantName = chat.otherUser?.name || chat.otherUser?.email || 'Unknown';
    const propertyTitle = chat.property?.title || '';
    const lastMessage = getMessagePreview(chat.lastMessage);
    
    const searchLower = searchTerm.toLowerCase();
    return tenantName.toLowerCase().includes(searchLower) ||
           propertyTitle.toLowerCase().includes(searchLower) ||
           lastMessage.toLowerCase().includes(searchLower);
  });

  const handleChatClick = (chat) => {
    navigate(`/chat/${chat.chatId}`);
  };

  if (loading) {
    return (
      <div className="owner-chat-loading">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="owner-chat-container">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="header-content">
          <h2>Messages</h2>
          <div className="chat-stats">
            <span className="total-chats">{chats.length} conversations</span>
          </div>
        </div>
        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="chat-list-container">
        {filteredChats.length === 0 ? (
          <div className="empty-chat-state">
            <div className="empty-icon">Chat</div>
            <h3>No conversations yet</h3>
            <p>
              {searchTerm 
                ? "No conversations match your search criteria." 
                : "Tenants haven't started any conversations about your properties yet."}
            </p>
          </div>
        ) : (
          <div className="chat-list">
            {filteredChats.map((chat) => (
              <div 
                key={chat.chatId} 
                className="chat-item"
                onClick={() => handleChatClick(chat)}
              >
                <div className="chat-avatar">
                  <div className="avatar-placeholder">
                    {chat.otherUser?.name ? chat.otherUser.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() : 
                     (chat.otherUser?.email?.charAt(0)?.toUpperCase() || 'T')}
                  </div>
                </div>
                
                <div className="chat-content">
                  <div className="chat-header-info">
                    <div className="tenant-info">
                      <h4 className="tenant-name">
                        {chat.otherUser?.name || chat.otherUser?.email || 'Unknown Tenant'}
                      </h4>
                      <p className="property-title">
                        {chat.property?.title || 'Property Discussion'}
                      </p>
                    </div>
                    <span className="chat-time">
                      {formatTime(chat.lastMessageTime)}
                    </span>
                  </div>
                  
                  <div className="last-message">
                    <p className="message-preview">{getMessagePreview(chat.lastMessage)}</p>
                  </div>
                  
                  <div className="chat-meta">
                    <span className="property-location">
                      {chat.property?.address?.city && chat.property?.address?.state 
                        ? `${chat.property.address.city}, ${chat.property.address.state}`
                        : 'Location not specified'
                      }
                    </span>
                    {chat.property?.monthlyRent && (
                      <span className="property-price">
                        ₹{chat.property.monthlyRent}/month
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
