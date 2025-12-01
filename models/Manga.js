// models/Manga.js
const mongoose = require('mongoose');

const MangaSchema = new mongoose.Schema({
    title: { type: String, required: true },
    alternativeTitle: String, // <--- FIELD BARU
    slug: { type: String, required: true, unique: true, index: true },
    thumb: String,
    synopsis: String,
    metadata: {
        status: String,
        type: { type: String }, 
        series: String,
        author: String,
        group: String,
        rating: String,
        created: String
    },
    tags: [String]
}, { timestamps: true });

module.exports = mongoose.model('Manga', MangaSchema);
