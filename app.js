const express = require('express');
const app = express();
const userModel = require('./models/user');
const postModel = require('./models/post');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/miniproject')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 
app.use(cookieParser());

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/register', async (req, res) => {
    let { username, password, name, age, email } = req.body;
    
    let user = await userModel.findOne({ email });
    if (user) return res.status(400).send('User already exists');

    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(password, salt, async (err, hash) => {
            let user = await userModel.create({
                username,
                password: hash,
                name,
                age,
                email
            });
            let token = jwt.sign({ email: email, userid: user._id }, "secret key");
            res.cookie("token", token);
            res.send("registered");
        });
    });
});

app.post('/login', async (req, res) => {
    let { password, email } = req.body;
    
    let user = await userModel.findOne({ email });
    if (!user) return res.status(400).send('Something Went Wrong');

    bcrypt.compare(password, user.password, function (err, result) {
        if (result) {
            let token = jwt.sign({ email: email, userid: user._id }, "secret key");
            res.cookie("token", token);
            res.status(200).send("you can login");
        } else {
            res.redirect("/login");
        }
    });
}); // <--- Correctly closed app.post('/login')

app.get('/logout', (req, res) => {
    res.cookie("token", "");
    res.redirect('/login');
});

function isLoggedIn(req, res, next) {
    if (!req.cookies.token || req.cookies.token === "") {
        return res.send("You Must Be Logged in");
    } else {
        let data = jwt.verify(req.cookies.token, "secret key");
        req.user = data;
        next();
    }
}

app.listen(3000, () => {
    console.log("Server running on port 3000");
});