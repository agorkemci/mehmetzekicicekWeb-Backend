const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const path = require('path')
const fs = require('fs')
const multer = require('multer')

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_secret'

// Directory paths
const dataDir = path.join(__dirname, 'data')
const backupDir = path.join(__dirname, 'backup')
const uploadsDir = path.join(__dirname, 'uploads')

// Ensure directories exist
;[dataDir, backupDir, uploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

// Create initial data files if they don't exist
const tables = ['users', 'portfolio', 'blog', 'gallery', 'videos', 'testimonials', 'messages']
tables.forEach(table => {
    const filePath = path.join(dataDir, `${table}.json`)
    if (!fs.existsSync(filePath)) {
        const initialData = { nextId: 1, items: [] }
        if (table === 'users') {
            initialData.items.push({
                id: 1,
                username: 'mzevk',
                password: 'mzevk06239354'
            })
            initialData.nextId = 2
        }
        fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2))
    }
})

// Backup system
function backupData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(backupDir, `backup-${timestamp}`)
    fs.mkdirSync(backupPath)

    // Backup all JSON files
    tables.forEach(table => {
        const sourceFile = path.join(dataDir, `${table}.json`)
        const destFile = path.join(backupPath, `${table}.json`)
        if (fs.existsSync(sourceFile)) {
            fs.copyFileSync(sourceFile, destFile)
        }
    })

    // Keep only last 5 backups
    const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse()

    backups.slice(5).forEach(backup => {
        fs.rmSync(path.join(backupDir, backup), { recursive: true, force: true })
    })
}

function restoreFromLatestBackup() {
    const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup-'))
        .sort()
        .reverse()

    if (backups.length === 0) return false

    const latestBackup = backups[0]
    tables.forEach(table => {
        const backupFile = path.join(backupDir, latestBackup, `${table}.json`)
        const targetFile = path.join(dataDir, `${table}.json`)
        if (fs.existsSync(backupFile)) {
            fs.copyFileSync(backupFile, targetFile)
        }
    })
    return true
}

// Try to restore from backup on startup
if (restoreFromLatestBackup()) {
    console.log('Data restored from backup')
}

// Backup every hour and before shutdown
setInterval(backupData, 60 * 60 * 1000)
process.on('SIGTERM', () => {
    backupData()
    process.exit(0)
})
process.on('SIGINT', () => {
    backupData()
    process.exit(0)
})

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(uploadsDir))

// Helper to read JSON data
function readData(table) {
    const filePath = path.join(dataDir, `${table}.json`)
    if (!fs.existsSync(filePath)) {
        return { nextId: 1, items: [] }
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

// Helper to write JSON data with backup
function writeData(table, data) {
    const filePath = path.join(dataDir, `${table}.json`)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    // Create backup after significant changes
    backupData()
}

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
    const users = readData('users')
    const user = users.items.find(u => u.username === username && u.password === password)
    if (!user) return res.status(401).json({ error: 'invalid' })
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' })
    res.json({ token })
})

// File upload endpoint
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const url = `/uploads/${req.file.filename}`
    res.json({ url, filename: req.file.filename, path: req.file.path })
})

// CRUD helper
function makeCrud(table) {
    // GET all items
    app.get(`/api/${table}`, (req, res) => {
        const data = readData(table)
        res.json(data.items)
    })

    // POST new item
    app.post(`/api/${table}`, authMiddleware, (req, res) => {
        const data = readData(table)
        const newItem = {
            id: data.nextId++,
            ...req.body,
            date: req.body.date || new Date().toISOString()
        }
        data.items.unshift(newItem)
        writeData(table, data)
        res.json({ id: newItem.id })
    })

    // PUT update item
    app.put(`/api/${table}/:id`, authMiddleware, (req, res) => {
        const data = readData(table)
        const id = parseInt(req.params.id)
        const index = data.items.findIndex(item => item.id === id)
        if (index === -1) return res.status(404).json({ error: 'not found' })
        data.items[index] = { ...data.items[index], ...req.body }
        writeData(table, data)
        res.json({ changes: 1 })
    })

    // DELETE item
    app.delete(`/api/${table}/:id`, authMiddleware, (req, res) => {
        const data = readData(table)
        const id = parseInt(req.params.id)
        const initialLength = data.items.length
        data.items = data.items.filter(item => item.id !== id)
        writeData(table, data)
        res.json({ changes: initialLength - data.items.length })
    })

    // DELETE all items
    app.delete(`/api/${table}`, authMiddleware, (req, res) => {
        const data = readData(table)
        data.items = []
        writeData(table, data)
        res.json({ ok: true })
    })
}

// Create CRUD endpoints for each table
;['portfolio','blog','gallery','videos','testimonials','messages'].forEach(makeCrud)

// Public endpoints
app.post('/api/testimonials/public', (req, res) => {
    const { author, text } = req.body || {}
    if (!author || !text) return res.status(400).json({ error: 'author and text are required' })
    
    const data = readData('testimonials')
    const newItem = {
        id: data.nextId++,
        author,
        text,
        date: new Date().toISOString().slice(0, 10)
    }
    data.items.unshift(newItem)
    writeData('testimonials', data)
    res.json({ id: newItem.id })
})

app.post('/api/messages/public', (req, res) => {
    const { name, phone, email, topic, message } = req.body || {}
    if (!name || !message) return res.status(400).json({ error: 'name and message are required' })
    
    const data = readData('messages')
    const newItem = {
        id: data.nextId++,
        name,
        phone: phone || '',
        email: email || '',
        topic: topic || '',
        message,
        date: new Date().toISOString(),
        read: false
    }
    data.items.unshift(newItem)
    writeData('messages', data)
    res.json({ id: newItem.id })
})

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})