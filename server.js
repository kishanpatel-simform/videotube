var express = require("express");
var app = express();
var http = require("http").createServer(app);

var mongodb = require("mongodb");
var mongoClient = mongodb.MongoClient;
var ObjectID = mongodb.ObjectID;

var formidable = require("formidable");
var fileSystem = require("fs");
var { getVideoDurationInSeconds } = require("get-video-duration");

var bodyParser = require("body-parser");
var bcrypt = require("bcrypt");

var mv = require('mv');

function getUser(id, callback) {
    database.collection("users").findOne({
        "_id": ObjectID(id)
    }, function(_error, user) {
        callback(user);
    });
}

var expressSession = require("express-session");
const { request } = require("express");
app.use(expressSession({
    "key": "user_id",
    "secret": "User secret Object Id",
    "resave": true,
    "saveUninitialized": true
}));

app.use(bodyParser.json({
    limit: "10000mb"
}));

app.use(bodyParser.urlencoded({
    extended: true,
    limit: "10000mb",
    parameterLimit: 1000000
}));

app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");

http.listen(3000, function() {
    console.log("server started.");

    mongoClient.connect("mongodb+srv://jenil:YgKVZ69aHMnrt6Yy@cluster0.jtt7h.mongodb.net/myDatabase2?retryWrites=true&w=majority", { useUnifiedTopology: true }, function(_error, client) {
        database = client.db("videoStreaming");

        app.get("/", function(request, result) {

            database.collection("videos").find({}).sort({
                "createdAt": -1
            }).toArray(function(_error, videos) {
                result.render("index", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos
                });
            });

        });

        app.get("/logout", function(request, result) {
            request.session.destroy();
            result.redirect("/");
        });

        app.get("/signup", function(request, result) {
            result.render("signup");
        });

        app.get("/login", function(request, result) {
            result.render("login", {
                "error": "",
                "message": ""
            });
        });

        app.post("/login", function(request, result) {
            var email = request.body.email;
            var password = request.body.password;

            database.collection("users").findOne({
                "email": email
            }, function(_error1, user) {
                if (user == null) {
                    result.send("Email does not exist");
                } else {
                    bcrypt.compare(password, user.password, function(_error, isVerify) {
                        if (isVerify) {
                            request.session.user_id = user._id;
                            result.redirect("/");
                        } else {
                            result.send("Password is not correct");
                        }
                    });
                }
            });
        });

        app.post("/signup", function(request, result) {
            var name = request.body.name;
            var email = request.body.email;
            var password = request.body.password;

            if (name == "" || email == "" || password == "") {
                result.render("signup", {
                    "error": "Please fill all fields",
                    "message": ""
                });
                return;
            }

            database.collection("users").findOne({
                "email": email
            }, function(_error1, user) {
                if (user == null) {
                    bcrypt.hash(password, 10, function(_error3, hash) {
                        database.collection("users").insertOne({
                            "name": name,
                            "email": email,
                            "password": hash,
                            "coverPhoto": "",
                            "subscribers": 0,
                            "subscription": [],
                            "playlists": [],
                            "videos": [],
                            "history": [],
                            "notification": []
                        }, function(_error2, _data) {
                            result.redirect("/login");
                        });
                    });
                } else {
                    result.render("register", {
                        "error": "Email already exists",
                        "message": ""
                    });
                }
            });
        });

        app.get("/upload", function(request, result) {
            if (request.session.user_id) {
                result.render("upload", {
                    "isLogin": true
                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/upload-video", function(request, result) {
            if (request.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.maxFileSize = 1000 * 1024 * 1024;
                formData.parse(request, function(_error, fields, files) {
                    var title = fields.title;
                    var description = fields.description;
                    var tags = fields.tags;
                    var category = fields.category;

                    var oldPathThumbnail = files.thumbnail.path;
                    var thumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail.name;

                    // fileSystem.rename(oldPathThumbnail, thumbnail, function(error) {
                    //     if (error) throw error;
                    // });

                    mv(oldPathThumbnail, thumbnail, function(err) {
                        if (err) throw err;
                    });

                    var oldPathVideo = files.video.path;
                    var newPath = "public/videos/" + new Date().getTime() + "-" + files.video.name;

                    //fileSystem.rename(oldPathVideo, newPath, function(error) 

                    mv(oldPathVideo, newPath, function(_error) {
                        getUser(request.session.user_id, function(user) {
                            var currentTime = new Date().getTime();

                            getVideoDurationInSeconds(newPath).then(function(duration) {
                                var hours = Math.floor(duration / 60 / 60);
                                var minutes = Math.floor(duration / 60) - (hours * 60);
                                var seconds = Math.floor(duration % 60);

                                database.collection("videos").insertOne({
                                    "user": {
                                        "_id": user._id,
                                        "name": user.name,
                                        "image": user.image,
                                        "subscribers": user.subscribers
                                    },
                                    "filepath": newPath,
                                    "thumbnail": thumbnail,
                                    "title": title,
                                    "description": description,
                                    "tags": tags,
                                    "category": category,
                                    "createdAt": currentTime,
                                    "minutes": minutes,
                                    "seconds": seconds,
                                    "hours": hours,
                                    "watch": currentTime,
                                    "views": 0,
                                    "playlist": "",
                                    "likers": [],
                                    "dislikers": [],
                                    "comments": []
                                }, function(_error, data) {
                                    database.collection("users").updateOne({
                                        "_id": ObjectID(request.session.user_id)
                                    }, {
                                        $push: {
                                            "videos": {
                                                "_id": data.insertedId,
                                                "title": title,
                                                "views": 0,
                                                "thumbnail": thumbnail,
                                                "watch": currentTime
                                            }
                                        }
                                    });

                                    result.redirect("/");

                                });
                            });

                        });
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.get("/watch/:watch", function(request, result) {
            database.collection("videos").findOne({
                "watch": parseInt(request.params.watch)
            }, function(_error, video) {
                if (video == null) {
                    result.send("Video does not exist.");
                } else {

                    database.collection("videos").updateOne({
                        "_id": ObjectID(video._id)
                    }, {
                        $inc: {
                            "views": 1
                        }
                    });

                    result.render("video-page/index", {
                        "isLogin": request.session.user_id ? true : false,
                        "video": video,
                        "playlist": [],
                        "playlistId": ""
                    });
                }
            });
        });


        app.post("/do-like", function(request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    "_id": ObjectID(request.body.videoId),
                    "likers._id": request.session.user_id
                }, function(_error, video) {
                    if (video == null) {
                        database.collection("videos").updateOne({
                            "_id": ObjectID(request.body.videoId)
                        }, {
                            $push: {
                                "likers": {
                                    "_id": request.session.user_id
                                }
                            }
                        }, function(_error, _data) {
                            result.json({
                                "status": "success",
                                "message": "Video has been liked"
                            });
                        });
                    } else {
                        result.json({
                            "status": "error",
                            "message": "Already liked this video"
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please login"
                });
            }
        });


        app.post("/do-dislike", function(request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    "_id": ObjectID(request.body.videoId),
                    "dislikers._id": request.session.user_id
                }, function(_error, video) {
                    if (video == null) {
                        database.collection("videos").updateOne({
                            "_id": ObjectID(request.body.videoId)
                        }, {
                            $push: {
                                "dislikers": {
                                    "_id": request.session.user_id
                                }
                            }
                        }, function(_error, _data) {
                            result.json({
                                "status": "success",
                                "message": "Video has been liked"
                            });
                        });
                    } else {
                        result.json({
                            "status": "error",
                            "message": "Already liked this video"
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please Login"
                });
            }
        });


        app.post("/do-comment", function(request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function(user) {
                    database.collection("videos").findOneAndUpdate({
                        "_id": ObjectID(request.body.videoId)
                    }, {
                        $push: {
                            "comments": {
                                "_id": ObjectID(),
                                "user": {
                                    "_id": user._id,
                                    "name": user.name,
                                    "image": user.image
                                },
                                "comment": request.body.comment,
                                "createdAt": new Date().getTime(),
                                "replies": []
                            }
                        }
                    }, function(_error, data) {
                        var channelId = data.value.user._id;
                        database.collection("users").updateOne({
                            "_id": ObjectID(channelId)
                        }, {
                            $push: {
                                "notifications": {
                                    "_id": ObjectID(),
                                    "type": "new_comment",
                                    "content": request.body.comment,
                                    "is_read": false,
                                    "video_watch": data.value.watch,
                                    "user": {
                                        "_id": user._id,
                                        "name": user.name,
                                        "image": user.image
                                    }
                                }
                            }
                        });

                        result.json({
                            "status": "success",
                            "message": "Comment Posted",
                            "user": {
                                "_id": user._id,
                                "name": user.name,
                                "image": user.image
                            }
                        });

                    });
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please Login"
                });
            }
        });

        app.get("/get_user", function(request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function(users) {
                    delete users.password;

                    result.json({
                        "user": users,
                        "status": "success",
                        "message": "Record fetched"
                    });
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please Login"
                });
            }
        });

        app.post("/read-notification", function(request, result) {
            if (request.session.user_id) {
                database.collection("users").updateOne({
                    $and: [{
                        "_id": ObjectID(request.session.user_id)
                    }, {
                        "notifications._id": ObjectID(request.body.notificationId)
                    }]
                }, {
                    $set: {
                        "notifications.$.is_read": true
                    }
                }, function(_error1, _data) {
                    result.json({
                        "status": "success",
                        "message": "Notification has been marked as read."
                    });
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please Login"
                });
            }
        });

        app.post("/do-reply", function(request, result) {
            if (request.session.user_id) {
                var reply = request.body.reply;
                var commentId = request.body.commentId;

                getUser(request.session.user_id, function(user) {
                    database.collection("videos").findOneAndUpdate({
                        "comments._id": ObjectID(commentId)
                    }, {
                        $push: {
                            "comments.$.replies": {
                                "_id": ObjectID(),
                                "user": {
                                    "_id": user._id,
                                    "name": user.name,
                                    "image": user.image
                                },
                                "reply": reply,
                                "createdAt": new Date().getTime()
                            }
                        }
                    }, function(_error1, data) {
                        var videoWatch = data.value.watch;
                        for (var a = 0; a < data.value.comments.length; a++) {
                            var comment = data.value.comments[a];

                            if (comment._id == commentId) {
                                var _id = comment.user._id;

                                database.collection("user").updateOne({
                                    "_id": ObjectID(_id)
                                }, {
                                    $push: {
                                        "notifications": {
                                            "_id": ObjectID(),
                                            "type": "new_reply",
                                            "content": reply,
                                            "is_read": false,
                                            "video_watch": videoWatch,
                                            "user": {
                                                "_id": user._id,
                                                "name": user.name,
                                                "image": user.image
                                            }
                                        }
                                    }
                                });
                                break;
                            }
                        }
                        result.json({
                            "status": "success",
                            "message": "Reply Posted",
                            "user": {
                                "_id": user._id,
                                "name": user.name,
                                "image": user.image
                            }
                        });
                    });
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please Login"
                });
            }
        });

        app.post("/do-subscribe", function(request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    "_id": ObjectID(request.body.videoId)
                }, function(error1, video) {
                    if (request.session.user_id == video.user._id) {
                        result.json({
                            "status": "error",
                            "message": "You can not subscribe your own channel."
                        });
                    } else {

                        getUser(request.session.user_id, function(myData) {
                            var flag = false;
                            for (var a = 0; a < myData.subscription.length; a++) {
                                if (myData.subscription[a]._id.toString() == video.user._id.toString()) {
                                    flag = true;
                                    break;
                                }
                            }

                            if (flag) {
                                result.json({
                                    "status": "error",
                                    "message": "Already Subscribed"
                                });
                            } else {
                                database.collection("users").findOneAndUpdate({
                                    "_id": video.user._id
                                }, {
                                    $inc: {
                                        "subscribers": 1
                                    }
                                }, {
                                    reurnOriginal: false
                                }, function(error2, userData) {
                                    database.collection("users").updateOne({
                                        "_id": ObjectID(request.session.user_id)
                                    }, {
                                        $push: {
                                            "subscription": {
                                                "_id": video.user._id,
                                                "name": video.user.name,
                                                "subscribers": userData.value.subscribers,
                                                "image": userData.value.image
                                            }
                                        }
                                    }, function(error3, data) {
                                        database.collection("videos").findOneAndUpdate({
                                            "_id": ObjectID(request.body.videoId)
                                        }, {
                                            $inc: {
                                                "user.subscribers": 1
                                            }
                                        });

                                        result.json({
                                            "status": "success",
                                            "message": "Subscription has been added"
                                        });
                                    });
                                });
                            }
                        });
                    }
                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please Login"
                });
            }
        });

        app.get("/get-related-videos/:category/:videoId", function(request, result) {
            database.collection("videos").find({
                $and: [{
                    "category": request.params.category
                }, {
                    "_id": {
                        $ne: ObjectID(request.params.videoId)
                    }
                }]
            }).toArray(function(_error, videos) {
                for (var a = 0; a < videos.lengh; a++) {
                    var x = videos[a];
                    var y = Math.floor(Math.random() * (a + 1));
                    videos[a] = videos[y];
                    videos[y] = x;
                }
                result.json(videos);
            });
        });

        app.post("/save-history", function(request, result) {
            if (request.session.user_id) {
                console.log(ObjectID(request.body.vId));
                database.collection("videos").findOne({
                    "_id": ObjectID(request.body.vId)
                }, function(_error, video) {
                    database.collection("users").findOne({
                        $and: [{
                            "_id": ObjectID(request.session.user_id)
                        }, {
                            "history.videoId": request.body.vId
                        }]
                    }, function(_error, history) {
                        if (history == null) {
                            database.collection("users").updateOne({
                                "_id": ObjectID(request.session.user_id)
                            }, {
                                $push: {
                                    "history": {
                                        "_id": ObjectID(),
                                        "videoId": request.body.vId,
                                        "watch": video.watch,
                                        "title": video.title,
                                        "watched": request.body.watched,
                                        "thumbnail": video.thumbnail,
                                        "minutes": video.minutes,
                                        "seconds": video.seconds

                                    }
                                }
                            });

                            result.json({
                                "status": "success",
                                "message": "History has been added"
                            });

                        } else {
                            database.collection("users").updateOne({
                                $and: [{
                                    "_id": ObjectID(request.session.user_id)
                                }, {
                                    "history.videoId": request.body.videoId
                                }]
                            }, {
                                $set: {
                                    "history.$.watched": request.body.watched
                                }
                            });
                            result.json({
                                "status": "success",
                                "message": "History has been updated"
                            });
                        }
                    });


                });
            } else {
                result.json({
                    "status": "error",
                    "message": "Please login to perform this Action."
                });
            }
        });

        app.get("/watch-history", function(request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function(user) {
                    result.render("watch-history", {
                        "isLogin": true,
                        "videos": user.history
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/delete-from-history", function(request, result) {
            if (request.session.user_id) {
                database.collection("users").updateOne({
                    $and: [{
                        "_id": ObjectID(request.session.user_id)
                    }, {
                        "history.videoId": request.body.videoId
                    }]
                }, {
                    $pull: {
                        "history": {
                            "videoId": request.body.videoId
                        }
                    }
                });
                result.redirect("/watch-history");
            } else {
                result.redirect("/login");
            }
        });

        app.get("/channel/:_id", function(request, result) {
            getUser(request.params._id, function(user) {
                if (user == null) {
                    result.send("Channel not found");
                } else {
                    result.render("single-channel", {
                        "isLogin": request.session.user_id ? true : false,
                        "user": user,
                        "isMyChannel": request.session.user_id == request.params._id
                    });
                }
            });
        });


        app.post("/change-profile-picture", function(request, result) {
            if (request.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.parse(request, function(error, fields, files) {
                    var oldPath = files.image.path;
                    var newPath = "public/profiles/" + files.image.name;
                    mv(oldPath, newPath, function(error) {
                        database.collection("users").updateOne({
                            "_id": ObjectID(request.session.user_id)
                        }, {
                            $set: {
                                "image": newPath
                            }
                        });
                        database.collection("users").updateOne({
                            "subscriptions._id": ObjectID(request.session.user_id)
                        }, {
                            $set: {
                                "subscriptions.$.image": newPath
                            }
                        });

                        database.collection("videos").updateOne({
                            "user._id": ObjectID(request.session.user_id)
                        }, {
                            $set: {
                                "user.image": newPath
                            }
                        });
                        result.redirect("/mychannel");
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/change-cover-picture", function(request, result) {
            if (request.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.parse(request, function(error, fields, files) {
                    var oldPath = files.image.path;
                    var newPath = "public/covers/" + request.session.user_id + "_" + files.image.name;
                    mv(oldPath, newPath, function(error) {
                        database.collection("users").updateOne({
                            "_id": ObjectID(request.session.user_id)
                        }, {
                            $set: {
                                "coverPhoto": newPath
                            }
                        });
                        result.redirect("/channel/" + request.session.user_id);
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.get("/edit/:watch", function(request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    $and: [{
                        "watch": parseInt(request.params.watch)
                    }, {
                        "user._id": ObjectID(request.session.user_id)
                    }]
                }, function(error, video) {
                    if (video == null) {
                        result.send("Sorry you do not own this video.");
                    } else {
                        getUser(request.session.user_id, function(user) {
                            result.render("edit-video", {
                                "isLogin": true,
                                "video": video,
                                "user": user
                            });
                        });

                    }
                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/edit", function(request, result) {
            if (request.session.user_id) {
                var formData = new formidable.IncomingForm();
                formData.parse(request, function(error, fields, files) {
                    database.collection("videos").findOne({
                        $and: [{
                            "_id": ObjectID(fields.videoId)
                        }, {
                            "user._id": ObjectID(request.session.user_id)
                        }]
                    }, function(error, mainVideo) {
                        if (mainVideo == null) {
                            result.send("Sorry you do not own this video");
                        } else {
                            if (files.thumbnail.size > 0) {
                                var oldPath = files.thumbnail.path;
                                mv(oldPath, mainVideo.thumbnail, function(error) {
                                    //
                                });
                            }
                            database.collection("videos").findOneAndUpdate({
                                "_id": mongodb.ObjectID(fields.videoId)
                            }, {
                                $set: {
                                    "title": fields.title,
                                    "description": fields.description,
                                    "tags": fields.tags,
                                    "category": fields.category,
                                    "thumbnail": mainVideo.thumbnail,
                                    "playlist": fields.playlist
                                }
                            }, function(error, data) {
                                if (fields.playlist == "") {
                                    database.collection("users").findOneAndUpdate({
                                        $and: [{
                                            "_id": ObjectID(request.session.user_id)
                                        }, {
                                            "videos._id": ObjectID(fields.videoId)
                                        }]
                                    }, {
                                        $set: {
                                            "videos.$.title": fields.title,
                                            "videos.$. thumbnail": mainVideo.thumbnail
                                        }
                                    });
                                    database.collection("users").updateOne({
                                        $and: [{
                                            "_id": ObjectID(request.session.user_id)
                                        }, {
                                            "playlists._id": ObjectID(mainVideo.playlist)
                                        }]
                                    }, {
                                        $pull: {
                                            "playlists. $.videos": {

                                                "_id": fields.videoId
                                            }
                                        }
                                    });

                                } else {
                                    if (mainVideo.playlist != "") {
                                        database.collection("users").updateOne({
                                            $and: [{
                                                "_id": ObjectID(request.session.user_id)
                                            }, {
                                                "playlists._id": ObjectID(mainVideo.playlist)
                                            }]
                                        }, {
                                            $pull: {
                                                "playlists.$.videos": {
                                                    "_id": fields.videoId
                                                }
                                            }
                                        });
                                    }
                                    database.collection("users").updateOne({
                                        $and: [{
                                            "_id": ObjectID(request.session.user_id)
                                        }, {
                                            "playlists._id": ObjectID(fields.playlist)
                                        }]
                                    }, {
                                        $push: {
                                            "playlists.$.videos": {
                                                "_id": fields.videoId,
                                                "title": fields.title,
                                                "watch": mainVideo.watch,
                                                "thumbnail": mainVideo.thumbnail
                                            }
                                        }
                                    });
                                }

                                result.redirect("/edit/" + mainVideo.watch);
                            });
                        }
                    });
                });
            } else {
                result.redirect("/login");
            }
        });


        app.post("/delete-video", function(request, result) {
            if (request.session.user_id) {
                database.collection("videos").findOne({
                    $and: [{
                        "_id": ObjectID(request.body._id)
                    }, {
                        "user._id": ObjectID(request.session.user_id)
                    }]
                }, function(error, video) {
                    if (video == null) {
                        result.send("Sorry. You do not own this video.");
                        return;
                    }
                    fileSystem.unlink(video.filepath, function(error) {
                        fileSystem.unlink(video.thumbnail, function(error) {
                            //
                        });;
                    });
                    database.collection("videos").remove({
                        $and: [{
                            "_id": ObjectID(request.body._id)
                        }, {
                            "user._id": ObjectID(request.session.user_id)
                        }]
                    });
                    database.collection("users").findOneAndUpdate({
                        "_id": ObjectID(request.session.user_id)
                    }, {
                        $pull: {
                            "videos": {
                                "_id": ObjectID(request.body._id)
                            }
                        }
                    });
                    database.collection("users").updateMany({}, {
                        $pull: {
                            "history": {
                                "videoId": request.body._id.toString()
                            }
                        }
                    });

                    getUser(request.session.user_id, function(user) {
                        var playlistId = "";
                        for (var a = 0; a < user.playlists.length; a++) {
                            for (var b = 0; b < user.playlists[a].videos.length; b++) {
                                var video = user.playlists[a].videos[b];
                                if (video._id == request.body._id) {
                                    playlistId = user.playlists[a]._id;
                                    break;
                                }
                            }
                        }
                        if (playlistId != "") {
                            database.collection("users").updateOne({
                                $and: [{
                                    "_id": ObjectID(request.session.user_id)
                                }, {
                                    "playlists._id": ObjectID(playlistId)
                                }]
                            }, {
                                $pull: {
                                    "playlists.$.videos": {
                                        "_id": request.body._id
                                    }
                                }
                            });
                        }
                    });


                    result.redirect("/mychannel");
                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/create-playlist", function(request, result) {
            if (request.session.user_id) {
                database.collection("users").updateOne({
                    "_id": ObjectID(request.session.user_id)
                }, {
                    $push: {
                        "playlists": {
                            "_id": ObjectID(),
                            "title": request.body.title,
                            "videos": []
                        }
                    }
                });
                result.redirect("/channel/" + request.session.user_id)
            } else {
                result.redirect("/login");
            }
        });

        app.get("/playlist/:_id/:watch", function(request, result) {
            database.collection("videos").findOne({
                $and: [{
                    "watch": parseInt(request.params.watch)
                }, {
                    "playlist": request.params._id
                }]
            }, function(error, video) {
                if (video == null) {
                    result.send("Video does not exist.");
                } else {
                    database.collection("videos").updateOne({
                        "_id": ObjectID(video._id)
                    }, {
                        $inc: {
                            "views": 1
                        }
                    });
                    getUser(video.user._id, function(user) {
                        var playlistVideos = [];
                        for (var a = 0; a < user.playlists.length; a++) {
                            if (user.playlists[a]._id == request.params._id) {
                                playlistVideos = user.playlists[a].videos;
                                break;
                            }
                        }
                        result.render("video-page/index", {
                            "isLogin": request.session.user_id ? true : false,
                            "video": video,
                            "playlist": playlistVideos,
                            "playlistId": request.params._id
                        });
                    });
                }
            });
        });

        app.post("/delete-playlist", function(request, result) {
            if (request.session.user_id) {
                database.collection("users").findOne({
                    $and: [{
                        "_id": ObjectID(request.session.user_id)
                    }, {
                        "playlists._id": ObjectID(request.body._id)
                    }]
                }, function(error, data) {
                    if (data == null) {
                        result.send("Sorry. You do not own this playlist.");
                        return;
                    }
                    database.collection("users").updateOne({
                        "_id": ObjectID(request.session.user_id)
                    }, {
                        $pull: {
                            "playlists": {
                                "_id": ObjectID(request.body._id)
                            }
                        }
                    });
                    database.collection("videos").updateMany({
                        "playlist": request.body._id
                    }, {
                        $set: {
                            "playlist": ""
                        }
                    });
                });
                result.redirect("/channel/" + request.session.user_id);
            } else {
                result.redirect("/login");
            }
        });

        app.get("/subscriptions", function(request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function(user) {
                    result.render("subscriptions", {
                        "isLogin": true,
                        "user": user
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.get("/mychannel", function(request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function(user) {
                    result.render("mychannel", {
                        "isLogin": true,
                        "user": user,
                        "isMyChannel": true
                    });
                });
            } else {
                result.redirect("/login");
            }
        });

        app.post("/remove-channel-from-subscription", function(request, result) {
            if (request.session.user_id) {
                database.collection("users").updateOne({
                    "_id": ObjectID(request.session.user_id)
                }, {
                    $pull: {
                        "subscriptions": {
                            "_id": ObjectID(request.body._id)
                        }
                    }
                }, function(error, data) {
                    if (data.modifiedCount > 0) {
                        database.collection("users").updateOne({
                            "_id": ObjectID(request.body._id)
                        }, {
                            $dec: {
                                "subscribers": 1
                            }
                        });
                        database.collection("videos").updateOne({
                            "user._id": ObjectID(request.body._id)
                        }, {
                            $dec: {
                                "user.$. subscribers": 1
                            }
                        });
                    }
                    result.redirect("/subscriptions");
                });
            } else {
                result.redirect("/Login");
            }
        });

        app.get("/category_search/:query", function(request, result) {
            database.collection("videos").find({
                "category": {
                    $regex: ".*?" + request.params.query + ".*?"
                }
            }).toArray(function(error, videos) {
                result.render("search", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos,
                    "query": request.params.query
                });
            });
        });


        app.get("/tag_search/:query", function(request, result) {
            database.collection("videos").find({
                "tags": {
                    $regex: ".*" + request.params.query + ".*",
                    $options: "i"
                }
            }).toArray(function(error, videos) {
                result.render("search", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos,
                    "query": request.params.query,
                });
            });
        });

        app.get("/search", function(request, result) {
            database.collection("videos").find({
                "title": {
                    $regex: request.query.search_query,
                    $options: "i"
                }
            }).toArray(function(error, videos) {
                result.render("search", {
                    "isLogin": request.session.user_id ? true : false,
                    "videos": videos,
                    "query": request.query.search_query,
                });
            });
        });

        app.get("/settings", function(request, result) {
            if (request.session.user_id) {
                getUser(request.session.user_id, function(user) {
                    result.render("settings", {
                        "isLogin": true,
                        "user": user,
                        "request": request.query
                    });
                });
            } else {
                result.redirect("/Login");
            }
        });

        app.post("/save_settings", function(request, result) {
            if (request.session.user_id) {
                if (request.body.plassword == "") {
                    database.collection("users").updateOne({
                        "_id": ObjectID(request.session.user_id)
                    }, {
                        $set: {
                            "name": request.body.name,
                        }
                    });
                } else {
                    bcrypt.hash(request.body.password, 10, function(error, hash) {
                        database.collection("users").updateOne({
                            "_id": ObjectID(request.session.user_id)
                        }, {
                            $set: {
                                "name": request.body.name,
                                "password": hash
                            }
                        });
                    });
                }
                database.collection("users").updateMany({
                    "subscriptions._id": ObjectID(request.session.user_id)
                }, {
                    $set: {
                        "subscriptions.$.name": request.body.name
                    }
                });
                database.collection("users").updateMany({
                    "user._id": ObjectID(request.session.user_id)
                }, {
                    $set: {
                        "user.name": request.body.name,
                    }
                }, function(error, data) {
                    result.redirect("/settings?message=success");
                });
            } else {
                result.redirect("/login");
            }
        });


    });


});
