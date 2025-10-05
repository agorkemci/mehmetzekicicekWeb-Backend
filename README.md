# MehmetZekiCicekWeb Backend

Backend server for MehmetZekiCicekWeb portfolio site.

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `JWT_SECRET`: Secret key for JWT tokens (default: 'change_me_secret')

## API Endpoints

### Authentication
- POST `/api/auth/login` - Login with username and password

### Public Endpoints
- POST `/api/testimonials/public` - Submit public testimonial
- POST `/api/messages/public` - Submit contact message

### Protected Endpoints (requires authentication)
- GET/POST/PUT/DELETE `/api/portfolio` - Portfolio CRUD
- GET/POST/PUT/DELETE `/api/blog` - Blog CRUD
- GET/POST/PUT/DELETE `/api/gallery` - Gallery CRUD
- GET/POST/PUT/DELETE `/api/videos` - Videos CRUD
- GET/POST/PUT/DELETE `/api/testimonials` - Testimonials CRUD
- GET/POST/PUT/DELETE `/api/messages` - Messages CRUD
- POST `/api/upload` - File upload endpoint

## Database
Uses SQLite for data storage (data.sqlite)