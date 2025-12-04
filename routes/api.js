// routes/api.js
const express = require('express');
const router = express.Router();
const Manga = require('../models/Manga');
const Chapter = require('../models/Chapter');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Format Standard Response
// successResponse(res, data, pagination)
const successResponse = (res, data, pagination = null) => {
    res.json({
        success: true,
        data,
        pagination
    });
};

const errorResponse = (res, message, code = 500) => {
    res.status(code).json({ success: false, message });
};

// Helper: Hitung Chapter Count untuk List Manga
async function attachChapterCounts(mangas) {
    return await Promise.all(mangas.map(async (m) => {
        // Hitung jumlah dokumen di collection Chapter berdasarkan manga_id
        const count = await Chapter.countDocuments({ manga_id: m._id });
        
        // Konversi Mongoose Document ke Plain Object agar bisa ditambah properti baru
        const mObj = m.toObject ? m.toObject() : m; 
        mObj.chapter_count = count;
        
        return mObj;
    }));
}

// ==========================================
// 1. HOME & LISTING ENDPOINTS
// ==========================================

// GET /api/home 
router.get('/home', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const skip = (page - 1) * limit;

        const totalManga = await Manga.countDocuments();

        // 1. Recents (Update Terbaru) - Apply Pagination here for 'Load More' feature
        let recents = await Manga.find()
            .select('title slug thumb metadata')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);
        recents = await attachChapterCounts(recents);

        // 2. Trending (Top Views) - Fixed 10 items
        let trending = await Manga.find()
            .select('title slug thumb views metadata')
            .sort({ views: -1 })
            .limit(10);
        trending = await attachChapterCounts(trending);

        // 3. Manhwa (Tipe Manhwa Terbaru) - Fixed 10 items
        let manhwas = await Manga.find({ 'metadata.type': { $regex: 'manhwa', $options: 'i' } })
            .select('title slug thumb metadata')
            .sort({ updatedAt: -1 })
            .limit(10);
        manhwas = await attachChapterCounts(manhwas);

        // PERBAIKAN DI SINI: Pagination dikirim sebagai argumen ke-3
        successResponse(res, { 
            recents, 
            trending,
            manhwas 
        }, {
            currentPage: page,
            totalPages: Math.ceil(totalManga / limit),
            totalItems: totalManga,
            perPage: limit
        });

    } catch (err) {
        errorResponse(res, err.message);
    }
});

// GET /api/manga-list
router.get('/manga-list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const skip = (page - 1) * limit;

        const total = await Manga.countDocuments();
        
        let mangas = await Manga.find()
            .select('title slug thumb metadata.rating metadata.status metadata.type')
            .sort({ title: 1 })
            .skip(skip)
            .limit(limit);

        mangas = await attachChapterCounts(mangas);

        successResponse(res, mangas, {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            perPage: limit
        });
    } catch (err) {
        errorResponse(res, err.message);
    }
});

// ==========================================
// 2. DETAIL & READ ENDPOINTS
// ==========================================

// GET /api/manga/:slug
router.get('/manga/:slug', async (req, res) => {
    try {
        const manga = await Manga.findOneAndUpdate(
            { slug: req.params.slug },
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!manga) return errorResponse(res, 'Manga not found', 404);

        const chapters = await Chapter.find({ manga_id: manga._id })
            .select('title slug chapter_index createdAt')
            .sort({ chapter_index: 1 });

        const resultManga = manga.toObject();
        resultManga.chapter_count = chapters.length;

        successResponse(res, { info: resultManga, chapters });
    } catch (err) {
        errorResponse(res, err.message);
    }
});

// GET /api/read/:slug/:chapterSlug
router.get('/read/:slug/:chapterSlug', async (req, res) => {
    try {
        const manga = await Manga.findOne({ slug: req.params.slug }).select('_id title slug thumb');
        if (!manga) return errorResponse(res, 'Manga not found', 404);

        const chapter = await Chapter.findOne({ 
            manga_id: manga._id, 
            slug: req.params.chapterSlug 
        });

        if (!chapter) return errorResponse(res, 'Chapter not found', 404);

        const nextChap = await Chapter.findOne({ manga_id: manga._id, chapter_index: chapter.chapter_index + 1 }).select('slug title');
        const prevChap = await Chapter.findOne({ manga_id: manga._id, chapter_index: chapter.chapter_index - 1 }).select('slug title');

        successResponse(res, { 
            chapter, 
            manga, 
            navigation: {
                next: nextChap ? nextChap.slug : null,
                prev: prevChap ? prevChap.slug : null
            }
        });
    } catch (err) {
        errorResponse(res, err.message);
    }
});

// ==========================================
// 3. SEARCH & FILTERS
// ==========================================

// GET /api/search?q=keyword
router.get('/search', async (req, res) => {
    try {
        const keyword = req.query.q;
        if (!keyword) return errorResponse(res, 'Query parameter "q" required', 400);

        const page = parseInt(req.query.page) || 1;
        const limit = 24;
        const skip = (page - 1) * limit;

        const query = { title: { $regex: keyword, $options: 'i' } };
        const total = await Manga.countDocuments(query);

        let mangas = await Manga.find(query)
            .select('title slug thumb metadata')
            .skip(skip)
            .limit(limit);

        mangas = await attachChapterCounts(mangas);

        successResponse(res, mangas, {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            perPage: limit
        });
    } catch (err) {
        errorResponse(res, err.message);
    }
});

// GET /api/genres
router.get('/genres', async (req, res) => {
    try {
        const genres = await Manga.aggregate([
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        successResponse(res, genres);
    } catch (err) {
        errorResponse(res, err.message);
    }
});

// GET /api/filter/:type/:value
router.get('/filter/:type/:value', async (req, res) => {
    try {
        const { type, value } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = 24;
        const skip = (page - 1) * limit;

        let query = {};

        if (type === 'genre') {
            const parts = value.split('-').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const regex = parts.join('[- ]');
            query = { tags: { $regex: new RegExp(regex, 'i') } };
        } else if (type === 'status') {
            query = { 'metadata.status': { $regex: `^${value}$`, $options: 'i' } };
        } else if (type === 'type') {
            query = { 'metadata.type.type': { $regex: `^${value}$`, $options: 'i' } };
        } else {
            return errorResponse(res, 'Invalid filter type. Use: genre, status, or type.', 400);
        }

        const total = await Manga.countDocuments(query);
        let mangas = await Manga.find(query)
            .select('title slug thumb metadata')
            .skip(skip)
            .limit(limit);

        mangas = await attachChapterCounts(mangas);

        successResponse(res, mangas, {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            filter: { type, value },
            perPage: limit
        });

    } catch (err) {
        errorResponse(res, err.message);
    }
});

module.exports = router;
