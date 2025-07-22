# Technical Architecture Documentation

## 🏗 System Architecture Overview

This document provides a detailed technical overview of the Learning Management System (LMS) backend architecture, designed for developers, system architects, and technical stakeholders.

## 📋 Table of Contents
- [Architecture Patterns](#architecture-patterns)
- [Technology Stack](#technology-stack)
- [Database Design](#database-design)
- [API Architecture](#api-architecture)
- [Security Implementation](#security-implementation)
- [File Management](#file-management)
- [Performance Considerations](#performance-considerations)
- [Deployment Strategy](#deployment-strategy)
- [Monitoring & Logging](#monitoring--logging)

---

## 🎯 Architecture Patterns

### MVC (Model-View-Controller) Pattern
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Controllers  │    │      Models     │    │     Routes      │
│  (Business      │◄──►│  (Data Layer)   │    │  (API Layer)    │
│   Logic)        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Middleware Chain Pattern
```
Request → CORS → Auth → Role Check → Controller → Response
   ↓        ↓      ↓        ↓           ↓          ↑
Error ←── Error ←── Error ←── Error ←── Error ←── Error
```

### Repository Pattern
- **Models**: Direct database interaction using Mongoose ODM
- **Controllers**: Business logic and data transformation
- **Routes**: API endpoint definitions and middleware orchestration

---

## 🛠 Technology Stack

### Backend Framework
```javascript
// Core Technologies
Node.js v14+          // Runtime environment
Express.js v4.21+     // Web application framework
MongoDB v7.8+         // NoSQL database
Mongoose v7.8+        // Object Document Mapper (ODM)
```

### Authentication & Security
```javascript
// Security Stack
jsonwebtoken v9.0+    // JWT token generation/validation
bcryptjs v2.4+        // Password hashing
cors v2.8+            // Cross-origin resource sharing
joi v17.9+            // Data validation
```

### File Processing
```javascript
// File Handling
multer v1.4+          // File upload middleware
express-fileupload    // Alternative file upload handler
xlsx v0.18+           // Excel file processing
uuid v11.1+           // Unique identifier generation
@azure/storage-blob   // Azure Blob Storage integration
```

### Development Tools
```javascript
// Development Environment
nodemon v2.0+         // Development auto-restart
dotenv v16.4+         // Environment variable management
body-parser v1.20+    // Request body parsing
```

---

## 🗄 Database Design

### MongoDB Collections Structure

#### Core Collections
```javascript
// Users Collection
{
  _id: ObjectId,
  name: String,
  email: String (unique, indexed),
  password: String (hashed),
  role: Enum["admin", "teacher", "student"],
  createdAt: Date,
  updatedAt: Date
}

// Courses Collection
{
  _id: ObjectId,
  title: String,
  aboutCourse: String,
  semester: ObjectId (ref: Semester),
  teacher: ObjectId (ref: Teacher),
  lectures: [Object],
  outcomes: ObjectId (ref: CourseOutcome),
  schedule: ObjectId (ref: CourseSchedule),
  syllabus: ObjectId (ref: CourseSyllabus),
  weeklyPlan: ObjectId (ref: WeeklyPlan),
  creditPoints: ObjectId (ref: CreditPoints),
  attendance: ObjectId (ref: CourseAttendance),
  assignments: [ObjectId] (ref: Assignment),
  createdAt: Date,
  updatedAt: Date
}
```

#### Relationship Collections
```javascript
// Students Collection (extends User)
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  teacher: ObjectId (ref: Teacher),
  courses: [ObjectId] (ref: Course),
  teacherEmail: String (indexed),
  createdAt: Date,
  updatedAt: Date
}

// Teachers Collection (extends User)
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  courses: [ObjectId] (ref: Course),
  email: String (unique, indexed),
  createdAt: Date,
  updatedAt: Date
}
```

### Database Indexes
```javascript
// Performance Optimization Indexes
db.users.createIndex({ "email": 1 }, { unique: true })
db.students.createIndex({ "teacherEmail": 1 })
db.teachers.createIndex({ "email": 1 }, { unique: true })
db.courses.createIndex({ "teacher": 1 })
db.assignments.createIndex({ "course": 1 })
db.discussions.createIndex({ "course": 1 })
```

### Data Relationships
```
User (1) ←→ (1) Student/Teacher
Teacher (1) ←→ (N) Students
Teacher (1) ←→ (N) Courses
Course (1) ←→ (N) Assignments
Course (1) ←→ (N) Discussions
Course (1) ←→ (N) EContent
Course (1) ←→ (1) Syllabus
```

---

## 🔗 API Architecture

### RESTful Design Principles
```javascript
// Standard HTTP Methods
GET    /api/courses        // Retrieve all courses
GET    /api/courses/:id    // Retrieve specific course
POST   /api/courses        // Create new course
PUT    /api/courses/:id    // Update entire course
PATCH  /api/courses/:id    // Partial course update
DELETE /api/courses/:id    // Delete course
```

### Response Format Standards
```javascript
// Success Response
{
  success: true,
  data: { /* response data */ },
  message: "Operation completed successfully"
}

// Error Response
{
  success: false,
  error: "Error type",
  message: "Detailed error description",
  statusCode: 400
}
```

### API Versioning Strategy
```javascript
// Current Implementation
/api/auth/*           // Authentication endpoints
/api/courses/*        // Course management
/api/students/*       // Student operations
/api/teachers/*       // Teacher operations

// Future Versioning (Recommended)
/api/v1/auth/*        // Version 1 endpoints
/api/v2/auth/*        // Version 2 endpoints
```

---

## 🔒 Security Implementation

### Authentication Flow
```javascript
// JWT Token Structure
{
  header: {
    "alg": "HS256",
    "typ": "JWT"
  },
  payload: {
    "id": "user_id",
    "email": "user@example.com",
    "role": "student",
    "iat": 1640995200,
    "exp": 1641081600
  }
}
```

### Middleware Security Chain
```javascript
// Authentication Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Role-based Authorization
const roleCheck = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
};
```

### Password Security
```javascript
// Password Hashing (Pre-save Hook)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
```

### CORS Configuration
```javascript
// Cross-Origin Resource Sharing
app.use(cors({
  origin: [
    'https://kiit-lms.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
```

---

## 📁 File Management System

### Upload Configuration
```javascript
// File Upload Middleware
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  abortOnLimit: true,
  useTempFiles: false,
  debug: false,
  parseNested: true
}));
```

### Storage Strategy
```javascript
// Multi-tier Storage
1. Temporary Storage: /tmp directory for processing
2. Local Storage: /uploads directory for development
3. Cloud Storage: AWS S3 for production
4. CDN: CloudFront for global content delivery
```

### File Processing Pipeline
```
Upload → Validation → Virus Scan → Processing → Storage → URL Generation
   ↓         ↓           ↓           ↓          ↓           ↑
Error ←── Error ←── Error ←── Error ←── Error ←── Success
```

---

## ⚡ Performance Considerations

### Database Optimization
```javascript
// Connection Pooling
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,        // Maximum connections
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0
});
```

### Caching Strategy
```javascript
// Recommended Caching Layers
1. Application Cache: In-memory caching for frequently accessed data
2. Database Cache: MongoDB built-in caching
3. CDN Cache: Static asset caching
4. Browser Cache: Client-side caching headers
```

### Query Optimization
```javascript
// Efficient Database Queries
// Good: Use projection to limit fields
User.find({}, 'name email role').limit(10);

// Good: Use indexes for filtering
Course.find({ teacher: teacherId }).populate('teacher', 'name email');

// Avoid: N+1 query problems
// Use populate() instead of multiple queries
```

### Memory Management
```javascript
// Large File Handling
// Stream processing for large files
const stream = fs.createReadStream(filePath);
stream.pipe(parser).pipe(processor);

// Garbage collection optimization
global.gc && global.gc(); // Force garbage collection if available
```

---

## 🚀 Deployment Strategy

### Environment Configuration
```javascript
// Environment Variables
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lms
JWT_SECRET=your_secret_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

### Serverless Deployment (Vercel)
```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.js"
    }
  ]
}
```

### Container Deployment (Docker)
```dockerfile
# Dockerfile (Recommended for production)
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

### Load Balancing
```javascript
// Horizontal Scaling Strategy
1. Multiple server instances behind load balancer
2. Database clustering for high availability
3. CDN for static asset delivery
4. Auto-scaling based on CPU/memory usage
```

---

## 📊 Monitoring & Logging

### Application Monitoring
```javascript
// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### Error Handling
```javascript
// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Log error details
  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({ error: 'Internal Server Error' });
});
```

### Performance Metrics
```javascript
// Key Performance Indicators
1. Response Time: API endpoint response times
2. Throughput: Requests per second
3. Error Rate: Percentage of failed requests
4. Database Performance: Query execution times
5. Memory Usage: Heap and RSS memory consumption
6. CPU Usage: Server CPU utilization
```

---

## 🔧 Development Guidelines

### Code Structure
```
src/
├── controllers/     # Business logic
├── models/         # Database schemas
├── routes/         # API endpoints
├── middleware/     # Custom middleware
├── utils/          # Helper functions
├── config/         # Configuration files
└── tests/          # Unit and integration tests
```

### Coding Standards
```javascript
// Naming Conventions
- Variables: camelCase (e.g., userName)
- Functions: camelCase (e.g., getUserById)
- Constants: UPPER_CASE (e.g., MAX_FILE_SIZE)
- Classes: PascalCase (e.g., UserController)
- Files: camelCase (e.g., userController.js)

// Error Handling Pattern
try {
  const result = await someAsyncOperation();
  res.status(200).json({ success: true, data: result });
} catch (error) {
  console.error('Operation failed:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Operation failed',
    message: error.message 
  });
}
```

### Testing Strategy
```javascript
// Recommended Testing Approach
1. Unit Tests: Individual function testing
2. Integration Tests: API endpoint testing
3. Load Tests: Performance under stress
4. Security Tests: Vulnerability assessment

// Testing Tools (Recommended)
- Jest: Unit testing framework
- Supertest: HTTP assertion library
- MongoDB Memory Server: In-memory database for tests
```

---

## 📈 Scalability Roadmap

### Current Architecture Limitations
- Single server instance
- No caching layer
- Limited concurrent connections
- Basic error handling

### Scalability Improvements
```javascript
// Phase 1: Basic Optimization
1. Add Redis caching layer
2. Implement connection pooling
3. Add comprehensive logging
4. Optimize database queries

// Phase 2: Horizontal Scaling
1. Load balancer implementation
2. Multiple server instances
3. Database clustering
4. CDN integration

// Phase 3: Advanced Architecture
1. Microservices architecture
2. Message queue system
3. Advanced monitoring
4. Auto-scaling infrastructure
```

---

## 📞 Technical Support

### Development Environment Setup
```bash
# Quick Setup Commands
git clone <repository>
cd lms-backend
npm install
cp .env.example .env
npm run dev
```

### Common Issues & Solutions
```javascript
// MongoDB Connection Issues
- Check MONGODB_URI format
- Verify network connectivity
- Ensure MongoDB service is running

// JWT Token Issues
- Verify JWT_SECRET is set
- Check token expiration time
- Validate Authorization header format

// File Upload Issues
- Check file size limits
- Verify upload directory permissions
- Ensure adequate disk space
```

### Performance Optimization
```javascript
// Database Query Optimization
1. Use indexes for frequently queried fields
2. Limit returned fields with projection
3. Use aggregation pipeline for complex queries
4. Implement pagination for large result sets

// Memory Optimization
1. Avoid loading large datasets into memory
2. Use streaming for file processing
3. Implement proper garbage collection
4. Monitor memory leaks
```

---

This technical architecture document provides a comprehensive overview of the system's technical implementation. For business-oriented information, refer to COMPANY_OVERVIEW.md, and for setup instructions, see SETUP_GUIDE.md.
