const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
    username: String,
    name: String,
    email: String,
    password: String,
    age: Number,
    profilepic: {
        type: String,
        default: "default.png"
    },
    posts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'post'
        }
    ]
});

module.exports = mongoose.models.user || mongoose.model('user', userSchema);