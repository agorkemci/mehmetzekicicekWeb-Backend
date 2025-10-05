require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')
const multer = require('multer')

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_secret'
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://gorkem2323:Agorkem940623#23@webproject.cnk1izc.mongodb.net/webproject'

app.use(cors())
app.use(express.json())

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err))

// Define MongoDB Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
})

const portfolioSchema = new mongoose.Schema({
  title: String,
  location: String,
  tag: String,
  image: String,
  link: String,
  transactionType: String,
  propertyType: String
})

const blogSchema = new mongoose.Schema({
  title: String,
  date: String,
  image: String,
  link: String,
  text: String
})

const gallerySchema = new mongoose.Schema({
  url: String,
  category: String
})

const videoSchema = new mongoose.Schema({
  title: String,
  youtubeId: String
})

const testimonialSchema = new mongoose.Schema({
  author: String,
  text: String,
  date: String
})

const messageSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  topic: String,
  message: String,
  date: String,
  read: { type: Boolean, default: false }
})

// Create MongoDB models
const User = mongoose.model('User', userSchema)
const Portfolio = mongoose.model('Portfolio', portfolioSchema)
const Blog = mongoose.model('Blog', blogSchema)
const Gallery = mongoose.model('Gallery', gallerySchema)
const Video = mongoose.model('Video', videoSchema)
const Testimonial = mongoose.model('Testimonial', testimonialSchema)
const Message = mongoose.model('Message', messageSchema)

// Ensure uploads directory exists and serve it statically
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', express.static(uploadsDir))

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir)
    },
    filename: function (req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
        const ext = path.extname(file.originalname) || ''
        cb(null, `${unique}${ext}`)
    }
})
const upload = multer({ storage })

// File upload endpoint
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const url = `/uploads/${req.file.filename}`
    res.json({ url, filename: req.file.filename, path: req.file.path })
})

// Database initialization
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        location TEXT,
        tag TEXT,
        image TEXT,
        link TEXT,
        transactionType TEXT,
        propertyType TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS blog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        date TEXT,
        image TEXT,
        link TEXT,
        text TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS gallery (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT,
        category TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        youtubeId TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS testimonials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        text TEXT,
        date TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        phone TEXT,
        email TEXT,
        topic TEXT,
        message TEXT,
        date TEXT,
        read INTEGER DEFAULT 0
    )`)

    // Seed admin user if not exists
    db.get('SELECT * FROM users WHERE username = ?', ['mzevk'], (err, row) => {
        if (!row) {
            db.run('INSERT OR IGNORE INTO users (username, password) VALUES (?,?)', 
                ['mzevk', 'mzevk06239354'], 
                err => { if (err) console.error('Error seeding admin:', err) }
            )
        }
    })
})

// Auth middleware
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    try {
        const payload = jwt.verify(token, JWT_SECRET)
        req.user = payload
        next()
    } catch {
        return res.status(401).json({ error: 'Invalid token' })
    }
}

// Login endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', 
        [username, password], 
        (err, row) => {
            if (err) return res.status(500).json({ error: 'db' })
            if (!row) return res.status(401).json({ error: 'invalid' })
            const token = jwt.sign(
                { id: row.id, username: row.username }, 
                JWT_SECRET, 
                { expiresIn: '2h' }
            )
            res.json({ token })
        }
    )
})

// Get model by table name
function getModel(table) {
    const models = {
        portfolio: Portfolio,
        blog: Blog,
        gallery: Gallery,
        videos: Video,
        testimonials: Testimonial,
        messages: Message
    }
    return models[table]
}

// CRUD helper function
function makeCrud(table) {
    const Model = getModel(table)

    // GET all items
    app.get(`/api/${table}`, async (req, res) => {
        try {
            const items = await Model.find().sort({ _id: -1 })
            res.json(items)
        } catch (err) {
            console.error(`Error getting ${table}:`, err)
            res.status(500).json({ error: 'db' })
        }
    })

    // POST new item (protected)
    app.post(`/api/${table}`, authMiddleware, async (req, res) => {
        try {
            const item = new Model(req.body)
            await item.save()
            res.json({ id: item._id })
        } catch (err) {
            console.error(`Error creating ${table}:`, err)
            res.status(500).json({ error: 'db' })
        }
    })

    // PUT update item (protected)
    app.put(`/api/${table}/:id`, authMiddleware, async (req, res) => {
        try {
            const result = await Model.findByIdAndUpdate(req.params.id, req.body)
            res.json({ changes: result ? 1 : 0 })
        } catch (err) {
            console.error(`Error updating ${table}:`, err)
            res.status(500).json({ error: 'db' })
        }
    })

    // DELETE item (protected)
    app.delete(`/api/${table}/:id`, authMiddleware, async (req, res) => {
        try {
            const result = await Model.findByIdAndDelete(req.params.id)
            res.json({ changes: result ? 1 : 0 })
        } catch (err) {
            console.error(`Error deleting ${table}:`, err)
            res.status(500).json({ error: 'db' })
        }
    })

    // DELETE all items (protected)
    app.delete(`/api/${table}`, authMiddleware, async (req, res) => {
        try {
            await Model.deleteMany({})
            res.json({ ok: true })
        } catch (err) {
            console.error(`Error deleting all ${table}:`, err)
            res.status(500).json({ error: 'db' })
        }
    })
}

// Create CRUD endpoints for all tables
;['portfolio', 'blog', 'gallery', 'videos', 'testimonials', 'messages'].forEach(makeCrud)

// Public endpoint for testimonials
app.post('/api/testimonials/public', (req, res) => {
    const { author, text } = req.body || {}
    if (!author || !text) return res.status(400).json({ error: 'author and text are required' })
    const date = new Date().toISOString().slice(0, 10)
    db.run(
        'INSERT INTO testimonials (author, text, date) VALUES (?,?,?)',
        [author, text, date],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ id: this.lastID })
        }
    )
})

// Public endpoint for contact messages
app.post('/api/messages/public', (req, res) => {
    const { name, phone, email, topic, message } = req.body || {}
    if (!name || !message) return res.status(400).json({ error: 'name and message are required' })
    const date = new Date().toISOString()
    db.run(
        'INSERT INTO messages (name, phone, email, topic, message, date) VALUES (?,?,?,?,?,?)',
        [name, phone||'', email||'', topic||'', message, date],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ id: this.lastID })
        }
    )
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})