![Telegram GramPro Banner](https://repository-images.githubusercontent.com/1144534294/b1b16f9e-45da-43df-9ea7-0ff053a199ca)

# Telegram GramPro - n8n Integration

**Powerful Telegram automation for n8n workflows with enterprise-grade security, performance optimization, and comprehensive error handling**

[![Build Status](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/build.yml/badge.svg)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/build.yml)
[![Publish Status](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/publish.yml/badge.svg)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/actions/workflows/publish.yml)
[![Socket Badge](https://badge.socket.dev/npm/package/n8n-nodes-telegram-grampro)](https://badge.socket.dev/npm/package/n8n-nodes-telegram-grampro)
[![GitHub Issues](https://img.shields.io/github/issues/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/pulls)

[![npm version](https://badgen.net/npm/v/n8n-nodes-telegram-grampro)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm downloads/week](https://img.shields.io/npm/dw/n8n-nodes-telegram-grampro?logo=npm&logoColor=white)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm downloads/month](https://img.shields.io/npm/dm/n8n-nodes-telegram-grampro?logo=npm&logoColor=white)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm downloads/year](https://img.shields.io/npm/dy/n8n-nodes-telegram-grampro?logo=npm&logoColor=white)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![node version](https://badgen.net/npm/node/n8n-nodes-telegram-grampro)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm license](https://badgen.net/npm/license/n8n-nodes-telegram-grampro)](LICENSE)
[![GitHub license](https://badgen.net/github/license/sadiakant/n8n-nodes-telegram-grampro)](LICENSE)
[![npm total downloads](https://img.shields.io/npm/dt/n8n-nodes-telegram-grampro?logo=npm&logoColor=white)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm unpacked size](https://img.shields.io/npm/unpacked-size/n8n-nodes-telegram-grampro)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm types](https://img.shields.io/npm/types/n8n-nodes-telegram-grampro)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)
[![npm collaborators](https://img.shields.io/npm/collaborators/n8n-nodes-telegram-grampro)](https://www.npmjs.com/package/n8n-nodes-telegram-grampro)

[![github release](https://badgen.net/github/release/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/releases)
[![github stars](https://badgen.net/github/stars/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/stargazers)
[![github forks](https://badgen.net/github/forks/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/network/members)
[![last commit](https://badgen.net/github/last-commit/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/commits/main)
[![GitHub contributors](https://img.shields.io/github/contributors/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/graphs/contributors)
[![GitHub watchers](https://img.shields.io/github/watchers/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/watchers)
[![GitHub issues closed](https://img.shields.io/github/issues-closed/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/issues)
[![GitHub PRs closed](https://img.shields.io/github/issues-pr-closed/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/pulls)
[![Commit activity](https://img.shields.io/github/commit-activity/m/sadiakant/n8n-nodes-telegram-grampro)](https://github.com/sadiakant/n8n-nodes-telegram-grampro/commits/main)
[![telegram dependency](https://img.shields.io/badge/telegram-%5E2.26.22-2CA5E0?logo=telegram&logoColor=white)](https://www.npmjs.com/package/telegram)
[![n8n-workflow peer dependency](https://img.shields.io/npm/dependency-version/n8n-nodes-telegram-grampro/peer/n8n-workflow)](https://www.npmjs.com/package/n8n-workflow)

[![Telegram API](https://badgen.net/static/Telegram/API/229ED9)](https://core.telegram.org/api)
[![TypeScript](https://badgen.net/static/TypeScript/5.x/3178C6)](https://www.typescriptlang.org/)
[![n8n](https://badgen.net/static/n8n/Community%20Node/EA4B71)](https://n8n.io/)
[![pnpm >= 9.1](https://img.shields.io/badge/pnpm-%3E%3D9.1-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Node >= 18.17](https://img.shields.io/badge/node-%3E%3D18.17-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

## 🚀 Transform Your Telegram Automation

Telegram GramPro is a comprehensive n8n custom node that brings the full power of Telegram's MTProto protocol to your automation workflows. Built with GramJS and designed for production use, it offers enterprise-grade features with an intuitive interface.

### 🌟 **Key Features**

#### **Core Operations**

- **Messages**: Send, get messages (time-based filters), edit, delete, pin, forward, copy, create polls and quizzes
- **Chats**: Get chats, dialogs, join/leave, create groups/channels
- **Users**: Get user info, full details with bio and common chats, update profile, change username, get profile photos
- **Media**: Download media files with progress tracking
- **Channels**: Get participants, manage members, ban/promote users

#### **Enterprise Security & Performance**

- 🔐 **AES-256-GCM Session Encryption** - Military-grade security with automatic key derivation
- ⚡ **Smart Rate Limiting** - Prevents API limits with intelligent queuing and priority handling
- 🛡️ **Enhanced Error Handling** - Automatic retry for flood waits, timeouts, and connection issues
- 🔗 **Connection Management** - Advanced client pooling with health checks and auto-reconnection
- 📊 **Structured Logging** - Production-ready logging with configurable levels and context
- 🧠 **Smart Caching** - In-memory caching for frequently accessed data with TTL management
- 🎯 **Input Validation** - Comprehensive validation with detailed error messages and warnings

#### **New Advanced Features**

- **Copy Restricted Content** - Handle media that cannot be forwarded normally
- **Edit Message Media** - Update media content in existing messages with caption support
- **Enhanced Authentication** - Improved session management with better error handling
- **Memory Optimization** - Automatic cleanup and resource management
- **Performance Monitoring** - Built-in metrics and queue monitoring

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
   pnpm install
   ```
3. **Build the project**
   ```bash
   pnpm run build
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
   pnpm install
   ```
4. **Build the project**
   ```bash
   pnpm run build
   ```
5. **Restart n8n** to load the custom node

## ⚙️ Quick Setup

### 1. Get API Credentials

- Visit [my.telegram.org](https://my.telegram.org)
- Create new application
- Note your **API ID** and **API Hash**

### 2. Create Session String

Use our built-in authentication operations. For detailed step-by-step instructions, see our [Authorization Guide](./docs/AUTHORIZATION_GUIDE.md).

### 3. Configure Credentials

In n8n → Settings → Credentials:

- **API ID**: Your Telegram API ID
- **API Hash**: Your Telegram API hash
- **Session String**: Your encrypted session string
- **Mobile Number**: Your Telegram mobile number with country code (e.g., +1234567890)
- **Validation**: Save/Test performs real MTProto getMe verification.
- **UI Note**: n8n may still show the generic label Connection tested successfully on the global credentials page.

## 🎯 Comprehensive Operations Guide

For detailed documentation of all operations with parameters, examples, and use cases, see our [Operations Guide](./docs/OPERATIONS_GUIDE.md).

## 🔧 Available Operations

| Resource              | Operations                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Session Generator** | Request Code, Sign In & Generate                                                                            |
| **Message**           | Send Text, Get Messages, Edit, Delete, Pin, Forward, Copy, Edit Media, Create Poll, Copy Restricted Content |
| **Chat**              | Get Chat, Get Dialogs, Join Channel/Group, Leave Channel/Group, Create Group/Channel                        |
| **User**              | Get User Info, Get Full User Details, Update Profile, Change Username, Get Profile Photo                    |
| **Media**             | Download Media Files                                                                                        |
| **Channel**           | Get Admin & Bots, Get Public Members, Add/Remove Member, Ban/Unban User, Promote to Admin                   |

## 🛡️ Security Features

### **Session Encryption**

All session strings are automatically encrypted using AES-256-GCM with:

- 256-bit encryption keys derived from your API credentials
- 128-bit initialization vectors with PBKDF2 key derivation
- Authentication tags for integrity verification
- Automatic encryption/decryption transparent to users
- Secure storage prevents session exposure

### **Input Validation**

Comprehensive validation ensures data integrity and security:

- API credentials validation (ID format, Hash length)
- Phone number format validation (international format)
- Session string validation and integrity checks
- Operation-specific parameter validation
- Real-time warnings for potential issues

### **Enhanced Error Handling**

The node handles common Telegram errors gracefully:

- **FLOOD_WAIT**: Automatic retry with specified wait time
- **AUTH_KEY_DUPLICATED**: Clear error message about session conflicts
- **SESSION_REVOKED**: Guidance to re-authenticate
- **USER_DEACTIVATED_BAN**: Account ban detection
- **PEER_FLOOD**: Extended wait times for peer flooding
- **NETWORK_TIMEOUT**: Exponential backoff retries (up to 5 attempts)
- **CHAT_WRITE_FORBIDDEN**: Permission error handling
- **USER_BANNED_IN_CHANNEL**: Channel ban detection
- **AUTH_KEY_UNREGISTERED**: Session is invalid or expired and must be regenerated
- **SESSION_EXPIRED**: Session expired and must be renewed
- **USER_PRIVACY_RESTRICTED**: Action blocked by user privacy settings
- **CHANNEL_PRIVATE**: Channel or group is private/inaccessible
- **USERNAME_NOT_OCCUPIED / USERNAME_INVALID**: Username does not exist or has invalid format
- **INVITE_HASH_INVALID / INVITE_HASH_EXPIRED**: Invite link is invalid or expired
- **PEER_ID_INVALID / MESSAGE_ID_INVALID**: Chat/message identifiers are invalid

## ⚡ Performance Optimizations

### **Smart Client Management**

- **Connection Pooling**: Reuses existing TelegramClient instances via Map cache
- **Race Condition Prevention**: Connection locks prevent multiple simultaneous connections
- **Health Monitoring**: Automatic connection validation and healing
- **Auto-cleanup**: 30-minute stale connection detection and cleanup
- **Reconnection Logic**: Automatic reconnection for failed connections
- **Session Encryption**: Transparent AES-256-GCM session decryption

### **Intelligent Rate Limiting**

- Configurable request intervals (minimum 1-second)
- Priority-based request queuing with queue length monitoring
- DoS protection with maximum queue size limits (1000 requests)
- Automatic cleanup of stale requests
- Enhanced Telegram API limit compliance

### **Smart Caching**

In-memory caching for frequently accessed data:

- User information caching (5-minute TTL)
- Chat/channel metadata caching
- Dialog lists caching
- Automatic cache cleanup and size management
- Configurable cache TTL and maximum size

### **Memory Efficient Design**

- Proper cleanup prevents memory leaks
- Connection pooling and resource management
- Background loop prevention
- Optimized data structures and algorithms
- Automatic resource cleanup

### **Enhanced Request Handling**

- **Binary File Upload**: Support for photos, videos, documents with automatic format detection
- **Media URL Support**: Direct URL upload with fallback to download-and-upload
- **Progress Tracking**: Real-time download progress for large media files
- **Error Recovery**: Automatic retry for network timeouts and connection issues

## 🚨 Troubleshooting

For comprehensive troubleshooting guidance, common issues, and solutions, see our [Troubleshooting Guide](./docs/TROUBLESHOOTING_GUIDE.md).

## Project Structure

```
n8n-nodes-telegram-grampro/
|-- .github/                       # GitHub specific configuration & metadata
|   |-- workflows/                 # CI/CD pipelines (Build & Publish)
|   |-- CODE_OF_CONDUCT.md         # Community guidelines
|   |-- CONTRIBUTING.md            # Instructions for developers
|   |-- LICENSE                    # Legal usage rights
|   `-- SECURITY.md                # Security policy and reporting
|-- docs/                          # Extended documentation & manuals
|   |-- AUTHORIZATION_GUIDE.md     # Steps for Telegram API auth
|   |-- OPERATIONS_GUIDE.md        # Detailed node usage instructions
|   |-- TROUBLESHOOTING_GUIDE.md   # Common errors and fixes
|   `-- Workflows-Examples/        # Ready-to-import n8n workflow JSON files
|       |-- Send messages from one user to multiple users.json
|       `-- Send messages from folder chats to user.json
|-- src/                           # Source code
|   |-- core/                      # Core logic (Rate limiting, Encryption, Auth)
|   |-- credentials/               # n8n Credential definitions
|   |-- nodes/                     # n8n Node implementations (Main & Trigger)
|   |   |-- icons/                 # Brand assets
|   |   `-- resources/             # API resource operations (Chat, Media, etc.)
|   |-- types/                     # TypeScript interfaces & types
|   `-- index.ts                   # Library entry point
|-- .gitignore                     # Files excluded from version control
|-- copy-assets.mjs                # Build script for static assets
|-- esbuild.config.mjs             # Fast bundling configuration
|-- package.json                   # Dependencies and pnpm scripts
|-- README.md                      # Project overview and quick start
`-- tsconfig.json                  # TypeScript compiler settings
```

## Workflow Examples

Ready-to-import workflow examples are available in [`docs/Workflows-Examples`](./docs/Workflows-Examples):

- [`Send messages from one user to multiple users.json`](./docs/Workflows-Examples/Send%20messages%20from%20one%20user%20to%20multiple%20users.json)
- [`Send messages from folder chats to user.json`](./docs/Workflows-Examples/Send%20messages%20from%20folder%20chats%20to%20user.json)

### How to Import in n8n

1. Open n8n and create a new workflow.
2. Use the workflow menu and select **Import from File**.
3. Choose one of the JSON files from `docs/Workflows-Examples/`.
4. Re-map `telegramApi` credentials to your own Telegram GramPro credential.
5. Replace placeholders such as source/target chats, admin usernames, and sub-workflow IDs.

### What These Examples Cover

- **Send messages from one user to multiple users.json**: Pulls recent messages from one source, filters by recency and keyword/domain, then distributes to multiple target chats with flood-wait and error notifications.
- **Send messages from folder chats to user.json**: Reads dialogs grouped by folders, filters recent media messages, then forwards matched content to a target user with scheduling and error handling.

## Advanced Configuration

### **Environment Variables**

- `GRAMPRO_LOG_LEVEL=error|warn|info|debug` - Control log verbosity
- `N8N_LOG_LEVEL=error|warn|info|debug` - Fallback if GRAMPRO_LOG_LEVEL not set

### **Performance Tuning**

- **Rate Limiting**: Adjust intervals based on your usage patterns
- **Cache Size**: Configure maximum cache entries for your memory constraints
- **Connection Timeout**: Set appropriate timeouts for your network conditions
- **Retry Attempts**: Configure retry logic for your reliability requirements

### **Security Best Practices**

- Always use encrypted session strings
- Keep API credentials secure and never expose them in workflow outputs
- Enable 2FA for your Telegram account
- Regularly rotate session strings
- Monitor logs for security events

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
pnpm install

# Start development mode
pnpm run dev

# Build for production
pnpm run build
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

| Contributor                                                                                                                                                                                           | Role                         | Expertise & Contributions                                                                                                                                                                                                                                                                  |
| :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a href="https://github.com/sadiakant"><img src="https://github.com/sadiakant.png" width="50" height="50" style="border-radius:50%; border: 2px solid #007bff;" alt="Sadiakant"></a><br>**Sadiakant** | **Project Lead & Developer** | <span style="color: #28a745; font-weight: bold;">🔧</span> **Architecture & Development**<br>• Overall project architecture and design<br>• Core node implementation and authentication system<br>• TypeScript development and API integration<br>• Production deployment and optimization |
| <a href="https://deepseek.com"><img src="https://github.com/deepseek-ai.png" width="50" height="50" style="border-radius:50%; border: 2px solid #6f42c1;" alt="DeepSeek AI"></a><br>**DeepSeek AI**   | **Concept & Ideas**          | <span style="color: #6f42c1; font-weight: bold;">💡</span> **Innovation & Strategy**<br>• Initial project structure and feature suggestions<br>• Technical concept development<br>• Architecture planning and design patterns<br>• Feature roadmap and enhancement ideas                   |
| <a href="https://openai.com"><img src="https://github.com/openai.png" width="50" height="50" style="border-radius:50%; border: 2px solid #007bff;" alt="ChatGPT AI"></a><br>**ChatGPT AI**            | **Implementation Strategy**  | <span style="color: #007bff; font-weight: bold;">🏗️</span> **Code Architecture**<br>• Code structure guidance and implementation strategy<br>• Best practices and coding standards<br>• Integration patterns and API design<br>• Documentation and code organization                       |
| <a href="https://github.com/cline"><img src="https://github.com/cline.png" width="50" height="50" style="border-radius:50%; border: 2px solid #28a745;" alt="Cline AI"></a><br>**Cline AI**           | **Development & Coding**     | <span style="color: #28a745; font-weight: bold;">💻</span> **Code Implementation**<br>• Complete codebase development and testing<br>• Performance optimization and debugging<br>• Automated testing and CI/CD integration<br>• Code review and quality assurance                          |
| <a href="https://github.com/google"><img src="https://github.com/google.png" width="50" height="50" style="border-radius:50%; border: 2px solid #ffc107;" alt="Gemini AI"></a><br>**Gemini AI**       | **Quality Assurance**        | <span style="color: #ffc107; font-weight: bold;">🔍</span> **Testing & Debugging**<br>• Error resolution and performance optimization<br>• Code review and quality assurance<br>• Bug detection and fix validation<br>• Security analysis and vulnerability assessment                     |

### **Technology Stack**

<div style="display: flex; gap: 10px; flex-wrap: wrap; margin: 15px 0;">
  <span style="background: #007bff; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">TypeScript</span>
  <span style="background: #6f42c1; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">n8n</span>
  <span style="background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">GramJS</span>
  <span style="background: #ffc107; color: black; padding: 4px 8px; border-radius: 4px; font-size: 12px;">MTProto</span>
  <span style="background: #dc3545; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">WebSocket</span>
  <span style="background: #20c997; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">AES-256</span>
  <span style="background: #6c757d; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Rate Limiting</span>
  <span style="background: #e83e8c; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Caching</span>
  <span style="background: #fd7e14; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Validation</span>
</div>

### **Recent Major Improvements**

#### **Performance & Reliability Enhancements**

- **Advanced Client Management**: Implemented connection pooling with automatic health checks and reconnection logic
- **Smart Rate Limiting**: Added priority-based queuing with configurable intervals and DoS protection
- **Memory Optimization**: Automatic cleanup prevents memory leaks with proper resource management
- **Enhanced Error Recovery**: Exponential backoff retries for network timeouts and connection issues

#### **Security & Data Protection**

- **AES-256-GCM Encryption**: Military-grade session encryption with automatic key derivation from API credentials
- **Comprehensive Input Validation**: Multi-layered validation with detailed error messages and security warnings
- **Session Management**: Secure session handling with integrity checks and automatic cleanup

#### **New Advanced Features**

- **Copy Restricted Content**: Handle media that cannot be forwarded normally with download-and-upload fallback
- **Edit Message Media**: Update media content in existing messages with caption and formatting support
- **Enhanced Authentication**: Improved session generation with better error handling and validation
- **Smart Caching**: In-memory caching for frequently accessed data with TTL management

#### **Developer Experience**

- **Structured Logging**: Configurable log levels with context-rich messages for debugging
- **Comprehensive Documentation**: Updated guides with new features and troubleshooting
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions
- **Error Handling**: Detailed error messages with actionable guidance

### **Collaboration Excellence**

- **<span style="color: #007bff;">🤖 AI-Powered Development</span>**: Cutting-edge AI assistance for code generation and optimization
- **<span style="color: #28a745;">✅ Quality Assurance</span>**: Multi-layered review process ensuring code quality and security
- **<span style="color: #6f42c1;">🚀 Innovation</span>**: Latest technologies and best practices implementation
- **<span style="color: #ffc107;">🔧 Expert Integration</span>**: Professional-grade code integration and deployment
- **<span style="color: #dc3545;">⚡ Performance Focus</span>**: Enterprise-grade performance optimization and monitoring
- **<span style="color: #20c997;">🛡️ Security First</span>**: Military-grade security with comprehensive validation
- **<span style="color: #6c757d;">📊 Production Ready</span>**: Built for enterprise environments with monitoring and logging

---

**Built with ❤️ for n8n automation workflows**
