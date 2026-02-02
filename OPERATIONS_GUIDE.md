# Telegram GramPro - Operations Guide

## Overview

This guide provides comprehensive documentation for all operations available in the Telegram GramPro n8n node. Each operation is designed to work seamlessly with Telegram's MTProto protocol through GramJS.

## 🎯 Operations Reference

### **Message Operations**

#### **Send Text**
Send text messages to any chat or user with advanced options.

**Parameters:**
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message**: Text to send
- **Reply To**: Optional message ID to reply to
- **Disable Link Preview**: Hide link previews for URLs

**Example:**
```json
{
  "operation": "sendText",
  "chatId": "@channel_name",
  "message": "Hello from n8n!",
  "disableLinkPreview": true
}
```

**Use Cases:**
- Automated announcements
- Welcome messages
- Status updates
- Notifications

---

#### **Edit Message**
Edit previously sent messages with precision control.

**Parameters:**
- **Chat ID**: Target chat ID
- **Message ID**: ID of message to edit
- **Text**: New message text
- **Disable Link Preview**: Hide link previews

**Example:**
```json
{
  "operation": "editMessage",
  "chatId": "123456789",
  "messageId": 123,
  "text": "Updated message content",
  "disableLinkPreview": false
}
```

**Use Cases:**
- Correcting typos
- Updating information
- Adding new details to existing messages

---

#### **Delete Message**
Remove messages from chats with granular control.

**Parameters:**
- **Chat ID**: Target chat ID
- **Message ID**: ID of message to delete
- **Delete for Everyone**: Whether to delete for all users

**Example:**
```json
{
  "operation": "deleteMessage",
  "chatId": "123456789",
  "messageId": 123,
  "revoke": true
}
```

**Use Cases:**
- Content moderation
- Removing inappropriate messages
- Cleaning up old announcements

---

#### **Pin Message**
Pin important messages in chats with notification options.

**Parameters:**
- **Chat ID**: Target chat ID
- **Message ID**: ID of message to pin
- **Notify Players**: Send notification to all members

**Example:**
```json
{
  "operation": "pinMessage",
  "chatId": "@group_name",
  "messageId": 456,
  "notify": true
}
```

**Use Cases:**
- Highlighting important announcements
- Pinning rules and guidelines
- Featuring important updates

---

#### **Send Poll**
Create interactive polls and quizzes for engagement.

**Parameters:**
- **Chat ID**: Target chat ID
- **Question**: Poll question
- **Options**: Poll answer options
- **Is Quiz**: Whether this is a quiz
- **Anonymous Voting**: Hide voter identities
- **Correct Answer Index**: For quizzes, the correct answer

**Example:**
```json
{
  "operation": "sendPoll", 
  "chatId": "123456789",
  "question": "What's your favorite feature?",
  "options": ["Messages", "Chats", "Users", "Channels"],
  "isQuiz": false,
  "anonymous": true
}
```

**Use Cases:**
- Gathering user feedback
- Conducting surveys
- Creating quizzes and trivia
- Team decision making

---

#### **Forward Message**
Forward messages between chats seamlessly.

**Parameters:**
- **From Chat**: Source chat ID
- **To Chat**: Target chat ID
- **Message ID**: ID of message to forward

**Example:**
```json
{
  "operation": "forwardMessage",
  "fromChatId": "@source_channel",
  "toChatId": "@target_channel",
  "messageId": 789
}
```

**Use Cases:**
- Cross-channel content sharing
- Content redistribution
- Message archiving

---

### **Chat Operations**

#### **Get Chat**
Retrieve detailed chat information.

**Parameters:**
- **Chat ID**: Chat ID, username (@channel), or invite link

**Example:**
```json
{
  "operation": "getChat",
  "chatId": "@channel_name"
}
```

**Use Cases:**
- Chat information retrieval
- Channel details verification
- Group information gathering

---

#### **Get Dialogs**
Get list of user's chats with pagination.

**Parameters:**
- **Limit**: Number of chats to retrieve

**Example:**
```json
{
  "operation": "getDialogs",
  "limit": 50
}
```

**Use Cases:**
- Chat inventory management
- Channel discovery
- User activity monitoring

---

#### **Join Chat**
Join a chat using invite link.

**Parameters:**
- **Chat ID**: Invite link or chat ID

**Example:**
```json
{
  "operation": "joinChat",
  "chatId": "https://t.me/joinchat/ABC123"
}
```

