# Telegram GramPro - n8n Integration

**Powerful Telegram automation for n8n workflows with session encryption and rate limiting**

[![Build Status](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/build.yml/badge.svg)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/build.yml)
[![Publish Status](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/publish.yml/badge.svg)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/publish.yml)

[![Telegram](https://img.shields.io/badge/Telegram-API-blue.svg)](https://core.telegram.org/api)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)
[![n8n](https://img.shields.io/badge/n8n-Custom_Node-green.svg)](https://n8n.io/)
[![NPM](https://img.shields.io/npm/v/n8n-nodes-telegram-grampro.svg)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 🚀 Transform Your Telegram Automation

Telegram GramPro is a comprehensive n8n custom node that brings the full power of Telegram's MTProto protocol to your automation workflows. Built with GramJS and designed for production use, it offers enterprise-grade features with an intuitive interface.

### 🌟 **Key Features**

#### **Core Operations**
- **Messages**: Send, edit, delete, pin, forward, copy, create polls and quizzes
- **Chats**: Get chats, dialogs, join/leave, create groups/channels  
- **Users**: Get user info, full details with bio and common chats, update profile, change username, get profile photos
- **Media**: Download media files with progress tracking
- **Channels**: Get participants, manage members, ban/promote users

#### **Enterprise Security & Performance**
- 🔐 **AES-256-GCM Session Encryption** - Military-grade security
- ⚡ **Smart Rate Limiting** - Prevents API limits with intelligent queuing
- 🛡️ **Enhanced Error Handling** - Automatic retry for flood waits and timeouts
- 🔗 **Connection Management** - WebSocket support with automatic cleanup
- 📊 **Structured Logging** - Production-ready logging with debug support

## 📦 Installation

### Method 1: n8n Community Nodes (Recommended)
1. Open n8n UI
2. Go to **Settings** → **Community Nodes**
3. Add in box "n8n-nodes-telegram-grampro"
4. Click checkbox to allow to use external nodes.
5. Click **Install**
6. Restart n8n to load the custom node

### Method 2: Custom Nodes Directory
1. **Clone to n8n custom nodes directory**
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Build the project**
   ```bash
   npm run build
   ```
4. **Restart n8n** to load the custom node

### Method 3: GitHub Installation
1. **Clone from GitHub**
   ```bash
   git clone https://github.com/sadiakant/n8n-nodes-telegram-grampro.git
   ```
2. **Move to n8n custom nodes directory**
3. **Install dependencies**
   ```bash
   npm install
   ```
4. **Build the project**
   ```bash
   npm run build
   ```
5. **Restart n8n** to load the custom node

## ⚙️ Quick Setup

### 1. Get API Credentials
- Visit [my.telegram.org](https://my.telegram.org)
- Create new application
- Note your **API ID** and **API Hash**

### 2. Create Session String
Use our built-in authentication operations. For detailed step-by-step instructions, see our [Authorization Guide](AUTHORIZATION_GUIDE.md).

### 3. Configure Credentials
In n8n → Settings → Credentials:
- **API ID**: Your Telegram API ID
- **API Hash**: Your Telegram API hash  
- **Session String**: Your encrypted session string
- **Mobile Number**: Your Telegram mobile number with country code (e.g., +1234567890)
- **2FA Code (Optional)**: Your Telegram 2FA code if enabled

## 🎯 Comprehensive Operations Guide

For detailed documentation of all operations with parameters, examples, and use cases, see our [Operations Guide](OPERATIONS_GUIDE.md).

## 🔧 Available Operations

| Resource | Operations |
|----------|------------|
| **Session Generator** | Request Code, Sign In & Generate |
| **Message** | Send Text, Edit, Delete, Pin, Forward, Copy, Create Poll |
| **Chat** | Get Chat, Get Dialogs, Join Channel/Group, Leave Channel/Group, Create Group/Channel |
| **User** | Get User Info, Get Full User Details, Update Profile, Change Username, Get Profile Photo |
| **Media** | Download Media Files |
| **Channel** | Get Admin & Bots, Get Public Members, Add/Remove Member, Ban/Unban User, Promote to Admin |

## 🛡️ Security Features

### **Session Encryption**
All session strings are automatically encrypted using AES-256-GCM with:
- 256-bit encryption keys
- 128-bit initialization vectors
- PBKDF2 key derivation with salt
- Authentication tags for integrity

### **Error Handling**
The node handles common Telegram errors gracefully:

- **FLOOD_WAIT**: Automatic retry with specified wait time
- **AUTH_KEY_DUPLICATED**: Clear error message about session conflicts
- **SESSION_REVOKED**: Guidance to re-authenticate
- **USER_DEACTIVATED_BAN**: Account ban detection
- **PEER_FLOOD**: Extended wait times for peer flooding
- **NETWORK_TIMEOUT**: Exponential backoff retries
- **CHAT_WRITE_FORBIDDEN**: Permission error handling
- **USER_BANNED_IN_CHANNEL**: Channel ban detection

### **Rate Limiting**
Prevents hitting Telegram's API rate limits:
- Minimum 1-second interval between requests (configurable)
- Request queuing with priority support
- Queue length monitoring
- Automatic cleanup

## 📊 Performance Optimized

### **Smart Client Management**
- Automatic connection validation
- Health checks and reconnection
- Resource cleanup and management
- WebSocket support for reliability

### **Request Queuing**
- Priority-based request handling
- Queue length monitoring
- Automatic cleanup
- Configurable intervals

### **Memory Efficient**
- Proper cleanup prevents memory leaks
- Connection pooling
- Resource management
- Background loop prevention

## 🚨 Troubleshooting

For comprehensive troubleshooting guidance, common issues, and solutions, see our [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md).

## 🎨 Workflow Examples

### **Basic Message Automation**
```
1. Trigger (Webhook, Schedule, etc.)
2. Telegram GramPro (Send Text)
   ├── Chat ID: @channel_name
   ├── Message: "Automated message from n8n"
   └── Disable Link Preview: true
3. Success/Failure handling
```

### **User Management Workflow**
```
1. Trigger (New User Registration)
2. Telegram GramPro (Add Member)
   ├── Channel ID: @your_channel
   └── User ID to Add: {{ $json.username }}
3. Telegram GramPro (Send Welcome Message)
   ├── Chat ID: @your_channel
   └── Message: "Welcome {{ $json.name }}!"
4. Success/Failure handling
```

### **Content Moderation Workflow**
```
1. Trigger (Message Received)
2. Telegram GramPro (Get Message Content)
3. Content Analysis (External API)
4. Conditional Logic
   ├── If Spam → Ban User
   ├── If Violation → Delete Message
   └── If Clean → Continue
5. Telegram GramPro (Notify Admins)
6. Success/Failure handling
```

## 🤝 Contributing

We welcome contributions to make Telegram GramPro even better!

### **Contribution Guidelines**

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes with proper TypeScript types**
4. **Add tests for new functionality**
5. **Update documentation**
6. **Submit a pull request**

### **Development Setup**

```bash
# Clone the repository
git clone https://github.com/sadiakant/n8n-nodes-telegram-grampro.git

# Install dependencies
npm install

# Start development mode
npm run dev

# Build for production
npm run build
```

### **Code Standards**
- Use TypeScript for type safety
- Follow existing code patterns
- Add comprehensive error handling
- Include proper documentation
- Test thoroughly before submitting

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Resources

- [Telegram API Documentation](https://core.telegram.org/api)
- [GramJS Documentation](https://gram.js.org/)
- [n8n Custom Nodes Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [Telegram GramPro GitHub](https://github.com/sadiakant/n8n-nodes-telegram-grampro)
- [NPM Package](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)

## 👥 Contributors

### **Core Development Team**

| Contributor | Role | Expertise & Contributions |
| :--- | :--- | :--- |
| <a href="https://github.com/sadiakant"><img src="https://github.com/sadiakant.png" width="50" height="50" style="border-radius:50%; border: 2px solid #007bff;" alt="Sadiakant"></a><br>**Sadiakant** | **Project Lead & Developer** | <span style="color: #28a745; font-weight: bold;">🔧</span> **Architecture & Development**<br>• Overall project architecture and design<br>• Core node implementation and authentication system<br>• TypeScript development and API integration<br>• Production deployment and optimization |
| <a href="https://deepseek.com"><img src="https://github.com/deepseek-ai.png" width="50" height="50" style="border-radius:50%; border: 2px solid #6f42c1;" alt="DeepSeek AI"></a><br>**DeepSeek AI** | **Concept & Ideas** | <span style="color: #6f42c1; font-weight: bold;">💡</span> **Innovation & Strategy**<br>• Initial project structure and feature suggestions<br>• Technical concept development<br>• Architecture planning and design patterns<br>• Feature roadmap and enhancement ideas |
| <a href="https://openai.com"><img src="https://github.com/openai.png" width="50" height="50" style="border-radius:50%; border: 2px solid #007bff;" alt="ChatGPT AI"></a><br>**ChatGPT AI** | **Implementation Strategy** | <span style="color: #007bff; font-weight: bold;">🏗️</span> **Code Architecture**<br>• Code structure guidance and implementation strategy<br>• Best practices and coding standards<br>• Integration patterns and API design<br>• Documentation and code organization |
| <a href="https://github.com/cline"><img src="https://github.com/cline.png" width="50" height="50" style="border-radius:50%; border: 2px solid #28a745;" alt="Cline AI"></a><br>**Cline AI** | **Development & Coding** | <span style="color: #28a745; font-weight: bold;">💻</span> **Code Implementation**<br>• Complete codebase development and testing<br>• Performance optimization and debugging<br>• Automated testing and CI/CD integration<br>• Code review and quality assurance |
| <a href="https://github.com/google"><img src="https://github.com/google.png" width="50" height="50" style="border-radius:50%; border: 2px solid #ffc107;" alt="Gemini AI"></a><br>**Gemini AI** | **Quality Assurance** | <span style="color: #ffc107; font-weight: bold;">🔍</span> **Testing & Debugging**<br>• Error resolution and performance optimization<br>• Code review and quality assurance<br>• Bug detection and fix validation<br>• Security analysis and vulnerability assessment |

### **Technology Stack**

<div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 15px 0;">
  <span style="background: #007bff; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">TypeScript</span>
  <span style="background: #6f42c1; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">n8n</span>
  <span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">GramJS</span>
  <span style="background: #ffc107; color: black; padding: 4px 8px; border-radius: 4px; font-size: 12px;">MTProto</span>
  <span style="background: #dc3545; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">WebSocket</span>
  <span style="background: #20c997; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">AES-256</span>
</div>

### **Collaboration Excellence**

- **<span style="color: #007bff;">🤖 AI-Powered Development</span>**: Cutting-edge AI assistance for code generation and optimization
- **<span style="color: #28a745;">✅ Quality Assurance</span>**: Multi-layered review process ensuring code quality and security
- **<span style="color: #6f42c1;">🚀 Innovation</span>**: Latest technologies and best practices implementation
- **<span style="color: #ffc107;">🔧 Expert Integration</span>**: Professional-grade code integration and deployment
---

**Built with ❤️ for n8n automation workflows**

