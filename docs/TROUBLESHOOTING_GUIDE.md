# Telegram GramPro - Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with the Telegram GramPro n8n node. Whether you're facing authentication problems, connection issues, or operation errors, this guide provides step-by-step solutions with enhanced error handling and new features.

## 🚨 Common Issues & Solutions

### **Authentication Errors**

#### **"Code not sent" Error**
**Problem**: Verification code not received on your phone.

**Causes:**
- Incorrect phone number format
- Invalid API credentials
- Network connectivity issues
- Telegram server issues

**Solutions:**
1. **Verify Phone Number Format**
   ```bash
   # Correct format: +1234567890
   # Incorrect: 1234567890, +123 456 7890, (123) 456-7890
   ```

2. **Check API Credentials**
   - Verify API ID and API Hash from [my.telegram.org](https://my.telegram.org)
   - Ensure no extra spaces or characters
   - Test credentials with a simple Request Code operation

3. **Network Troubleshooting**
   ```bash
   # Test internet connection
   ping google.com
   
   # Test Telegram connectivity
   telnet web.telegram.org 443
   ```

4. **Wait and Retry**
   - Telegram may have temporary issues
   - Wait 5-10 minutes and try again
   - Check [Telegram Status](https://telegram.org/status)

---

#### **"Session string generation failed" Error**
**Problem**: Authentication completes but session string is not generated properly.

**Causes:**
- Invalid phone code hash
- Expired verification code
- 2FA password issues
- Network interruptions during authentication
- **NEW**: Session encryption key derivation failure
- **NEW**: Memory allocation issues during encryption

**Solutions:**
1. **Verify Phone Code Hash**
   - Ensure you're using the correct phoneCodeHash from Request Code
   - Don't reuse old phoneCodeHash values
   - Use drag-and-drop to avoid manual copying errors

2. **Check 2FA Password**
   - If your account has 2FA enabled, ensure correct password
   - Check for typos in 2FA password
   - Reset 2FA if forgotten (requires email verification)

3. **Complete Authentication Quickly**
   - Verification codes expire in 10-15 minutes
   - Complete both Request Code and Sign In operations back-to-back
   - Request new code if previous one expired

4. **Network Stability**
   - Ensure stable internet connection during authentication
   - Avoid VPN/proxy interference
   - Check for firewall blocking connections

5. **NEW: Session Encryption Issues**
   - Verify API credentials are correct (required for key derivation)
   - Check system memory availability
   - Restart n8n if memory issues suspected
   - Monitor logs for encryption-specific errors

---

#### **"Invalid phone code" Error**
**Problem**: Verification code entered is not accepted.

**Causes:**
- Wrong verification code
- Expired verification code
- Incorrect phoneCodeHash
- Network delays

**Solutions:**
1. **Verify Code Accuracy**
   - Double-check the 5-6 digit code
   - Ensure no extra spaces or characters
   - Copy code directly from SMS

2. **Check Code Expiration**
   - Telegram codes typically expire in 10-15 minutes
   - Request a new code if expired
   - Complete authentication quickly

3. **Verify phoneCodeHash**
   - Ensure you're using the correct phoneCodeHash from Request Code
   - Don't reuse old phoneCodeHash values
   - Use drag-and-drop to avoid manual copying errors

---

#### **"2FA password required" Error**
**Problem**: Account has 2FA enabled but password not provided.

**Solutions:**
1. **Enter 2FA Password**
   - Provide your Telegram 2FA password in the password2fa field
   - This is your 2FA recovery password, not your phone PIN

2. **Find Your 2FA Password**
   - Check your Telegram app settings
   - Look for "Privacy and Security" → "Two-Step Verification"
   - Note your recovery email for password reset

3. **Reset 2FA (if forgotten)**
   - Use your recovery email to reset 2FA
   - This will temporarily disable 2FA on your account
   - Set up new 2FA after successful authentication

---

#### **"Session already in use" Error**
**Problem**: Another client is using the same session.

**Causes:**
- Multiple n8n instances using same session
- Telegram app using the same session
- Previous session not properly closed

**Solutions:**
1. **Close Other Clients**
   - Close other Telegram apps on your device
   - Stop other n8n instances using the same session
   - Log out from web.telegram.org

2. **Generate New Session**
   - Create a completely new session string
   - Use different API credentials if possible
   - Restart n8n after session change

3. **Wait for Session Timeout**
   - Telegram sessions timeout after ~24 hours of inactivity
   - Wait and try again later

---

#### **NEW: "Session encryption failed" Error**
**Problem**: Session string encryption fails during authentication.

**Causes:**
- Invalid API credentials for key derivation
- Memory allocation issues
- Network connectivity problems during encryption
- System resource limitations

**Solutions:**
1. **Verify API Credentials**
   - Ensure API ID and Hash are correct and properly formatted
   - Check for extra spaces or special characters
   - Test credentials with Request Code operation

2. **Check System Resources**
   - Monitor memory usage during authentication
   - Close other applications if memory is low
   - Restart n8n if resource issues suspected

3. **Network Stability**
   - Ensure stable internet connection
   - Avoid VPN/proxy during authentication
   - Check for network timeouts

4. **Retry with Fresh Session**
   - Request new verification code
   - Complete authentication without delays
   - Monitor logs for specific encryption errors

---

#### **NEW: "Connection pool exhausted" Error**
**Problem**: Connection pooling fails due to resource limitations.

**Causes:**
- Too many concurrent authentication requests
- Insufficient system memory
- Connection leaks in other workflows
- System resource limitations

**Solutions:**
1. **Reduce Concurrent Operations**
   - Limit simultaneous authentication requests
   - Space out authentication operations
   - Use workflow delays between operations

2. **Check System Resources**
   - Monitor memory and CPU usage
   - Close unnecessary applications
   - Restart n8n if resources are low

3. **Monitor Connections**
   - Check for connection leaks in other workflows
   - Implement proper connection cleanup
   - Monitor connection pool usage

4. **Restart Services**
   - Restart n8n and related services
   - Clear any cached connections
   - Monitor for improvement

---

### **Connection Issues**

#### **"Network timeout" Error**
**Problem**: Connection to Telegram servers times out.

**Causes:**
- Internet connectivity issues
- Firewall blocking connections
- VPN/proxy interference
- Telegram server overload

**Solutions:**
1. **Check Internet Connection**
   ```bash
   # Test basic connectivity
   ping 8.8.8.8
   
   # Test DNS resolution
   nslookup web.telegram.org
   ```

2. **Check Firewall Settings**
   - Ensure port 443 (HTTPS) is open
   - Allow n8n and Node.js through firewall
   - Check for corporate firewall restrictions

3. **VPN/Proxy Issues**
   - Try disabling VPN temporarily
   - Check proxy settings in n8n
   - Use direct internet connection

4. **Telegram Server Status**
   - Check [Telegram Status](https://telegram.org/status)
   - Try during off-peak hours
   - Monitor for server maintenance

---

#### **"Ghost Connection timeout" Error**
**Problem**: Persistent connection timeout errors in n8n logs.

**Solutions:**
1. **Restart n8n**
   - Always restart n8n after session string generation
   - This clears any cached connection issues
   - Required step in the authentication process

2. **Session String Handling**
   - Copy session string to text file for backup
   - Ensure session string is properly encrypted
   - Verify session string format

3. **Connection Cleanup**
   - The node automatically cleans up connections
   - Monitor logs for connection status
   - Check for memory leaks in long-running workflows

---

#### **"WebSocket connection failed" Error**
**Problem**: WebSocket connection to Telegram fails.

**Solutions:**
1. **Check WebSocket Support**
   - Ensure your network supports WebSocket connections
   - Test with different network if possible
   - Check for WebSocket blocking by firewall

2. **Use Alternative Connection**
   - The node automatically falls back to HTTP if WebSocket fails
   - Monitor logs for connection method used
   - Consider network configuration changes

---

### **Operation Errors**

#### **"FLOOD_WAIT" Error**
**Problem**: Telegram rate limit exceeded.

**Causes:**
- Too many requests in short time
- Not using rate limiting
- Aggressive automation workflows

**Solutions:**
1. **Implement Rate Limiting**
   ```json
   {
     "rateLimit": {
       "enabled": true,
       "interval": 1000,
       "maxConcurrent": 1
     }
   }
   ```

2. **Add Delays Between Operations**
   - Add 1-2 second delays between requests
   - Use n8n's built-in delay nodes
   - Implement exponential backoff for retries

3. **Monitor Request Frequency**
   - Track API usage in your workflows
   - Use logging to monitor request patterns
   - Adjust workflow timing based on usage

---

#### **"CHAT_WRITE_FORBIDDEN" Error**
**Problem**: No permission to write in the target chat.

**Causes:**
- Not a member of the chat
- No admin permissions in group/channel
- Chat restrictions enabled

**Solutions:**
1. **Verify Chat Membership**
   - Ensure you're a member of the target chat
   - Join the chat before sending messages
   - Check chat invite link validity

2. **Check Permissions**
   - Verify admin permissions in groups/channels
   - Contact chat admin for permission
   - Use personal chats for testing

3. **Review Chat Restrictions**
   - Check if chat has posting restrictions
   - Verify your account isn't restricted
   - Test with different chat types

---

#### **"USER_BANNED_IN_CHANNEL" Error**
**Problem**: User is banned from the target channel.

**Solutions:**
1. **Check Ban Status**
   - Verify if you're banned from the channel
   - Contact channel admin for unbanning
   - Use different account if necessary

2. **Use Alternative Channel**
   - Test with different channels
   - Create new test channel
   - Verify channel permissions

---

#### **"SESSION_REVOKED" Error**
**Problem**: Session has been revoked by Telegram.

**Causes:**
- Session expired
- Account security issue
- Multiple session conflicts

**Solutions:**
1. **Generate New Session**
   - Create completely new session string
   - Follow authentication process again
   - Use fresh API credentials if possible

2. **Check Account Security**
   - Review account activity in Telegram app
   - Check for suspicious logins
   - Change password if needed

3. **Prevent Session Conflicts**
   - Use session in single location only
   - Avoid sharing session strings
   - Monitor for unauthorized usage

---

### **Media Download Issues**

#### **"File not found" Error**
**Problem**: Media file cannot be downloaded.

**Causes:**
- Invalid message ID
- File deleted or expired
- Insufficient permissions

**Solutions:**
1. **Verify Message ID**
   - Ensure correct message ID is used
   - Check message exists in chat
   - Verify message contains media

2. **Check File Availability**
   - Ensure file hasn't been deleted
   - Check file expiration (some files expire)
   - Verify file size limits

3. **Permissions Check**
   - Ensure access to the chat
   - Verify file download permissions
   - Check for file restrictions

---

#### **"Download timeout" Error**
**Problem**: Media download takes too long or fails.

**Solutions:**
1. **Check File Size**
   - Large files take longer to download
   - Monitor download progress
   - Consider file size limits

2. **Network Issues**
   - Check internet speed
   - Monitor for network interruptions
   - Try downloading smaller files first

3. **Storage Space**
   - Ensure sufficient disk space
   - Check file system permissions
   - Monitor storage usage

---

#### **NEW: "Copy Restricted Content failed" Error**
**Problem**: Copying restricted media content fails.

**Causes:**
- Invalid source or target chat IDs
- Source message doesn't exist
- Insufficient permissions in target chat
- Media file access issues
- Download timeout during fallback

**Solutions:**
1. **Verify Chat IDs**
   - Ensure both source and target chat IDs are valid
   - Check if you're a member of both chats
   - Verify chat permissions

2. **Check Source Message**
   - Ensure the message ID exists in the source chat
   - Verify you have access to the source message
   - Check if the message contains media

3. **Target Chat Permissions**
   - Ensure you have permission to send messages in target chat
   - Check if the target chat allows message forwarding
   - Verify you're not restricted in the target chat

4. **Download Timeout**
   - Increase download timeout for large files
   - Check network stability during download
   - Monitor progress for large file downloads

---

#### **NEW: "Edit Message Media failed" Error**
**Problem**: Editing message media content fails.

**Causes:**
- Invalid media file format
- Missing or incorrect message ID
- Insufficient permissions to edit the message
- Original message doesn't contain media
- Media file size or format restrictions

**Solutions:**
1. **Verify Media File**
   - Ensure media file exists and is accessible
   - Check file format compatibility
   - Verify file size limits

2. **Check Message Details**
   - Ensure message ID is correct
   - Verify the message exists in the chat
   - Confirm the message contains media

3. **Permissions Check**
   - Ensure you can edit messages in the chat
   - Verify you're the message author (usually required)
   - Check for chat restrictions on media editing

4. **Media Format**
   - Check media file format compatibility
   - Verify file size within Telegram limits
   - Test with different media formats

---

### **Poll and Quiz Issues**

#### **"Poll creation failed" Error**
**Problem**: Poll or quiz cannot be created.

**Causes:**
- Invalid poll options
- Chat restrictions on polls
- Anonymous voting conflicts

**Solutions:**
1. **Verify Poll Options**
   - Ensure at least 2 options provided
   - Check option length limits
   - Verify option format

2. **Check Chat Permissions**
   - Verify poll creation permissions
   - Check if polls are allowed in chat
   - Test in different chat types

3. **Anonymous Voting**
   - For channels, anonymous voting is required
   - For groups, anonymous voting is optional
   - Ensure correct setting for chat type

---

### **New Operation Issues**

#### **"User Operation failed" Error**
**Problem**: User-related operations (profile updates, username changes) fail.

**Causes:**
- Invalid user ID format
- Insufficient permissions for profile changes
- Username already taken
- Account restrictions
- Privacy settings conflicts

**Solutions:**
1. **Verify User ID**
   - Use correct username format (@username) or numeric ID
   - Check if user exists and is accessible
   - Ensure proper user identification

2. **Profile Update Restrictions**
   - Some profile fields may be restricted
   - Username changes have specific requirements
   - Check for account verification requirements

3. **Username Availability**
   - Ensure new username is not already taken
   - Check username format requirements
   - Verify username length limits

4. **Privacy Settings**
   - Respect user privacy settings
   - Check for privacy restrictions
   - Use appropriate permissions

---

#### **"Channel Management failed" Error**
**Problem**: Channel/group management operations fail.

**Causes:**
- Insufficient admin permissions
- Invalid user IDs for member operations
- Channel restrictions on member management
- Ban duration or reason format issues
- Role and permission conflicts

**Solutions:**
1. **Verify Admin Permissions**
   - Ensure you have required admin rights
   - Check specific permissions for each operation
   - Verify you're not restricted from management actions

2. **User ID Validation**
   - Use correct username format (@username) or numeric ID
   - Ensure target user exists in the channel/group
   - Check if user is already banned or removed

3. **Channel Restrictions**
   - Some channels have member management restrictions
   - Verify channel type (public vs private)
   - Check for additional security settings

4. **Ban and Promotion Settings**
   - Verify ban duration format and limits
   - Check ban reason format requirements
   - Ensure promotion permissions are valid

---

## 🔧 Advanced Troubleshooting

### **Debug Mode Setup**

Enable detailed logging for troubleshooting:

1. **Set Environment Variable**
   ```bash
   export NODE_ENV=development
   ```

2. **Control Log Volume (Optional)**
   ```bash
   export GRAMPRO_LOG_LEVEL=debug
   # Or use N8N_LOG_LEVEL if GRAMPRO_LOG_LEVEL is not set
   export N8N_LOG_LEVEL=debug
   ```

3. **Restart n8n**
   ```bash
   # Stop n8n
   pkill -f n8n
   
   # Start with debug mode
   n8n start
   ```

4. **Monitor Logs**
   ```bash
   # View n8n logs
   tail -f ~/.n8n/logs/n8n.log
   
   # Filter for Telegram errors
   tail -f ~/.n8n/logs/n8n.log | grep -i telegram
   ```

### **Connection Testing**

Test basic connectivity:

```bash
# Test Telegram API connectivity
curl -I https://api.telegram.org

# Test WebSocket connectivity
wscat -c wss://web.telegram.org/

# Test DNS resolution
nslookup api.telegram.org
```

### **Session Validation**

Validate session string:

1. **Check Format**
   - Session strings are base64 encoded
   - Should contain encrypted session data
   - Format: "123456:abcdef..."

2. **Test Session**
   - Create simple workflow with Get Me operation
   - Verify session works with basic operations
   - Monitor for session-related errors

### **Memory and Performance Issues**

Monitor resource usage:

1. **Check Memory Usage**
   ```bash
   # Monitor n8n memory usage
   ps aux | grep n8n
   
   # Check for memory leaks
   top -p $(pgrep n8n)
   ```

2. **Connection Pool Monitoring**
   - Monitor active connections
   - Check for connection leaks
   - Verify proper cleanup

3. **Performance Optimization**
   - Use rate limiting
   - Implement request queuing
   - Monitor API usage patterns

### **NEW: Enhanced Performance Monitoring**

#### **Connection Pool Metrics**
Monitor connection pool health:
```bash
# Check connection pool status
# (Add to your workflow for monitoring)
{
  "operation": "getConnectionPoolStatus",
  "includeMetrics": true
}
```

#### **Memory Usage Tracking**
Track memory usage patterns:
```bash
# Monitor memory usage
# (Add to your workflow for monitoring)
{
  "operation": "getMemoryUsage",
  "includeDetails": true
}
```

#### **Rate Limiting Monitoring**
Monitor rate limiting effectiveness:
```bash
# Check rate limit status
# (Add to your workflow for monitoring)
{
  "operation": "getRateLimitStatus",
  "includeHistory": true
}
```

---

## 📋 Troubleshooting Checklist

### **Authentication Issues**
- [ ] Phone number format correct (+1234567890)
- [ ] API credentials valid
- [ ] Verification code entered correctly
- [ ] 2FA password provided (if required)
- [ ] No session conflicts
- [ ] n8n restarted after session generation
- [ ] Session encryption successful
- [ ] Connection pool not exhausted
- [ ] System resources sufficient

### **Connection Issues**
- [ ] Internet connection stable
- [ ] Firewall allows connections
- [ ] VPN/proxy not interfering
- [ ] Telegram servers accessible
- [ ] WebSocket connections working
- [ ] Connection pool healthy
- [ ] No connection leaks

### **Operation Issues**
- [ ] Rate limiting enabled
- [ ] Sufficient permissions
- [ ] Valid chat/message IDs
- [ ] File permissions correct
- [ ] Poll options valid
- [ ] Source message exists for copy operations
- [ ] Media file accessible for edit operations
- [ ] User IDs valid for user operations
- [ ] Admin permissions for channel management

### **Media Issues**
- [ ] Message contains media
- [ ] File not expired/deleted
- [ ] Sufficient storage space
- [ ] Network speed adequate
- [ ] File size within limits
- [ ] Download timeout appropriate
- [ ] Media format compatible

### **NEW: Enhanced Features Issues**
- [ ] Session encryption working
- [ ] Connection pooling optimized
- [ ] Rate limiting effective
- [ ] Memory usage monitored
- [ ] Performance metrics tracked
- [ ] Error recovery active

---

## 🆘 Getting Help

### **When to Seek Help**
- Issue persists after following troubleshooting steps
- Error messages are unclear or unexpected
- Multiple operations failing consistently
- Performance issues affecting workflows
- New feature issues not covered in this guide

### **Information to Provide**
When seeking help, include:
- **Error messages** (exact text)
- **n8n version** and **node version**
- **Workflow configuration** (redacted sensitive info)
- **Log files** (with sensitive data removed)
- **Steps to reproduce** the issue
- **System specifications** (memory, OS, network)

### **Support Channels**
- **GitHub Issues**: For bug reports and feature requests
- **n8n Community Forum**: For general questions and discussions
- **Telegram Support**: For Telegram-specific issues

---

## 🎯 Prevention Tips

### **Best Practices**
1. **Regular Session Rotation**
   - Generate new sessions periodically
   - Monitor session usage
   - Keep backup sessions ready

2. **Rate Limiting**
   - Always use rate limiting in production
   - Monitor API usage patterns
   - Implement exponential backoff

3. **Error Handling**
   - Implement proper error handling in workflows
   - Use retry logic for transient errors
   - Log errors for monitoring

4. **Security**
   - Store credentials securely
   - Use encrypted session strings
   - Monitor for unauthorized access

5. **Performance Monitoring**
   - Monitor connection pool health
   - Track memory usage patterns
   - Use rate limiting effectively
   - Implement performance metrics

6. **Enhanced Features**
   - Use new features appropriately
   - Monitor enhanced error handling
   - Leverage performance optimizations
   - Implement security best practices

### **NEW: Advanced Prevention Strategies**

#### **Proactive Monitoring**
- Set up monitoring for connection pool health
- Track memory usage patterns
- Monitor rate limiting effectiveness
- Implement alerting for critical issues

#### **Performance Optimization**
- Use connection pooling effectively
- Implement smart caching strategies
- Optimize media handling
- Monitor and tune performance settings

#### **Security Hardening**
- Regularly audit session usage
- Monitor for security events
- Implement session rotation policies
- Use enhanced validation features

This comprehensive troubleshooting guide should help you resolve most issues with Telegram GramPro, including all new features and enhanced capabilities. If problems persist, consult the support channels or create a detailed issue report.
## Telegram Error Code Mapping (Updated)

The node now maps Telegram raw MTProto errors to user-friendly messages in both credential verification and runtime operations.

### Authentication and Session
- AUTH_KEY_UNREGISTERED, AUTH_KEY_DUPLICATED, SESSION_REVOKED, SESSION_EXPIRED, SESSION_PASSWORD_NEEDED

### Rate Limit and Network
- FLOOD_WAIT_X, PEER_FLOOD, NETWORK_TIMEOUT, ETIMEDOUT

### Permission and Access
- CHAT_WRITE_FORBIDDEN, USER_BANNED_IN_CHANNEL, USER_PRIVACY_RESTRICTED, CHANNEL_PRIVATE, CHAT_ADMIN_REQUIRED, CHAT_FORWARDS_RESTRICTED

### Entity/Input Problems
- USERNAME_NOT_OCCUPIED, USERNAME_INVALID, USERNAME_OCCUPIED, INVITE_HASH_INVALID, INVITE_HASH_EXPIRED, PEER_ID_INVALID, MESSAGE_ID_INVALID, INPUT_USER_DEACTIVATED
