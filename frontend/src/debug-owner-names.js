// Debug utility to check owner name resolution
import { getUserChats } from '../services/chatService';

export const debugOwnerNames = async () => {
  console.log('🔍 DEBUG: Checking owner name resolution...');
  
  try {
    const response = await getUserChats();
    const chats = response.chats;
    
    console.log(`📊 Found ${chats.length} chats`);
    
    chats.forEach((chat, index) => {
      console.log(`\n--- CHAT ${index + 1} ---`);
      console.log('Chat ID:', chat.chatId);
      console.log('Property Title:', chat.property?.title);
      console.log('Owner ID:', chat.ownerId);
      console.log('Tenant ID:', chat.tenantId);
      console.log('Current User Role:', chat.userRole);
      
      console.log('\n👤 otherUser object:');
      console.log('  otherUser:', chat.otherUser);
      console.log('  otherUser.name:', chat.otherUser?.name);
      console.log('  otherUser.email:', chat.otherUser?.email);
      
      console.log('\n🏠 property object:');
      console.log('  property.ownerName:', chat.property?.ownerName);
      console.log('  property.contactPerson:', chat.property?.contactPerson);
      
      console.log('\n🔧 Direct chat fields:');
      console.log('  chat.ownerName:', chat.ownerName);
      
      // Test the getOwnerName function logic
      console.log('\n🎯 Name resolution priority:');
      if (chat.otherUser?.name) {
        console.log('  ✅ Would use: otherUser.name =', chat.otherUser.name);
      } else if (chat.ownerId && ownerNames[chat.ownerId]) {
        console.log('  ✅ Would use: cached owner name =', ownerNames[chat.ownerId]);
      } else if (chat.ownerName) {
        console.log('  ✅ Would use: chat.ownerName =', chat.ownerName);
      } else if (chat.property?.ownerName) {
        console.log('  ✅ Would use: property.ownerName =', chat.property.ownerName);
      } else if (chat.property?.contactPerson) {
        console.log('  ✅ Would use: property.contactPerson =', chat.property.contactPerson);
      } else if (chat.otherUser?.email) {
        const emailName = chat.otherUser.email.split('@')[0];
        console.log('  ✅ Would use: email username =', emailName);
      } else {
        console.log('  ❌ Would use fallback: Property Owner');
      }
      
      console.log('------------------------\n');
    });
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
};

// Make it available globally for testing
if (typeof window !== 'undefined') {
  window.debugOwnerNames = debugOwnerNames;
  console.log('🔧 Debug utility loaded! Run window.debugOwnerNames() to check owner names');
}
