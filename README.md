# MehmetZekiCicekWeb Backend

Backend server for MehmetZekiCicekWeb real estate portfolio site.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

## Environment Variables

- `PORT`: Server port (default: 3001)
- `JWT_SECRET`: Secret for JWT tokens (default: 'change_me_secret')

## API Endpoints

### Public Endpoints
- `POST /api/auth/login`: Login with username/password
- `POST /api/messages/public`: Submit contact message
- `POST /api/testimonials/public`: Submit testimonial

### Protected Endpoints (require JWT)
- `POST /api/upload`: Upload file
- CRUD operations for:
  - `/api/portfolio`
  - `/api/blog`
  - `/api/gallery`
  - `/api/videos`
  - `/api/testimonials`
  - `/api/messages`