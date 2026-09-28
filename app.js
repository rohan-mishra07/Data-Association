const express = require('express');
const app = express();
const userModel = require('./models/user');
const postModel = require('./models/post');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

const JWT_SECRET = "secret key";

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/miniproject')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware configuration
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'Public')));

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './Public/images/uploads');
    },
    filename: function (req, file, cb) {
        crypto.randomBytes(12, function (err, bytes) {
            if (err) return cb(err);
            const fn = bytes.toString("hex") + path.extname(file.originalname);
            cb(null, fn);
        });
    }
});

const upload = multer({ storage: storage });

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
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/test', (req, res) => {
    res.render('test');
});

app.post('/upload', upload.single('image'), (req, res) => {
    console.log(req.file);
    res.redirect('/test');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/register', async (req, res) => {
    let { username, password, name, age, email } = req.body;

    if (!email) return res.status(400).send('Email is required');
    email = email.toLowerCase().trim();

    let user = await userModel.findOne({ email });
    if (user) return res.status(400).send('User already exists');

    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(password, salt, async (err, hash) => {
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
        });
    });
});

app.post('/login', async (req, res) => {
    let { password, email } = req.body;

    if (!email) return res.status(400).send('Email is required');
    email = email.toLowerCase().trim();

    let user = await userModel.findOne({ email });
    if (!user) return res.status(400).send('User not found with this email');

    bcrypt.compare(password, user.password, function (err, result) {
        if (result) {
            let token = jwt.sign({ email: user.email, userid: user._id }, JWT_SECRET);
            res.cookie("token", token);
            res.redirect('/profile');
        } else {
            res.status(400).send('Incorrect password');
        }
    });
});

app.get('/profile', isLoggedIn, async (req, res) => {
    let user = await userModel.findOne({ _id: req.user.userid }).populate("posts");

    if (!user) {
        res.cookie("token", "");
        return res.redirect('/login');
    }

    res.render('profile', { user });
});

app.get('/like/:id', isLoggedIn, async (req, res) => {
    let post = await postModel.findOne({ _id: req.params.id });

    if (post.likes.indexOf(req.user.userid) === -1) {
        post.likes.push(req.user.userid);
    } else {
        post.likes.splice(post.likes.indexOf(req.user.userid), 1);
    }

    await post.save();
    res.redirect('/profile');
});

app.get('/edit/:id', isLoggedIn, async (req, res) => {
    let post = await postModel.findOne({ _id: req.params.id }).populate('user');
    if (post.user._id.toString() !== req.user.userid) {
        return res.redirect('/profile');
    }

    res.render("edit", { post });
});

app.post('/update/:id', isLoggedIn, async (req, res) => {
    await postModel.findOneAndUpdate(
        { _id: req.params.id },
        { content: req.body.content }
    );

    res.redirect('/profile');
});

app.post('/post', isLoggedIn, async (req, res) => {
    let user = await userModel.findOne({ _id: req.user.userid });
    let { content } = req.body;

    let post = await postModel.create({
        user: user._id,
        content
    });

    user.posts.push(post._id);
    await user.save();
    res.redirect('/profile');
});

app.get('/logout', (req, res) => {
    res.cookie("token", "");
    res.redirect('/login');
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});