**Use Cases:**
- Automated group joining
- Channel subscription
- Community management

---

#### **Create Chat/Group**
Create new chats or groups with custom settings.

**Parameters:**
- **Title**: Chat title
- **About**: Chat description
- **Users**: List of users to add

**Example:**
```json
{
  "operation": "createChat",
  "chatTitle": "My New Group",
  "chatAbout": "A group for automation enthusiasts",
  "users": ["@user1", "@user2"]
}
```

**Use Cases:**
- Automated group creation
- Project team setup
- Event coordination

---

### **User Operations**

#### **Get Full User Info**
Get detailed user information including bio and common chats.

**Parameters:**
- **User ID**: Username or numeric ID

**Example:**
```json
{
  "operation": "getFullUser",
  "userId": "@username"
}
```

**Use Cases:**
- User verification
- Profile information gathering
- Common chat discovery

---

### **Channel Operations**

#### **Get Participants**
Get channel participants with filtering options.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **Limit**: Maximum number of participants to retrieve

**Example:**
```json
{
  "operation": "getParticipants",
  "channelId": "@your_channel",
  "limit": 100
}
```

**Use Cases:**
- Channel analytics
- Member list management
- Activity monitoring

---

#### **Get Members**
Get channel or group members with advanced filtering.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **Limit**: Maximum number of members to retrieve
- **Show Only Online Members**: Whether to show only online members

**Example:**
```json
{
  "operation": "getMembers",
  "channelId": "@your_channel",
  "limit": 100,
  "onlyOnline": false
}
```

**Use Cases:**
- Member management
- Online user tracking
- Group administration

---

#### **Add Member**
Add a user to a channel or group.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **User ID to Add**: Username or numeric ID of the user to add

**Example:**
```json
{
  "operation": "addMember",
  "channelId": "@your_channel",
  "userIdToAdd": "@newuser"
}
```

**Use Cases:**
- Automated user onboarding
- Group expansion
- Channel subscription management

---

#### **Remove Member**
Remove a user from a channel or group.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **User ID to Remove**: Username or numeric ID of the user to remove

**Example:**
```json
{
  "operation": "removeMember",
  "channelId": "@your_channel",
  "userIdToRemove": "@user_to_remove"
}
```

**Use Cases:**
- User management
- Content moderation
- Group cleanup

---

#### **Ban User**
Ban a user from a channel or group with customizable duration.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **User ID to Ban**: Username or numeric ID of the user to ban
- **Ban Duration (days)**: Number of days to ban (0 for permanent)
- **Ban Reason**: Optional reason for banning

**Example:**
```json
{
  "operation": "banUser",
  "channelId": "@your_channel",
  "userIdToBan": "@user_to_ban",
  "banDuration": 7,
  "banReason": "Spam messages"
}
```

**Use Cases:**
- Content moderation
- Spam prevention
- Rule enforcement

---

#### **Unban User**
Unban a user from a channel or group.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **User ID to Unban**: Username or numeric ID of the user to unban

**Example:**
```json
{
  "operation": "unbanUser",
  "channelId": "@your_channel",
  "userIdToUnban": "@user_to_unban"
}
```

**Use Cases:**
- User reinstatement
- Appeal management
- Temporary ban expiration

---

#### **Promote User to Admin**
Promote a user to admin with customizable permissions.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **User ID to Promote**: Username or numeric ID of the user to promote
- **Admin Title**: Custom title for the promoted admin
- **Admin Permissions**: Various permission toggles

**Example:**
```json
{
  "operation": "promoteUser",
  "channelId": "@your_channel",
  "userIdToPromote": "@user_to_promote",
  "adminTitle": "Moderator",
  "canDeleteMessages": true,
  "canRestrictMembers": true,
  "canPinMessages": true
}
```

**Use Cases:**
- Admin management
- Permission delegation
- Team coordination

---

### **Media Operations**

#### **Download Media**
Download media files from messages with progress tracking.

**Parameters:**
- **Chat ID**: Chat ID where the message with media is located
- **Message ID**: The ID of the message containing the media to download

**Example:**
```json
{
  "operation": "downloadMedia",
  "chatId": "@channel_name",
  "messageId": 123
}
```

**Use Cases:**
- Media backup
- Content archiving
- File management

---

### **Authentication Operations**

#### **Request Code**
Request a verification code to be sent to your phone number.

