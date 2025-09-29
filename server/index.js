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

// Upload endpoint (authenticated)
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
	if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
	const url = `/uploads/${req.file.filename}`
	res.json({ url, filename: req.file.filename, path: req.file.path })
})

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
		link TEXT
	)`)
	// add new columns if they don't exist (ignore errors if already added)
	db.run('ALTER TABLE portfolio ADD COLUMN transactionType TEXT', () => {})
	db.run('ALTER TABLE portfolio ADD COLUMN propertyType TEXT', () => {})
	db.run(`CREATE TABLE IF NOT EXISTS blog (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT,
		date TEXT,
		image TEXT,
		link TEXT
	)`)
	// If admin sends full text for blog posts, ensure the column exists
	db.run('ALTER TABLE blog ADD COLUMN text TEXT', () => {})
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
		text TEXT
	)`)
	// ek: tarih kolonu yoksa eklemeye çalış (varsa hata yoksayılır)
	db.run('ALTER TABLE testimonials ADD COLUMN date TEXT', () => {})
	// seed admin if not exists
	db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
		if (!row) {
			db.run('INSERT INTO users (username, password) VALUES (?,?)', ['admin', 'admin123'])
		}
	})
})

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

app.post('/api/auth/login', (req, res) => {
	const { username, password } = req.body
	db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
		if (err) return res.status(500).json({ error: 'db' })
		if (!row) return res.status(401).json({ error: 'invalid' })
		const token = jwt.sign({ id: row.id, username: row.username }, JWT_SECRET, { expiresIn: '2h' })
		res.json({ token })
	})
})

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
	// clear all items of a table
	app.delete(`/api/${table}`, authMiddleware, (req, res) => {
		db.run(`DELETE FROM ${table}`, [], function (err) {
			if (err) return res.status(500).json({ error: 'db' })
			res.json({ ok: true })
		})
	})
}

;['portfolio','blog','gallery','videos','testimonials'].forEach(makeCrud)

