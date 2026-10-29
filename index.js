var express = require("express");
var bodyparser = require("body-parser");
var app = express();
var upload = require("express-fileupload");
var session = require("express-session");

// Parse both URL-encoded and JSON bodies
app.use(bodyparser.urlencoded({ extended: true }));
app.use(bodyparser.json()); // <--- ADD THIS LINE

app.use(upload());
app.use(express.static("public/"));
app.use(session({
    secret: "123456BATCH35NODEJS605202024",
    saveUninitialized: true,
    resave: true
}));

var user_route = require("./routes/user_route");
var admin_route = require("./routes/admin_route");

app.use("/", user_route);
app.use("/admin", admin_route);

app.listen(2000, () => {
    console.log("Server running on port 2000");
});