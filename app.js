<<<<<<< HEAD
// app.js - FINAL VERSION
=======
// app.js
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
if (!process.env.DB_URI) {
    console.error("❌ Error: DB_URI tidak ditemukan di .env");
    process.exit(1);
}

=======
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
mongoose.connect(process.env.DB_URI)
    .then(() => console.log('✅ Connected to MongoDB for Web'))
    .catch(err => console.error('❌ DB Error:', err));

// Setup View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// GLOBAL VARIABLES MIDDLEWARE
<<<<<<< HEAD
// Mengirim variable .env ke semua file EJS secara otomatis
app.use((req, res, next) => {
    res.locals.siteName = process.env.SITE_NAME || 'DoujinShi';
    // Gunakan SITE_URL dari .env, jika tidak ada fallback ke request host
    res.locals.siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
=======
app.use((req, res, next) => {
    res.locals.siteName = process.env.SITE_NAME || 'DoujinShi';
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            title: `${res.locals.siteName} - Baca Komik Bahasa Indonesia`,
            desc: `${res.locals.siteName} adalah website download dan baca doujin bahasa indonesia terbaru dan terlengkap. Kamu bisa membaca berbagai macam doujin secara gratis di ${res.locals.siteName}.`
=======
            title: `${res.locals.siteName} - Baca Manga & Manhwa Bahasa Indonesia`,
            desc: 'Doujinshi adalah website download dan baca doujin bahasa indonesia terbaru dan terlengkap. Kamu bisa membaca berbagai macam doujin secara gratis di Doujinshi.'
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
        });
    } catch (err) { res.status(500).send(err.message); }
});

<<<<<<< HEAD
// DETAIL PAGE
=======
// DETAIL PAGE (Updated SEO Description)
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
app.get('/manga/:slug', async (req, res) => {
    try {
        const manga = await Manga.findOneAndUpdate(
            { slug: req.params.slug },
            { $inc: { views: 1 } }, 
            { new: true } 
        );

        if (!manga) return res.status(404).render('404');

        const chapters = await Chapter.find({ manga_id: manga._id }).sort({ chapter_index: 1 });

<<<<<<< HEAD
        const siteName = res.locals.siteName;
        const type = manga.metadata.type ? (manga.metadata.type.type || 'Komik') : 'Komik';

        const seoDesc = `Baca ${type} ${manga.title} bahasa Indonesia lengkap di ${siteName}. ${type} ${manga.title} sub indo terupdate hanya di ${siteName}.`;
=======
        // Ambil variable untuk SEO
        const siteName = res.locals.siteName;
        const type = manga.metadata.type ? (manga.metadata.type.type || 'Komik') : 'Komik';
        const status = manga.metadata.status || 'Unknown';
        
        // Ambil potongan sinopsis (maksimal 150 karakter) untuk deskripsi
        const synopsisSnippet = manga.synopsis ? manga.synopsis.substring(0, 150).replace(/[\r\n]+/g, ' ') + '...' : 'Baca gratis di sini.';

        // Deskripsi SEO yang Kuat
        const seoDesc = `Baca ${type} ${manga.title} Bahasa Indonesia terbaru di ${siteName}. ${manga.title} memiliki status ${status}. Sinopsis: ${synopsisSnippet} Kualitas gambar HD dan update setiap hari.`;
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9

        res.render('detail', { 
            manga,
            chapters,
<<<<<<< HEAD
            title: `${manga.title} Bahasa Indonesia - ${siteName}`,
            desc: seoDesc,
            ogType: 'article',
            image: manga.thumb
=======
            title: `${manga.title} Bahasa Indonesia - ${siteName}`, // Title juga diperkuat
            desc: seoDesc
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
        });
    } catch (err) { res.status(500).send(err.message); }
});

