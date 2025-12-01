// app.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Manga = require('./models/Manga');
const Chapter = require('./models/Chapter');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. DATABASE & CONFIG
// ==========================================

// Koneksi Database
mongoose.connect(process.env.DB_URI)
    .then(() => console.log('✅ Connected to MongoDB for Web'))
    .catch(err => console.error('❌ DB Error:', err));

// Setup View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// GLOBAL VARIABLES MIDDLEWARE
app.use((req, res, next) => {
    res.locals.siteName = process.env.SITE_NAME || 'DoujinShi';
    res.locals.currentUrl = req.path;
    next();
});

// ==========================================
// 2. MAIN ROUTES (Home, Detail, Read)
// ==========================================

// HOME PAGE
app.get('/', async (req, res) => {
    try {
        const limit = 20; 
        const page = parseInt(req.query.page) || 1; 
        const skip = (page - 1) * limit;

        const totalManga = await Manga.countDocuments();
        const totalPages = Math.ceil(totalManga / limit);

        // 1. Ambil Update Terbaru
        const recents = await Manga.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // 2. Ambil Trending (Top Views - Limit 10 untuk Slider)
        const trending = await Manga.find()
            .sort({ views: -1 })
            .limit(10);
            
        res.render('landing', { 
            mangas: recents, 
            trending: trending,
            currentPage: page,
            totalPages: totalPages,
            title: `${res.locals.siteName} - Baca Komik & Manhwa Bahasa Indonesia`,
            desc: 'DoujinShi Website download dan baca doujin & manhwa bahasa indonesia terbaru dan terlengkap.'
        });
    } catch (err) { res.status(500).send(err.message); }
});

// DETAIL PAGE
app.get('/manga/:slug', async (req, res) => {
    try {
        const manga = await Manga.findOneAndUpdate(
            { slug: req.params.slug },
            { $inc: { views: 1 } }, 
            { new: true } 
        );

        if (!manga) return res.status(404).render('404');

        const chapters = await Chapter.find({ manga_id: manga._id }).sort({ chapter_index: 1 });

        res.render('detail', { 
            manga,
            chapters,
            title: `${manga.title} Bahasa Indonesia`,
            desc: `Baca ${manga.metadata.type ? (manga.metadata.type.type || 'Komik') : 'Komik'} ${manga.title}.`
        });
    } catch (err) { res.status(500).send(err.message); }
});

// ROUTE MANGA LIST (A-Z)
app.get('/manga-list', async (req, res) => {
    try {
        const limit = 20; 
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const totalManga = await Manga.countDocuments();
        const totalPages = Math.ceil(totalManga / limit);

        const mangas = await Manga.find()
            .select('title slug thumb metadata.rating metadata.type metadata.status') 
            .sort({ title: 1 }) 
            .skip(skip)
            .limit(limit);

        res.render('manga_list', {
            mangas,
            currentPage: page,
            totalPages: totalPages,
            title: `Daftar Komik A-Z - Halaman ${page}`,
            desc: 'Daftar lengkap komik doujinshi dan manga diurutkan berdasarkan abjad A-Z.'
        });
    } catch (err) { res.status(500).send(err.message); }
});

// READ CHAPTER PAGE
app.get('/read/:slug/:chapterSlug', async (req, res) => {
    try {
        const manga = await Manga.findOne({ slug: req.params.slug });
        if (!manga) return res.status(404).send('Manga not found');

        const chapter = await Chapter.findOne({ 
            manga_id: manga._id, 
            slug: req.params.chapterSlug 
        });
        if (!chapter) return res.status(404).send('Chapter not found');

        const nextChap = await Chapter.findOne({ manga_id: manga._id, chapter_index: chapter.chapter_index - 1 });
        const prevChap = await Chapter.findOne({ manga_id: manga._id, chapter_index: chapter.chapter_index + 1 });

        res.render('read', { 
            manga,
            chapter,
            nextChap,
            prevChap,
            title: `${manga.title} - ${chapter.title}`,
            desc: `Sedang membaca ${manga.title} ${chapter.title}.`
        });
    } catch (err) { res.status(500).send(err.message); }
});

// ==========================================
// 3. SEARCH & FILTER ROUTES
// ==========================================

// SEARCH
app.get('/search', async (req, res) => {
    try {
        const keyword = req.query.q;
        if (!keyword) return res.redirect('/');

        const limit = 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const query = { title: { $regex: keyword, $options: 'i' } };
        
        const totalManga = await Manga.countDocuments(query);
        const totalPages = Math.ceil(totalManga / limit);

        const mangas = await Manga.find(query)
            .limit(limit)
            .skip(skip);

        res.render('archive', {
            mangas,
            pageTitle: `Hasil Pencarian: "${keyword}"`,
            title: `Cari ${keyword}`,
            desc: `Hasil pencarian untuk kata kunci ${keyword}`,
            currentPage: page,
            totalPages: totalPages,
            paginationBaseUrl: `/search?q=${keyword}&` 
        });
    } catch (err) { res.status(500).send(err.message); }
});

