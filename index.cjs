const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')
const multer = require('multer')

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_secret'

app.use(cors())
app.use(express.json())

const dbPath = path.join(__dirname, 'data.sqlite')
const db = new sqlite3.Database(dbPath)

// Ensure uploads directory exists and serve it statically
const uploadsDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
app.use('/uploads', express.static(uploadsDir))

// Multer setup
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

// Create database tables
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
                err => { if (err) console.error('Error seeding user:', err) }
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
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) return res.status(500).json({ error: 'db' })
        if (!row) return res.status(401).json({ error: 'invalid' })
        const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: '2h' })
        res.json({ token })
    })
})

// File upload endpoint
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const url = `/uploads/${req.file.filename}`
    res.json({ url, filename: req.file.filename, path: req.file.path })
})

// CRUD helper
function makeCrud(table) {
    app.get(`/api/${table}`, (req, res) => {
        db.all(`SELECT * FROM ${table} ORDER BY id DESC`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: 'db' })
            res.json(rows)
        })
    })
    app.post(`/api/${table}`, authMiddleware, (req, res) => {
        const keys = Object.keys(req.body)
        const values = keys.map(k => req.body[k])
        const placeholders = keys.map(() => '?').join(',')
        db.run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`, values, function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ id: this.lastID })
        })
    })
    app.put(`/api/${table}/:id`, authMiddleware, (req, res) => {
        const keys = Object.keys(req.body)
        const setters = keys.map(k => `${k} = ?`).join(',')
        const values = keys.map(k => req.body[k])
        values.push(req.params.id)
        db.run(`UPDATE ${table} SET ${setters} WHERE id = ?`, values, function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ changes: this.changes })
        })
    })
    app.delete(`/api/${table}/:id`, authMiddleware, (req, res) => {
        db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ changes: this.changes })
        })
    })
    app.delete(`/api/${table}`, authMiddleware, (req, res) => {
        db.run(`DELETE FROM ${table}`, [], function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ ok: true })
        })
    })
}

// Create CRUD endpoints for each table
;['portfolio','blog','gallery','videos','testimonials','messages'].forEach(makeCrud)

// Public endpoints
app.post('/api/testimonials/public', (req, res) => {
    const { author, text } = req.body || {}
    if (!author || !text) return res.status(400).json({ error: 'author and text are required' })
    const date = new Date().toISOString().slice(0, 10)
    db.run('INSERT INTO testimonials (author, text, date) VALUES (?,?,?)', 
        [author, text, date], 
        function (err) {
            if (err) return res.status(500).json({ error: 'db' })
            res.json({ id: this.lastID })
        }
    )
})

app.post('/api/messages/public', (req, res) => {
    const { name, phone, email, topic, message } = req.body || {}
    if (!name || !message) return res.status(400).json({ error: 'name and message are required' })
    const date = new Date().toISOString()
    db.run('INSERT INTO messages (name, phone, email, topic, message, date) VALUES (?,?,?,?,?,?)', 
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