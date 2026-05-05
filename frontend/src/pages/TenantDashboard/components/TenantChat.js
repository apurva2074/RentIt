import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "./TenantChat.css";
import { auth } from "../../../firebase/auth";
import { getUserChats } from "../../../services/chatService";

export default function TenantChat() {
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [groupBy, setGroupBy] = useState('property'); // 'property' or 'recent'
  const [ownerNames, setOwnerNames] = useState({}); // Cache for fetched owner names

  // Function to fetch owner names for chats that don't have them
  const fetchOwnerNamesForChats = useCallback(async (chats) => {
    const ownerIdsToFetch = [];
    
    // Identify chats that need owner names fetched
    chats.forEach(chat => {
      if (!chat.otherUser?.name && chat.ownerId && !ownerNames[chat.ownerId]) {
        ownerIdsToFetch.push(chat.ownerId);
      }
    });
    
    if (ownerIdsToFetch.length === 0) {
      console.log("✅ All owner names already available");
      return;
    }
    
    console.log(`🔄 Fetching names for ${ownerIdsToFetch.length} owners:`, ownerIdsToFetch);
    
    try {
      const token = await user.getIdToken();
      const fetchPromises = ownerIdsToFetch.map(async (ownerId) => {
        try {
          const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/users/${ownerId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const ownerData = await response.json();
            console.log(`✅ Fetched owner data for ${ownerId}:`, ownerData);
            return { ownerId, name: ownerData.name };
          } else {
            console.log(`❌ Failed to fetch owner ${ownerId}: ${response.status}`);
            return { ownerId, name: null };
          }
        } catch (error) {
          console.log(`❌ Error fetching owner ${ownerId}:`, error);
          return { ownerId, name: null };
        }
      });
      
      const results = await Promise.all(fetchPromises);
      
      // Update owner names cache and chat objects
      const newOwnerNames = { ...ownerNames };
      results.forEach(({ ownerId, name }) => {
        if (name) {
          newOwnerNames[ownerId] = name;
        }
      });
      
      setOwnerNames(newOwnerNames);
      
      // Update chat objects with fetched names
      chats.forEach(chat => {
        if (!chat.otherUser?.name && chat.ownerId && newOwnerNames[chat.ownerId]) {
          chat.otherUser = { ...chat.otherUser, name: newOwnerNames[chat.ownerId] };
          console.log(`✅ Updated chat ${chat.chatId} with owner name: ${newOwnerNames[chat.ownerId]}`);
        }
      });
      
      console.log("✅ Owner names fetched and cached:", newOwnerNames);
    } catch (error) {
      console.error("❌ Error fetching owner names:", error);
    }
  }, [ownerNames, user, setOwnerNames]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchChats = async () => {
      try {
        console.log("🧪 TenantChat - Starting to fetch chats...");
        console.log("🧪 TenantChat - Current user:", user?.uid);
        
        const response = await getUserChats();
        console.log("🧪 TenantChat - Received chats response:", response);
        console.log("🧪 TenantChat - Response type:", typeof response);
        console.log("🧪 TenantChat - Response keys:", Object.keys(response));
        
        // Handle new response structure
        const chatsData = response.chats || response;
        console.log("🧪 TenantChat - Chats data type:", typeof chatsData);
        console.log("🧪 TenantChat - Chats data length:", Array.isArray(chatsData) ? chatsData.length : 'Not an array');
        
        // DETAILED LOGGING: Log each chat received
        if (Array.isArray(chatsData)) {
          console.log("🧪 TenantChat - DETAILED CHAT ANALYSIS:");
          chatsData.forEach((chat, index) => {
            console.log(`🧪 CHAT ${index + 1}:`, {
              chatId: chat.chatId,
              propertyId: chat.propertyId,
              propertyTitle: chat.property?.title,
              tenantId: chat.tenantId,
              ownerId: chat.ownerId,
              userRole: chat.userRole,
              lastMessage: chat.lastMessage,
              otherUser: chat.otherUser,
              otherUserName: chat.otherUser?.name,
              ownerName: chat.ownerName
            });
          });
        }
        
        // Deduplicate by ownerId, keeping the chat that has messages
        const ownerChatMap = new Map();

        chatsData.forEach(chat => {
          const ownerId = chat.ownerId;
          const existing = ownerChatMap.get(ownerId);
          
          if (!existing) {
            // First chat for this owner – store it
            ownerChatMap.set(ownerId, chat);
          } else {
            // Already have a chat – keep the one that has messages
            const existingHasMessage = existing.lastMessage && existing.lastMessage !== null;
            const newHasMessage = chat.lastMessage && chat.lastMessage !== null;
            
            if (newHasMessage && !existingHasMessage) {
              // New chat has message, existing empty – replace
              ownerChatMap.set(ownerId, chat);
            } else if (newHasMessage && existingHasMessage) {
              // Both have messages – keep the most recent (by lastMessageTime)
              const existingTime = existing.lastMessageTime?.toDate?.() || new Date(0);
              const newTime = chat.lastMessageTime?.toDate?.() || new Date(0);
              if (newTime > existingTime) {
                ownerChatMap.set(ownerId, chat);
              }
            }
            // Otherwise keep existing (if existing has message and new empty, or both empty)
          }
        });

        const uniqueChats = Array.from(ownerChatMap.values());

        // Sort by lastMessageTime descending (most recent first)
        uniqueChats.sort((a, b) => {
          const timeA = a.lastMessageTime?.toDate?.() || new Date(0);
          const timeB = b.lastMessageTime?.toDate?.() || new Date(0);
          return timeB - timeA;
        });

        console.log("🧪 TenantChat - After deduplication:", {
          originalCount: chatsData.length,
          uniqueCount: uniqueChats.length,
          duplicatesRemoved: chatsData.length - uniqueChats.length
        });

        console.log("🧪 TenantChat - Setting unique chats in state:", uniqueChats);
        
        // Fetch owner names for chats that don't have them
        await fetchOwnerNamesForChats(uniqueChats);
        
        setChats(uniqueChats);
        setLoading(false);
      } catch (error) {
        console.error('🧪 TenantChat - Error fetching chats:', error);
        setLoading(false);
      }
    };

    fetchChats();
  }, [user, navigate, fetchOwnerNamesForChats]);

  const handleChatClick = (chat) => {
    // Validate chat data before navigation
    if (!chat || !chat.chatId) {
      console.error('Invalid chat data:', chat);
      return;
    }
    
    navigate(`/chat/${chat.chatId}`, { 
      state: { 
        propertyTitle: chat.property?.title || 'Property',
        otherUserName: chat.otherUser?.name || 'User'
      } 
    });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    let date;
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else {
      return '';
    }
    
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const filteredChats = chats.filter(chat => 
    chat.property?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.otherUser?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chat.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group chats by property
  const groupedChats = useMemo(() => {
    if (groupBy !== 'property') return { recent: filteredChats };
    
    const groups = {};
    filteredChats.forEach(chat => {
      const propertyTitle = chat.property?.title || 'Unknown Property';
      if (!groups[propertyTitle]) {
        groups[propertyTitle] = {
          property: chat.property,
          chats: []
        };
      }
      groups[propertyTitle].chats.push(chat);
    });
    
    // Sort chats within each group by last message time
    Object.keys(groups).forEach(propertyTitle => {
      groups[propertyTitle].chats.sort((a, b) => {
        const timeA = a.lastMessageTime ? (a.lastMessageTime.toDate ? a.lastMessageTime.toDate().getTime() : new Date(a.lastMessageTime).getTime()) : 0;
        const timeB = b.lastMessageTime ? (b.lastMessageTime.toDate ? b.lastMessageTime.toDate().getTime() : new Date(b.lastMessageTime).getTime()) : 0;
        return timeB - timeA;
      });
    });
    
    return groups;
  }, [groupBy, filteredChats]);

  // Calculate total unread count
  const totalUnreadCount = useMemo(() => {
    return chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
  }, [chats]);

  // Helper function to get owner name with multiple fallbacks
  const getOwnerName = (chat) => {
    console.log(`🔍 DIAGNOSTIC - getOwnerName for chat ${chat.chatId}:`, {
      otherUser: chat.otherUser,
      ownerName: chat.ownerName,
      propertyOwnerName: chat.property?.ownerName,
      propertyContactPerson: chat.property?.contactPerson,
      ownerId: chat.ownerId,
      cachedOwnerName: chat.ownerId ? ownerNames[chat.ownerId] : null
    });
    
    // DIAGNOSTIC: Check if otherUser.name is problematic
    if (chat.otherUser?.name === 'User' || chat.otherUser?.name === 'Unknown User' || !chat.otherUser?.name) {
      console.log(`🚨 DIAGNOSTIC - PROBLEM DETECTED in chat ${chat.chatId}:`);
      console.log(`   otherUser.name: "${chat.otherUser?.name}"`);
      console.log(`   otherUser.email: "${chat.otherUser?.email}"`);
      console.log(`   Will try fallbacks...`);
    }
    
    // 1. From otherUser object (backend-provided)
    if (chat.otherUser?.name && chat.otherUser.name !== 'User' && chat.otherUser.name !== 'Unknown User') {
      console.log(`✅ DIAGNOSTIC - Using otherUser.name: ${chat.otherUser.name}`);
      return chat.otherUser.name;
    }
    // 2. From cached ownerNames map (if fetched separately)
    if (chat.ownerId && ownerNames[chat.ownerId]) {
      console.log(`✅ DIAGNOSTIC - Using cached owner name: ${ownerNames[chat.ownerId]}`);
      return ownerNames[chat.ownerId];
    }
    // 3. Direct fallback from chat object
    if (chat.ownerName) {
      console.log(`✅ DIAGNOSTIC - Using chat.ownerName: ${chat.ownerName}`);
      return chat.ownerName;
    }
    if (chat.property?.ownerName) {
      console.log(`✅ DIAGNOSTIC - Using property.ownerName: ${chat.property.ownerName}`);
      return chat.property.ownerName;
    }
    if (chat.property?.contactPerson) {
      console.log(`✅ DIAGNOSTIC - Using property.contactPerson: ${chat.property.contactPerson}`);
      return chat.property.contactPerson;
    }
    // 4. Email-derived fallback
    if (chat.otherUser?.email) {
      const emailName = chat.otherUser.email.split('@')[0];
      console.log(`✅ DIAGNOSTIC - Using email username: ${emailName}`);
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    
    console.log(`❌ DIAGNOSTIC - No name found, using fallback 'Property Owner'`);
    return 'Property Owner';
  };

  // Enhanced last message preview
  const formatLastMessage = (chat) => {
    if (!chat.lastMessage) {
      return chat.isReadonly ? 'Read-only conversation' : 'No messages yet';
    }
    
    const message = chat.lastMessage;
    const sender = chat.lastMessageSenderId === user?.uid ? 'You' : getOwnerName(chat);
    const maxLength = 50;
    
    let preview = `${sender}: ${message}`;
    if (preview.length > maxLength) {
      preview = preview.substring(0, maxLength) + '...';
    }
    
    return preview;
  };

  if (loading) {
    return (
      <div className="tenant-chat-loading">
        <div className="loading-spinner"></div>
        <p>Loading your conversations...</p>
      </div>
    );
  }

  return (
    <div className="tenant-chat-container">
      <div className="tenant-chat-header">
        <div className="header-title">
          <h2>Messages</h2>
          {totalUnreadCount > 0 && (
            <div className="total-unread-badge">
              {totalUnreadCount}
            </div>
          )}
        </div>
        <div className="header-controls">
          <div className="chat-search">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div className="group-controls">
            <button 
              className={`group-btn ${groupBy === 'recent' ? 'active' : ''}`}
              onClick={() => setGroupBy('recent')}
            >
              Recent
            </button>
            <button 
              className={`group-btn ${groupBy === 'property' ? 'active' : ''}`}
              onClick={() => setGroupBy('property')}
            >
              By Property
            </button>
          </div>
        </div>
      </div>

      <div className="chats-list">
        {Object.keys(groupedChats).length === 0 ? (
          <div className="empty-chats">
            <div className="empty-icon">Chat</div>
            <h3>No conversations yet</h3>
            <p>
              {searchTerm ? 'No conversations match your search' : 'Start a conversation by contacting property owners'}
            </p>
            {!searchTerm && (
              <button 
                className="browse-properties-btn"
                onClick={() => navigate('/listings')}
              >
                Browse Properties
              </button>
            )}
          </div>
        ) : (
          Object.entries(groupedChats).map(([groupKey, groupData]) => (
            <div key={groupKey} className="chat-group">
              {groupBy === 'property' && (
                <div className="group-header">
                  <div className="group-info">
                    <h3 className="group-title">{groupKey}</h3>
                    {groupData.property && (
                      <div className="group-property-details">
                        {groupData.property.address?.city && (
                          <span className="property-city">{groupData.property.address.city}</span>
                        )}
                        {groupData.property.bedrooms && (
                          <span className="property-beds">{groupData.property.bedrooms} BHK</span>
                        )}
                        {groupData.property.rent && (
                          <span className="property-rent">₹{groupData.property.rent.toLocaleString()}/mo</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="group-stats">
                    <span className="chat-count">{groupData.chats.length} conversation{groupData.chats.length !== 1 ? 's' : ''}</span>
                    {groupData.chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0) > 0 && (
                      <span className="group-unread">
                        {groupData.chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0)} unread
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              <div className="group-chats">
                {(groupBy === 'property' ? groupData.chats : [groupData]).map((chat) => (
                  <div 
                    key={chat.chatId} 
                    className={`chat-item ${chat.isReadonly ? 'readonly' : ''} ${chat.unreadCount > 0 ? 'has-unread' : ''}`}
                    onClick={() => handleChatClick(chat)}
                  >
                    <div className="chat-avatar">
                      <div className="avatar-circle">
                        {chat.otherUser?.name ? chat.otherUser.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() : (chat.otherUser?.role === 'owner' ? 'O' : 'T')}
                      </div>
                      {chat.unreadCount > 0 && (
                        <div className="unread-badge">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </div>
                      )}
                      {chat.isReadonly && (
                        <div className="readonly-indicator" title="Read-only chat">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    
                    <div className="chat-content">
                      <div className="chat-header-info">
                        <div className="chat-name-section">
                          <h3 className="chat-name">
                            {getOwnerName(chat)}
                          </h3>
                          {chat.property?.title && groupBy === 'recent' && (
                            <span className="chat-property-title">{chat.property.title}</span>
                          )}
                        </div>
                        <div className="chat-meta">
                          <span className="chat-time">
                            {formatTime(chat.lastMessageTime)}
                          </span>
                          {chat.unreadCount > 0 && (
                            <span className="unread-indicator">•</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="chat-preview">
                        {groupBy === 'recent' && chat.property && (
                          <div className="property-info">
                            {chat.property.address?.city && (
                              <span className="property-location">
                                📍 {chat.property.address.city}
                                {chat.property.address?.state && `, ${chat.property.address.state}`}
                              </span>
                            )}
                            {chat.property.bedrooms && (
                              <span className="property-specs">
                                {chat.property.bedrooms} BHK
                                {chat.property.rent && ` • ₹${chat.property.rent.toLocaleString()}/mo`}
                              </span>
                            )}
                          </div>
                        )}
                        
                        <div className="last-message-section">
                          <p className="last-message">
                            {formatLastMessage(chat)}
                          </p>
                          {chat.isReadonly && (
                            <p className="readonly-notice">
                              Lock Read-only {chat.propertyStatus === 'rented' ? '(Property rented)' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="chat-arrow">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
