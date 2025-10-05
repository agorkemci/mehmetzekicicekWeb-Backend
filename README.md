# MehmetZekiCicekWeb Backend

Backend server for MehmetZekiCicekWeb portfolio site.

## Setup

```bash
# Install dependencies
npm install

# Start the server
npm start

# Start in development mode
npm run dev
```

## API Endpoints

### Public Endpoints
- `POST /api/messages/public` - Submit contact messages
- `POST /api/testimonials/public` - Submit public testimonials
- `POST /api/auth/login` - Admin login

### Protected Endpoints (requires JWT auth)
- `GET/POST/PUT/DELETE /api/portfolio` - Manage portfolio items
- `GET/POST/PUT/DELETE /api/blog` - Manage blog posts
- `GET/POST/PUT/DELETE /api/gallery` - Manage gallery
- `GET/POST/PUT/DELETE /api/videos` - Manage videos
- `GET/POST/PUT/DELETE /api/testimonials` - Manage testimonials
- `GET/POST/PUT/DELETE /api/messages` - Manage contact messages
- `POST /api/upload` - Upload files

## Environment Variables

- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - Secret for JWT tokens