# Telegram GramPro - Operations Guide

## Overview

This guide provides comprehensive documentation for all operations available in the Telegram GramPro n8n node. Each operation is designed to work seamlessly with Telegram's MTProto protocol through GramJS, with enterprise-grade security, performance optimization, and comprehensive error handling.

## 🎯 Operations Reference

### **Message Operations**

#### **Send Text**
Send text messages to any chat or user with advanced options including binary file upload and media URL support.

**Parameters:**
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message**: Text to send
- **Reply To**: Optional message ID to reply to
- **Disable Link Preview**: Hide link previews for URLs
- **Send to Saved Messages**: Send to your Saved Messages (me) instead of a specific chat
- **Attach Media**: Upload a photo, video, or document with the message
- **Media Type**: Select the kind of media (Photo, Video, Document)
- **Binary Property**: Name of the binary property containing the file to upload
- **Media URL**: Optional direct URL to a file (fallback if no binary data)

**Example:**
```json
{
  "operation": "sendText",
  "chatId": "@channel_name",
  "message": "Hello from n8n!",
  "disableLinkPreview": true,
  "attachMedia": true,
  "mediaType": "photo",
  "binaryProperty": "data"
}
```

**Use Cases:**
- Automated announcements with media
- Welcome messages with attachments
- Status updates with documents
- Notifications with images

**New Features:**
- **Binary File Upload**: Support for photos, videos, documents with automatic format detection
- **Media URL Support**: Direct URL upload with fallback to download-and-upload
- **Progress Tracking**: Real-time download progress for large media files
- **Format Detection**: Automatic media type detection from MIME types

---

#### **Get Messages**
Retrieve messages from a chat with optional time and media filters, enhanced with advanced filtering options.

**Parameters:**
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Mode**: Recent Messages (Limit), Last X Hours, or Date Range
- **Limit**: Number of recent messages to fetch (Mode = Limit)
- **Last Hours**: How many hours back to scan (Mode = Last X Hours)
- **From Date**: Start date/time (Mode = Date Range)
- **To Date**: End date/time (Mode = Date Range)
- **Max Messages**: Safety cap for very active chats (Mode = Last X Hours / Date Range)
- **Has Media**: Only return messages that contain media
- **Media Type**: Filter by Photo, Video, or Document
- **Get from Saved Messages**: Fetch history from your Saved Messages (me)

**Example:**
```json
{
  "operation": "getHistory",
  "chatId": "@channel_name",
  "mode": "hours",
  "hours": 6,
  "maxMessages": 500,
  "onlyMedia": true,
  "mediaType": ["photo", "video"]
}
```

**Use Cases:**
- Fetch recent messages with media filtering
- Time-based monitoring and analysis
- Media-only scanning for content moderation
- Audit windows for compliance

**Enhanced Features:**
- **Advanced Filtering**: Filter by specific media types (Photo, Video, Document)
- **Time Range Support**: Flexible date range and hour-based filtering
- **Safety Caps**: Maximum message limits to prevent overwhelming responses
- **Rich Metadata**: Enhanced message information including sender details and timestamps

---

#### **Copy Message**
Copy a message from one chat to another with optional caption modification and improved error handling.

**Parameters:**
- **From Chat**: Source chat ID, username (@channel), or invite link
- **To Chat**: Target chat ID, username (@channel), or invite link
- **Message ID**: ID of message to copy
- **Caption**: Optional caption to replace original message text
- **Disable Link Preview**: Hide link previews for URLs
- **Save to Saved Messages**: Copy to your Saved Messages instead of target chat

**Example:**
```json
{
  "operation": "copyMessage",
  "fromChatId": "@source_channel",
  "toChatId": "@target_channel",
  "messageId": 789,
  "caption": "Check this out!",
  "disableLinkPreview": false
}
```

**Use Cases:**
- Content redistribution across channels
- Cross-channel sharing with modifications
- Message archiving and backup
- Content curation and curation

**New Features:**
- **Caption Override**: Replace original message text with custom caption
- **Saved Messages Support**: Copy to your Saved Messages for personal backup
- **Enhanced Error Handling**: Better handling of restricted content and permissions

---

#### **Edit Message**
Edit previously sent messages with precision control and enhanced validation.

