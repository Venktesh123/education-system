# LMS User Flow Diagram

```mermaid
flowchart TD
    A[User Visits LMS] --> B{User Registered?}
    
    B -->|No| C[Registration Page]
    C --> D[Select Role: Student/Teacher/Admin]
    D --> E[Fill Registration Form]
    E --> F[Submit Registration]
    F --> G[Account Created]
    G --> H[Login Page]
    
    B -->|Yes| H[Login Page]
    H --> I[Enter Credentials]
    I --> J{Authentication Valid?}
    
    J -->|No| K[Show Error Message]
    K --> H
    
    J -->|Yes| L{User Role?}
    
    %% Admin Flow
    L -->|Admin| M[Admin Dashboard]
    M --> N[Manage Users]
    M --> O[System Settings]
    M --> P[View Reports]
    
    %% Teacher Flow
    L -->|Teacher| Q[Teacher Dashboard]
    Q --> R[Course Management]
    Q --> S[Assignment Management]
    Q --> T[Student Management]
    Q --> U[Content Management]
    
    %% Course Management (Teacher)
    R --> R1[Create Course]
    R --> R2[View My Courses]
    R --> R3[Update Course]
    R --> R4[Delete Course]
    R --> R5[Manage Course Attendance]
    
    R2 --> R6[Select Course]
    R6 --> R7[Course Details]
    R7 --> R8[Manage Modules & Lectures]
    R7 --> R9[View Enrolled Students]
    R7 --> R10[Course Syllabus]
    
    %% Lecture Management
    R8 --> L1[Create Module]
    R8 --> L2[Create Lecture]
    R8 --> L3[Upload Content]
    R8 --> L4[Reorder Lectures]
    
    %% Assignment Management (Teacher)
    S --> S1[Create Assignment]
    S --> S2[View Assignments]
    S --> S3[Grade Submissions]
    S --> S4[Update Assignment]
    S --> S5[Delete Assignment]
    
    S2 --> S6[Select Assignment]
    S6 --> S7[View Submissions]
    S7 --> S8[Grade Individual Submission]
    
    %% Content Management (Teacher)
    U --> U1[Upload E-Content]
    U --> U2[Manage Announcements]
    U --> U3[Create Discussion Topics]
    U --> U4[Manage Events]
    U --> U5[Weekly Plans]
    
    %% Student Flow
    L -->|Student| V[Student Dashboard]
    V --> W[Browse Courses]
    V --> X[My Enrolled Courses]
    V --> Y[Assignments]
    V --> Z[Discussions]
    V --> AA[Announcements]
    V --> BB[Events]
    
    %% Course Browsing & Enrollment (Student)
    W --> W1[View Available Courses]
    W1 --> W2[Course Details]
    W2 --> W3{Enroll in Course?}
    W3 -->|Yes| W4[Enroll in Course]
    W4 --> W5[Course Added to My Courses]
    W3 -->|No| W1
    
    %% My Courses (Student)
    X --> X1[Select Course]
    X1 --> X2[Course Content]
    X2 --> X3[View Lectures]
    X2 --> X4[Download Materials]
    X2 --> X5[View Syllabus]
    X2 --> X6[Check Attendance]
    
    X3 --> X7[Watch/Read Lecture]
    X7 --> X8[Mark as Complete]
    
    %% Assignments (Student)
    Y --> Y1[View Pending Assignments]
    Y --> Y2[View Submitted Assignments]
    Y --> Y3[View Graded Assignments]
    
    Y1 --> Y4[Select Assignment]
    Y4 --> Y5[Read Instructions]
    Y5 --> Y6[Upload Solution]
    Y6 --> Y7[Submit Assignment]
    Y7 --> Y8[Assignment Submitted]
    
    %% Discussions (Student)
    Z --> Z1[Browse Discussion Topics]
    Z --> Z2[Search Discussions]
    Z1 --> Z3[Select Topic]
    Z3 --> Z4[Read Posts]
    Z4 --> Z5[Reply to Discussion]
    Z4 --> Z6[Create New Post]
    
    %% Common Activities
    AA --> AA1[View Latest Announcements]
    BB --> BB1[View Upcoming Events]
    
    %% Activity Tracking
    X8 --> AC[Activity Logged]
    Y8 --> AC
    Z5 --> AC
    Z6 --> AC
    S8 --> AC
    
    AC --> AD[Update User Activity]
    AD --> AE[Generate Reports]
    
    %% Logout
    Q --> LOGOUT[Logout]
    V --> LOGOUT
    M --> LOGOUT
    LOGOUT --> H
    
    %% Error Handling
    F --> |Error| F1[Registration Failed]
    F1 --> C
    
    W4 --> |Error| W6[Enrollment Failed]
    W6 --> W2
    
    Y7 --> |Error| Y9[Submission Failed]
    Y9 --> Y5
    
    %% File Upload Flows
    L2 --> L5{Upload Content?}
    L5 -->|Yes| L6[Select Files]
    L6 --> L7[Upload Files < 200MB]
    L7 --> L8{Upload Success?}
    L8 -->|Yes| L9[Content Saved]
    L8 -->|No| L10[Upload Failed]
    L10 --> L6
    L5 -->|No| L9
    
    Y6 --> Y10[Select Assignment Files]
    Y10 --> Y11[Upload Files < 200MB]
    Y11 --> Y12{Upload Success?}
    Y12 -->|Yes| Y7
    Y12 -->|No| Y13[Upload Failed]
    Y13 --> Y10

    %% Styling
    classDef userAction fill:#e1f5fe
    classDef decision fill:#fff3e0
    classDef process fill:#f3e5f5
    classDef error fill:#ffebee
    classDef success fill:#e8f5e8
    
    class A,C,E,H,I,W1,W2,X1,Y4,Y5,Z3,Z4 userAction
    class B,J,L,W3,L5,L8,Y12 decision
    class F,G,R1,S1,W4,Y7,Y8,L9,AC,AD process
    class K,F1,W6,Y9,L10,Y13 error
    class W5,X8,AE success
```

## User Flow Summary

This diagram represents the comprehensive user flows for the Learning Management System with three main user types:

### 1. **Admin Users**
- System administration
- User management
- Reports and analytics

### 2. **Teacher Users**
- Course creation and management
- Module and lecture organization
- Assignment creation and grading
- Student progress tracking
- Content upload and management
- Discussion forum moderation

### 3. **Student Users**
- Course browsing and enrollment
- Lecture viewing and learning
- Assignment submission
- Discussion participation
- Progress tracking

### Key Features Covered:
- **Authentication & Authorization**: Role-based access control
- **Course Management**: Full CRUD operations for courses
- **Content Delivery**: Lectures, modules, e-content
- **Assignment System**: Creation, submission, and grading workflow
- **Discussion Forums**: Teacher-student and peer interactions
- **File Upload**: Support for large files (up to 200MB)
- **Activity Tracking**: User engagement monitoring
- **Error Handling**: Graceful failure recovery

The flow includes proper error handling, file upload limitations, and role-based access controls as implemented in the backend system.