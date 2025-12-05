// app.js - FINAL VERSION WITH CACHE
require('dotenv').config({
  debug: false, quiet: true
});
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Manga = require('./models/Manga');
const Chapter = require('./models/Chapter');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

app.use((req, res, next) => {
  res.locals.siteName = process.env.SITE_NAME || 'DoujinShi';
  res.locals.siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  res.locals.currentUrl = req.path;
  next();
});

// ==========================================
// 🚀 SISTEM CACHE SEDERHANA (In-Memory)
// ==========================================
const cacheStore = new Map();

// Garbage Collection: Bersihkan cache expired setiap 5 menit
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cacheStore.entries()) {
    if (now > value.expiry) cacheStore.delete(key);
  }
}, 5 * 60 * 1000);

const simpleCache = (durationInSeconds) => {
  return (req,
    res,
    next) => {
    // Hanya cache method GET
    if (req.method !== 'GET') return next();

    // Key unik berdasarkan URL lengkap
    const key = `__cache__${req.originalUrl || req.url}`;
    const cachedBody = cacheStore.get(key);

    // Cek apakah data ada di cache dan belum expired
    if (cachedBody && Date.now() < cachedBody.expiry) {
      return res.send(cachedBody.html);
    }

    // Intercept res.send untuk menyimpan output ke cache
    const originalSend = res.send;
    res.send = (body) => {
      originalSend.call(res, body);
      cacheStore.set(key, {
        html: body,
        expiry: Date.now() + (durationInSeconds * 1000)
      });
    };
    next();
  };
};

// ==========================================
// HELPER FUNCTION: Hitung Chapter
// ==========================================
async function attachChapterCounts(mangas) {
  return await Promise.all(mangas.map(async (m) => {
    const count = await Chapter.countDocuments({
      manga_id: m._id
    });
    const mObj = m.toObject ? m.toObject(): m;
    mObj.chapter_count = count;
    return mObj;
  }));
}

// ==========================================
// 2. MAIN ROUTES (DENGAN CACHE)
// ==========================================