**Parameters:**
- **Chat ID**: Target chat ID
- **Message ID**: ID of message to edit
- **Text**: New message text
- **Disable Link Preview**: Hide link previews
- **Edit in Saved Messages**: Edit a message in your Saved Messages (me)

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
- Correcting typos and errors
- Updating information in existing messages
- Adding new details to announcements

**Enhanced Features:**
- **Validation**: Comprehensive input validation with detailed error messages
- **Saved Messages Support**: Edit messages in your Saved Messages
- **Rich Response**: Enhanced response with detailed message information

---

#### **Edit Message Media**
Edit the media content of a message with optional caption and formatting support.

**Parameters:**
- **Chat ID**: Target chat ID, username (@channel), or invite link
- **Message ID**: ID of message to edit
- **Media**: The media to edit the message with (InputMedia type)
- **Caption**: New caption for the media (optional, preserves original if empty)
- **Caption Entities**: Optional formatting entities for the caption
- **Parse Mode**: Text formatting mode for the caption (default/html/markdown)

**Example:**
```json
{
  "operation": "editMessageMedia",
  "chatId": "@channel_name",
  "messageId": 123,
  "media": "path/to/new/media.jpg",
  "caption": "Updated caption with formatting",
  "parseMode": "markdown"
}
```

**Use Cases:**
- Updating media content in messages
- Adding or modifying captions with formatting
- Correcting media files in announcements
- Content updates and corrections

**New Advanced Features:**
- **Media Replacement**: Complete media content replacement in existing messages
- **Caption Management**: Preserve or update captions with formatting support
- **Parse Mode Support**: HTML and Markdown formatting for captions
- **Entity Support**: Advanced text formatting with entities

---

#### **Unpin Message**
Unpin a previously pinned message from a chat with enhanced error handling.

**Parameters:**
- **Chat ID**: Target chat ID
- **Message ID**: ID of message to unpin

**Example:**
```json
{
  "operation": "unpinMessage",
  "chatId": "@group_name",
  "messageId": 456
}
```

**Use Cases:**
- Removing outdated pinned messages
- Content rotation and updates
- Message management and cleanup

**Enhanced Features:**
- **Permission Checking**: Verify unpin permissions before attempting
- **Error Handling**: Clear error messages for permission issues
- **Rich Response**: Detailed response with message information

---

#### **Delete Message**
Remove messages from chats with granular control and enhanced security.

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
- Content moderation and cleanup
- Removing inappropriate messages
- Cleaning up old announcements

**Enhanced Features:**
- **Permission Validation**: Check delete permissions before attempting
- **Security Checks**: Verify message ownership and permissions
- **Rich Response**: Detailed response with deletion confirmation

---

#### **Pin Message**
Pin important messages in chats with notification options and enhanced validation.

**Parameters:**
- **Chat ID**: Target chat ID
- **Message ID**: ID of message to pin
- **Notify Members**: Send notification to all members

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

**Enhanced Features:**
- **Permission Validation**: Verify pin permissions before attempting
- **Notification Control**: Optional member notifications
- **Error Handling**: Clear error messages for permission issues

---

#### **Send Poll**
Create interactive polls and quizzes for engagement with enhanced formatting support.

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

**Enhanced Features:**
- **Anonymous Voting**: Required for channels, optional for groups
- **Quiz Support**: Full quiz functionality with correct answers
- **Formatting Support**: Enhanced question and option formatting

---

#### **Forward Message**
Forward messages between chats seamlessly with enhanced error handling.

**Parameters:**
- **From Chat**: Source chat ID
- **To Chat**: Target chat ID
- **Message ID**: ID of message to forward
- **Save to Saved Messages**: Forward to your Saved Messages instead of target chat

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

**Enhanced Features:**
- **Permission Checking**: Verify forward permissions
- **Saved Messages Support**: Forward to your Saved Messages
- **Error Handling**: Enhanced error messages for restrictions

---

#### **Copy Restricted Content**
Handle media that cannot be forwarded normally with download-and-upload fallback.

**Parameters:**
- **Source Chat / Username**: Source chat ID, username (@channel), or invite link
- **Message ID**: The ID of the message to copy
- **Target Chat / Username**: Target chat ID, username (@channel), or invite link
- **Save to Saved Messages**: Send to your Saved Messages instead of target chat
- **Include Caption**: Include the original message caption/text
- **Download Timeout (seconds)**: Timeout for downloading large media files

