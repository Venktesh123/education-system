# API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Response Format
All API responses follow this format:
```json
{
  "success": true/false,
  "data": {},
  "message": "Response message",
  "error": "Error message (if any)"
}
```

---

## 🔐 Authentication Endpoints

### Register User
- **URL**: `/auth/register`
- **Method**: `POST`
- **Auth Required**: No

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "student"
}
```

**Response:**
```json
{
  "user": {
    "_id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "student"
  },
  "token": "jwt_token_here"
}
```

### Login User
- **URL**: `/auth/login`
- **Method**: `POST`
- **Auth Required**: No

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

---

## 📚 Course Endpoints

### Get User Courses
- **URL**: `/courses`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

**Response:**
```json
{
  "courses": [
    {
      "_id": "course_id",
      "title": "Mathematics 101",
      "aboutCourse": "Basic mathematics course",
      "semester": "semester_id",
      "teacher": "teacher_id"
    }
  ]
}
```

### Get Course by ID
- **URL**: `/courses/:courseId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

### Create Course
- **URL**: `/courses`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher

**Request Body:**
```json
{
  "title": "Physics 101",
  "aboutCourse": "Introduction to Physics",
  "semester": "semester_id"
}
```

### Update Course
- **URL**: `/courses/:courseId`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher

### Delete Course
- **URL**: `/courses/:courseId`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher

---

## 👨‍🎓 Student Endpoints

### Get All Students
- **URL**: `/students`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, admin

### Create Student
- **URL**: `/students`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: admin

**Request Body:**
```json
{
  "name": "Student Name",
  "email": "student@example.com",
  "password": "password123",
  "teacherId": "teacher_object_id"
}
```

### Update Student
- **URL**: `/students/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: admin

### Delete Student
- **URL**: `/students/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: admin

### Get Students by Teacher
- **URL**: `/students/teacher/:teacherId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, admin

---

## 👨‍🏫 Teacher Endpoints

### Get All Teachers
- **URL**: `/teachers`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: admin

### Create Teacher
- **URL**: `/teachers`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: admin

**Request Body:**
```json
{
  "name": "Teacher Name",
  "email": "teacher@example.com",
  "password": "password123"
}
```

### Update Teacher
- **URL**: `/teachers/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: admin

### Delete Teacher
- **URL**: `/teachers/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: admin

---

## 📝 Assignment Endpoints

### Get Course Assignments
- **URL**: `/assignment/course/:courseId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

### Create Assignment
- **URL**: `/assignment`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher

**Request Body:**
```json
{
  "title": "Assignment 1",
  "description": "Complete the exercises",
  "course": "course_id",
  "dueDate": "2024-12-31T23:59:59Z",
  "maxMarks": 100
}
```

### Update Assignment
- **URL**: `/assignment/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher

### Delete Assignment
- **URL**: `/assignment/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher

### Submit Assignment
- **URL**: `/assignment/:id/submit`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: student

---

## 💬 Discussion Endpoints

### Get Course Discussions
- **URL**: `/discussion/course/:courseId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

### Create Discussion Thread
- **URL**: `/discussion`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher, student

**Request Body:**
```json
{
  "title": "Discussion Topic",
  "content": "Discussion content",
  "course": "course_id"
}
```

### Reply to Discussion
- **URL**: `/discussion/:id/reply`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher, student

**Request Body:**
```json
{
  "content": "Reply content"
}
```

### Update Discussion
- **URL**: `/discussion/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher, student (own posts only)

### Delete Discussion
- **URL**: `/discussion/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher, student (own posts only)

---

## 📖 E-Content Endpoints

### Get Course Content
- **URL**: `/econtent/course/:courseId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

### Upload Content
- **URL**: `/econtent`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher
- **Content-Type**: `multipart/form-data`

**Request Body:**
```json
{
  "title": "Lecture Notes",
  "description": "Chapter 1 notes",
  "course": "course_id",
  "files": [file1, file2]
}
```

