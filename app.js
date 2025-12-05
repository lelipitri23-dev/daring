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

// SEO & ERROR - Cache Sitemap 1 Jam
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
});

app.get('/sitemap.xml', simpleCache(3600), async (req, res) => {
  try {
    const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
    const mangas = await Manga.find().select('slug updatedAt');
    const chapters = await Chapter.find().select('slug updatedAt manga_id').populate('manga_id', 'slug');

    res.header('Content-Type', 'application/xml');
    let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    xml += `<url><loc>${baseUrl}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    mangas.forEach(manga => xml += `<url><loc>${baseUrl}/manga/${manga.slug}</loc><lastmod>${new Date(manga.updatedAt).toISOString()}</lastmod><priority>0.8</priority></url>`);
    chapters.forEach(chap => {
      if (chap.manga_id) xml += `<url><loc>${baseUrl}/read/${chap.manga_id.slug}/${chap.slug}</loc><lastmod>${new Date(chap.updatedAt).toISOString()}</lastmod><priority>0.6</priority></url>`;
    });
    xml += '</urlset>';
    res.send(xml);
  } catch (err) {
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