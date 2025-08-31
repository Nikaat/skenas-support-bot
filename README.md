# Skenas Telegram Bot 🤖

A simple and lightweight Telegram bot for Skenas admin notifications and failed transaction monitoring. This bot provides secure access to failed transaction logs for admin users only, using environment-based configuration instead of a database.

## ✨ Features

- 🔐 **Simple Admin Authentication** - Phone number-based admin verification via environment variables
- 📊 **Failed Transaction Logs** - Real-time access to failed invoice data
- 🚀 **Lightweight Architecture** - No database required, in-memory session management
- 🐳 **Docker Ready** - Easy deployment with Docker and Docker Compose
- 📱 **User-Friendly Interface** - Intuitive Telegram bot commands
- 🔄 **Session Management** - Automatic session cleanup and management
- 📈 **Health Monitoring** - Built-in health checks and status reporting

## 🏗️ Architecture

The bot follows a simple, lightweight architecture:

```
src/
├── bot/           # Telegram bot logic
├── commands/      # Bot command handlers
├── config/        # Configuration management
├── services/      # Business logic and external integrations
└── types/         # TypeScript type definitions
```

**Key Design Decisions:**

- **No Database**: Admin phone numbers configured via environment variables
- **In-Memory Sessions**: Simple session management using JavaScript Map
- **Stateless Design**: Easy to scale horizontally
- **Environment-Based Config**: Simple deployment and configuration
- **Minimal Dependencies**: Only essential packages included

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd telegram-bot
npm install
```

### 2. Environment Configuration

Copy the environment file and configure it:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_BOT_USERNAME=your_bot_username_here

# Admin Phone Numbers (comma-separated list)
ADMIN_PHONE_NUMBERS=+989123456789,+989876543210

# Main Application API
SKENAS_API_BASE_URL=http://localhost:3000
SKENAS_API_KEY=your_api_key_here

# Bot Configuration
BOT_PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Development

```bash
# Start in development mode
npm run dev

# Build for production
npm run build

# Start production build
npm start
```

### 4. Docker Deployment

```bash
# Build and start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f telegram-bot

# Stop services
docker-compose down
```

## 📱 Bot Commands

| Command   | Description                       | Access     |
| --------- | --------------------------------- | ---------- |
| `/start`  | Start bot and verify admin access | Public     |
| `/logs`   | View failed transaction logs      | Admin Only |
| `/status` | Check system status               | Admin Only |
| `/logout` | End admin session                 | Admin Only |
| `/help`   | Show available commands           | Public     |

## 🔐 Admin Authentication Flow

1. **Start Command** (`/start`)

   - Bot welcomes user and requests phone number
   - User shares phone number via Telegram contact

2. **Phone Verification**

   - Bot checks if phone number is in `ADMIN_PHONE_NUMBERS` environment variable
   - Creates admin session if verified

3. **Access Control**
   - Only verified admins can access logs and status
   - Sessions expire after 24 hours
   - Automatic cleanup of expired sessions

## 🗄️ Configuration

### Admin Phone Numbers

Configure admin access by setting the `ADMIN_PHONE_NUMBERS` environment variable:

```env
# Single admin
ADMIN_PHONE_NUMBERS=+989123456789

# Multiple admins (comma-separated)
ADMIN_PHONE_NUMBERS=+989123456789,+989876543210,+989111111111
```

### Session Management

- **Session Timeout**: 24 hours (configurable in code)
- **Storage**: In-memory using JavaScript Map
- **Cleanup**: Automatic cleanup every hour

## 🔌 API Integration

The bot communicates with the main Skenas application via REST API:

- **Health Check**: `/health`
- **Failed Invoices**: `/api/failed-invoices/date-range`

## 🐳 Docker Configuration

### Production Dockerfile

- Multi-stage build for optimized image size
- Non-root user for security
- Health checks for monitoring
- Alpine Linux for minimal footprint

### Docker Compose

- Single service deployment
- Environment variable configuration
- Health monitoring
- Volume persistence for logs

## 📊 Monitoring & Health Checks

### Built-in Health Endpoints

- `/health` - Application health status
- `/api/admin-phone-numbers` - Configured admin phone numbers

### Health Metrics

- API connectivity status
- Bot uptime
- Active admin sessions count
- Admin phone numbers configuration

## 🔒 Security Features

- **Phone Number Verification** - Secure admin authentication
- **Environment-Based Access Control** - No database vulnerabilities
- **Session Management** - Automatic session expiration
- **Access Control** - Admin-only command restrictions
- **Input Validation** - Sanitized user inputs
- **Error Handling** - Secure error responses

## 🚀 Scaling Considerations

### Horizontal Scaling

- Stateless bot design
- No shared database dependencies
- Load balancer ready
- Container orchestration support

### Performance Optimization

- In-memory session storage
- Efficient API calls
- Message chunking for long logs
- Minimal memory footprint

## 🛠️ Development

### Code Structure

- **Commands**: Simple command objects with handlers
- **Services**: Business logic and external integrations
- **Types**: Essential TypeScript interfaces

### Adding New Commands

1. Create command object with `command`, `description`, and `handler` properties
2. Add to commands array in `TelegramBot` class
3. Register command handler

### Testing

```bash
# Run tests
npm test

# Test with specific command
npm test -- --grep "start command"
```

## 📝 Environment Variables

| Variable                | Description                  | Required | Default                 |
| ----------------------- | ---------------------------- | -------- | ----------------------- |
| `TELEGRAM_BOT_TOKEN`    | Bot token from BotFather     | ✅       | -                       |
| `TELEGRAM_BOT_USERNAME` | Bot username                 | ✅       | -                       |
| `ADMIN_PHONE_NUMBERS`   | Comma-separated admin phones | ✅       | -                       |
| `SKENAS_API_BASE_URL`   | Main app API URL             | ✅       | `http://localhost:3000` |
| `SKENAS_API_KEY`        | API authentication key       | ✅       | -                       |
| `BOT_PORT`              | HTTP server port             | ❌       | `3001`                  |
| `NODE_ENV`              | Environment mode             | ❌       | `development`           |
| `LOG_LEVEL`             | Logging level                | ❌       | `info`                  |

## 🔧 Troubleshooting

### Common Issues

1. **Bot Not Responding**

   - Check bot token validity
   - Verify webhook configuration
   - Check server connectivity

2. **Admin Access Denied**

   - Verify phone number format in `ADMIN_PHONE_NUMBERS`
   - Check environment variable configuration
   - Ensure phone number includes country code

3. **API Calls Failing**
   - Check main app availability
   - Verify API key
   - Check network connectivity

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# View detailed logs
docker-compose logs -f telegram-bot
```

## 📚 API Documentation

### Health Check

```http
GET /health
```

### Admin Phone Numbers

```http
GET /api/admin-phone-numbers
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Follow existing code patterns
4. Add tests for new functionality
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Contact the development team
- Check the troubleshooting section

---

**Built with ❤️ for Skenas Team**