**Example:**
```json
{
  "operation": "copyRestrictedContent",
  "sourceChatId": "@restricted_channel",
  "messageId": 123,
  "targetChatId": "@your_channel",
  "includeCaption": true,
  "downloadTimeout": 60
}
```

**Use Cases:**
- Copying content from restricted channels
- Handling media with forwarding restrictions
- Content redistribution with fallback mechanisms

**New Advanced Feature:**
- **Restricted Content Handling**: Automatically detect and handle restricted media
- **Download-and-Upload Fallback**: Download restricted media and re-upload
- **Timeout Management**: Configurable timeouts for large file downloads
- **Error Recovery**: Graceful handling of download failures

---

### **Chat Operations**

#### **Get Chat**
Retrieve detailed chat information with enhanced metadata.

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

**Enhanced Features:**
- **Rich Metadata**: Enhanced chat information including member counts
- **Type Detection**: Automatic chat type detection (channel, group, user)
- **Permission Information**: Chat permission details

---

#### **Get Dialogs**
Get list of user's chats with pagination and enhanced filtering.

**Parameters:**
- **Limit**: Number of chats to retrieve
- **Number of Results**: Maximum number of chats to return

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

**Enhanced Features:**
- **Pagination Support**: Efficient handling of large chat lists
- **Type Filtering**: Filter by chat types
- **Metadata Enrichment**: Enhanced chat information

---

#### **Join Chat**
Join a chat using invite link with enhanced validation.

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

**Enhanced Features:**
- **Invite Link Validation**: Verify invite link validity
- **Permission Checking**: Check join permissions
- **Error Handling**: Clear error messages for restrictions

---

#### **Create Chat/Group**
Create new chats or groups with custom settings and enhanced validation.

**Parameters:**
- **Title**: Chat title
- **About**: Chat description
- **Create Group**: Whether to create a group or channel

**Example:**
```json
{
  "operation": "createChat",
  "chatTitle": "My New Group",
  "chatAbout": "A group for automation enthusiasts"
}
```

**Use Cases:**
- Automated group creation
- Project team setup
- Event coordination

**Enhanced Features:**
- **Type Selection**: Choose between group and channel creation
- **Description Support**: Enhanced chat descriptions
- **Validation**: Comprehensive input validation

---

### **User Operations**

#### **Get Full User Info**
Get detailed user information including bio and common chats with enhanced privacy handling.

**Parameters:**
- **User**: Username or numeric ID
- **Get My Profile**: Get your own profile information
- **Get User Profile**: Get detailed information about a specific user

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

**Enhanced Features:**
- **Privacy Respect**: Handle privacy settings appropriately
- **Bio Information**: Enhanced bio and about information
- **Common Chats**: Discover common chats with the user

---

#### **Update Profile**
Update your Telegram profile information including name and bio with enhanced validation.

**Parameters:**
- **First Name**: New first name for your profile (optional)
- **Last Name**: New last name for your profile (optional)
- **About**: New bio/about text for your profile (optional)

**Example:**
```json
{
  "operation": "updateProfile",
  "firstName": "John",
  "lastName": "Doe",
  "about": "Automation enthusiast and developer"
}
```

**Use Cases:**
- Profile updates
- Bio management
- Name changes

**Enhanced Features:**
- **Partial Updates**: Update only the fields you specify
- **Validation**: Comprehensive input validation
- **Privacy Handling**: Respect privacy settings

---

#### **Update Username**
Change your Telegram username with enhanced validation and availability checking.

**Parameters:**
- **New Username**: New username for your account

**Example:**
```json
{
  "operation": "updateUsername",
  "newUsername": "newusername123"
}
```

**Use Cases:**
- Username changes
- Brand updates
- Profile rebranding

**Enhanced Features:**
- **Availability Checking**: Check username availability
- **Format Validation**: Validate username format requirements
- **Error Handling**: Clear error messages for conflicts

---

#### **Get Profile Photo**
Download a user's profile photo in different sizes with enhanced quality options.

**Parameters:**
- **User**: Username or numeric ID of the user
- **My Profile Photo Only**: Get your own profile photo without requiring userId
- **Photo Size**: Size of the profile photo (small, medium, large, full)

