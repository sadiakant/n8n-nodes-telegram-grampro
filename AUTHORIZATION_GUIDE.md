# Telegram GramPro - Authorization Guide

## Overview

This guide will help you authenticate your Telegram account with n8n using the Telegram Auth node. The process involves two operations that work together to generate a secure session string for use with other Telegram nodes.

## Prerequisites

Before starting, ensure you have:
- A Telegram account with access to your phone number
- API ID and API Hash from [https://my.telegram.org](https://my.telegram.org)
- Access to the phone number associated with your Telegram account
- Your mobile number with country code (e.g., +1234567890)
- Your 2FA password if your account has 2FA enabled

## Authentication Flow

### Step 1: Request Code Operation

**Purpose**: Request a verification code to be sent to your phone number.

**Configuration**:
- **API ID**: Your Telegram API ID from https://my.telegram.org
- **API Hash**: Your Telegram API Hash from https://my.telegram.org  
- **Phone Number**: Your phone number in international format (e.g., +1234567890)
- **2FA Password** (Optional): Your 2FA password if your account has 2FA enabled

**Output**:
```json
{
  "success": true,
  "phoneCodeHash": "abc123...",
  "apiId": 123456,
  "apiHash": "abcdef...",
  "phoneNumber": "+1234567890",
  "password2fa": "your-2fa-password",
  "message": "Code sent successfully. Use the phoneCodeHash in the Sign In operation."
}
```

### Step 2: Sign In & Generate Operation

**Purpose**: Complete the authentication process and generate a session string for use with other Telegram nodes.

**Configuration**:
- **API ID**: Your Telegram API ID (same as Request Code)
- **API Hash**: Your Telegram API Hash (same as Request Code)
- **Phone Number**: Your phone number (same as Request Code)
- **Phone Code Hash**: The hash returned from Request Code operation
- **Phone Code**: The verification code sent to your phone
- **2FA Password** (Optional): Your 2FA password if your account has 2FA enabled

**Output**:
```json
{
  "success": true,
  "sessionString": "123456:abcdef...",
  "apiId": 123456,
  "apiHash": "abcdef...",
  "phoneNumber": "+1234567890",
  "password2fa": "your-2fa-password",
  "message": "Authentication successful. Use the sessionString in your Telegram nodes.",
  "note": "IMPORTANT: Copy this sessionString output and save it to a text file for backup. Then restart your n8n instance to prevent \"Ghost Connection timeout\" errors in the terminal logs."
}
```

## Drag and Drop Integration

### Operation A to Operation B Connection

To streamline your workflow, you can directly connect the output of Request Code to Sign In & Generate:

1. **Run Operation A** (Request Code)
2. **Drag the `phoneCodeHash` field** from Operation A's output
3. **Drop it into the `phoneCodeHash` field** of Operation B's input
4. **Enter your verification code** when prompted
5. **Execute Operation B** to generate the session string

This eliminates manual copying and reduces errors.

## Session String Handling

### Important Notes

**⚠️ CRITICAL**: When you receive the session string output:

1. **Copy the session string** from the output
2. **Save it to a text file** for backup purposes
3. **Restart your n8n instance** to prevent "Ghost Connection timeout" errors in the terminal logs

The session string is encrypted automatically when used with the main Telegram nodes, but restarting n8n ensures clean session management.

## Phone Code Expiration - Quick Fix Guide

### Problem
The error `PHONE_CODE_EXPIRED` occurs when the verification code sent to your phone has expired before you complete the Sign In operation.

### Why This Happens
- Telegram verification codes typically expire after **10-15 minutes**
- Network delays or slow workflow execution can cause expiration
- The code becomes invalid and cannot be used for authentication

### Solution

#### Immediate Fix
1. **Request a new code** using the Request Code operation
2. **Complete the Sign In operation immediately** (within 10 minutes)
3. **Use the new phoneCodeHash** from the fresh request

#### Best Practices to Avoid This Issue

**Quick Execution**:
- Run both operations back-to-back without delays
- Complete the entire authentication flow within 10 minutes

**Workflow Optimization**:
```
Request Code → Store phoneCodeHash → Get Phone Code from SMS → Sign In & Generate → Use Session String
```

**Error Handling**:
The updated node provides clear error messages:
```
"The verification code has expired. Please request a new code and try again."
```

### Step-by-Step Recovery

1. **Run Request Code Operation**
   ```json
   {
     "operation": "requestCode",
     "apiId": 123456,
     "apiHash": "abcdef...",
     "phoneNumber": "+1234567890"
   }
   ```

2. **Get New phoneCodeHash**
   ```json
   {
     "phoneCodeHash": "new_hash_value...",
     "success": true
   }
   ```

3. **Immediately Run Sign In Operation**
   ```json
   {
     "operation": "signIn",
     "apiId": 123456,
     "apiHash": "abcdef...",
     "phoneNumber": "+1234567890",
     "phoneCodeHash": "new_hash_value...",
     "phoneCode": "123456"
   }
   ```

4. **Get Session String**
   ```json
   {
     "sessionString": "your_session_string...",
     "success": true
   }
   ```

---

## New Authentication Features

### Enhanced Session String Generation

The updated authentication system now provides additional information in the session generation output:

```json
{
  "success": true,
  "sessionString": "123456:abcdef...",
  "apiId": 123456,
  "apiHash": "abcdef...",
  "phoneNumber": "+1234567890",
  "password2fa": "your-2fa-password",
  "message": "Authentication successful. Use the sessionString in your Telegram nodes.",
  "note": "IMPORTANT: Copy this sessionString output and save it to a text file for backup. Then restart your n8n instance to prevent \"Ghost Connection timeout\" errors in the terminal logs."
}
```

### Key Improvements

1. **Enhanced Error Messages**: More descriptive error messages for common issues
2. **Session Validation**: Better validation of session strings before use
3. **Connection Management**: Improved connection cleanup and management
4. **2FA Support**: Enhanced support for accounts with two-factor authentication

### Troubleshooting New Features

#### **"Session string generation failed" Error**
If you encounter issues with session string generation:

1. **Check Network Stability**: Ensure stable internet connection during authentication
2. **Verify 2FA Password**: If using 2FA, ensure correct password format
3. **Complete Quickly**: Finish authentication within the 10-minute window
4. **Restart n8n**: Always restart n8n after successful authentication

#### **"Ghost Connection timeout" Prevention**
To prevent connection timeout errors:

1. **Restart n8n**: Always restart n8n after receiving the session string
2. **Backup Session**: Save session string to a text file for backup
3. **Monitor Logs**: Check n8n logs for connection status
4. **Use Stable Network**: Avoid VPN/proxy during authentication

## Integration with Other Nodes

The generated `sessionString` can be used directly with:

- **Telegram MTProto Node**: For all Telegram operations
- **Telegram Trigger Node**: For event-based workflows

## Security Features

- **Secure password handling**: 2FA passwords are handled securely
- **Session encryption**: Generated sessions are compatible with the encryption system
- **Temporary connections**: No persistent connections are maintained
- **Proper cleanup**: All resources are properly cleaned up after use

## Troubleshooting

### Common Issues

1. **"Code not sent"**: Check your phone number format and API credentials
2. **"Invalid phone code"**: Ensure you're using the correct code and phoneCodeHash
3. **"Phone code expired"**: The verification code has expired (typically after 10-15 minutes). Request a new code and try again.
4. **"2FA password required"**: Enter your 2FA password in the password2fa field
5. **"Session already in use"**: Disconnect other Telegram clients or wait for session timeout
6. **"Ghost Connection timeout"**: Restart your n8n instance after receiving the session string

### Best Practices

1. **Store credentials securely**: Use n8n's credential management
2. **Handle errors gracefully**: Implement proper error handling in your workflows
3. **Monitor session usage**: Avoid multiple simultaneous authentications
4. **Keep API credentials safe**: Never expose them in workflow outputs
5. **Act quickly**: Complete the authentication process within 10-15 minutes to avoid code expiration
6. **Use fresh codes**: Always request a new verification code if the previous one expired
7. **Restart n8n**: Always restart n8n after session string generation to prevent connection issues

## Example Complete Workflow

```
1. Telegram Auth (Request Code)
   ├── Input: API ID, API Hash, Phone Number
   └── Output: phoneCodeHash

2. [Manual Step: Enter verification code]

3. Telegram Auth (Sign In & Generate)
   ├── Input: All parameters + phoneCode + phoneCodeHash (drag & drop from step 1)
   └── Output: sessionString

4. [IMPORTANT: Copy sessionString to text file and restart n8n]

5. Telegram MTProto Node
   ├── Input: Use sessionString in credentials
   └── Output: Telegram operations
```

This guide provides a complete authentication solution for integrating Telegram into your n8n workflows with proper session management and error handling.