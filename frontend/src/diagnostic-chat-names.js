// Comprehensive diagnostic tool for chat name resolution
import { getUserChats } from '../services/chatService';

export const runChatNameDiagnostic = async () => {
  console.log('🔍 === COMPREHENSIVE CHAT NAME DIAGNOSTIC ===');
  
  try {
    // Step 1: Get API response
    console.log('\n📡 Step 1: Fetching chats from API...');
    const response = await getUserChats();
    const chats = response.chats;
    
    console.log(`📊 Found ${chats.length} chats`);
    
    // Step 2: Analyze each chat
    chats.forEach((chat, index) => {
      console.log(`\n--- CHAT ${index + 1} ANALYSIS ---`);
      console.log('🆔 Chat ID:', chat.chatId);
      console.log('👤 Owner ID:', chat.ownerId);
      console.log('👤 Tenant ID:', chat.tenantId);
      console.log('🏠 Property:', chat.property?.title);
      
      // Step 3: Deep dive into otherUser object
      console.log('\n🔍 otherUser Object Analysis:');
      if (chat.otherUser) {
        console.log('  ✅ otherUser exists');
        console.log('  📛 otherUser.name:', `"${chat.otherUser.name}"`);
        console.log('  📧 otherUser.email:', chat.otherUser.email);
        console.log('  🆔 otherUser.uid:', chat.otherUser.uid);
        
        // Check if name is problematic
        if (!chat.otherUser.name || chat.otherUser.name === 'User' || chat.otherUser.name === 'Unknown User') {
          console.log('  🚨 PROBLEM DETECTED: Name is missing or generic!');
          console.log('  📋 Expected fallback chain:');
          console.log('    1. Firestore name (users.name)');
          console.log('    2. Firebase Auth displayName');
          console.log('    3. Email-derived name');
          console.log('    4. "Unknown User" fallback');
        } else {
          console.log('  ✅ Name looks good:', chat.otherUser.name);
        }
      } else {
        console.log('  ❌ otherUser is null or undefined');
      }
      
      // Step 4: Check alternative name sources
      console.log('\n🔍 Alternative Name Sources:');
      console.log('  📛 chat.ownerName:', `"${chat.ownerName || 'MISSING'}"`);
      console.log('  🏠 chat.property?.ownerName:', `"${chat.property?.ownerName || 'MISSING'}"`);
      console.log('  📞 chat.property?.contactPerson:', `"${chat.property?.contactPerson || 'MISSING'}"`);
      
      // Step 5: Predict what getOwnerName will return
      console.log('\n🎯 getOwnerName() Prediction:');
      
      let predictedName = 'Property Owner'; // Final fallback
      
      if (chat.otherUser?.name && chat.otherUser.name !== 'User' && chat.otherUser.name !== 'Unknown User') {
        predictedName = chat.otherUser.name;
        console.log('  ✅ Will use: otherUser.name =', predictedName);
      } else if (chat.ownerName) {
        predictedName = chat.ownerName;
        console.log('  ✅ Will use: chat.ownerName =', predictedName);
      } else if (chat.property?.ownerName) {
        predictedName = chat.property.ownerName;
        console.log('  ✅ Will use: property.ownerName =', predictedName);
      } else if (chat.property?.contactPerson) {
        predictedName = chat.property.contactPerson;
        console.log('  ✅ Will use: property.contactPerson =', predictedName);
      } else if (chat.otherUser?.email) {
        const emailName = chat.otherUser.email.split('@')[0];
        predictedName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
        console.log('  ✅ Will use: email-derived =', predictedName);
      } else {
        console.log('  ❌ Will use fallback: Property Owner');
      }
      
      console.log('  🎯 FINAL PREDICTED NAME:', `"${predictedName}"`);
      console.log('------------------------\n');
    });
    
    // Step 6: Summary
    console.log('\n📊 === DIAGNOSTIC SUMMARY ===');
    const problematicChats = chats.filter(chat => 
      !chat.otherUser?.name || 
      chat.otherUser.name === 'User' || 
      chat.otherUser.name === 'Unknown User'
    );
    
    if (problematicChats.length > 0) {
      console.log(`🚨 FOUND ${problematicChats.length} PROBLEMATIC CHATS:`);
      problematicChats.forEach((chat, index) => {
        console.log(`  ${index + 1}. Chat ${chat.chatId} - Owner: ${chat.ownerId}`);
        console.log(`     otherUser.name: "${chat.otherUser?.name || 'MISSING'}"`);
        console.log(`     otherUser.email: ${chat.otherUser?.email || 'MISSING'}`);
      });
      
      console.log('\n🔧 RECOMMENDED ACTIONS:');
      console.log('1. Check backend logs for Firebase Auth fetch attempts');
      console.log('2. Verify Firestore users collection for these owner IDs');
      console.log('3. Check Firebase Authentication for these users');
      console.log('4. Ensure backend is running latest code with fallbacks');
    } else {
      console.log('✅ All chats have proper names!');
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
};

// Enhanced function to test specific owner ID
export const testSpecificOwner = async (ownerId) => {
  console.log(`🔍 === TESTING SPECIFIC OWNER: ${ownerId} ===`);
  
  try {
    // This would require a backend endpoint to test specific user
    console.log('📡 Testing owner data resolution...');
    
    // Simulate what backend does
    console.log('🔍 Checking what the backend would return for this owner...');
    console.log('📋 This requires backend verification of:');
    console.log('  1. Firestore users collection');
    console.log('  2. Firebase Auth getUser()');
    console.log('  3. Email-derived name fallback');
    
  } catch (error) {
    console.error('❌ Owner test failed:', error);
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.runChatNameDiagnostic = runChatNameDiagnostic;
  window.testSpecificOwner = testSpecificOwner;
  
  console.log('🔧 Chat name diagnostic tools loaded!');
  console.log('📝 Available commands:');
  console.log('  - window.runChatNameDiagnostic() - Full chat analysis');
  console.log('  - window.testSpecificOwner("ownerId") - Test specific owner');
}
