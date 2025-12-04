// app.js - FINAL VERSION (With Dynamic Chapter Count)
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

if (!process.env.DB_URI) {
  console.error("❌ Error: DB_URI tidak ditemukan di .env");
  process.exit(1);
}

mongoose.connect(process.env.DB_URI)
.then(() => console.log('✅ Connected to MongoDB for Web'))
.catch(err => console.error('❌ DB Error:', err));

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
// HELPER FUNCTION: Hitung Chapter
// ==========================================
// Fungsi ini menyisipkan 'chapter_count' ke setiap object manga secara real-time
async function attachChapterCounts(mangas) {
  return await Promise.all(mangas.map(async (m) => {
    // Hitung jumlah dokumen di collection Chapter berdasarkan manga_id
    const count = await Chapter.countDocuments({
      manga_id: m._id
    });

    // Konversi Mongoose Document ke Plain Object agar bisa ditambah properti baru
    const mObj = m.toObject ? m.toObject(): m;
    mObj.chapter_count = count;

    return mObj;
  }));
}

// ==========================================
// 2. MAIN ROUTES
// ==========================================

// HOME PAGE
app.get('/', async (req, res) => {
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
    // Hitung chapter untuk Update Terbaru
    recents = await attachChapterCounts(recents);

    // 2. Ambil Trending
    let trending = await Manga.find().sort({
      views: -1
    }).limit(10);
    // Hitung chapter untuk Trending
    trending = await attachChapterCounts(trending);

    // 3. Ambil Manhwa
    let manhwas = await Manga.find({
      'metadata.type': {
        $regex: 'manhwa', $options: 'i'
      }
    })
    .sort({
      createdAt: -1
    }).limit(24);
    // Hitung chapter untuk Manhwa
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

// DETAIL PAGE
app.get('/manga/:slug', async (req, res) => {
  try {
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
        const type = manga.metadata.type ? (manga.metadata.type || 'Komik') : 'Komik';
    
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

// MANGA LIST (A-Z)
app.get('/manga-list', async (req, res) => {
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

    // Hitung chapter
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

// READ CHAPTER
app.get('/read/:slug/:chapterSlug', async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug
    });
    if (!manga) return res.status(404).send('Manga not found');

    const chapter = await Chapter.findOne({
      manga_id: manga._id, slug: req.params.chapterSlug
    });
    if (!chapter) return res.status(404).send('Chapter not found');

    const nextChap = await Chapter.findOne({
      manga_id: manga._id, chapter_index: chapter.chapter_index - 1
    });
    const prevChap = await Chapter.findOne({
      manga_id: manga._id, chapter_index: chapter.chapter_index + 1
    });

    res.render('read', {
      manga,
      chapter,
      nextChap,
      prevChap,
      title: `${manga.title} - ${chapter.title}`,
      desc: `Baca ${manga.title} ${chapter.title}.`,
      ogType: 'article',
      image: manga.thumb
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// 3. SEARCH & FILTER ROUTES
// ==========================================

// SEARCH
app.get('/search', async (req, res) => {
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
    mangas = await attachChapterCounts(mangas); // Hitung chapter

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

// GENRES
app.get('/genres', async (req, res) => {
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

// FILTER GENRE
app.get('/genre/:tag', async (req, res) => {
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
    mangas = await attachChapterCounts(mangas); // Hitung chapter

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

// FILTER TYPE
app.get('/type/:type', async (req, res) => {
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
    mangas = await attachChapterCounts(mangas); // Hitung chapter

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

// FILTER STATUS
app.get('/status/:status', async (req, res) => {
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
    mangas = await attachChapterCounts(mangas); // Hitung chapter

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

// SEO & ERROR
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.SITE_URL || `https://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
});

app.get('/sitemap.xml', async (req, res) => {
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

// STATIC
app.get('/privacy', (req, res) => res.render('privacy', {
  title: 'Privacy Policy',
  desc: 'Kebijakan Privasi'
}));
app.get('/terms', (req, res) => res.render('terms', {
  title: 'Terms of Service',
  desc: 'Syarat dan Ketentuan'
}));
app.get('/contact', (req, res) => res.render('contact', {
  title: 'Contact Us',
  desc: 'Hubungi Kami'
}));

app.use((req, res) => res.status(404).render('404', {
  title: '404 - Tidak Ditemukan',
  desc: 'Halaman tidak ditemukan.'
}));

app.listen(PORT, () => console.log(`🚀 Server berjalan di http://localhost:${PORT}`));