var express = require("express");
var router = express.Router();
var exe = require("./../connection");

// Page render routes
router.get("/", function (req, res) {
  res.render("user/index.ejs");
});

router.get("/home", function (req, res) {
  res.render("user/home.ejs");
});

router.get("/service", function (req, res) {
  res.render("user/services.ejs");
});

router.get("/contact", function (req, res) {
  res.render("user/contact.ejs");
});

router.get("/blogs", function (req, res) {
  res.render("user/blogs.ejs");
});

router.get("/appointment", function (req, res) {
  res.render("user/book_appointment.ejs");
});

// Doctor timetable
router.get("/time_table", async function (req, res) {
  try {
    var sql = `SELECT * FROM avaibility`;
    var data = await exe(sql);
    res.render("user/time_table.ejs", { d_avaibility: data });
  } catch (err) {
    console.error("Timetable fetch error:", err);
    res.status(500).send("Error loading schedule");
  }
});

router.get("/doctors_filed", function (req, res) {
  res.render("user/doctors_filed.ejs");
});

// Form submission API endpoint (matched with your frontend fetch)
// Handles standard HTML form POST from <form action="/submit_appointment" method="POST">
router.post("/submit_appointment", async function (req, res) {
  try {
    const {
      patient_name,
      contact_number,
      email,
      appointment_date,
      department,
      doctor,
      reason
    } = req.body;

    const sql = `
      INSERT INTO book_appointment (
        patient_name,
        contact_number,
        email,
        appointment_date,
        department,
        doctor,
        reason,
        gender,
        appointment_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      (patient_name || "").trim(),
      (contact_number || "").trim(),
      email ? email.trim() : null,
      appointment_date,
      department || "General",
      doctor || "Any Available Specialist",
      reason ? reason.trim() : "General Consultation",
      "Not Specified",
      "10:00:00"
    ];

    await exe(sql, values);

    // Redirect to home or a success page after booking
    res.redirect("/");
  } catch (err) {
    console.error("Error submitting appointment:", err);
    res.status(500).send("Failed to save appointment: " + (err.sqlMessage || err.message));
  }
});
module.exports = router;