**Parameters:**
- **API ID**: Your Telegram API ID from https://my.telegram.org
- **API Hash**: Your Telegram API Hash from https://my.telegram.org  
- **Phone Number**: Your phone number in international format (e.g., +1234567890)
- **2FA Password** (Optional): Your 2FA password if your account has 2FA enabled

**Example:**
```json
{
  "operation": "requestCode",
  "apiId": 123456,
  "apiHash": "abcdef...",
  "phoneNumber": "+1234567890"
}
```

**Use Cases:**
- Initial authentication setup
- Session string generation
- Account verification

---

#### **Sign In & Generate**
Complete the authentication process and generate a session string.

**Parameters:**
- **API ID**: Your Telegram API ID (same as Request Code)
- **API Hash**: Your Telegram API Hash (same as Request Code)
- **Phone Number**: Your phone number (same as Request Code)
- **Phone Code Hash**: The hash returned from Request Code operation
- **Phone Code**: The verification code sent to your phone
- **2FA Password** (Optional): Your 2FA password if your account has 2FA enabled

**Example:**
```json
{
  "operation": "signIn",
  "apiId": 123456,
  "apiHash": "abcdef...",
  "phoneNumber": "+1234567890",
  "phoneCodeHash": "abc123...",
  "phoneCode": "123456"
}
```

**Use Cases:**
- Authentication completion
- Session string generation
- Account setup

---

## 🔧 Operation Categories

| Resource | Operations | Description |
|----------|------------|-------------|
| **Session Generator** | Request Code, Sign In & Generate | Account authentication and setup |
| **Message** | Send Text, Edit, Delete, Pin, Forward, Create Poll | Complete message management |
| **Chat** | Get Chat, Get Dialogs, Join Channel/Group, Leave Channel/Group, Create Group/Channel | Chat and group operations |
| **User** | Get User Info, Get Full User Details | User information and management |
| **Media** | Download Media Files | Media file handling |
| **Channel** | Get Admin & Bots, Get Public Members, Add/Remove Member, Ban/Unban User, Promote to Admin | Channel and group administration |

## 🎨 Workflow Integration Examples

### **Content Moderation Workflow**
```
1. Trigger (New Message)
2. Telegram GramPro (Get Message Content)
3. Content Analysis (External API)
4. Conditional Logic
   ├── If Spam → Ban User
   ├── If Violation → Delete Message
   └── If Clean → Continue
5. Telegram GramPro (Notify Admins)
```

### **User Onboarding Workflow**
```
1. Trigger (New User Registration)
2. Telegram GramPro (Add Member)
3. Telegram GramPro (Send Welcome Message)
4. Telegram GramPro (Pin Rules)
```

### **Content Distribution Workflow**
```
1. Trigger (New Content)
2. Telegram GramPro (Send Text)
3. Telegram GramPro (Send Poll)
4. Telegram GramPro (Pin Message)
```

## 🚨 Best Practices

### **Message Operations**
- Use appropriate chat IDs (numeric, username, or invite links)
- Handle message IDs carefully for edit/delete operations
- Consider notification settings for pinned messages
- Use anonymous voting for sensitive polls

### **Chat Operations**
- Verify chat permissions before operations
- Use proper invite links for joining chats
- Handle chat creation errors gracefully
- Monitor chat limits and restrictions

### **User Operations**
- Respect user privacy settings
- Handle user not found errors
- Use proper user identification methods
- Monitor user activity appropriately

### **Channel Operations**
- Verify admin permissions before management operations
- Use appropriate ban durations
- Document admin promotion reasons
- Monitor channel member limits

### **Media Operations**
- Check file size limits
- Handle download errors gracefully
- Monitor storage usage
- Respect copyright and permissions

### **Authentication Operations**
- Store API credentials securely
- Handle session expiration properly
- Use strong 2FA passwords
- Monitor authentication attempts

## 📊 Performance Considerations

### **Rate Limiting**
- Telegram API has rate limits (1 request per second recommended)
- Use built-in rate limiting features
- Implement exponential backoff for failed requests
- Monitor API usage and adjust accordingly

### **Error Handling**
- Implement proper error handling for all operations
- Use retry logic for transient errors
- Log errors for debugging and monitoring
- Provide user-friendly error messages

### **Resource Management**
- Properly clean up connections
- Monitor memory usage
- Handle large file downloads appropriately
- Use efficient data structures

This comprehensive operations guide provides everything needed to effectively use all Telegram GramPro operations in your n8n workflows.