// HOME PAGE - Cache 60 Detik
app.get('/', simpleCache(60), async (req, res) => {
  try {
    const limit = 24;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const totalManga = await Manga.countDocuments();
    const totalPages = Math.ceil(totalManga / limit);

    // 1. Ambil Update Terbaru
    let recents = await Manga.find().sort({
      createdAt: -1
    }).skip(skip).limit(limit);
    recents = await attachChapterCounts(recents);

    // 2. Ambil Trending
    let trending = await Manga.find().sort({
      views: -1
    }).limit(10);
    trending = await attachChapterCounts(trending);

    // 3. Ambil Manhwa
    let manhwas = await Manga.find({
      'metadata.type': {
        $regex: 'manhwa', $options: 'i'
      }
    }).sort({
      createdAt: -1
    }).limit(24);
    manhwas = await attachChapterCounts(manhwas);

    res.render('landing', {
      mangas: recents,
      trending: trending,
      manhwas: manhwas,
      currentPage: page,
      totalPages: totalPages,
      title: `${res.locals.siteName} - Baca Komik Bahasa Indonesia`,
      desc: `${res.locals.siteName} adalah website download dan baca doujin bahasa indonesia terbaru dan terlengkap. Kamu bisa membaca berbagai macam doujin secara gratis di ${res.locals.siteName}.`
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// DETAIL PAGE - Cache 3 Menit (180 detik)
app.get('/manga/:slug', simpleCache(180), async (req, res) => {
  try {
    // Note: Views bertambah setiap 3 menit sekali per user (saat cache refresh)
    const manga = await Manga.findOneAndUpdate(
      {
        slug: req.params.slug
      },
      {
        $inc: {
          views: 1
        }
      },
      {
        new: true
      }
    );

    if (!manga) return res.status(404).render('404');

    const chapters = await Chapter.find({
      manga_id: manga._id
    }).sort({
      chapter_index: 1
    });

    const siteName = res.locals.siteName;
    const type = manga.metadata.type ? (manga.metadata.type || 'Komik'): 'Komik';

    const seoDesc = `Baca ${type} ${manga.title} bahasa Indonesia lengkap di ${siteName}. ${type} ${manga.title} sub indo terupdate hanya di ${siteName}.`;

    res.render('detail', {
      manga,
      chapters,
      title: `${manga.title} Bahasa Indonesia - ${res.locals.siteName}`,
      desc: seoDesc,
      ogType: 'article',
      image: manga.thumb
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// MANGA LIST (A-Z) - Cache 5 Menit (300 detik)
app.get('/manga-list', simpleCache(300), async (req, res) => {
  try {
    const limit = 24;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const totalManga = await Manga.countDocuments();
    const totalPages = Math.ceil(totalManga / limit);

    let mangas = await Manga.find()
    .select('title slug thumb metadata.rating metadata.type metadata.status')
    .sort({
      title: 1
    })
    .skip(skip)
    .limit(limit);

    mangas = await attachChapterCounts(mangas);

    res.render('manga_list', {
      mangas,
      currentPage: page,
      totalPages: totalPages,
      title: `Daftar Komik A-Z - Halaman ${page}`,
      desc: `Daftar lengkap komik diurutkan dari A-Z.`
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// READ CHAPTER - Cache 10 Menit (600 detik)
app.get('/read/:slug/:chapterSlug', simpleCache(600), async (req, res) => {
  try {
    const siteName = process.env.SITE_NAME || 'Doujinshi';

    const manga = await Manga.findOne({
      slug: req.params.slug
    }).lean();
    if (!manga) return res.status(404).send('Manga not found');
    const chapter = await Chapter.findOne({
      manga_id: manga._id, slug: req.params.chapterSlug
    });
    if (!chapter) return res.status(404).send('Chapter not found');

    const [allChapters,
      nextChap,
      prevChap] = await Promise.all([
        Chapter.find({
          manga_id: manga._id
        })
        .select('title slug date chapter_index')
        .sort({
          chapter_index: -1
        }),
        Chapter.findOne({
          manga_id: manga._id,
          chapter_index: {
            $lt: chapter.chapter_index
          }
        }).sort({
          chapter_index: -1
        }),
        Chapter.findOne({
          manga_id: manga._id,
          chapter_index: {
            $gt: chapter.chapter_index
          }
        }).sort({
          chapter_index: 1
        })
      ]);

    manga.chapters = allChapters;

    res.render('read', {
      manga,
      chapter,
      nextChap: nextChap,
      prevChap: prevChap,

      siteName,
      title: `${manga.title} - Chapter ${chapter.title}`,
      desc: `Baca manga ${manga.title} Chapter ${chapter.title} bahasa Indonesia terbaru di ${siteName}. Manga ${manga.title} bahasa Indonesia selalu update di ${siteName}. Jangan lupa membaca update manga lainnya ya. Daftar koleksi manga ${siteName} ada di menu Daftar Manga.`,
      ogType: 'article',
      image: manga.thumb
    });

  } catch (err) {
    console.error("Error Read Chapter:", err);
    res.status(500).send("Terjadi kesalahan pada server.");
  }
});

// ==========================================
// 3. SEARCH & FILTER ROUTES (DENGAN CACHE)
// ==========================================

// SEARCH - Cache 2 Menit (120 detik)
app.get('/search', simpleCache(120), async (req, res) => {
  try {
    const keyword = req.query.q;
    if (!keyword) return res.redirect('/');

    const limit = 24;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const query = {
      title: {
        $regex: keyword,
        $options: 'i'
      }
    };

    const totalManga = await Manga.countDocuments(query);
    const totalPages = Math.ceil(totalManga / limit);

    let mangas = await Manga.find(query).limit(limit).skip(skip);
    mangas = await attachChapterCounts(mangas);

    res.render('archive', {
      mangas,
      pageTitle: `Hasil Pencarian: "${keyword}"`,
      title: `Cari ${keyword}`,
      desc: `Hasil pencarian ${keyword}`,
      currentPage: page,
      totalPages: totalPages,
      paginationBaseUrl: `/search?q=${keyword}&`
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// GENRES - Cache 1 Jam (3600 detik)
app.get('/genres', simpleCache(3600), async (req, res) => {
  try {
    const genres = await Manga.aggregate([{
      $unwind: "$tags"
    },
      {
        $group: {
          _id: "$tags", count: {
            $sum: 1
          }
        }
      },
      {
        $sort: {
          _id: 1
        }
      }]);
    res.render('genres', {
      genres, title: 'Daftar Genre', desc: 'Daftar genre komik.'
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// FILTER GENRE - Cache 5 Menit
app.get('/genre/:tag', simpleCache(300), async (req, res) => {
  try {
    const rawTag = req.params.tag;
    const limit = 24;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const parts = rawTag.split('-').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regexPattern = parts.join('[- ]');
    const query = {
      tags: {
        $regex: new RegExp(regexPattern, 'i')
      }
    };

    const totalManga = await Manga.countDocuments(query);
    const totalPages = Math.ceil(totalManga / limit);

    let mangas = await Manga.find(query).limit(limit).skip(skip);
    mangas = await attachChapterCounts(mangas);

    const displayTitle = rawTag.replace(/-/g, ' ').toUpperCase();
    res.render('archive', {
      mangas,
      pageTitle: `Genre: ${displayTitle}`,
      title: `Genre ${displayTitle}`,
      desc: `Komik genre ${displayTitle}`,
      currentPage: page,
      totalPages: totalPages,
      paginationBaseUrl: `/genre/${rawTag}?`
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// FILTER TYPE - Cache 5 Menit
app.get('/type/:type', simpleCache(300), async (req, res) => {
  try {
    const typeParam = req.params.type;
    const limit = 24;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const query = {
      'metadata.type': {
        $regex: `^${typeParam}$`,
        $options: 'i'
      }
    };

    const totalManga = await Manga.countDocuments(query);
    const totalPages = Math.ceil(totalManga / limit);

    let mangas = await Manga.find(query).limit(limit).skip(skip);
    mangas = await attachChapterCounts(mangas);

    res.render('archive', {
      mangas,
      pageTitle: `Type: ${typeParam.toUpperCase()}`,
      title: `Tipe ${typeParam}`,
      desc: `Komik tipe ${typeParam}`,
      currentPage: page,
      totalPages: totalPages,
      paginationBaseUrl: `/type/${typeParam}?`
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// FILTER STATUS - Cache 5 Menit
app.get('/status/:status', simpleCache(300), async (req, res) => {
  try {
    const statusParam = req.params.status;
    const limit = 24;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const query = {
      'metadata.status': {
        $regex: `^${statusParam}$`,
        $options: 'i'
      }
    };

    const totalManga = await Manga.countDocuments(query);
    const totalPages = Math.ceil(totalManga / limit);

    let mangas = await Manga.find(query).limit(limit).skip(skip);
    mangas = await attachChapterCounts(mangas);

    res.render('archive', {
      mangas,
      pageTitle: `Status: ${statusParam.toUpperCase()}`,
      title: `Status ${statusParam}`,
      desc: `Komik status ${statusParam}`,
      currentPage: page,
      totalPages: totalPages,
      paginationBaseUrl: `/status/${statusParam}?`
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// 4. SEO ROUTES (Robots & Sitemap Generator)
// ==========================================

// Helper Formatter Tanggal (YYYY-MM-DD)
const formatDate = (date) => {
    const d = new Date(date || Date.now());
    return d.toISOString().split('T')[0];
};

// 1. ROBOTS.TXT
app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
    res.type('text/plain');
    res.send(
        `User-agent: *\n` +
        `Allow: /\n` +
        `\n` +
        `Sitemap: ${baseUrl}/sitemap.xml`
    );
});

// 2. SITEMAP INDEX (Induk Sitemap)
app.get('/sitemap.xml', (req, res) => {
    const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    const xmlFooter = '</sitemapindex>';
    const lastMod = formatDate();

    const sitemaps = [
        'sitemap-static.xml', // Halaman statis (Home, Genre, dll)
        'sitemap-manga.xml',  // List semua komik
        'sitemap-chapter.xml' // List semua chapter
    ];

    let xmlBody = '';
    sitemaps.forEach(map => {
        xmlBody += `<sitemap><loc>${baseUrl}/${map}</loc><lastmod>${lastMod}</lastmod></sitemap>`;
    });

    res.header('Content-Type', 'application/xml');
    res.send(xmlHeader + xmlBody + xmlFooter);
});

// 3. SITEMAP STATIC (Halaman Umum)
app.get('/sitemap-static.xml', (req, res) => {
    const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    const xmlFooter = '</urlset>';
    
    // Daftar halaman statis manual
    const staticPages = [
        { url: '/', changefreq: 'hourly', priority: '1.0' },
        { url: '/manga-list', changefreq: 'daily', priority: '0.9' },
        { url: '/genres', changefreq: 'weekly', priority: '0.8' },
        { url: '/status/publishing', changefreq: 'daily', priority: '0.8' },
        { url: '/status/finished', changefreq: 'weekly', priority: '0.8' },
        { url: '/type/manga', changefreq: 'weekly', priority: '0.7' },
        { url: '/type/manhwa', changefreq: 'weekly', priority: '0.7' },
        { url: '/type/doujinshi', changefreq: 'weekly', priority: '0.7' }
    ];

    let xmlBody = '';
    staticPages.forEach(page => {
        xmlBody += `<url><loc>${baseUrl}${page.url}</loc><lastmod>${formatDate()}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`;
    });

    res.header('Content-Type', 'application/xml');
    res.send(xmlHeader + xmlBody + xmlFooter);
});

// 4. SITEMAP MANGA (Daftar Komik dari DB)
app.get('/sitemap-manga.xml', async (req, res) => {
    try {
        const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        const xmlFooter = '</urlset>';

        res.header('Content-Type', 'application/xml');
        res.write(xmlHeader); // Kirim header dulu (Streaming)

        // Ambil data Manga (Slug & Update Time)
        // Gunakan cursor agar hemat memori jika data ribuan
        const cursor = Manga.find({}, 'slug updatedAt').cursor();

        for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            if (doc.slug) {
                const urlEntry = `<url><loc>${baseUrl}/manga/${doc.slug}</loc><lastmod>${formatDate(doc.updatedAt)}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`;
                res.write(urlEntry);
            }
        }

        res.end(xmlFooter); // Tutup XML
    } catch (err) {
        console.error("Sitemap Manga Error:", err);
        res.status(500).end();
    }
});

// 5. SITEMAP CHAPTER (Daftar Chapter dari DB)
const CHAPTER_LIMIT = 500;
app.get('/sitemap-chapter.xml', async (req, res) => {
    try {
        const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
        
        // Hitung total semua chapter di database
        const totalChapters = await Chapter.countDocuments();
        const totalPages = Math.ceil(totalChapters / CHAPTER_LIMIT);

        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        const xmlFooter = '</sitemapindex>';
        let xmlBody = '';
        const lastMod = formatDate(); // Menggunakan tanggal hari ini

        // Generate list sitemap berdasarkan jumlah halaman
        for (let i = 1; i <= totalPages; i++) {
            xmlBody += `
            <sitemap>
                <loc>${baseUrl}/sitemap-chapter${i}.xml</loc>
                <lastmod>${lastMod}</lastmod>
            </sitemap>`;
        }

        res.header('Content-Type', 'application/xml');
        res.send(xmlHeader + xmlBody + xmlFooter);

    } catch (err) {
        console.error("Sitemap Chapter Index Error:", err);
        res.status(500).end();
    }
});

// --------------------------------------------------------
// 2. SITEMAP CHAPTER PAGES (Child)
// URL: /sitemap-chapter1.xml, /sitemap-chapter2.xml, dst
// Fungsi: Menampilkan URL chapter asli (max 500 per file)
// --------------------------------------------------------
app.get('/sitemap-chapter:page.xml', async (req, res) => {
    try {
        const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
        
        // Ambil nomor halaman dari URL (misal: "1" dari sitemap-chapter1.xml)
        const page = parseInt(req.params.page) || 1;
        
        // Hitung skip (melewati data)
        const skip = (page - 1) * CHAPTER_LIMIT;

        // Ambil data chapter sesuai halaman
        const chapters = await Chapter.find()
            .select('slug updatedAt manga_id')
            .populate('manga_id', 'slug') // Ambil slug manga induk
            .sort({ updatedAt: -1 }) // Urutkan dari yang terbaru
            .skip(skip)
            .limit(CHAPTER_LIMIT);

        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        const xmlFooter = '</urlset>';
        let xmlBody = '';

        chapters.forEach(doc => {
            // Pastikan data valid (punya slug dan relasi manga)
            if (doc.slug && doc.manga_id && doc.manga_id.slug) {
                const url = `${baseUrl}/read/${doc.manga_id.slug}/${doc.slug}`;
                xmlBody += `
                <url>
                    <loc>${url}</loc>
                    <lastmod>${formatDate(doc.updatedAt)}</lastmod>
                    <changefreq>weekly</changefreq>
                    <priority>0.6</priority>
                </url>`;
            }
        });

        res.header('Content-Type', 'application/xml');
        res.send(xmlHeader + xmlBody + xmlFooter);

    } catch (err) {
        console.error(`Sitemap Chapter Page ${req.params.page} Error:`, err);
        res.status(500).end();
    }
});


// STATIC PAGES - Cache 1 Jam (jarang berubah)
app.get('/privacy', simpleCache(3600), (req, res) => res.render('privacy', {
  title: 'Privacy Policy',
  desc: 'Kebijakan Privasi'
}));
app.get('/terms', simpleCache(3600), (req, res) => res.render('terms', {
  title: 'Terms of Service',
  desc: 'Syarat dan Ketentuan'
}));
app.get('/contact', simpleCache(3600), (req, res) => res.render('contact', {
  title: 'Contact Us',
  desc: 'Hubungi Kami'
}));

// PROFIL PAGE (JANGAN DI CACHE - Personal User Data)
app.get('/profile', (req, res) => {
  res.render('profile',
    {
      title: `Profil Saya - ${res.locals.siteName}`,
      desc: 'Lihat bookmark dan riwayat bacaan kamu.'
    });
});

app.use((req, res) => res.status(404).render('404', {
  title: '404 - Tidak Ditemukan',
  desc: 'Halaman tidak ditemukan.'
}));

// ==========================================
// 4. SERVER STARTUP
// ==========================================

const DB_URI = process.env.DB_URI;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

if (!DB_URI) {
  console.error("❌ FATAL ERROR: DB_URI is not defined in environment variables.");
  process.exit(1);
}

const startServer = async () => {
  try {
    await mongoose.connect(DB_URI, {
      serverSelectionTimeoutMS: 30000
    });
    console.log('✅ Successfully connected to MongoDB...');

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port: ${PORT}`);
      console.log(`🔗 Access at: ${SITE_URL}`);
    });

  } catch (err) {
    console.error('❌ Failed to connect to MongoDB. Server will not start.', err);
    process.exit(1);
  }
};

startServer();