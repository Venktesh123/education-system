# Deployment & Operations Guide

## 🚀 Production Deployment Guide

This comprehensive guide covers production deployment, monitoring, maintenance, and operational procedures for the Learning Management System (LMS) backend.

## 📋 Table of Contents
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Production Environment Setup](#production-environment-setup)
- [Deployment Strategies](#deployment-strategies)
- [Monitoring & Alerting](#monitoring--alerting)
- [Backup & Recovery](#backup--recovery)
- [Security Operations](#security-operations)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting Guide](#troubleshooting-guide)

---

## ✅ Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] **Server Specifications**
  - CPU: 2-4 cores minimum (4-8 cores recommended)
  - RAM: 4GB minimum (8GB recommended)
  - Storage: 100GB minimum (SSD preferred)
  - Network: 1Gbps connection minimum

- [ ] **Database Setup**
  - MongoDB 4.4+ installed and configured
  - Database user with appropriate permissions
  - Indexes created for performance optimization
  - Backup strategy implemented

- [ ] **External Services**
  - AWS S3 bucket configured (or alternative storage)
  - SMTP service for email notifications
  - SSL certificate obtained and configured
  - Domain name configured with DNS

### Security Checklist
- [ ] **Environment Variables**
  - JWT_SECRET: Strong, unique secret key
  - MONGODB_URI: Secure connection string
  - AWS credentials: Limited permissions
  - All sensitive data moved to environment variables

- [ ] **Network Security**
  - Firewall configured (ports 80, 443, 22 only)
  - SSH key-based authentication
  - Fail2ban or similar intrusion prevention
  - SSL/TLS certificates installed

- [ ] **Application Security**
  - CORS origins properly configured
  - Rate limiting implemented
  - Input validation enabled
  - Security headers configured

---

## 🏗 Production Environment Setup

### Option 1: Traditional Server Deployment

#### 1. Server Preparation
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### 2. Application Deployment
```bash
# Clone repository
git clone <your-repository-url>
cd lms-backend

# Install dependencies
npm ci --only=production

# Create production environment file
sudo nano .env
```

#### 3. Environment Configuration
```bash
# .env file for production
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lms_production
JWT_SECRET=your_very_long_and_secure_jwt_secret_key_here
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET_NAME=your-production-bucket
AWS_REGION=us-east-1
```

#### 4. PM2 Process Management
```bash
# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOL'
module.exports = {
  apps: [{
    name: 'lms-backend',
    script: 'index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOL

# Create logs directory
mkdir logs

# Start application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

#### 5. Nginx Reverse Proxy
```bash
# Install Nginx
sudo apt install nginx -y

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/lms-backend
```

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/lms-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6. SSL Certificate with Certbot
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

### Option 2: Docker Deployment

#### 1. Create Dockerfile
```dockerfile
# Dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy app source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the application
CMD [ "node", "index.js" ]
```

#### 2. Docker Compose Setup
```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/lms_production
    depends_on:
      - mongo
    restart: unless-stopped
    volumes:
      - ./uploads:/usr/src/app/uploads
      - ./logs:/usr/src/app/logs

  mongo:
    image: mongo:6.0
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: yourpassword
      MONGO_INITDB_DATABASE: lms_production
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  mongodb_data:
```

#### 3. Deploy with Docker
```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Scale application
docker-compose up -d --scale app=3
```

### Option 3: Vercel Serverless Deployment

#### 1. Prepare for Serverless
```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb"
      }
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/index.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

#### 2. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add AWS_ACCESS_KEY_ID
vercel env add AWS_SECRET_ACCESS_KEY
```

---

## 📊 Monitoring & Alerting

### Application Monitoring

#### 1. Health Check Endpoint
```javascript
// healthcheck.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();
```

#### 2. PM2 Monitoring
```bash
# Install PM2 monitoring
pm2 install pm2-server-monit

# Monitor processes
pm2 monit

# Check status
pm2 status

# View logs
pm2 logs lms-backend --lines 100
```

#### 3. System Monitoring Script
```bash
#!/bin/bash
# monitor.sh

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    echo "WARNING: Disk usage is ${DISK_USAGE}%"
fi

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.2f", $3/$2 * 100.0)}')
if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
    echo "WARNING: Memory usage is ${MEMORY_USAGE}%"
fi

# Check MongoDB status
if ! systemctl is-active --quiet mongod; then
    echo "ERROR: MongoDB is not running"
fi

# Check application status
if ! pm2 describe lms-backend > /dev/null; then
    echo "ERROR: LMS Backend is not running"
fi
```

### Log Management

#### 1. Log Rotation
```bash
# Create logrotate configuration
sudo nano /etc/logrotate.d/lms-backend
```

```
/path/to/lms-backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 nodejs nodejs
    postrotate
        pm2 reloadLogs
    endscript
}
```

#### 2. Centralized Logging
```javascript
// logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'lms-backend' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

module.exports = logger;
```

---

## 💾 Backup & Recovery

### Database Backup

#### 1. Automated Backup Script
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="lms_backup_$DATE"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create MongoDB dump
mongodump --db lms_production --out $BACKUP_DIR/$BACKUP_NAME

# Compress backup
tar -czf $BACKUP_DIR/$BACKUP_NAME.tar.gz -C $BACKUP_DIR $BACKUP_NAME

# Remove uncompressed backup
rm -rf $BACKUP_DIR/$BACKUP_NAME

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/$BACKUP_NAME.tar.gz s3://your-backup-bucket/mongodb/

# Keep only last 7 days of local backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_NAME.tar.gz"
```

#### 2. Crontab Configuration
```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/backup.sh >> /var/log/backup.log 2>&1
```

### File Backup
```bash
#!/bin/bash
# file-backup.sh

UPLOAD_DIR="/path/to/lms-backend/uploads"
BACKUP_DIR="/backups/files"
DATE=$(date +%Y%m%d)

# Sync files to backup location
rsync -av --delete $UPLOAD_DIR/ $BACKUP_DIR/uploads_$DATE/

# Upload to S3
aws s3 sync $BACKUP_DIR/uploads_$DATE/ s3://your-backup-bucket/files/uploads_$DATE/
```

### Disaster Recovery

#### 1. Database Recovery
```bash
# Restore from backup
mongorestore --db lms_production --drop /path/to/backup/lms_production/

# Restore from S3
aws s3 cp s3://your-backup-bucket/mongodb/lms_backup_20240101_020000.tar.gz .
tar -xzf lms_backup_20240101_020000.tar.gz
mongorestore --db lms_production --drop lms_backup_20240101_020000/lms_production/
```

#### 2. Application Recovery
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm ci --only=production

# Restart application
pm2 restart lms-backend
```

---

## 🔒 Security Operations

### Security Monitoring

#### 1. Fail2Ban Configuration
```bash
# Install fail2ban
sudo apt install fail2ban -y

# Create jail configuration
sudo nano /etc/fail2ban/jail.local
```

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 2

[nginx-noscript]
enabled = true
filter = nginx-noscript
logpath = /var/log/nginx/access.log
maxretry = 6
```

#### 2. Security Audit Script
```bash
#!/bin/bash
# security-audit.sh

echo "=== Security Audit Report ==="
echo "Date: $(date)"
echo

# Check for failed login attempts
echo "Failed SSH attempts (last 24 hours):"
grep "Failed password" /var/log/auth.log | grep "$(date +%b\ %d)" | wc -l

# Check disk space
echo "Disk usage:"
df -h /

# Check running processes
echo "Suspicious processes:"
ps aux | grep -E "(nc|netcat|telnet)" | grep -v grep

# Check open ports
echo "Open ports:"
netstat -tuln

# Check last logins
echo "Recent logins:"
last -n 10

echo "=== End of Report ==="
```

### SSL Certificate Management
```bash
#!/bin/bash
# ssl-check.sh

# Check certificate expiration
DOMAIN="your-domain.com"
EXPIRY_DATE=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)
EXPIRY_TIMESTAMP=$(date -d "$EXPIRY_DATE" +%s)
CURRENT_TIMESTAMP=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))

if [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
    echo "WARNING: SSL certificate expires in $DAYS_UNTIL_EXPIRY days"
    # Auto-renew with certbot
    sudo certbot renew --quiet
fi
```

---

## ⚡ Performance Optimization

### Database Optimization

#### 1. Index Creation
```javascript
// Create performance indexes
db.users.createIndex({ "email": 1 }, { unique: true })
db.students.createIndex({ "teacherEmail": 1 })
db.teachers.createIndex({ "email": 1 }, { unique: true })
db.courses.createIndex({ "teacher": 1 })
db.courses.createIndex({ "semester": 1 })
db.assignments.createIndex({ "course": 1 })
db.assignments.createIndex({ "dueDate": 1 })
db.discussions.createIndex({ "course": 1 })
db.discussions.createIndex({ "createdAt": -1 })
```

#### 2. Database Maintenance
```bash
#!/bin/bash
# db-maintenance.sh

# Compact database
mongo lms_production --eval "db.runCommand({compact: 'users'})"
mongo lms_production --eval "db.runCommand({compact: 'courses'})"
mongo lms_production --eval "db.runCommand({compact: 'assignments'})"

# Rebuild indexes
mongo lms_production --eval "db.users.reIndex()"
mongo lms_production --eval "db.courses.reIndex()"

# Check database stats
mongo lms_production --eval "db.stats()"
```

### Application Performance

#### 1. Memory Optimization
```javascript
// memory-monitor.js
const usage = process.memoryUsage();
console.log('Memory Usage:');
console.log(`RSS: ${Math.round(usage.rss / 1024 / 1024)} MB`);
console.log(`Heap Total: ${Math.round(usage.heapTotal / 1024 / 1024)} MB`);
console.log(`Heap Used: ${Math.round(usage.heapUsed / 1024 / 1024)} MB`);
console.log(`External: ${Math.round(usage.external / 1024 / 1024)} MB`);

// Force garbage collection if available
if (global.gc) {
    global.gc();
    console.log('Garbage collection triggered');
}
```

#### 2. Performance Monitoring
```bash
# Install and configure monitoring tools
npm install -g clinic
npm install -g autocannon

# Profile application
clinic doctor -- node index.js
clinic flame -- node index.js

# Load testing
autocannon -c 10 -d 30 http://localhost:3000/api/courses
```

---

## 🔧 Troubleshooting Guide

### Common Issues

#### 1. Database Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Test connection
mongo --eval "db.stats()"

# Restart MongoDB
sudo systemctl restart mongod
```

#### 2. Application Not Starting
```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs lms-backend

# Restart application
pm2 restart lms-backend

# Check environment variables
pm2 env lms-backend
```

#### 3. High Memory Usage
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Check Node.js heap usage
node --max-old-space-size=4096 index.js

# Monitor memory in real-time
watch -n 1 'free -h && echo "---" && ps aux --sort=-%mem | head -5'
```

#### 4. File Upload Issues
```bash
# Check disk space
df -h

# Check upload directory permissions
ls -la uploads/

# Check file size limits in Nginx
sudo nano /etc/nginx/nginx.conf
# Add: client_max_body_size 200M;

# Restart Nginx
sudo systemctl restart nginx
```

### Performance Issues

#### 1. Slow Database Queries
```javascript
// Enable MongoDB profiling
db.setProfilingLevel(2, { slowms: 100 })

// Check slow queries
db.system.profile.find().sort({ ts: -1 }).limit(5).pretty()

// Explain query performance
db.courses.find({ teacher: ObjectId("...") }).explain("executionStats")
```

#### 2. High CPU Usage
```bash
# Check CPU usage
top -p $(pgrep -f "node index.js")

# Profile CPU usage
node --prof index.js
node --prof-process isolate-*.log > processed.txt
```

### Emergency Procedures

#### 1. Service Restart
```bash
#!/bin/bash
# emergency-restart.sh

echo "Emergency restart initiated at $(date)"

# Stop services
pm2 stop lms-backend
sudo systemctl stop nginx

# Clear temporary files
rm -rf /tmp/upload_*
pm2 flush

# Start services
sudo systemctl start nginx
pm2 start lms-backend

# Check status
pm2 status
sudo systemctl status nginx

echo "Emergency restart completed at $(date)"
```

#### 2. Database Recovery
```bash
#!/bin/bash
# emergency-db-recovery.sh

echo "Emergency database recovery initiated"

# Stop application
pm2 stop lms-backend

# Backup current database
mongodump --db lms_production --out /tmp/emergency_backup_$(date +%Y%m%d_%H%M%S)

# Repair database
mongo lms_production --eval "db.repairDatabase()"

# Restart application
pm2 start lms-backend

echo "Database recovery completed"
```

---

## 📈 Scaling Strategies

### Horizontal Scaling

#### 1. Load Balancer Configuration
```nginx
# nginx-lb.conf
upstream lms_backend {
    least_conn;
    server 10.0.1.10:3000 weight=3;
    server 10.0.1.11:3000 weight=3;
    server 10.0.1.12:3000 weight=2;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://lms_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Health check
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503 http_504;
    }
}
```

#### 2. Database Clustering
```bash
# MongoDB Replica Set Configuration
# On primary server
mongo --eval "rs.initiate({
  _id: 'lmsReplSet',
  members: [
    { _id: 0, host: 'mongo1.yourdomain.com:27017', priority: 2 },
    { _id: 1, host: 'mongo2.yourdomain.com:27017', priority: 1 },
    { _id: 2, host: 'mongo3.yourdomain.com:27017', arbiterOnly: true }
  ]
})"

# Connection string for replica set
MONGODB_URI=mongodb://mongo1.yourdomain.com:27017,mongo2.yourdomain.com:27017,mongo3.yourdomain.com:27017/lms_production?replicaSet=lmsReplSet
```

---

This deployment and operations guide provides comprehensive coverage of production deployment scenarios. For development setup, refer to SETUP_GUIDE.md, and for business context, see COMPANY_OVERVIEW.md.
