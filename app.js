const express = require('express');
const app = express();
const userModel = require('./models/user');
const postModel = require('./models/post');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const upload = require("./config/multerconfig");

const JWT_SECRET = process.env.JWT_SECRET || "secret key";
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/miniproject';

// 1. Serverless MongoDB Connection Caching Logic
let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
            console.log('Connected to MongoDB');
            return mongooseInstance;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

// Database Connection Middleware for Serverless Execution
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("Database connection error:", err);
        next(err);
    }
});

// 3. View Engine & Static Assets Configuration (Absolute Paths)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'Public')));

// Authentication Middleware
function isLoggedIn(req, res, next) {
    if (!req.cookies.token || req.cookies.token === "") {
        return res.redirect('/login');
    }
    try {
        let data = jwt.verify(req.cookies.token, JWT_SECRET);
        req.user = data;
        next();
    } catch (err) {
        res.cookie("token", "");
        return res.redirect('/login');
    }
}

// Routes
app.get('/', (req, res, next) => {
    try {
        res.render('index');
    } catch (err) {
        next(err);
    }
});

app.get('/profile/upload', isLoggedIn, (req, res, next) => {
    try {
        res.render('profileupload');
    } catch (err) {
        next(err);
    }
});

// 4. Multer & Ephemeral Disk Guardrails
app.post('/upload', isLoggedIn, (req, res, next) => {
    upload.single("image")(req, res, async (err) => {
        if (err) {
            console.error("Multer upload error:", err);
            return res.status(500).send("Upload error: " + (err.message || "Storage error"));
        }
        try {
            let user = await userModel.findOne({ email: req.user.email });
            if (!user) return res.status(404).send("User not found");
            if (req.file) {
                user.profilepic = req.file.filename;
                await user.save();
            }
            res.redirect("/profile");
        } catch (dbErr) {
            next(dbErr);
        }
    });
});

app.get('/login', (req, res, next) => {
    try {
        res.render('login');
    } catch (err) {
        next(err);
    }
});

app.post('/register', async (req, res, next) => {
    try {
        let { username, password, name, age, email } = req.body;

        if (!email) return res.status(400).send('Email is required');
        if (!password) return res.status(400).send('Password is required');
        email = email.toLowerCase().trim();

        let user = await userModel.findOne({ email });
        if (user) return res.status(400).send('User already exists');

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        let newUser = await userModel.create({
            username,
            password: hash,
            name,
            age,
            email
        });

        let token = jwt.sign({ email: newUser.email, userid: newUser._id }, JWT_SECRET);
        res.cookie("token", token);
        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
});

app.post('/login', async (req, res, next) => {
    try {
        let { password, email } = req.body;

        if (!email) return res.status(400).send('Email is required');
        if (!password) return res.status(400).send('Password is required');
        email = email.toLowerCase().trim();

        let user = await userModel.findOne({ email });
        if (!user) return res.status(400).send('User not found with this email');

        const result = await bcrypt.compare(password, user.password);
        if (result) {
            let token = jwt.sign({ email: user.email, userid: user._id }, JWT_SECRET);
            res.cookie("token", token);
            res.redirect('/profile');
        } else {
            res.status(400).send('Incorrect password');
        }
    } catch (err) {
        next(err);
    }
});

app.get('/profile', isLoggedIn, async (req, res, next) => {
    try {
        let user = await userModel.findOne({ _id: req.user.userid }).populate("posts");

        if (!user) {
            res.cookie("token", "");
            return res.redirect('/login');
        }

        res.render('profile', { user });
    } catch (err) {
        next(err);
    }
});

app.get('/like/:id', isLoggedIn, async (req, res, next) => {
    try {
        let post = await postModel.findOne({ _id: req.params.id });
        if (!post) return res.redirect('/profile');

        const likeIndex = post.likes.indexOf(req.user.userid);
        if (likeIndex === -1) {
            post.likes.push(req.user.userid);
        } else {
            post.likes.splice(likeIndex, 1);
        }

        await post.save();
        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
});

app.get('/edit/:id', isLoggedIn, async (req, res, next) => {
    try {
        let post = await postModel.findOne({ _id: req.params.id }).populate('user');
        if (!post || !post.user || post.user._id.toString() !== req.user.userid) {
            return res.redirect('/profile');
        }

        res.render("edit", { post });
    } catch (err) {
        next(err);
    }
});

app.get('/delete/:id', isLoggedIn, async (req, res, next) => {
    try {
        let post = await postModel.findOne({ _id: req.params.id });
        if (!post) {
            return res.redirect('/profile');
        }

        // Authenticate ownership
        if (post.user.toString() !== req.user.userid) {
            return res.redirect('/profile');
        }

        // Disassociate post from user document using $pull
        await userModel.updateOne(
            { _id: req.user.userid },
            { $pull: { posts: req.params.id } }
        );

        // Delete post document
        await postModel.deleteOne({ _id: req.params.id });

        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
});

app.post('/update/:id', isLoggedIn, async (req, res, next) => {
    try {
        await postModel.findOneAndUpdate(
            { _id: req.params.id },
            { content: req.body.content }
        );
        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
});

app.post('/post', isLoggedIn, async (req, res, next) => {
    try {
        let user = await userModel.findOne({ _id: req.user.userid });
        if (!user) return res.redirect('/login');

        let { content } = req.body;

        let post = await postModel.create({
            user: user._id,
            content
        });

        user.posts.push(post._id);
        await user.save();
        res.redirect('/profile');
    } catch (err) {
        next(err);
    }
});

app.get('/logout', (req, res, next) => {
    try {
        res.cookie("token", "");
        res.redirect('/login');
    } catch (err) {
        next(err);
    }
});

// 5. Centralized Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("Vercel Runtime Telemetry Error Stack:\n", err.stack || err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>500 Internal Server Error</title></head>
        <body style="font-family: system-ui, sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc;">
            <h2>500 Internal Server Error</h2>
            <p>${err.message || "An unexpected error occurred."}</p>
            <a href="/" style="color: #38bdf8;">Return Home</a>
        </body>
        </html>
    `);
});

// 2. Serverless Export & Non-blocking Listener Logic
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;