// LIST GENRES
app.get('/genres', async (req, res) => {
    try {
        const genres = await Manga.aggregate([
            { $unwind: "$tags" },
            { 
                $group: { 
                    _id: "$tags", 
                    count: { $sum: 1 } 
                } 
            },
            { $sort: { _id: 1 } }
        ]);

        res.render('genres', { 
            genres,
            title: 'Daftar Genre Lengkap',
            desc: 'Jelajahi ribuan komik berdasarkan genre.'
        });
    } catch (err) { res.status(500).send(err.message); }
});

// FILTER BY GENRE
app.get('/genre/:tag', async (req, res) => {
    try {
        const rawTag = req.params.tag;
        const limit = 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        // Logic Regex Flexible (Spasi atau Strip)
        const parts = rawTag.split('-').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regexPattern = parts.join('[- ]'); 
        const query = { tags: { $regex: new RegExp(regexPattern, 'i') } };

        const totalManga = await Manga.countDocuments(query);
        const totalPages = Math.ceil(totalManga / limit);

        const mangas = await Manga.find(query)
            .limit(limit)
            .skip(skip);

        const displayTitle = rawTag.replace(/-/g, ' ').toUpperCase();

        res.render('archive', {
            mangas,
            pageTitle: `Genre: ${displayTitle}`,
            title: `Genre ${displayTitle}`,
            desc: `Daftar komik dengan genre ${displayTitle}`,
            currentPage: page,
            totalPages: totalPages,
            paginationBaseUrl: `/genre/${rawTag}?`
        });
    } catch (err) { res.status(500).send(err.message); }
});

// FILTER BY TYPE
app.get('/type/:type', async (req, res) => {
    try {
        const typeParam = req.params.type;
        const limit = 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const query = { 'metadata.type': { $regex: `^${typeParam}$`, $options: 'i' } };

        const totalManga = await Manga.countDocuments(query);
        const totalPages = Math.ceil(totalManga / limit);

        const mangas = await Manga.find(query)
            .limit(limit)
            .skip(skip);

        res.render('archive', {
            mangas,
            pageTitle: `Type: ${typeParam.toUpperCase()}`,
            title: `Tipe ${typeParam}`,
            desc: `Daftar komik tipe ${typeParam}`,
            currentPage: page,
            totalPages: totalPages,
            paginationBaseUrl: `/type/${typeParam}?`
        });
    } catch (err) { res.status(500).send(err.message); }
});

// FILTER BY STATUS
app.get('/status/:status', async (req, res) => {
    try {
        const statusParam = req.params.status;
        const limit = 20;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;

        const query = { 'metadata.status': { $regex: `^${statusParam}$`, $options: 'i' } };

        const totalManga = await Manga.countDocuments(query);
        const totalPages = Math.ceil(totalManga / limit);

        const mangas = await Manga.find(query)
            .limit(limit)
            .skip(skip);

        res.render('archive', {
            mangas,
            pageTitle: `Status: ${statusParam.toUpperCase()}`,
            title: `Status ${statusParam}`,
            desc: `Daftar komik status ${statusParam}`,
            currentPage: page,
            totalPages: totalPages,
            paginationBaseUrl: `/status/${statusParam}?`
        });
    } catch (err) { res.status(500).send(err.message); }
});

// ==========================================
// 4. SEO & ERROR
// ==========================================

app.get('/robots.txt', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
});

app.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const mangas = await Manga.find().select('slug updatedAt');
        const chapters = await Chapter.find().select('slug updatedAt manga_id').populate('manga_id', 'slug');

        res.header('Content-Type', 'application/xml');
        let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        xml += `<url><loc>${baseUrl}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;

        mangas.forEach(manga => {
            xml += `<url><loc>${baseUrl}/manga/${manga.slug}</loc><lastmod>${new Date(manga.updatedAt).toISOString()}</lastmod><priority>0.8</priority></url>`;
        });

        chapters.forEach(chap => {
            if (chap.manga_id && chap.manga_id.slug) {
                xml += `<url><loc>${baseUrl}/read/${chap.manga_id.slug}/${chap.slug}</loc><lastmod>${new Date(chap.updatedAt).toISOString()}</lastmod><priority>0.6</priority></url>`;
            }
        });

        xml += '</urlset>';
        res.send(xml);
    } catch (err) {
        console.error("Sitemap Error:", err);
        res.status(500).end();
    }
});

app.use((req, res) => {
    res.status(404).render('404', {
        title: '404 - Tidak Ditemukan',
        desc: 'Halaman tidak ditemukan.'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
