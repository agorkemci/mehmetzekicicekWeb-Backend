const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const User = require('./models/user');
const Blog = require('./models/blog');
const Testimonial = require('./models/testimonial');
const Message = require('./models/message');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB bağlantısı
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB bağlantısı başarılı');
}).catch(err => {
    console.error('MongoDB bağlantı hatası:', err);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Multer konfigürasyonu
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Yetkilendirme token\'ı gerekli' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token geçersiz' });
        }
        req.user = user;
        next();
    });
};

// Routes

// Admin Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
        }

        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        if (hashedPassword !== user.password) {
            return res.status(401).json({ error: 'Geçersiz şifre' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Sunucu hatası' });
    }
});

// Blog Routes
app.post('/api/blogs', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const { title, content } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        const blog = new Blog({
            title,
            content,
            imageUrl
        });

        await blog.save();
        res.status(201).json(blog);
    } catch (error) {
        res.status(500).json({ error: 'Blog oluşturulurken hata oluştu' });
    }
});

app.get('/api/blogs', async (req, res) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        res.json(blogs);
    } catch (error) {
        res.status(500).json({ error: 'Bloglar getirilirken hata oluştu' });
    }
});

// Testimonial Routes
app.post('/api/testimonials/public', async (req, res) => {
    try {
        const { author, text } = req.body;
        const testimonial = new Testimonial({
            name: author,
            message: text
        });

        await testimonial.save();
        res.status(201).json({
            id: testimonial._id,
            author: testimonial.name,
            text: testimonial.message,
            date: testimonial.createdAt
        });
    } catch (error) {
        console.error('Testimonial error:', error);
        res.status(500).json({ error: 'Testimonial oluşturulurken hata oluştu' });
    }
});

// Messages endpoint
app.post('/api/messages/public', async (req, res) => {
    try {
        const { name, message } = req.body;
        const newMessage = new Message({
            name,
            message
        });

        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: 'Mesaj oluşturulurken hata oluştu' });
    }
});

app.get('/api/testimonials/public', async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ createdAt: -1 });
        res.json(testimonials);
    } catch (error) {
        res.status(500).json({ error: 'Testimoniallar getirilirken hata oluştu' });
    }
});

// Get all messages
app.get('/api/messages/public', async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Mesajlar getirilirken hata oluştu' });
    }
});

// Admin endpoints - protected with JWT
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Mesajlar getirilirken hata oluştu' });
    }
});

app.get('/api/testimonials', authenticateToken, async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ createdAt: -1 });
        res.json(testimonials);
    } catch (error) {
        res.status(500).json({ error: 'Testimoniallar getirilirken hata oluştu' });
    }
});

// Veri göçü için admin kullanıcısı oluşturma endpoint'i
app.post('/api/setup', async (req, res) => {
    try {
        const { username, password, setupKey } = req.body;

        // Setup key kontrolü
        if (setupKey !== process.env.SETUP_KEY) {
            return res.status(403).json({ error: 'Geçersiz setup key' });
        }

        // Kullanıcı zaten var mı kontrolü
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
        }

        // Yeni admin kullanıcısı oluştur
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
        const user = new User({
            username,
            password: hashedPassword
        });

        await user.save();
        res.status(201).json({ message: 'Admin kullanıcısı başarıyla oluşturuldu' });
    } catch (error) {
        res.status(500).json({ error: 'Admin kullanıcısı oluşturulurken hata oluştu' });
    }
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
});