**Example:**
```json
{
  "operation": "getProfilePhoto",
  "userId": "@username",
  "photoSize": "medium"
}
```

**Use Cases:**
- Profile photo backup
- User verification
- Avatar management

**Enhanced Features:**
- **Size Options**: Multiple photo size options
- **Quality Selection**: Choose between different quality levels
- **User Privacy**: Respect user privacy settings

---

### **Channel Operations**

#### **Get Participants**
Get channel participants with filtering options and enhanced metadata.

**Parameters:**
- **Channel ID**: Channel ID, username (@channel), or invite link
- **Limit**: Maximum number of participants to retrieve
- **Filter Admin Participants**: Show only admin participants
- **Filter Bot Participants**: Show only bot participants
- **Exclude Admins**: Remove admins from the results
- **Exclude Bots**: Remove bots from the results
- **Exclude Deleted / Long Ago**: Exclude deleted accounts and users with long-ago status
- **Show Only Online Members**: Show only online members

**Example:**
```json
{
  "operation": "getParticipants",
  "channelId": "@your_channel",
  "limit": 100,
  "filterAdmins": true,
  "onlyOnline": false
}
```

**Use Cases:**
- Channel analytics
- Member list management
- Activity monitoring

**Enhanced Features:**
- **Advanced Filtering**: Multiple filtering options for precise results
- **Status Filtering**: Filter by user status and activity
- **Role Filtering**: Filter by admin and bot roles
- **Metadata Enrichment**: Enhanced participant information

---

#### **Get Members**
Get channel or group members with advanced filtering and enhanced performance.

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

**Enhanced Features:**
- **Performance Optimization**: Optimized for large member lists
- **Online Status**: Real-time online status tracking
- **Role Information**: Enhanced member role information

---

#### **Add Member**
Add a user to a channel or group with enhanced permission checking.

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

**Enhanced Features:**
- **Permission Validation**: Verify admin permissions before adding
- **User Validation**: Validate user existence and accessibility
- **Error Handling**: Clear error messages for restrictions

---

#### **Remove Member**
Remove a user from a channel or group with enhanced security.

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

**Enhanced Features:**
- **Permission Checking**: Verify removal permissions
- **Security Validation**: Enhanced security checks
- **Audit Trail**: Detailed removal information

---

#### **Ban User**
Ban a user from a channel or group with customizable duration and reasons.

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

**Enhanced Features:**
- **Duration Control**: Configurable ban durations
- **Reason Tracking**: Optional ban reasons for audit trails
- **Permission Validation**: Verify ban permissions
- **Security Checks**: Enhanced security validation

---

#### **Unban User**
Unban a user from a channel or group with enhanced tracking.

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

**Enhanced Features:**
- **Ban Status Checking**: Verify user ban status
- **Permission Validation**: Verify unban permissions
- **Audit Trail**: Track unban actions

---

#### **Promote User to Admin**
Promote a user to admin with customizable permissions and enhanced control.

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

**Enhanced Features:**
- **Granular Permissions**: Fine-grained permission control
- **Custom Titles**: Custom admin titles
- **Permission Validation**: Verify promotion permissions
- **Role Management**: Enhanced role and permission tracking

---

### **Media Operations**

#### **Download Media**
Download media files from messages with progress tracking and enhanced error handling.

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

**Enhanced Features:**
- **Progress Tracking**: Real-time download progress
- **Error Recovery**: Automatic retry for failed downloads
- **Format Support**: Support for all Telegram media formats
- **Quality Options**: Multiple quality options for downloads

---

### **Authentication Operations**

#### **Request Code**
Request a verification code to be sent to your phone number with enhanced security.

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

**Enhanced Features:**
- **Security Validation**: Enhanced input validation
- **Error Handling**: Detailed error messages
- **Network Optimization**: Optimized network requests
- **Session Management**: Improved session handling

---

#### **Sign In & Generate**
Complete the authentication process and generate a session string with enhanced encryption.

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

**Enhanced Features:**
- **AES-256-GCM Encryption**: Military-grade session encryption
- **Key Derivation**: Automatic key derivation from API credentials
- **Session Validation**: Enhanced session validation
- **Security Auditing**: Security audit trail for authentication

---

## 🔧 Operation Categories

