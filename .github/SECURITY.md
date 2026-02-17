# Security Policy

## Supported Versions

We take security seriously in Telegram GramPro. Security updates will be applied to the latest version of the project.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Telegram GramPro, please report it responsibly:

1. **Do not open a public issue** for security vulnerabilities
2. **Email us directly** at krushnakantsadiya@gmail.com with details about the vulnerability
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact
   - Suggested fix (if applicable)

## Security Best Practices

When using Telegram GramPro, please follow these security best practices:

### **API Credentials**
- Never commit API credentials to version control
- Use environment variables or secure credential storage
- Regularly rotate your API credentials
- Only grant necessary permissions to your Telegram API

### **Session Management**
- Store session strings securely
- Use strong 2FA passwords for your Telegram account
- Monitor for unauthorized session usage
- Regularly regenerate session strings

### **n8n Security**
- Keep your n8n instance updated
- Use strong authentication for n8n access
- Restrict access to sensitive workflows
- Monitor workflow execution logs

### **Network Security**
- Use HTTPS for all connections
- Be cautious when using VPNs or proxies
- Monitor for unusual network activity
- Use firewalls to restrict unnecessary connections

## Response Timeline

We are committed to responding to security reports promptly:

- **Initial Response**: Within 48 hours
- **Vulnerability Assessment**: Within 5 business days
- **Fix Development**: As soon as possible based on severity
- **Public Disclosure**: After a fix is available

## Security Updates

Security updates will be:
- Released as patch versions (e.g., 1.0.1, 1.0.2)
- Clearly documented in release notes
- Backward compatible when possible
- Available through standard update channels

## Contact

For security-related inquiries or vulnerability reports:
- **Email**: krushnakantsadiya@gmail.com
- **GitHub**: [Create a private message](https://github.com/sadiakant)

Thank you for helping keep Telegram GramPro secure! 🛡️