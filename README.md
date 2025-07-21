# Learning Management System (LMS) Backend

A comprehensive backend API for an education management system built with Node.js, Express, and MongoDB. This system supports role-based access control for administrators, teachers, and students with features for course management, assignments, discussions, e-content delivery, and more.

## 📋 Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Database Models](#database-models)
- [API Endpoints](#api-endpoints)
- [Authentication & Authorization](#authentication--authorization)
- [File Upload System](#file-upload-system)
- [Deployment](#deployment)
- [Contributing](#contributing)

## 🚀 Features

### Core Functionality
- **Multi-role Authentication**: Admin, Teacher, and Student roles with JWT-based auth
- **Course Management**: Complete CRUD operations for courses with enrollment system
- **Assignment System**: Create, submit, and grade assignments
- **Discussion Forums**: Course-based discussion threads and replies
- **E-Content Management**: Upload and manage educational content
- **Lecture Management**: Schedule and manage lectures with recordings
- **Event Calendar**: Academic events and scheduling
- **Announcements**: System-wide and course-specific announcements
- **Semester Management**: Academic semester organization
- **Attendance Tracking**: Course-based attendance management
- **Syllabus Management**: Detailed syllabus with weekly plans and outcomes

### Administrative Features
- **Bulk User Import**: Excel file-based user registration
- **Student-Teacher Assignment**: Hierarchical student management
- **Course Scheduling**: Time-table and schedule management
- **Credit Points System**: Academic credit tracking
- **Activity Tracking**: Student activity monitoring

## 🛠 Technology Stack

- **Backend Framework**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT)
- **File Processing**: 
  - Multer for file uploads
  - XLSX for Excel parsing
  - AWS SDK for cloud storage
- **Security**: 
  - bcryptjs for password hashing
  - CORS for cross-origin requests
  - Role-based access control
- **Validation**: Joi for data validation
- **Development**: Nodemon for hot reload

## 📁 Project Structure

```
education-system/
├── config/
│   └── database.js              # MongoDB connection configuration
├── controllers/                 # Business logic controllers
│   ├── authController.js        # Authentication logic
│   ├── courseController.js      # Course management
│   ├── studentController.js     # Student operations
│   ├── teacherController.js     # Teacher operations
│   ├── assignmentController.js  # Assignment handling
│   ├── discussionController.js  # Discussion forums
│   ├── econtentController.js    # E-content management
│   ├── lectureController.js     # Lecture management
│   ├── announcementController.js# Announcements
│   ├── eventController.js       # Event management
│   ├── syllabusController.js    # Syllabus operations
│   ├── semesterController.js    # Semester management
│   ├── activityController.js    # Activity tracking
│   ├── adminController.js       # Admin operations
│   └── getStudentsController.js # Student retrieval
├── middleware/
│   ├── auth.js                  # JWT authentication middleware
│   ├── roleCheck.js             # Role-based access control
│   ├── upload.js                # File upload middleware
│   ├── errorHandler.js          # Global error handling
│   └── catchAsyncErrors.js      # Async error wrapper
├── models/                      # MongoDB schema definitions
│   ├── User.js                  # Base user model
│   ├── Student.js               # Student-specific data
│   ├── Teacher.js               # Teacher-specific data
│   ├── Course.js                # Course information
│   ├── Assignment.js            # Assignment structure
│   ├── Discussion.js            # Discussion threads
│   ├── EContent.js              # Educational content
│   ├── Lecture.js               # Lecture details
│   ├── Announcement.js          # Announcements
│   ├── Event.js                 # Calendar events
│   ├── Semester.js              # Academic semesters
│   ├── Activity.js              # Student activities
│   ├── CourseSyllabus.js        # Detailed syllabus
│   ├── CourseSchedule.js        # Course scheduling
│   ├── CourseOutcome.js         # Learning outcomes
│   ├── CourseAttendance.js      # Attendance tracking
│   ├── CreditPoints.js          # Credit system
│   └── WeeklyPlan.js            # Weekly course plans
├── routes/                      # API route definitions
│   ├── auth.js                  # Authentication routes
│   ├── courses.js               # Course-related endpoints
│   ├── students.js              # Student management
│   ├── teachers.js              # Teacher operations
│   ├── assignment.js            # Assignment endpoints
│   ├── discussion.js            # Discussion forums
│   ├── econtent.js              # E-content routes
│   ├── lecture.js               # Lecture management
│   ├── announcement.js          # Announcement routes
│   ├── event.js                 # Event management
│   ├── semester.js              # Semester operations
│   ├── syllabus.js              # Syllabus routes
│   ├── activity.js              # Activity tracking
│   ├── admin.js                 # Admin operations
│   └── getStudents.js           # Student retrieval
├── utils/
│   ├── excelParser.js           # Excel file processing
│   ├── s3Config.js              # AWS S3 configuration
│   └── validation.js            # Data validation utilities
├── uploads/                     # Temporary file storage
├── tmp/                         # Temporary processing files
├── index.js                     # Application entry point
├── package.json                 # Dependencies and scripts
└── vercel.json                  # Deployment configuration
```

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn package manager

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd education-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with the following variables:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/lms_database
   JWT_SECRET=your_jwt_secret_key_here
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_S3_BUCKET_NAME=your_s3_bucket_name
   AWS_REGION=your_aws_region
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Start the production server**
   ```bash
   npm start
   ```

The server will start on `http://localhost:3000` (or the port specified in your environment variables).

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port number | No (default: 3000) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | Secret key for JWT token generation | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key for S3 storage | Yes (if using S3) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 storage | Yes (if using S3) |
| `AWS_S3_BUCKET_NAME` | S3 bucket name for file storage | Yes (if using S3) |
| `AWS_REGION` | AWS region for S3 bucket | Yes (if using S3) |

## 🗄️ Database Models

### Core Models

#### User Model
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (required, hashed),
  role: Enum ["admin", "teacher", "student"] (required),
  timestamps: true
}
```

#### Student Model
```javascript
{
  user: ObjectId (ref: User, required),
  teacher: ObjectId (ref: Teacher, required),
  courses: [ObjectId] (ref: Course),
  teacherEmail: String (required, indexed),
  timestamps: true
}
```

#### Teacher Model
```javascript
{
  user: ObjectId (ref: User, required),
  courses: [ObjectId] (ref: Course),
  email: String (required, unique, indexed),
  timestamps: true
}
```

#### Course Model
```javascript
{
  title: String (required),
  aboutCourse: String (required),
  semester: ObjectId (ref: Semester, required),
  teacher: ObjectId (ref: Teacher, required),
  lectures: [Object],
  outcomes: ObjectId (ref: CourseOutcome),
  schedule: ObjectId (ref: CourseSchedule),
  syllabus: ObjectId (ref: CourseSyllabus),
  weeklyPlan: ObjectId (ref: WeeklyPlan),
  creditPoints: ObjectId (ref: CreditPoints),
  attendance: ObjectId (ref: CourseAttendance),
  assignments: [ObjectId] (ref: Assignment),
  timestamps: true
}
```

### Extended Models
- **Assignment**: Assignment details, submissions, and grading
- **Discussion**: Forum threads with nested replies
- **EContent**: Educational content with file attachments
- **Lecture**: Scheduled lectures with recordings
- **Announcement**: System and course announcements
- **Event**: Calendar events and scheduling
- **Semester**: Academic semester management
- **Activity**: Student activity tracking
- **CourseSyllabus**: Detailed course syllabus
- **CourseSchedule**: Time-table management
- **CourseOutcome**: Learning outcomes
- **CourseAttendance**: Attendance tracking
- **CreditPoints**: Academic credit system
- **WeeklyPlan**: Weekly course planning

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Course Management
- `GET /api/courses` - Get user courses
- `GET /api/courses/student` - Get enrolled courses (students)
- `GET /api/courses/:courseId` - Get specific course
- `POST /api/courses` - Create new course (teachers)
- `PUT /api/courses/:courseId` - Update course (teachers)
- `DELETE /api/courses/:courseId` - Delete course (teachers)

### Student Management
- `GET /api/students` - Get students (teachers/admin)
- `POST /api/students` - Create student (admin)
- `PUT /api/students/:id` - Update student (admin)
- `DELETE /api/students/:id` - Delete student (admin)

### Teacher Management
- `GET /api/teachers` - Get teachers (admin)
- `POST /api/teachers` - Create teacher (admin)
- `PUT /api/teachers/:id` - Update teacher (admin)
- `DELETE /api/teachers/:id` - Delete teacher (admin)

### Assignment System
- `GET /api/assignment/course/:courseId` - Get course assignments
- `POST /api/assignment` - Create assignment (teachers)
- `PUT /api/assignment/:id` - Update assignment (teachers)
- `DELETE /api/assignment/:id` - Delete assignment (teachers)

### Discussion Forums
- `GET /api/discussion/course/:courseId` - Get course discussions
- `POST /api/discussion` - Create discussion thread
- `POST /api/discussion/:id/reply` - Reply to discussion
- `PUT /api/discussion/:id` - Update discussion
- `DELETE /api/discussion/:id` - Delete discussion

### E-Content Management
- `GET /api/econtent/course/:courseId` - Get course content
- `POST /api/econtent` - Upload content (teachers)
- `PUT /api/econtent/:id` - Update content (teachers)
- `DELETE /api/econtent/:id` - Delete content (teachers)

### Additional Endpoints
- **Lectures**: `/api/lectures/*` - Lecture management
- **Announcements**: `/api/announcement/*` - Announcement system
- **Events**: `/api/events/*` - Event management
- **Semesters**: `/api/semesters/*` - Semester operations
- **Syllabus**: `/api/syllabus/*` - Syllabus management
- **Activities**: `/api/activity/*` - Activity tracking
- **Admin**: `/api/admin/*` - Administrative operations

## 🔐 Authentication & Authorization

### JWT Authentication
The system uses JSON Web Tokens for stateless authentication:

1. **Registration/Login**: Users receive a JWT token valid for 24 hours
2. **Token Usage**: Include token in Authorization header: `Bearer <token>`
3. **Token Verification**: Middleware validates tokens on protected routes

### Role-Based Access Control
Three distinct user roles with hierarchical permissions:

#### Admin
- Full system access
- User management (create, update, delete)
- Bulk user import via Excel
- System-wide announcements
- All teacher and student permissions

#### Teacher
- Course creation and management
- Student enrollment in their courses
- Assignment creation and grading
- Lecture scheduling and content upload
- Discussion moderation
- Course-specific announcements

#### Student
- View enrolled courses
- Submit assignments
- Participate in discussions
- Access course content and lectures
- View personal activity and grades

### Protected Routes
All API endpoints (except registration/login) require authentication. Role-specific endpoints are protected by `roleCheck` middleware.

## 📁 File Upload System

### Supported Operations
- **Excel Import**: Bulk user registration via Excel files
- **Content Upload**: Educational materials (PDFs, videos, documents)
- **Assignment Submissions**: Student file submissions
- **Profile Pictures**: User avatar uploads

### Upload Configuration
- **File Size Limit**: 2GB for large educational content
- **Supported Formats**: Excel, PDF, images, videos, documents
- **Storage Options**: 
  - Local temporary storage for processing
  - AWS S3 for permanent storage
  - In-memory processing for Excel files

### Security Features
- File type validation
- Size limit enforcement
- Virus scanning (configurable)
- Secure file naming
- Access control per file type

## 🚀 Deployment

### Vercel Deployment
The project includes `vercel.json` configuration for serverless deployment:

```json
{
  "functions": {
    "index.js": {
      "maxDuration": 30
    }
  }
}
```

### Environment Setup for Production
1. Set up MongoDB Atlas or production MongoDB instance
2. Configure AWS S3 bucket for file storage
3. Set production environment variables
4. Update CORS settings for production domains
5. Configure SSL certificates

### Database Considerations
- Enable MongoDB indexes for performance
- Set up database backups
- Configure connection pooling
- Monitor database performance

## 🧪 Testing

### Manual Testing
Use tools like Postman or Insomnia to test API endpoints:

1. **Authentication Flow**:
   - Register new users
   - Login and obtain JWT tokens
   - Test role-based access

2. **Course Management**:
   - Create courses as teacher
   - Enroll students
   - Test CRUD operations

3. **File Upload**:
   - Test Excel import functionality
   - Upload various file types
   - Verify S3 storage integration

## 📝 Contributing

### Development Guidelines
1. Follow existing code structure and naming conventions
2. Add proper error handling and validation
3. Include appropriate middleware for new routes
4. Test thoroughly before submitting changes
5. Update documentation for new features

### Code Style
- Use consistent indentation (2 spaces)
- Follow RESTful API design principles
- Include comprehensive error messages
- Add comments for complex business logic

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Issues**:
   - Verify MONGODB_URI in environment variables
   - Check network connectivity
   - Ensure MongoDB service is running

2. **JWT Token Errors**:
   - Verify JWT_SECRET is set
   - Check token expiration
   - Ensure proper Authorization header format

3. **File Upload Issues**:
   - Check file size limits
   - Verify AWS credentials
   - Ensure S3 bucket permissions

4. **Role Permission Errors**:
   - Verify user role in database
   - Check role-specific route access
   - Confirm JWT payload includes correct user data

## 📞 Support

For issues, questions, or contributions, please refer to the project repository or contact the development team.

---

**Note**: This is a backend API system. For complete functionality, pair with a compatible frontend application that can consume these REST APIs. 