| Resource | Operations | Description |
|----------|------------|-------------|
| **Session Generator** | Request Code, Sign In & Generate | Account authentication and setup with enhanced security |
| **Message** | Send Text, Get Messages, Edit, Delete, Pin, Forward, Copy, Edit Media, Unpin, Create Poll, Copy Restricted Content | Complete message management with advanced features |
| **Chat** | Get Chat, Get Dialogs, Join Channel/Group, Leave Channel/Group, Create Group/Channel | Chat and group operations with enhanced validation |
| **User** | Get User Info, Get Full User Details, Update Profile, Change Username, Get Profile Photo | User information and management with privacy respect |
| **Media** | Download Media Files | Media file handling with progress tracking |
| **Channel** | Get Admin & Bots, Get Public Members, Add/Remove Member, Ban/Unban User, Promote to Admin | Channel and group administration with granular permissions |

## Workflow Integration Examples

Ready-to-import examples are available in [`docs/Workflows-Examples`](./Workflows-Examples):

- [`Send messages from one user to multiple users.json`](./Workflows-Examples/Send%20messages%20from%20one%20user%20to%20multiple%20users.json)
- [`Send messages from folder chats to user.json`](./Workflows-Examples/Send%20messages%20from%20folder%20chats%20to%20user.json)

### Import Steps

1. In n8n, open a workflow and choose **Import from File**.
2. Select one of the files from `docs/Workflows-Examples/`.
3. Reassign `telegramApi` credentials to your environment.
4. Replace placeholders (`Source_Username`, `Target_Bot_Username`, `your_admin_user`, workflow IDs, and sample chat IDs).

### Example A: One Source to Multiple Destinations

- File: `Send messages from one user to multiple users.json`
- Reads recent messages from a single source chat.
- Filters messages by recency, direction, and domain text match.
- Distributes output across destination chat IDs with flood-wait control.
- Sends admin success/error notifications and can call a follow-up workflow.

### Example B: Folder Chats to Target User

- File: `Send messages from folder chats to user.json`
- Uses `getDialogs` grouped by folders to discover source chats.
- Pulls recent media messages (`photo`) from each source.
- Filters and forwards/copies matched messages to a target user.
- Includes schedule trigger, wait nodes, and error notification branches.

## Best Practices

### **Message Operations**
- Use appropriate chat IDs (numeric, username, or invite links)
- Handle message IDs carefully for edit/delete operations
- Consider notification settings for pinned messages
- Use anonymous voting for sensitive polls
- Leverage new media features for enhanced content handling

### **Chat Operations**
- Verify chat permissions before operations
- Use proper invite links for joining chats
- Handle chat creation errors gracefully
- Monitor chat limits and restrictions
- Use enhanced filtering for better results

### **User Operations**
- Respect user privacy settings
- Handle user not found errors
- Use proper user identification methods
- Monitor user activity appropriately
- Use enhanced validation for profile updates

### **Channel Operations**
- Verify admin permissions before management operations
- Use appropriate ban durations
- Document admin promotion reasons
- Monitor channel member limits
- Use granular permissions for better control

### **Media Operations**
- Check file size limits
- Handle download errors gracefully
- Monitor storage usage
- Respect copyright and permissions
- Use progress tracking for large files

### **Authentication Operations**
- Store API credentials securely
- Handle session expiration properly
- Use strong 2FA passwords
- Monitor authentication attempts
- Use enhanced security features

## 📊 Performance Considerations

### **Rate Limiting**
- Telegram API has rate limits (1 request per second recommended)
- Use built-in rate limiting features
- Implement exponential backoff for failed requests
- Monitor API usage and adjust accordingly
- Use priority queuing for critical operations

### **Error Handling**
- Implement proper error handling for all operations
- Use retry logic for transient errors
- Log errors for debugging and monitoring
- Provide user-friendly error messages
- Use enhanced error recovery features

### **Resource Management**
- Properly clean up connections
- Monitor memory usage
- Handle large file downloads appropriately
- Use efficient data structures
- Implement automatic cleanup

### **Security Best Practices**
- Always use encrypted session strings
- Keep API credentials secure
- Enable 2FA for your Telegram account
- Regularly rotate session strings
- Monitor for security events
- Use enhanced validation features

This comprehensive operations guide provides everything needed to effectively use all Telegram GramPro operations in your n8n workflows, including all new features and enhancements for enterprise-grade automation.