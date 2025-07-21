# Quick Setup Guide

This guide will help you get the LMS Backend system running on your local machine in under 10 minutes.

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] Node.js (v14 or higher) installed
- [ ] MongoDB running locally or MongoDB Atlas account
- [ ] Git installed
- [ ] Code editor (VS Code recommended)

## Step-by-Step Setup

### 1. Clone and Install Dependencies
```bash
# Clone the repository
git clone <your-repository-url>
cd education-system

# Install dependencies
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/lms_database

# JWT Security
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# AWS S3 (Optional - for file uploads)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET_NAME=your_bucket_name
AWS_REGION=us-east-1
```

### 3. Database Setup

#### Option A: Local MongoDB
```bash
# Start MongoDB service
sudo systemctl start mongod  # Linux
brew services start mongodb  # macOS
```

#### Option B: MongoDB Atlas (Cloud)
1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a cluster
3. Get connection string and replace in `.env`

### 4. Start the Server
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

You should see:
```
Server is running on port 3000
MongoDB connected successfully
```

### 5. Test the Setup
Open your browser or API client and test:
```
GET http://localhost:3000/
```
Should return: `<h1>Backend Working</h1>`

## Quick Test with Sample Data

### Create Admin User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@example.com",
    "password": "admin123",
    "role": "admin"
  }'
```

### Login and Get Token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

Save the returned token for subsequent API calls.

### Create a Teacher
```bash
curl -X POST http://localhost:3000/api/teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "John Teacher",
    "email": "teacher@example.com",
    "password": "teacher123"
  }'
```

## File Upload Setup (Optional)

### For Local File Storage
Files will be stored in the `uploads/` directory automatically.

### For AWS S3 Storage
1. Create an S3 bucket
2. Create IAM user with S3 access
3. Add credentials to `.env` file
4. Test file upload endpoints

## Common Issues & Solutions

### Issue: MongoDB Connection Failed
**Solution:**
- Check if MongoDB is running: `sudo systemctl status mongod`
- Verify connection string in `.env`
- For Atlas, check network access settings

### Issue: JWT Token Errors
**Solution:**
- Ensure `JWT_SECRET` is set in `.env`
- Check token format: `Bearer <token>`
- Verify token hasn't expired (24h default)

### Issue: File Upload Errors
**Solution:**
- Check file size limits (2GB max)
- Verify AWS credentials if using S3
- Ensure `uploads/` directory exists

### Issue: Port Already in Use
**Solution:**
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change port in .env file
PORT=3001
```

## Development Workflow

### 1. Project Structure Understanding
```
├── controllers/     # Business logic
├── models/         # Database schemas
├── routes/         # API endpoints
├── middleware/     # Authentication, validation
├── utils/          # Helper functions
└── config/         # Database connection
```

### 2. Making Changes
1. Modify controllers for business logic
2. Update models for database changes
3. Add routes for new endpoints
4. Test with Postman/Thunder Client

### 3. Database Operations
```bash
# Connect to MongoDB shell
mongo lms_database

# View collections
show collections

# View users
db.users.find()

# Clear database (development only)
db.dropDatabase()
```

## Production Deployment Checklist

Before deploying to production:
- [ ] Change default JWT secret
- [ ] Set up production MongoDB
- [ ] Configure CORS for your frontend domain
- [ ] Set up SSL certificates
- [ ] Configure environment variables
- [ ] Set up file storage (S3 recommended)
- [ ] Enable error logging
- [ ] Set up database backups

## API Testing

### Recommended Tools
- **Postman**: Full-featured API testing
- **Thunder Client**: VS Code extension
- **Insomnia**: Lightweight alternative

### Sample Postman Collection
Import this collection to test all endpoints:
```json
{
  "info": {
    "name": "LMS Backend API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api"
    },
    {
      "key": "authToken",
      "value": ""
    }
  ]
}
```

## Need Help?

1. Check the [README.md](./README.md) for comprehensive documentation
2. Review [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for endpoint details
3. Look at controller files for implementation examples
4. Check the middleware files for authentication logic

## Next Steps

Once you have the backend running:
1. Set up the frontend application
2. Configure the frontend to connect to this backend
3. Test the complete user flow
4. Set up proper production deployment

---

**Happy Coding! 🚀** 