<<<<<<< HEAD
// ROUTE MANGA LIST (A-Z)
app.get('/manga-list', async (req, res) => {
    try {
        const limit = 24; 
=======

// ROUTE MANGA LIST (A-Z)
app.get('/manga-list', async (req, res) => {
    try {
        const limit = 20; 
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            desc: `Daftar lengkap komik doujinshi dan manga diurutkan berdasarkan abjad A-Z di ${res.locals.siteName}.`
=======
            desc: 'Daftar lengkap komik doujinshi dan manga diurutkan berdasarkan abjad A-Z.'
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
        });
    } catch (err) { res.status(500).send(err.message); }
});

<<<<<<< HEAD
=======

>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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

<<<<<<< HEAD
        const siteName = res.locals.siteName;
        const seoDescription = `Baca manga ${manga.title} Chapter ${chapter.title} bahasa Indonesia terbaru di ${siteName}.`;
=======
        // Ambil nama situs dari locals (middleware)
        const siteName = res.locals.siteName;

        // Buat Deskripsi SEO Dinamis
        const seoDescription = `Baca manga ${manga.title} Chapter ${chapter.title} bahasa Indonesia terbaru di ${siteName}. Manga ${manga.title} bahasa Indonesia selalu update di ${siteName}. Jangan lupa membaca update manga lainnya ya. Daftar koleksi manga ${siteName} ada di menu Daftar Manga.`;
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9

        res.render('read', { 
            manga,
            chapter,
            nextChap,
            prevChap,
            title: `${manga.title} - Chapter ${chapter.title}`,
<<<<<<< HEAD
            desc: seoDescription,
            ogType: 'article',
            image: manga.thumb
=======
            desc: seoDescription // Deskripsi SEO yang sudah diupdate
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            title: `Cari ${keyword} - ${res.locals.siteName}`,
=======
            title: `Cari ${keyword}`,
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            { $group: { _id: "$tags", count: { $sum: 1 } } },
=======
            { 
                $group: { 
                    _id: "$tags", 
                    count: { $sum: 1 } 
                } 
            },
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
            { $sort: { _id: 1 } }
        ]);

        res.render('genres', { 
            genres,
<<<<<<< HEAD
            title: `Daftar Genre Lengkap - ${res.locals.siteName}`,
            desc: 'Jelajahi ribuan komik berdasarkan genre dan kategori terlengkap.'
=======
            title: 'Daftar Genre Lengkap',
            desc: 'Jelajahi ribuan komik berdasarkan genre.'
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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

<<<<<<< HEAD
=======
        // Logic Regex Flexible (Spasi atau Strip)
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            title: `Genre ${displayTitle} - ${res.locals.siteName}`,
=======
            title: `Genre ${displayTitle}`,
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            title: `Tipe ${typeParam} - ${res.locals.siteName}`,
=======
            title: `Tipe ${typeParam}`,
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
            title: `Status ${statusParam} - ${res.locals.siteName}`,
=======
            title: `Status ${statusParam}`,
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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
<<<<<<< HEAD
    // Priority: SITE_URL (.env) -> HTTPS hardcoded -> Host Header
    const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
=======
    const baseUrl = `https://${req.get('host')}`;
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
});

app.get('/sitemap.xml', async (req, res) => {
    try {
<<<<<<< HEAD
        // Priority: SITE_URL (.env) -> HTTPS hardcoded -> Host Header
        const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
        
=======
        const baseUrl = `https://${req.get('host')}`;
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
        const mangas = await Manga.find().select('slug updatedAt');
        const chapters = await Chapter.find().select('slug updatedAt manga_id').populate('manga_id', 'slug');

        res.header('Content-Type', 'application/xml');
        let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

<<<<<<< HEAD
        // Homepage
        xml += `<url><loc>${baseUrl}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;

        // Manga Links
=======
        xml += `<url><loc>${baseUrl}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;

>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
        mangas.forEach(manga => {
            xml += `<url><loc>${baseUrl}/manga/${manga.slug}</loc><lastmod>${new Date(manga.updatedAt).toISOString()}</lastmod><priority>0.8</priority></url>`;
        });

<<<<<<< HEAD
        // Chapter Links
=======
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
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

<<<<<<< HEAD
// STATIC PAGES (Optional)
app.get('/privacy', (req, res) => res.render('privacy', { title: 'Privacy Policy', desc: 'Kebijakan Privasi' }));
app.get('/terms', (req, res) => res.render('terms', { title: 'Terms of Service', desc: 'Syarat dan Ketentuan' }));
app.get('/contact', (req, res) => res.render('contact', { title: 'Contact Us', desc: 'Hubungi Kami' }));

// 404 Handler
=======
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
app.use((req, res) => {
    res.status(404).render('404', {
        title: '404 - Tidak Ditemukan',
        desc: 'Halaman tidak ditemukan.'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
<<<<<<< HEAD
});
=======
});
>>>>>>> 92a0575f6d027cf4ddc57ba62b64dc238215aba9
