const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../controllers/user");
const Post = require("../models/post");
const Notification = require("../models/notification");
const User = require("../models/user");
const otpGenerator = require('otp-generator');
const { isLoggedIn } = require("../utils/middlewares");
const mailSender = require("../utils/forgetPasswordMail.js");
const multer  = require('multer');
const {storage, cloudinary} = require("../cloudconfig.js");
const upload = multer({ storage });

router.route("/signup")
    .get(userController.renderSignupForm)
    .post(userController.signup);


router.route("/login")
    .get(userController.renderLoginForm)
    .post(passport.authenticate('local', { failureRedirect: '/users/login', failureFlash: true }) , userController.login);

router.get("/logout", userController.logout);

router.get("/verify-email",isLoggedIn, userController.renderVerifyEmailForm);
router.post("/verify-email", isLoggedIn, userController.verifyEmail);

// render the profile edit page
router.get("/edit", isLoggedIn, (req, res, next) => {
    res.render("users/editprofile.ejs", {user: req.user});
});

// edit user info page
router.post("/edit", isLoggedIn, async(req, res, next) => {
    try {
        let {username, bio} = req.body;
        await User.findOneAndUpdate({_id: req.user._id}, {username: username, bio: bio});
        let user = await User.findById(req.user._id);

        req.login(user, (err) => {
            if(err) {
                return next(err);
            }
            res.redirect(`./${user._id}/profile`);
        })
    } catch(err) {
        return next(err);
    }
});

router.get("/forget-password", async(req, res, next) => {
    if(req.user) {
        req.logout((err) => {
            if(err) {
                return next(err);
            }
            req.flash("success", "You logged out successfully");
            return res.render("users/forgetPassword");
        });
    } else {
        return res.render("users/forgetPassword");
    }
});

router.post("/forget-password", async(req, res, next) => {
    let {email, otp} = req.body;
    let user = await User.findOne({email});
    if(user) {
        if(user.otp == otp) {
            // after otp and email verification auto login for further process
            req.login(user, (err) => {
                if(err) {
                    return next(err);
                }
                return res.json({ success: true, message: `user found and otp matched` });
            })
        } else {
            return res.json({ success: false, message: `otp does not match` });    
        }
    } else {
        return res.json({ success: false, message: `user not find` });
    }
});

router.get("/reset-password",isLoggedIn, (req, res, next) => {
    res.render("users/resetPassword.ejs");
});

router.post("/reset-password", isLoggedIn, async(req, res, next) => {
    try {
        let {password} = req.body;
        let user = req.user;

        await User.findOneAndDelete({email: user.email});

        let userOption = {
            _id: user._id,
            username: user.username, 
            email: user.email, 
            otp: user.otp, 
            isVerified: user.isVerified,
            bio: user.bio,
            profile_image: user.profile_image
        }
        let newUser = new User(userOption);
        const registeredUser = await User.register(newUser, password);
        
        req.login(registeredUser, (err) => {
            if(err) {
                return next(err);
            }
            req.flash("success", "Signup successfull");
            res.redirect(`/`);
        })
    } catch(err) {
        return next(err);
    }
});

router.post("/updateProfile", isLoggedIn, upload.single("image"), async(req, res, next) => {
    let user = req.user;
    if(user.profile_image.filename  && req.file) {
        await cloudinary.uploader.destroy(user.profile_image.filename);
    }
    if(req.file) {
        user.profile_image.filename = req.file.filename;
        user.profile_image.url = req.file.path;
        await user.save();
    }
    res.redirect(`./${user._id}/profile`);
})

router.post("/forget-password/sendOtp", async(req, res, next) => {
    const {email} = req.body;
    try {
        let otp = otpGenerator.generate(4, { 
            upperCaseAlphabets: false, 
            specialChars: false,
            lowerCaseAlphabets: false,
        });
        let user = await User.findOneAndUpdate({email}, {email, otp});
        if(user) {
            mailSender(user.username, email, otp);

            res.json({ success: true, message: `OTP send to ${email}` });
        } else {
            res.redirect("/users/forget-password");
        }
    } catch(err) {   // if wrong email entered by the user
        req.flash("error", err.message);
        res.redirect("/users/forget-password");
    }
});

// user profile page
router.get("/:id/profile", isLoggedIn, async(req, res, next) => {
    let {id} = req.params;
    let posts = await Post.find({creater: id});
    let user = await User.findOne({_id: id});
    console.log(posts[0])
    res.render("users/userPage.ejs", {user, posts});
});

// notification page
router.get("/notification", isLoggedIn, async(req, res, next) => {
    let notifications = (await Notification.find({to: req.user._id}).populate("from").populate("to").populate("post")).reverse();
    res.render("users/notification.ejs", {notifications});
});


module.exports = router;