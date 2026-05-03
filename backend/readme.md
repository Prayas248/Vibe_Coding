# Node Production Backend

A production-ready Node.js backend application built with Express.js, featuring comprehensive authentication, security middleware, automated testing, and containerized deployment.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Docker Support](#docker-support)
- [CI/CD Pipeline](#cicd-pipeline)
- [Contributing](#contributing)

## Overview

This Node.js backend application provides a robust foundation for building scalable web applications. It implements industry best practices including secure authentication with JWT tokens, comprehensive input validation, rate limiting, automated testing, and containerized deployment.

**Problem Solved:** Eliminates the need to build authentication and security infrastructure from scratch, providing developers with a production-ready backend that can be quickly customized for specific business requirements.

**Key Benefits:**

- Secure user authentication and authorization
- Production-ready security middleware
- Comprehensive test coverage
- Automated CI/CD pipeline
- Docker containerization for consistent deployments
- Structured codebase following MVC architecture

## Project Structure

```
Node-Production-Backend/
├── .github/                          # GitHub Actions workflows
│   └── workflows/
│       ├── docker-build-and-push.yml # Docker CI/CD pipeline
│       ├── lint-and-format.yml       # Code quality automation
│       └── tests.yml                 # Automated test execution
├── coverage/                         # Test coverage reports
│   ├── clover.xml                   # Coverage data (Clover format)
│   ├── coverage-final.json          # Final coverage summary
│   ├── lcov.info                    # Coverage data (LCOV format)
│   └── lcov-report/                 # HTML coverage visualization
├── logs/                            # Application log files
├── src/                             # Main application source code
│   ├── app.js                       # Express application configuration
│   ├── index.js                     # Application entry point
│   ├── server.js                    # HTTP server setup
│   ├── config/                      # Configuration modules
│   │   ├── arcjet.js               # Security configuration (Arcjet)
│   │   ├── database.js             # MongoDB connection setup
│   │   └── logger.js               # Winston logging configuration
│   ├── controllers/                 # Request handlers (Controller layer)
│   │   ├── auth.controller.js      # Authentication endpoints
│   │   └── users.controller.js     # User management endpoints
│   ├── middleware/                  # Custom middleware functions
│   │   ├── auth.middleware.js      # JWT authentication middleware
│   │   └── security.middleware.js  # Security headers & rate limiting
│   ├── models/                      # Database schema definitions
│   │   └── user.model.js           # User model (Mongoose schema)
│   ├── routes/                      # API route definitions
│   │   ├── auth.routes.js          # Authentication routes
│   │   └── users.routes.js         # User management routes
│   ├── services/                    # Business logic layer
│   │   ├── auth.service.js         # Authentication business logic
│   │   └── users.service.js        # User management business logic
│   ├── tests/                       # Test suites
│   │   └── app.test.js             # Application integration tests
│   ├── utils/                       # Utility functions
│   │   ├── cookies.js              # Cookie management utilities
│   │   ├── format.js               # Data formatting helpers
│   │   └── jwt.js                  # JWT token utilities
│   └── validations/                 # Input validation schemas
│       ├── auth.validation.js      # Authentication input validation
│       └── users.validation.js     # User data validation
├── .dockerignore                    # Docker build exclusions
├── .gitignore                       # Git tracking exclusions
├── .prettierignore                  # Prettier formatting exclusions
├── .prettierrc                      # Prettier configuration
├── .env.example                     # Environment variables required
├── development-docker.sh            # Development Docker startup script
├── docker-compose.dev.yml           # Development environment setup
├── docker-compose.prod.yml          # Production environment setup
├── Dockerfile                       # Container build instructions
├── eslint.config.js                 # ESLint code quality rules
├── jest.config.mjs                  # Jest testing configuration
├── package.json                     # Dependencies and scripts
├── production-docker.sh             # Production Docker startup script
└── README.md                        # Project documentation
```

### Key Directory Explanations

- **`src/config/`**: Contains all application configuration including database connections, logging setup, and security configurations
- **`src/controllers/`**: Implements the Controller layer of MVC architecture, handling HTTP requests and responses
- **`src/middleware/`**: Custom middleware for authentication, security headers, rate limiting, and request processing
- **`src/models/`**: Database models and schemas using Mongoose ODM for MongoDB
- **`src/services/`**: Business logic layer that separates concerns from controllers
- **`src/validations/`**: Input validation schemas ensuring data integrity and security
- **`src/utils/`**: Reusable utility functions for common operations
- **`.github/workflows/`**: CI/CD automation using GitHub Actions

## Features

### Core Functionality

- User registration and authentication
- JWT-based session management
- Password encryption with bcrypt
- User profile management
- Input validation and sanitization

### Security Features

- Rate limiting and DDoS protection
- CORS configuration
- Security headers (Helmet.js)
- Arcjet security monitoring
- Secure cookie handling
- SQL injection prevention
- XSS protection

### Development & Operations

- Comprehensive test suite with Jest
- Code coverage reporting
- ESLint code quality checks
- Prettier code formatting
- Docker containerization
- Multi-environment support
- Automated CI/CD pipeline
- Structured logging with Winston

## Tech Stack

| Category             | Technology       | Purpose                                  |
| -------------------- | ---------------- | ---------------------------------------- |
| **Runtime**          | Node.js          | JavaScript runtime environment           |
| **Framework**        | Express.js       | Web application framework                |
| **Database**         | PostgreSQL       | Relational database                      |
| **Deployment**       | Supabase         | Managed PostgreSQL & backend platform    |
| **Authentication**   | JWT              | JSON Web Token authentication            |
| **Security**         | Arcjet, Helmet   | Request protection & secure HTTP headers |
| **Testing**          | Jest             | JavaScript testing framework             |
| **Code Quality**     | ESLint, Prettier | Linting and formatting                   |
| **Containerization** | Docker           | Application containerization             |
| **CI/CD**            | GitHub Actions   | Automated CI/CD workflows                |
| **Logging**          | Winston          | Structured application logging           |

## Installation & Setup

### Prerequisites

- Node.js (v18.0.0 or higher, v20 recommended)
- npm (v9.0.0 or higher)
- PostgreSQL (local instance **or** Supabase-managed database)
- Docker (for containerized development and production)

### Local Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/pranjalirathi/DSAF.git
   cd Node-Production-Backend
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` file with your configuration values.

4. **Set up PostgreSQL / Supabase**

   You can use either a local PostgreSQL instance or Supabase (recommended).

   **Option A: Using Supabase (Recommended)**
   - Create a new project on https://supabase.com
   - Copy the PostgreSQL connection string
   - Add it to your `.env` file:

   ```env

   ```

5. **Run the application**

   ```bash
   # Development mode with hot reload
   npm run dev

   # Production mode
   npm start
   ```

### Docker Setup

1. **Development environment**

   ```bash
   chmod +x development-docker.sh
   ./development-docker.sh
   ```

2. **Production environment**
   ```bash
   chmod +x production-docker.sh
   ./production-docker.sh
   ```

## Usage

### Starting the Application

```bash
# Development server (Node.js watch mode)
npm run dev

# Production server
npm start

# Development Docker environment
npm run dev:docker

# Production Docker environment
npm run prod:docker

```

### Running Tests

```bash
# Run all tests
npm test
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Format check
npm run format:check
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=production_api_backend

# Arcjet
ARCJET_KEY=your-arcjet-api-key
```

## API Endpoints

### Health & Base Endpoints

| Method | Endpoint  | Description              | Auth Required |
| ------ | --------- | ------------------------ | ------------- |
| GET    | `/health` | Application health check | No            |
| GET    | `/api`    | API status message       | No            |

---

### Authentication Endpoints

| Method | Endpoint             | Description                     | Auth Required |
| ------ | -------------------- | ------------------------------- | ------------- |
| POST   | `/api/auth/sign-up`  | Register a new user             | No            |
| POST   | `/api/auth/sign-in`  | Authenticate user and issue JWT | No            |
| POST   | `/api/auth/sign-out` | Sign out the authenticated user | Yes           |

> Authentication is implemented using **JWT-based stateless tokens**.

---

### User Management Endpoints

| Method | Endpoint         | Description       | Auth Required    |
| ------ | ---------------- | ----------------- | ---------------- |
| GET    | `/api/users`     | Get all users     | Yes              |
| GET    | `/api/users/:id` | Get user by ID    | Yes              |
| PUT    | `/api/users/:id` | Update user by ID | Yes              |
| DELETE | `/api/users/:id` | Delete user by ID | Yes (Admin only) |

## Testing

The project includes comprehensive testing with Jest:

### Test Structure

- **Unit Tests**: Individual function and module testing
- **Integration Tests**: API endpoint testing
- **Coverage Reports**: Automated coverage tracking

### Coverage Goals

- Minimum 80% code coverage
- All critical paths tested
- Edge cases covered

## Docker Support

### Development Container

```bash
# Start development environment using Docker
npm run dev:docker
```

### Production Container

```bash
# Start production environment using Docker
npm run prod:docker

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

## CI/CD Pipeline

The project includes automated GitHub Actions workflows:

### Workflows

1. **Code Quality** (`lint-and-format.yml`)
   - ESLint code quality checks
   - Prettier formatting validation
   - Runs on every push and pull request

2. **Testing** (`tests.yml`)
   - Jest test suite execution
   - Coverage reporting
   - Multi-environment testing

3. **Docker Build** (`docker-build-and-push.yml`)
   - Docker image building
   - Image pushing to registry
   - Production deployment

### Trigger Events

- Push to main branch
- Pull request creation
- Manual workflow dispatch

## Contributing

Contributions from the community are welcomed! Please follow these guidelines:

### Development Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes following our coding standards
4. Write/update tests for your changes
5. Ensure all tests pass: `npm test`
6. Run linting: `npm run lint`
7. Commit your changes: `git commit -m 'Add some feature'`
8. Push to the branch: `git push origin feature/your-feature-name`
9. Submit a pull request

### Code Standards

- Follow ESLint configuration
- Maintain test coverage above 80%
- Write meaningful commit messages
- Update documentation for new features
- Follow semantic versioning for releases

### Pull Request Requirements

- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)

---