// Demo seed endpoint - inserts sample content if corresponding tables are empty
app.post('/api/seed/demo', authMiddleware, (req, res) => {
    db.serialize(() => {
        db.get('SELECT COUNT(*) as c FROM portfolio', (e, r) => {
            if (!e && r.c === 0) {
                const items = [
                    { title: 'MEVLANA SİTESİ (YAPILI) KİRALIK 3+1 DAİRE', location: 'Ankara / Altındağ', tag: 'Kiralık', image: '', link: '#' },
                    { title: 'KAZAKİSTAN CADDESİ SATILIK 1+1 LÜKS DAİRE', location: 'Ankara / Çankaya', tag: 'Satılık', image: '', link: '#' },
                ]
                items.forEach(p => db.run('INSERT INTO portfolio (title,location,tag,image,link) VALUES (?,?,?,?,?)', [p.title,p.location,p.tag,p.image,p.link]))
            }
        })
        db.get('SELECT COUNT(*) as c FROM blog', (e, r) => {
            if (!e && r.c === 0) {
                const items = [
                    { title: 'Yılın İlk 8 Ayında 2 Milyon Gayrimenkul Satıldı', date: '2025-09-14', image: '', link: '#' },
                    { title: 'Türkiye Konut Piyasasında Yeni Dönem', date: '2025-09-09', image: '', link: '#' },
                ]
                items.forEach(b => db.run('INSERT INTO blog (title,date,image,link) VALUES (?,?,?,?)', [b.title,b.date,b.image,b.link]))
            }
        })
        db.get('SELECT COUNT(*) as c FROM gallery', (e, r) => {
            if (!e && r.c === 0) {
                const items = [
                    { url: 'https://selfprof.cfd/storage/bireysel/galeri_resim/8929/29bed45e5f5fe150a9806a645650cfafe7c307ce_bcc30ac9f03b319c20e572e83db21226.jpg', category: 'Genel' },
                    { url: 'https://selfprof.cfd/storage/bireysel/galeri_resim/8929/898b33f504b0663a47b9c0e735021dd4a24aa3b5_47f12492374b2a2fda99505f43fcbcda.jpg', category: 'Başarılarım' },
                ]
                items.forEach(g => db.run('INSERT INTO gallery (url,category) VALUES (?,?)', [g.url,g.category]))
            }
        })
        db.get('SELECT COUNT(*) as c FROM videos', (e, r) => {
            if (!e && r.c === 0) {
                const items = [
                    { title: 'Gayrimenkul Profesyoneli Ol', youtubeId: 'LFq5vXOnNaY' },
                    { title: 'Markalaşma 1. Bölüm', youtubeId: 'Rx5CB_lJ8fQ' },
                ]
                items.forEach(v => db.run('INSERT INTO videos (title,youtubeId) VALUES (?,?)', [v.title,v.youtubeId]))
            }
        })
        db.get('SELECT COUNT(*) as c FROM testimonials', (e, r) => {
            const items = [
                    { author: 'Abdulkadir ASLAN', date: '2025-04-08', text: "Ankara'ya tayinim çıktığında ortak ev kiralamayı düşündüğüm arkadaşımla birlikte internet üzerinden Mehmet Zeki Bey'le irtibat kurduk. Kendisi ilk görüşmemizden itibaren bize yardımcı olabilmek için samimi ve içten tavırlarıyla gönlümüzü kazandı ve elindeki daireyi kiralamamızı sağladı. İlgi ve alakasından dolayı çok teşekkür ederim. İyi ki varsınız Mehmet Zeki abi. İşlerinizde başarılar dilerim." },
                    { author: 'METİN POLAT', date: '2025-04-06', text: "Bir kaç aydır ilanda olan dükkanımı kiralayamadığım için Mehmet Zeki Bey'i yetkilendirdim. Çok kısa sürede iyi bir müşteri bularak, her aşamasında yardımcı oldu. Kendisine çok teşekkür ediyor, başarılarının devamını diliyorum. Bu zamanda böyle dürüst ve profesyonel biriyle karşılaşmak ne güzel. İyi ki varsınız Mehmet Bey." },
                    { author: 'KERİMAN ERGİN', date: '2023-12-21', text: "Uzun zamandır bir ev almayı planlıyorduk. Tavsiye üzerine Mehmet Zeki Bey ile görüştük. Kısa sürede aklımızdaki tüm soruları cevaplayarak süreci en iyi şekilde yönetip istediğimiz eve sahip olmamıza yardımcı oldu. Kendisine çok teşekkür ediyoruz. KE" },
                    { author: 'NAZLI ALPER', date: '2023-11-15', text: "Mehmet Zeki Bey güler yüzlü ve yardımsever kişiliği sayesinde süreci çok güzel yönetti. Çok kısa sürede aradığımız kiralık evi bulduk, ayrıca tüm sorulara hızlı dönüşler için de teşekkürler. İyi ki varsınız Mehmet Zeki Bey." },
                    { author: 'SULTAN MERTOĞUZ', date: '2023-11-08', text: "Evimizin kiralanması süresince yetki verdiğim Mehmet Zeki Bey'den çok memnun kaldım. İlgi, alaka, iş takibi ve diğer tüm konularda eksiksiz yardımcı oldu. Gayrimenkulümün hızlı bir şekilde kiralanmasını sağladığı için çok teşekkür ederim. Gayrimenkul konusunun açıldığı her ortamda Mehmet Zeki Bey'den tüm dostlarıma bahsediyorum. Başarılar dilerim." },
                    { author: 'ABDURRAHMAN KAŞIK', date: '2023-10-24', text: "Müşteriyi doğru bilgilendiren güvenilir, teknik konulara ve sektöre hakim aynı zamanda samimi, pratik ve ilgili bir emlak danışmanı olan Mehmet bey'e teşekkür ediyoruz." },
                    { author: 'RAMAZAN ÇOKÇEVİK', date: '2023-10-10', text: "Evimin kiralanması aşamasında ve sonrasında verdiği desteklerden dolayı Mehmet Zeki Bey'e teşekkür ederim. Her zaman samimi ve güven veren bir danışman olarak gönlümdeki yeriniz ayrı olacak. Başarılar dilerim." },
                    { author: 'Kadir POLAT', date: '2023-10-02', text: "Mehmet Zeki Bey'e gerek profesyonelliği, gerek çözüm odaklı yaklaşımları, gerek hissettirdiği samimiyeti ile bana ve aileme harika bir danışmanlık deneyimi yaşattı. Kendisinden aldığımız danışmanlık hizmetindeki güven veren duruşu, oldukça hızlı bilgilendirmeleri, profesyonel yaklaşımı, açık iletişimi ve samimiyeti için Mehmet abi diye hitap etmek istiyor, çok teşekkür ediyorum, başarılarının devamını diliyorum." },
                    { author: 'MURAT KARTAL', date: '2023-09-27', text: "Ankara'daki dairemin satışı için yaklaşık bir yıldır birkaç emlak firmasıyla görüştüm, sonuç alamayınca tavsiye üzerine Mehmet Bey'i aradım. Kendisinin gerek fiyat belirleme gerekse satış aşamalarındaki gerçekçi ve samimi yaklaşımları sonucunda dairemi ilana girdikten 24 saat geçmeden beklediğimden de iyi bir fiyata sattı. Sonsuz teşekkür ediyorum Mehmet Zeki Bey, iyi ki varsınız." },
                    { author: 'ALEXİS İNVERNNİZZİ', date: '2023-09-11', text: "Bu satırları danışmanım aracılığıyla yazıyorum. Mr. Mehmet Zeki çok samimi biri ve evi çok iyi bir şekilde sundu. Bizi ev sahibiyle çok anlaştırdı. Ben de onun güvenini sarsmamak için elimden geleni yapıyor ve eve iyi bakıyorum, kiramı düzenli ödüyorum. Her şey için çok teşekkür ederim." },
                    { author: 'Gökhan Demir', date: '2023-08-16', text: "Mehmet Bey'in sadece Gayrimenkul Danışmanlığı değil, insan ilişkileri de çok mükemmel. Açık fikirli, samimi ve güven verici tutumu, duruma hızlı adapte olan, müşteri odaklı çözüm üreten profesyonel bir insan. Aradığım daireyi bulmam konusundaki yardımlarından dolayı yürekten teşekkür ediyorum." },
                    { author: 'Ali TAMER', date: '2023-08-14', text: "ODTÜ okuyan oğlum için kiralık ev arayışımızda tavsiye üzerine Mehmet Zeki Beyle görüştük. İl dışından gelmemiz nedeniyle bizimle otobüs terminalinden alıp ilgilenen ve çok güzel bir daireyi kiralamamızda yardımcı olan Mehmet Zeki Beye canı gönülden teşekkür ederim. İyi ki sizi tanıdım. Başarılarınızın devamını dilerim." },
                    { author: 'Yeşim Özcanan', date: '2023-08-11', text: "Mehmet Zeki Bey sağ olsun Çankaya’da olan dairemizle kendi dairesi gibi ilgilenip hızlıca kiralanması konusunda çok yardımcı oldu. Kendisine tekrar ihtiyacımız olursa ilk çalacağımız emlakçı olacaktır. Gayrimenkulünü emin ellere teslim etmek isteyenlere mutlaka tavsiye ederim. Emeklerinden dolayı teşekkürler." },
                    { author: 'Osman TURAN', date: '2023-08-07', text: "Mehmet Zeki Bey kiralık konut arayışımızda ilk andan itibaren her konuda güler yüz ve nezaketle yardımcı oldu. Ofisinde bizi ağırlamasından dolayı ve kontrat sonunda hiç mecbur olmamasına rağmen desteğini esirgemediği için ayrıca teşekkür ediyorum. Bir daha emlak kira-satış işlemlerine ihtiyaç duyduğumda ilk arayacağım kişi kendisidir. Başarılarının devamını dilerim." },
                    { author: 'Neşe ÖZTÜRK', date: '2023-07-29', text: "Sadece birkaç gün içinde ve son derece içime sinen bir kiracı bulduysam sayenizde Mehmet Bey. Bir kez daha iyi ki yollarımız kesişmiş dedim. Böylesine bir zamanda işini hakkıyla yapan, güven duyabileceğiniz bir Gayrimenkul Danışmanıyla çalışmak gerçekten çok büyük şans. Sayenizde iyi bir kiracım var artık ve kafam çok rahat. Her şey için tekrar teşekkür ederim." },
                    { author: 'Nur KİRPİT', date: '2023-07-22', text: "Dairemin kiralanmasının başından sonuna kadar tüm aşamalarında güler yüzlü, samimi ve işini bilen biriyle çalışmanın rahatlığı ve güveniyle kiralamayı sonuçlandırdığımız için Mehmet Bey'e ve ofisine teşekkür ederim." },
                    { author: 'Harun KARACAN', date: '2023-07-22', text: "Evimi satmaya karar verdikten sonra birçok Gayrimenkul danışmanıyla görüştüm. Mehmet Bey'le tanıştığım ilk dakikadan itibaren güler yüzlü ve samimi tavırlarıyla, işine hakimiyeti hakkında bana verdiği intibadan sonra kendisine verdiğim yetkiye istinaden evimi kısa sürede değerinde satılmasına aracılık ederek tüm süreç boyunca da benimle birlikte olmasından dolayı kendisine ayrıca teşekkür ediyorum." },
                ]
            if (!e && r && r.c < items.length) {
                items.forEach(t => db.run('INSERT INTO testimonials (author,text,date) VALUES (?,?,?)', [t.author,t.text,t.date]))
            }
        })
    })
    res.json({ ok: true })
})

app.listen(PORT, () => {
	console.log(`API running on http://localhost:${PORT}`)
})