### Update Content
- **URL**: `/econtent/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher

### Delete Content
- **URL**: `/econtent/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher

---

## 🎓 Lecture Endpoints

### Get Course Lectures
- **URL**: `/lectures/course/:courseId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

### Create Lecture
- **URL**: `/lectures`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher

**Request Body:**
```json
{
  "title": "Lecture 1",
  "description": "Introduction to the subject",
  "course": "course_id",
  "scheduledDate": "2024-02-01T10:00:00Z",
  "duration": 60,
  "recordingUrl": "https://example.com/recording"
}
```

### Update Lecture
- **URL**: `/lectures/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher

### Delete Lecture
- **URL**: `/lectures/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher

---

## 📢 Announcement Endpoints

### Get Announcements
- **URL**: `/announcement`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student, admin

### Create Announcement
- **URL**: `/announcement`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher, admin

**Request Body:**
```json
{
  "title": "Important Notice",
  "content": "Announcement content",
  "course": "course_id",
  "priority": "high"
}
```

### Update Announcement
- **URL**: `/announcement/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher, admin

### Delete Announcement
- **URL**: `/announcement/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher, admin

---

## 📅 Event Endpoints

### Get Events
- **URL**: `/events`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student, admin

### Create Event
- **URL**: `/events`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher, admin

**Request Body:**
```json
{
  "title": "Exam Schedule",
  "description": "Mid-term examination",
  "startDate": "2024-03-01T09:00:00Z",
  "endDate": "2024-03-01T12:00:00Z",
  "course": "course_id"
}
```

### Update Event
- **URL**: `/events/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: teacher, admin

### Delete Event
- **URL**: `/events/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: teacher, admin

---

## 📚 Semester Endpoints

### Get Semesters
- **URL**: `/semesters`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student, admin

### Create Semester
- **URL**: `/semesters`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: admin

**Request Body:**
```json
{
  "name": "Spring 2024",
  "startDate": "2024-01-15T00:00:00Z",
  "endDate": "2024-05-15T00:00:00Z",
  "isActive": true
}
```

### Update Semester
- **URL**: `/semesters/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Roles**: admin

### Delete Semester
- **URL**: `/semesters/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Roles**: admin

---

## 📄 Syllabus Endpoints

### Get Course Syllabus
- **URL**: `/syllabus/course/:courseId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student

### Create/Update Syllabus
- **URL**: `/syllabus`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: teacher

**Request Body:**
```json
{
  "course": "course_id",
  "objectives": ["Objective 1", "Objective 2"],
  "outcomes": ["Outcome 1", "Outcome 2"],
  "weeklyPlan": [
    {
      "week": 1,
      "topics": ["Topic 1", "Topic 2"],
      "activities": ["Activity 1"]
    }
  ],
  "assessmentCriteria": "Assessment details",
  "references": ["Reference 1", "Reference 2"]
}
```

---

## 📊 Activity Endpoints

### Get Student Activities
- **URL**: `/activity/student/:studentId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: teacher, student, admin

### Log Activity
- **URL**: `/activity`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: student

**Request Body:**
```json
{
  "type": "assignment_submission",
  "description": "Submitted assignment 1",
  "course": "course_id",
  "metadata": {}
}
```

---

## 👑 Admin Endpoints

### Bulk Import Users
- **URL**: `/admin/import-users`
- **Method**: `POST`
- **Auth Required**: Yes
- **Roles**: admin
- **Content-Type**: `multipart/form-data`

**Request Body:**
- Excel file with columns: name, email, password, role, teacherEmail (for students)

### Get System Statistics
- **URL**: `/admin/stats`
- **Method**: `GET`
- **Auth Required**: Yes
- **Roles**: admin

**Response:**
```json
{
  "totalUsers": 150,
  "totalCourses": 25,
  "totalStudents": 120,
  "totalTeachers": 28,
  "activeAnnouncements": 5
}
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

## Error Response Format
```json
{
  "error": "Error description",
  "message": "Detailed error message",
  "statusCode": 400
}
``` 