const express = require("express");
const router = express.Router();
const path = require("path");
const nodemailer = require("nodemailer");
const pdf = require("html-pdf");
const ejs = require("ejs");
const PDFDocument = require("pdfkit");
var db = require('../connection');
// Database execution helper
const exe = require("./../connection");

// Helper function to fetch real-time dashboard metrics
async function getDashboardMetrics() {
  const [patientResult, doctorResult, deptResult] = await Promise.all([
    exe("SELECT COUNT(*) AS total FROM book_appointment"),
    exe("SELECT COUNT(*) AS total FROM a_doctor"),
    exe("SELECT COUNT(*) AS total FROM departments"),
  ]);

  return {
    totalPatients: patientResult[0]?.total || 0,
    activeDoctors: doctorResult[0]?.total || 0,
    hospitalDepartments: deptResult[0]?.total || 0,
  };
}

// ------------------------------------------------------
// AUTHENTICATION & ADMIN MANAGEMENT
// ------------------------------------------------------

// Render Registration Form
router.get("/admin_registration", (req, res) => {
  res.render("admin/admin_registration.ejs");
});

router.get("/register", (req, res) => {
  res.render("admin/register.ejs");
});

// Save Admin Registration
router.post("/save_admin", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO a_login (
        full_name, email, mobile, username, password, confirm_password
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      d.full_name || null,
      d.email,
      d.mobile || null,
      d.username || null,
      d.password,
      d.confirm_password || null,
    ]);
    res.redirect("/admin/login");
  } catch (err) {
    console.error("Error saving admin:", err);
    res.status(500).send("Registration failed");
  }
});

// Admin Logins
router.get("/", (req, res) => {
  res.render("admin/login_admin.ejs");
});

router.get("/login", (req, res) => {
  res.render("admin/login_admin.ejs");
});

router.get("/admin_sing_in", (req, res) => {
  res.render("admin/admin_sing_in.ejs");
});

router.get("/home", (req, res) => {
  res.redirect("/admin/admin_sing_in");
});

// Dashboard direct GET route
router.get("/dashboard", async (req, res) => {
  try {
    const stats = await getDashboardMetrics();
    res.render("admin/index.ejs", { stats });
  } catch (err) {
    console.error("Error loading dashboard:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/l_login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const sql = "SELECT * FROM a_login WHERE email = ? AND password = ?";
    const data = await exe(sql, [email, password]);

    if (data.length > 0) {
      const stats = await getDashboardMetrics();
      res.render("admin/index.ejs", { stats });
    } else {
      res.status(401).send("Invalid email or password");
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Internal Server Error");
  }
});
router.get("/l_login", async (req, res) => {
  try {
    const stats = await getDashboardMetrics();
    res.render("admin/index.ejs", { stats: stats || {} });
  } catch (err) {
    console.error("Dashboard render error:", err);
    res.status(500).send("Error rendering dashboard");
  }
});

router.post("/admin_l", async (req, res) => {
  try {
    const { email, password } = req.body;
    const sql = "SELECT * FROM a_login WHERE email = ? AND password = ?";
    const data = await exe(sql, [email, password]);

    if (data.length > 0) {
      res.redirect("/admin/");
    } else {
      res.status(401).send("Login failed");
    }
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ------------------------------------------------------
// HOSPITAL GENERAL & EMAIL
// ------------------------------------------------------

router.get("/About_hospital", (req, res) => {
  res.render("admin/About_hospital.ejs");
});

router.get("/email_send", (req, res) => {
  res.render("admin/email.ejs");
});

router.get("/email-form", (req, res) => {
  res.sendFile(path.join(__dirname, "../views/email.ejs"));
});

router.post("/send-email", (req, res) => {
  const { to, subject, message } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER || "your_email@gmail.com",
      pass: process.env.EMAIL_PASS || "your_app_password",
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER || "your_email@gmail.com",
    to,
    subject,
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Email error:", error);
      return res.status(500).send("Failed to send email.");
    }
    console.log("Email sent: " + info.response);
    res.send("Email sent successfully!");
  });
});

// ------------------------------------------------------
// APPOINTMENTS
// ------------------------------------------------------

// 1. Fetch Paginated Appointments
// APPOINTMENTS
// ------------------------------------------------------

// APPOINTMENTS (admin_route.js)
// ------------------------------------------------------

// 1. Fetch Paginated Appointments
router.get("/appointment", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;
    const offset = (page - 1) * limit;

    // Count rows from book_appointment
    const countResult = await exe("SELECT COUNT(*) AS total FROM book_appointment");
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch records ordered by appointment_id DESC
    const data = await exe(
      "SELECT * FROM book_appointment ORDER BY appointment_id DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    res.render("admin/appointment.ejs", {
      details: data,
      current: page,
      pages: totalPages,
    });
  } catch (err) {
    console.error("Error loading appointments:", err);
    res.status(500).send("Error loading appointments: " + (err.sqlMessage || err.message));
  }
});

// 2. Export / Download PDF
router.get("/appointment/download-pdf", async (req, res) => {
  try {
    const results = await exe("SELECT * FROM book_appointment ORDER BY appointment_id DESC");

    results.forEach((r) => {
      if (r.appointment_date) {
        r.appointment_date = new Date(r.appointment_date).toISOString().slice(0, 10);
      }
    });

    const filePath = path.join(__dirname, "../views/admin/appointment_pdf.ejs");
    const html = await ejs.renderFile(filePath, { details: results });

    pdf.create(html, { format: "A4" }).toStream((err, stream) => {
      if (err) {
        console.error("PDF Error:", err);
        return res.status(500).send("PDF generation failed");
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=appointments.pdf");
      stream.pipe(res);
    });
  } catch (err) {
    console.error("PDF Route Error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 3. Delete Appointment
router.get("/delete_patient/:id", async (req, res) => {
  try {
    await exe("DELETE FROM book_appointment WHERE appointment_id = ?", [req.params.id]);
    res.redirect("/admin/appointment");
  } catch (err) {
    console.error("Error deleting appointment:", err);
    res.status(500).send("Delete failed");
  }
});

// 4. View Edit/Update Form
router.get("/update_patient/:id", async (req, res) => {
  try {
    const data = await exe("SELECT * FROM book_appointment WHERE appointment_id = ?", [req.params.id]);

    if (!data || data.length === 0) {
      return res.status(404).send("Appointment not found");
    }

    res.render("admin/update_patient.ejs", { update: data[0] });
  } catch (err) {
    console.error("Error loading appointment for update:", err);
    res.status(500).send("Error loading record");
  }
});

// 5. Submit Update
router.post("/modify_patient", async (req, res) => {
  try {
    const {
      appointment_id,
      patient_name,
      contact_number,
      email,
      appointment_date,
      appointment_time,
      department,
      doctor,
      reason,
      gender
    } = req.body;

    const sql = `
      UPDATE book_appointment 
      SET 
        patient_name = ?, 
        contact_number = ?, 
        email = ?, 
        appointment_date = ?, 
        appointment_time = ?, 
        department = ?, 
        doctor = ?, 
        reason = ?, 
        gender = ? 
      WHERE appointment_id = ?
    `;

    await exe(sql, [
      patient_name ? patient_name.trim() : null,
      contact_number ? contact_number.trim() : null,
      email ? email.trim() : null,
      appointment_date,
      appointment_time || "10:00:00",
      department || "General",
      doctor || "Any Available Specialist",
      reason ? reason.trim() : null,
      gender || "Not Specified",
      appointment_id
    ]);

    res.redirect("/admin/appointment");
  } catch (err) {
    console.error("Error updating appointment:", err);
    res.status(500).send("Update failed");
  }
});
// ------------------------------------------------------
// DOCTORS & AVAILABILITY
// ------------------------------------------------------

router.get("/doctors", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const offset = (page - 1) * limit;

    const countResult = await exe("SELECT COUNT(*) AS total FROM a_doctor");
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const data = await exe("SELECT * FROM a_doctor LIMIT ? OFFSET ?", [limit, offset]);

    res.render("admin/doctors.ejs", {
      doctors_info: data,
      current: page,
      pages: totalPages,
    });
  } catch (err) {
    console.error("Error loading doctors:", err);
    res.status(500).send("Error loading doctors");
  }
});

router.get("/create_doctors", (req, res) => {
  res.render("admin/create_doctor.ejs");
});

router.post("/save_doctor", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO a_doctor (
        first_name, last_name, age, email, mobile, marital_status, 
        designation, qualification, country, state, city
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      d.first_name, d.last_name, d.age, d.email, d.mobile,
      d.marital_status, d.designation, d.qualification,
      d.country, d.state, d.city,
    ]);
    res.redirect("/admin/doctors");
  } catch (err) {
    console.error("Error saving doctor:", err);
    res.status(500).send("Error saving doctor");
  }
});

router.get("/update_doctor/:id", async (req, res) => {
  try {
    const data = await exe("SELECT * FROM a_doctor WHERE doctor_id = ?", [req.params.id]);
    res.render("admin/update_doctor.ejs", { u_doctor: data[0] });
  } catch (err) {
    console.error("Error fetching doctor:", err);
    res.status(500).send("Error loading doctor");
  }
});

router.post("/update_d", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      UPDATE a_doctor SET 
        first_name = ?, last_name = ?, age = ?, email = ?, mobile = ?, 
        marital_status = ?, designation = ?, qualification = ?, 
        blood_group = ?, city = ?, state = ?, country = ? 
      WHERE doctor_id = ?
    `;
    await exe(sql, [
      d.first_name, d.last_name, d.age, d.email, d.mobile,
      d.marital_status, d.designation, d.qualification,
      d.blood_group, d.city, d.state, d.country, d.doctor_id,
    ]);
    res.redirect("/admin/doctors");
  } catch (err) {
    console.error("Error updating doctor:", err);
    res.status(500).send("Error updating doctor");
  }
});

router.get("/delete_doctor/:id", async (req, res) => {
  try {
    await exe("DELETE FROM a_doctor WHERE doctor_id = ?", [req.params.id]);
    res.redirect("/admin/doctors");
  } catch (err) {
    console.error("Error deleting doctor:", err);
    res.status(500).send("Error deleting doctor");
  }
});

router.get("/doctors/download-pdf", async (req, res) => {
  try {
    const results = await exe("SELECT * FROM a_doctor");
    results.forEach((doctor) => {
      if (doctor.appointment_date) {
        doctor.appointment_date = new Date(doctor.appointment_date).toLocaleDateString();
      }
    });

    const filePath = path.join(__dirname, "../views/admin/doctors_pdf.ejs");
    const html = await ejs.renderFile(filePath, { doctors_info: results });

    pdf.create(html, { format: "A4" }).toStream((err, stream) => {
      if (err) {
        console.error("PDF error:", err);
        return res.status(500).send("PDF generation failed");
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=doctors.pdf");
      stream.pipe(res);
    });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/avaibility", (req, res) => {
  res.render("admin/doctor_avaibility.ejs");
});

router.post("/submit", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO avaibility (
        doctor_name, monday, tuesday, wednesday, thursday, friday, saturday
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const data = await exe(sql, [
      d.doctor_name, d.monday, d.tuesday, d.wednesday,
      d.thursday, d.friday, d.saturday,
    ]);
    res.send(data);
  } catch (err) {
    console.error("Availability submit error:", err);
    res.status(500).send("Error saving availability");
  }
});

// ------------------------------------------------------
// TREATMENTS
// ------------------------------------------------------

router.get("/treatment", (req, res) => {
  res.render("admin/treatment.ejs");
});

router.post("/add_treatment", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO treatments (
        treatment_name, treatment_type, treatment_description, treatment_duration, 
        treatment_cost, insurance_coverage, age_group, gender, assigned_doctor, 
        specialization, available_from, available_to, location, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      d.treatment_name, d.treatment_type, d.treatment_description, d.treatment_duration,
      d.treatment_cost, d.insurance_coverage, d.age_group, d.gender, d.assigned_doctor,
      d.specialization, d.available_from, d.available_to, d.location, d.notes,
    ]);
    res.send(req.body);
  } catch (err) {
    console.error("Error adding treatment:", err);
    res.status(500).send("Error adding treatment");
  }
});

// ------------------------------------------------------
// DEPARTMENTS
// ------------------------------------------------------

router.get("/departments", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const offset = (page - 1) * limit;

    const countResult = await exe("SELECT COUNT(*) AS total FROM departments");
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const data = await exe("SELECT * FROM departments LIMIT ? OFFSET ?", [limit, offset]);

    res.render("admin/departments.ejs", {
      details: data,
      current: page,
      pages: totalPages,
    });
  } catch (err) {
    console.error("Error loading departments:", err);
    res.status(500).send("Error loading departments");
  }
});

router.get("/create_deparments", (req, res) => {
  res.render("admin/create_deparments.ejs");
});

router.post("/create_d", async (req, res) => {
  try {
    const d = req.body;
    const sql = "INSERT INTO departments (department_name, department_head) VALUES (?, ?)";
    await exe(sql, [d.department_name, d.department_head]);
    res.redirect("/admin/departments");
  } catch (err) {
    console.error("Error creating department:", err);
    res.status(500).send("Error creating department");
  }
});

router.get("/delete_department/:id", async (req, res) => {
  try {
    await exe("DELETE FROM departments WHERE department_id = ?", [req.params.id]);
    res.redirect("/admin/departments");
  } catch (err) {
    console.error("Error deleting department:", err);
    res.status(500).send("Error deleting department");
  }
});
//
router.get("/update_department/:id", async (req, res) => {
  try {
    const data = await exe("SELECT * FROM departments WHERE department_id = ?", [req.params.id]);
    res.render("admin/upadte_department.ejs", { d_details: data[0] });
  } catch (err) {
    console.error("Error loading department:", err);
    res.status(500).send("Error loading department");
  }
});

router.post("/update_department_data", async (req, res) => {
  try {
    const d = req.body;
    const sql = "UPDATE departments SET department_name = ?, department_head = ? WHERE department_id = ?";
    await exe(sql, [d.department_name, d.department_head, d.department_id]);
    res.redirect("/admin/departments");
  } catch (err) {
    console.error("Error updating department:", err);
    res.status(500).send("Error updating department");
  }
});

router.get("/departments/download-pdf", async (req, res) => {
  try {
    const results = await exe("SELECT * FROM departments");
    const filePath = path.join(__dirname, "../views/admin/department_pdf.ejs");
    const html = await ejs.renderFile(filePath, { details: results });

    pdf.create(html, { format: "A4" }).toStream((err, stream) => {
      if (err) {
        console.error("PDF Error:", err);
        return res.status(500).send("PDF generation failed");
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=departments.pdf");
      stream.pipe(res);
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// ------------------------------------------------------
// BILLING & INVOICING
// ------------------------------------------------------

router.get("/billing", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const invoices = await exe(
      "SELECT * FROM invoices ORDER BY invoice_id DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    const countResult = await exe("SELECT COUNT(*) AS total FROM invoices");
    const total = countResult[0].total;
    const pages = Math.ceil(total / limit);

    const statsResult = await exe(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN total_amount ELSE 0 END), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_status = 'Pending' THEN total_amount ELSE 0 END), 0) AS pending_amount,
        COUNT(CASE WHEN payment_status = 'Paid' THEN 1 END) AS paid_count,
        COUNT(CASE WHEN payment_status = 'Pending' THEN 1 END) AS pending_count
      FROM invoices
    `);

    res.render("admin/billing_list.ejs", {
      invoices,
      stats: statsResult[0],
      current: page,
      pages,
    });
  } catch (err) {
    console.error("Billing fetch error:", err);
    res.status(500).send("Database Error");
  }
});

router.get("/billing/create", async (req, res) => {
  try {
    const doctors = await exe("SELECT doctor_id, first_name, last_name FROM a_doctor");
    const treatments = await exe("SELECT * FROM treatments");

    res.render("admin/create_invoice.ejs", { 
      doctors: doctors || [], 
      treatments: treatments || [] 
    });
  } catch (err) {
    console.error("DETAILED INVOICE FORM ERROR:", err);
    res.status(500).send(`Error loading form: ${err.message}`);
  }
});

router.post("/billing/save", async (req, res) => {
  const {
    patient_name,
    patient_email,
    patient_phone,
    doctor_id,
    doctor_name,
    invoice_date,
    due_date,
    payment_method,
    payment_status,
    discount_amount,
    tax_rate,
    notes,
    items,
  } = req.body;

  try {
    const parsedItems = typeof items === "string" ? JSON.parse(items) : items || [];
    const subtotal = parsedItems.reduce(
      (acc, it) => acc + parseFloat(it.unit_price) * parseInt(it.quantity),
      0
    );
    const discount = parseFloat(discount_amount) || 0;
    const taxRate = parseFloat(tax_rate) || 5;
    const taxAmount = ((subtotal - discount) * taxRate) / 100;
    const totalAmount = subtotal - discount + taxAmount;
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

    const insertResult = await exe(
      `INSERT INTO invoices (
        invoice_number, patient_name, patient_email, patient_phone, doctor_id, doctor_name, 
        subtotal, tax_rate, tax_amount, discount_amount, total_amount, payment_method, 
        payment_status, invoice_date, due_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber, patient_name, patient_email, patient_phone, doctor_id, doctor_name,
        subtotal, taxRate, taxAmount, discount, totalAmount, payment_method,
        payment_status, invoice_date, due_date, notes,
      ]
    );

    const invoiceId = insertResult.insertId;

    for (const item of parsedItems) {
      const itemTotal = parseFloat(item.unit_price) * parseInt(item.quantity);
      await exe(
        `INSERT INTO invoice_items (
          invoice_id, item_description, item_type, unit_price, quantity, total_price
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.description, item.type, item.unit_price, item.quantity, itemTotal]
      );
    }

    res.redirect("/admin/billing");
  } catch (err) {
    console.error("Error generating invoice:", err);
    res.status(500).send("Error generating invoice");
  }
});

router.get("/billing/pdf/:id", async (req, res) => {
  try {
    const invoiceRows = await exe("SELECT * FROM invoices WHERE invoice_id = ?", [req.params.id]);
    const invoice = invoiceRows[0];
    if (!invoice) return res.status(404).send("Invoice not found");

    const items = await exe("SELECT * FROM invoice_items WHERE invoice_id = ?", [req.params.id]);

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Invoice-${invoice.invoice_number}.pdf`);
    doc.pipe(res);

    // Header Branding
    doc.fontSize(22).fillColor("#4338ca").text("WellCure Medical Center", 40, 40);
    doc.fontSize(9).fillColor("#64748b").text("Emergency, Surgical & Specialty Healthcare Services", 40, 68);
    doc.text("100 Wellness Blvd, Healthcare City | contact@wellcure.com", 40, 80);

    doc.fontSize(16).fillColor("#0f172a").text("INVOICE", 420, 40, { align: "right" });
    doc.fontSize(10).fillColor("#475569").text(`Invoice #: ${invoice.invoice_number}`, 420, 60, { align: "right" });
    doc.text(`Date: ${new Date(invoice.invoice_date).toLocaleDateString()}`, 420, 75, { align: "right" });
    doc.text(`Status: ${(invoice.payment_status || "PENDING").toUpperCase()}`, 420, 90, { align: "right" });

    doc.moveTo(40, 115).lineTo(570, 115).strokeColor("#e2e8f0").stroke();

    // Billed To / Attending Physician
    doc.fontSize(10).fillColor("#334155");
    doc.font("Helvetica-Bold").text("Billed To:", 40, 130);
    doc.font("Helvetica").text(invoice.patient_name, 40, 145);
    doc.text(`Phone: ${invoice.patient_phone || "N/A"}`, 40, 160);
    doc.text(`Email: ${invoice.patient_email || "N/A"}`, 40, 175);

    doc.font("Helvetica-Bold").text("Attending Clinician:", 320, 130);
    doc.font("Helvetica").text(invoice.doctor_name ? `Dr. ${invoice.doctor_name}` : "General Duty Doctor", 320, 145);
    doc.text(`Payment Mode: ${invoice.payment_method || "N/A"}`, 320, 160);

    // Item Table Header
    const tableTop = 210;
    doc.rect(40, tableTop, 530, 24).fill("#f1f5f9");
    doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(9);
    doc.text("Description", 50, tableTop + 7);
    doc.text("Type", 260, tableTop + 7);
    doc.text("Qty", 370, tableTop + 7);
    doc.text("Unit Price", 430, tableTop + 7);
    doc.text("Total", 500, tableTop + 7, { align: "right" });

    // Rows
    let y = tableTop + 30;
    doc.font("Helvetica").fontSize(9).fillColor("#334155");
    items.forEach((item) => {
      doc.text(item.item_description, 50, y);
      doc.text(item.item_type, 260, y);
      doc.text(item.quantity.toString(), 370, y);
      doc.text(`$${parseFloat(item.unit_price).toFixed(2)}`, 430, y);
      doc.text(`$${parseFloat(item.total_price).toFixed(2)}`, 500, y, { align: "right" });
      y += 22;
    });

    doc.moveTo(40, y + 5).lineTo(570, y + 5).strokeColor("#e2e8f0").stroke();

    // Summary Totals
    const summaryY = y + 18;
    doc.fontSize(9).fillColor("#64748b");
    doc.text("Subtotal:", 380, summaryY);
    doc.text(`$${parseFloat(invoice.subtotal).toFixed(2)}`, 500, summaryY, { align: "right" });

    doc.text("Discount:", 380, summaryY + 16);
    doc.text(`-$${parseFloat(invoice.discount_amount).toFixed(2)}`, 500, summaryY + 16, { align: "right" });

    doc.text(`Tax (${invoice.tax_rate}%):`, 380, summaryY + 32);
    doc.text(`$${parseFloat(invoice.tax_amount).toFixed(2)}`, 500, summaryY + 32, { align: "right" });

    doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a");
    doc.text("Total Balance Due:", 380, summaryY + 54);
    doc.text(`$${parseFloat(invoice.total_amount).toFixed(2)}`, 500, summaryY + 54, { align: "right" });

    // Footer
    doc.fontSize(8).font("Helvetica").fillColor("#94a3b8").text(
      "Payment is expected within agreed terms. Thank you for choosing WellCure.",
      40,
      720,
      { align: "center", width: 530 }
    );

    doc.end();
  } catch (err) {
    console.error("PDF Generation Error:", err);
    res.status(500).send("Error generating PDF");
  }
});
// ------------------------------------------------------
// BED & WARD MANAGEMENT
// ------------------------------------------------------

// 1. Bed Management Page
router.get("/beds", async (req, res) => {
  try {
    const beds = await exe("SELECT * FROM beds ORDER BY bed_id ASC");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_beds,
        COUNT(CASE WHEN status = 'Available' THEN 1 END) AS available_beds,
        COUNT(CASE WHEN status = 'Occupied' THEN 1 END) AS occupied_beds,
        COUNT(CASE WHEN status = 'Maintenance' THEN 1 END) AS maintenance_beds
      FROM beds
    `);

    res.render("admin/beds.ejs", {
      beds,
      stats: counts[0] || { total_beds: 0, available_beds: 0, occupied_beds: 0, maintenance_beds: 0 }
    });
  } catch (err) {
    console.error("Bed fetch error:", err);
    res.status(500).send("Error loading Bed Management");
  }
});

// 2. Allocate Bed to Patient
router.post("/beds/allocate", async (req, res) => {
  try {
    const { bed_id, patient_name } = req.body;
    await exe(
      "UPDATE beds SET status = 'Occupied', patient_name = ?, admitted_date = NOW() WHERE bed_id = ?",
      [patient_name, bed_id]
    );
    res.redirect("/admin/beds");
  } catch (err) {
    console.error("Allocation error:", err);
    res.status(500).send("Bed allocation failed");
  }
});

// 3. Discharge Patient (Free up Bed)
router.post("/beds/discharge", async (req, res) => {
  try {
    const { bed_id } = req.body;
    await exe(
      "UPDATE beds SET status = 'Available', patient_name = NULL, admitted_date = NULL WHERE bed_id = ?",
      [bed_id]
    );
    res.redirect("/admin/beds");
  } catch (err) {
    console.error("Discharge error:", err);
    res.status(500).send("Discharge operation failed");
  }
});

// 4. Update Bed Maintenance Status
router.post("/beds/maintenance", async (req, res) => {
  try {
    const { bed_id, status } = req.body;
    await exe("UPDATE beds SET status = ?, patient_name = NULL, admitted_date = NULL WHERE bed_id = ?", [status, bed_id]);
    res.redirect("/admin/beds");
  } catch (err) {
    console.error("Maintenance toggle error:", err);
    res.status(500).send("Status update failed");
  }
});
// Add a new hospital bed
router.post("/beds/add", async (req, res) => {
  try {
    const { bed_number, ward_type, daily_charge, status } = req.body;
    await exe(
      "INSERT INTO beds (bed_number, ward_type, daily_charge, status) VALUES (?, ?, ?, ?)",
      [bed_number, ward_type, daily_charge || 500, status || 'Available']
    );
    res.redirect("/admin/beds");
  } catch (err) {
    console.error("Error adding bed:", err);
    res.status(500).send("Failed to add new bed");
  }
});
// ------------------------------------------------------
// LABORATORY & DIAGNOSTIC REPORTS
// ------------------------------------------------------

// 1. Diagnostics Dashboard
router.get("/diagnostics", async (req, res) => {
  try {
    const reports = await exe("SELECT * FROM diagnostic_reports ORDER BY report_id DESC");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_tests,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END) AS pending_tests,
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END) AS in_progress_tests,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) AS completed_tests
      FROM diagnostic_reports
    `);

    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    res.render("admin/diagnostics.ejs", {
      reports,
      doctors: doctors || [],
      stats: counts[0] || { total_tests: 0, pending_tests: 0, in_progress_tests: 0, completed_tests: 0 }
    });
  } catch (err) {
    console.error("Diagnostics load error:", err);
    res.status(500).send("Error loading diagnostics");
  }
});

// 2. Book New Diagnostic Test
router.post("/diagnostics/create", async (req, res) => {
  try {
    const { patient_name, doctor_name, test_type, test_name, test_charge } = req.body;
    const report_code = `RPT-${Date.now().toString().slice(-4)}`;

    await exe(`
      INSERT INTO diagnostic_reports (report_code, patient_name, doctor_name, test_type, test_name, test_charge, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    `, [report_code, patient_name, doctor_name, test_type, test_name, test_charge || 500]);

    res.redirect("/admin/diagnostics");
  } catch (err) {
    console.error("Test creation error:", err);
    res.status(500).send("Error scheduling test");
  }
});

// 3. Update Result & Complete Report
router.post("/diagnostics/update-result", async (req, res) => {
  try {
    const { report_id, result_summary, status } = req.body;
    await exe(`
      UPDATE diagnostic_reports 
      SET result_summary = ?, status = ?, completed_at = NOW() 
      WHERE report_id = ?
    `, [result_summary, status, report_id]);

    res.redirect("/admin/diagnostics");
  } catch (err) {
    console.error("Result update error:", err);
    res.status(500).send("Error updating results");
  }
});

// 4. Delete Diagnostic Record
router.get("/diagnostics/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM diagnostic_reports WHERE report_id = ?", [req.params.id]);
    res.redirect("/admin/diagnostics");
  } catch (err) {
    console.error("Delete test error:", err);
    res.status(500).send("Error deleting record");
  }
});
// ------------------------------------------------------
// PHARMACY & INVENTORY MANAGEMENT
// ------------------------------------------------------

// 1. Inventory View & Metrics
router.get("/pharmacy", async (req, res) => {
  try {
    const medicines = await exe("SELECT * FROM pharmacy_inventory ORDER BY medicine_id DESC");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_items,
        COUNT(CASE WHEN stock_quantity <= min_stock_alert THEN 1 END) AS low_stock_count,
        COUNT(CASE WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) THEN 1 END) AS expiring_soon_count,
        COALESCE(SUM(stock_quantity * unit_price), 0) AS total_inventory_value
      FROM pharmacy_inventory
    `);

    res.render("admin/pharmacy.ejs", {
      medicines,
      stats: counts[0] || { total_items: 0, low_stock_count: 0, expiring_soon_count: 0, total_inventory_value: 0 }
    });
  } catch (err) {
    console.error("Pharmacy load error:", err);
    res.status(500).send("Error loading pharmacy inventory");
  }
});

// 2. Add New Medicine Stock
router.post("/pharmacy/add", async (req, res) => {
  try {
    const { medicine_name, category, batch_number, stock_quantity, min_stock_alert, unit_price, expiry_date, manufacturer } = req.body;
    
    await exe(`
      INSERT INTO pharmacy_inventory (medicine_name, category, batch_number, stock_quantity, min_stock_alert, unit_price, expiry_date, manufacturer)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      medicine_name,
      category,
      batch_number,
      parseInt(stock_quantity) || 0,
      parseInt(min_stock_alert) || 15,
      parseFloat(unit_price) || 0.0,
      expiry_date,
      manufacturer || 'General Supplier'
    ]);

    res.redirect("/admin/pharmacy");
  } catch (err) {
    console.error("Medicine addition error:", err);
    res.status(500).send("Failed to add medicine");
  }
});

// 3. Quick Stock Adjust (Restock or Dispense)
router.post("/pharmacy/adjust-stock", async (req, res) => {
  try {
    const { medicine_id, adjustment_type, quantity } = req.body;
    const qty = parseInt(quantity) || 1;

    if (adjustment_type === "restock") {
      await exe("UPDATE pharmacy_inventory SET stock_quantity = stock_quantity + ? WHERE medicine_id = ?", [qty, medicine_id]);
    } else if (adjustment_type === "dispense") {
      await exe("UPDATE pharmacy_inventory SET stock_quantity = GREATEST(0, stock_quantity - ?) WHERE medicine_id = ?", [qty, medicine_id]);
    }

    res.redirect("/admin/pharmacy");
  } catch (err) {
    console.error("Stock adjust error:", err);
    res.status(500).send("Stock update failed");
  }
});

// 4. Delete Medicine Entry
router.get("/pharmacy/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM pharmacy_inventory WHERE medicine_id = ?", [req.params.id]);
    res.redirect("/admin/pharmacy");
  } catch (err) {
    console.error("Delete medicine error:", err);
    res.status(500).send("Failed to delete item");
  }
});
//
// ------------------------------------------------------
// EMERGENCY & AMBULANCE DISPATCH
// ------------------------------------------------------

// 1. Emergency Overview
router.get("/emergency", async (req, res) => {
  try {
    const cases = await exe(`
      SELECT ec.*, amb.vehicle_number 
      FROM emergency_cases ec
      LEFT JOIN ambulances amb ON ec.assigned_ambulance_id = amb.ambulance_id
      ORDER BY ec.case_id DESC
    `);

    const ambulances = await exe("SELECT * FROM ambulances ORDER BY ambulance_id ASC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_cases,
        COUNT(CASE WHEN triage_level LIKE 'Code Red%' AND status != 'Discharged' THEN 1 END) AS red_cases,
        COUNT(CASE WHEN status = 'In Treatment' OR status = 'Triaged' THEN 1 END) AS active_cases,
        (SELECT COUNT(*) FROM ambulances WHERE status = 'Available') AS available_ambulances
      FROM emergency_cases
    `);

    res.render("admin/emergency.ejs", {
      cases,
      ambulances,
      doctors: doctors || [],
      stats: counts[0] || { total_cases: 0, red_cases: 0, active_cases: 0, available_ambulances: 0 }
    });
  } catch (err) {
    console.error("Emergency dashboard error:", err);
    res.status(500).send("Error loading emergency dashboard");
  }
});

// 2. Register New Emergency Case
router.post("/emergency/create", async (req, res) => {
  try {
    const { patient_name, triage_level, assigned_doctor, assigned_ambulance_id, incident_notes } = req.body;
    const case_code = `EMG-${Date.now().toString().slice(-4)}`;
    const ambulanceId = assigned_ambulance_id ? parseInt(assigned_ambulance_id) : null;

    await exe(`
      INSERT INTO emergency_cases (case_code, patient_name, triage_level, assigned_doctor, assigned_ambulance_id, incident_notes, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Triaged')
    `, [case_code, patient_name, triage_level, assigned_doctor, ambulanceId, incident_notes]);

    // If an ambulance was dispatched, switch its status to 'On Call'
    if (ambulanceId) {
      await exe("UPDATE ambulances SET status = 'On Call' WHERE ambulance_id = ?", [ambulanceId]);
    }

    res.redirect("/admin/emergency");
  } catch (err) {
    console.error("Case registration error:", err);
    res.status(500).send("Failed to log emergency");
  }
});

// 3. Update Case Status (Admit or Discharge)
router.post("/emergency/update-status", async (req, res) => {
  try {
    const { case_id, status } = req.body;
    await exe("UPDATE emergency_cases SET status = ? WHERE case_id = ?", [status, case_id]);
    res.redirect("/admin/emergency");
  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Toggle Ambulance Status (Return to Base / Maintenance)
router.post("/emergency/ambulance-status", async (req, res) => {
  try {
    const { ambulance_id, status, current_location } = req.body;
    await exe("UPDATE ambulances SET status = ?, current_location = ? WHERE ambulance_id = ?", [
      status, 
      current_location || 'Hospital Bay 1', 
      ambulance_id
    ]);
    res.redirect("/admin/emergency");
  } catch (err) {
    console.error("Ambulance toggle error:", err);
    res.status(500).send("Failed to update ambulance");
  }
});
// ------------------------------------------------------
// PATIENT MEDICAL RECORDS & EHR
// ------------------------------------------------------

// 1. Patient Records List View
router.get("/patient_records", async (req, res) => {
  try {
    const records = await exe("SELECT * FROM patient_records ORDER BY record_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_records,
        COUNT(DISTINCT patient_phone) AS unique_patients,
        COUNT(CASE WHEN allergies != 'None' AND allergies != '' THEN 1 END) AS allergy_flag_count
      FROM patient_records
    `);

    res.render("admin/patient_records.ejs", {
      records: records || [],
      doctors: doctors || [],
      stats: (counts && counts[0]) ? counts[0] : { total_records: 0, unique_patients: 0, allergy_flag_count: 0 }
    });
  } catch (err) {
    console.error("Error loading patient records:", err);
    res.status(500).send(`Error loading records: ${err.message}`);
  }
});

// 2. Add New Clinical Case History Record
router.post("/patient_records/save", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO patient_records (
        patient_name, patient_phone, gender, blood_group, age, 
        allergies, chronic_conditions, diagnosis, prescription, 
        attending_doctor, visit_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      d.patient_name,
      d.patient_phone,
      d.gender || 'Male',
      d.blood_group || 'O+',
      parseInt(d.age) || 0,
      d.allergies || 'None',
      d.chronic_conditions || 'None',
      d.diagnosis,
      d.prescription || null,
      d.attending_doctor || 'Dr. Rizwan',
      d.visit_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/patient_records");
  } catch (err) {
    console.error("Error saving patient record:", err);
    res.status(500).send("Failed to save patient record");
  }
});

// 3. Delete Patient Record
router.get("/patient_records/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM patient_records WHERE record_id = ?", [req.params.id]);
    res.redirect("/admin/patient_records");
  } catch (err) {
    console.error("Error deleting patient record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// STAFF & NURSE DUTY ROSTER
// ------------------------------------------------------

// 1. View Staff Duty Roster
router.get("/staff_roster", async (req, res) => {
  try {
    const roster = await exe("SELECT * FROM staff_roster ORDER BY duty_date DESC, roster_id DESC");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_shifts,
        COUNT(CASE WHEN status = 'On Duty' THEN 1 END) AS on_duty_count,
        COUNT(CASE WHEN assigned_ward = 'ICU' AND status = 'On Duty' THEN 1 END) AS icu_staff_count,
        COUNT(CASE WHEN status = 'On Leave' THEN 1 END) AS leave_count
      FROM staff_roster
    `);

    res.render("admin/staff_roster.ejs", {
      roster: roster || [],
      stats: (counts && counts[0]) ? counts[0] : { total_shifts: 0, on_duty_count: 0, icu_staff_count: 0, leave_count: 0 }
    });
  } catch (err) {
    console.error("Error loading duty roster:", err);
    res.status(500).send(`Error loading roster: ${err.message}`);
  }
});

// 2. Schedule New Shift
router.post("/staff_roster/save", async (req, res) => {
  try {
    const { staff_name, role, assigned_ward, shift_type, duty_date, contact_number, status } = req.body;
    const sql = `
      INSERT INTO staff_roster (
        staff_name, role, assigned_ward, shift_type, duty_date, contact_number, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      staff_name,
      role,
      assigned_ward,
      shift_type,
      duty_date || new Date().toISOString().slice(0, 10),
      contact_number,
      status || 'On Duty'
    ]);

    res.redirect("/admin/staff_roster");
  } catch (err) {
    console.error("Error saving shift:", err);
    res.status(500).send("Failed to save roster entry");
  }
});

// 3. Quick Status Toggle (On Duty / Completed / On Leave)
router.post("/staff_roster/update-status", async (req, res) => {
  try {
    const { roster_id, status } = req.body;
    await exe("UPDATE staff_roster SET status = ? WHERE roster_id = ?", [status, roster_id]);
    res.redirect("/admin/staff_roster");
  } catch (err) {
    console.error("Error updating shift status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Roster Entry
router.get("/staff_roster/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM staff_roster WHERE roster_id = ?", [req.params.id]);
    res.redirect("/admin/staff_roster");
  } catch (err) {
    console.error("Error deleting roster record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// HOSPITAL ASSETS & EQUIPMENT MAINTENANCE
// ------------------------------------------------------

// 1. Asset & Equipment Overview
router.get("/assets", async (req, res) => {
  try {
    const assets = await exe("SELECT * FROM hospital_assets ORDER BY asset_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_assets,
        COUNT(CASE WHEN status = 'Operational' THEN 1 END) AS operational_count,
        COUNT(CASE WHEN status = 'Under Maintenance' THEN 1 END) AS maintenance_count,
        COUNT(CASE WHEN next_service_due <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 END) AS service_due_count
      FROM hospital_assets
    `);

    res.render("admin/assets.ejs", {
      assets: assets || [],
      departments: departments || [],
      stats: (counts && counts[0]) ? counts[0] : { total_assets: 0, operational_count: 0, maintenance_count: 0, service_due_count: 0 }
    });
  } catch (err) {
    console.error("Error loading asset records:", err);
    res.status(500).send(`Error loading assets: ${err.message}`);
  }
});

// 2. Register New Medical Machine / Asset
router.post("/assets/save", async (req, res) => {
  try {
    const d = req.body;
    const asset_code = `AST-${Date.now().toString().slice(-5)}`;
    const sql = `
      INSERT INTO hospital_assets (
        asset_code, asset_name, department, location_room, 
        purchase_date, warranty_expiry, last_service_date, next_service_due, 
        status, technician_contact
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      asset_code,
      d.asset_name,
      d.department,
      d.location_room,
      d.purchase_date,
      d.warranty_expiry,
      d.last_service_date || null,
      d.next_service_due,
      d.status || 'Operational',
      d.technician_contact || 'Biomedical Support'
    ]);

    res.redirect("/admin/assets");
  } catch (err) {
    console.error("Error saving asset:", err);
    res.status(500).send("Failed to save asset record");
  }
});

// 3. Mark Service Completed (Sets status to Operational & logs service date)
router.post("/assets/complete-service", async (req, res) => {
  try {
    const { asset_id, next_service_due } = req.body;
    await exe(`
      UPDATE hospital_assets 
      SET status = 'Operational', last_service_date = CURDATE(), next_service_due = ? 
      WHERE asset_id = ?
    `, [next_service_due, asset_id]);

    res.redirect("/admin/assets");
  } catch (err) {
    console.error("Error updating asset maintenance:", err);
    res.status(500).send("Maintenance update failed");
  }
});

// 4. Toggle Maintenance Flag
router.post("/assets/set-maintenance", async (req, res) => {
  try {
    const { asset_id, status } = req.body;
    await exe("UPDATE hospital_assets SET status = ? WHERE asset_id = ?", [status, asset_id]);
    res.redirect("/admin/assets");
  } catch (err) {
    console.error("Error setting asset status:", err);
    res.status(500).send("Status update failed");
  }
});

// 5. Delete Asset
router.get("/assets/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM hospital_assets WHERE asset_id = ?", [req.params.id]);
    res.redirect("/admin/assets");
  } catch (err) {
    console.error("Error deleting asset:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// BLOOD BANK & DONOR MANAGEMENT
// ------------------------------------------------------

// 1. Blood Bank Dashboard View
router.get("/blood_bank", async (req, res) => {
  try {
    const stock = await exe("SELECT * FROM blood_bank_stock ORDER BY blood_id ASC");
    const transactions = await exe("SELECT * FROM blood_transactions ORDER BY transaction_id DESC LIMIT 20");

    const counts = await exe(`
      SELECT 
        COALESCE(SUM(units_available), 0) AS total_units,
        COUNT(CASE WHEN units_available <= min_alert_level THEN 1 END) AS low_stock_groups,
        (SELECT COUNT(*) FROM blood_transactions WHERE transaction_type = 'Donation') AS total_donations,
        (SELECT COUNT(*) FROM blood_transactions WHERE transaction_type = 'Issue/Transfusion') AS total_issued
      FROM blood_bank_stock
    `);

    res.render("admin/blood_bank.ejs", {
      stock: stock || [],
      transactions: transactions || [],
      stats: (counts && counts[0]) ? counts[0] : { total_units: 0, low_stock_groups: 0, total_donations: 0, total_issued: 0 }
    });
  } catch (err) {
    console.error("Error loading blood bank:", err);
    res.status(500).send(`Error loading blood bank: ${err.message}`);
  }
});

// 2. Process Blood Donation (Increases Stock)
router.post("/blood_bank/donate", async (req, res) => {
  try {
    const { person_name, contact_number, blood_group, units, purpose } = req.body;
    const qty = parseInt(units) || 1;

    // Log the transaction
    await exe(`
      INSERT INTO blood_transactions (person_name, contact_number, blood_group, units, transaction_type, purpose, transaction_date)
      VALUES (?, ?, ?, ?, 'Donation', ?, CURDATE())
    `, [person_name, contact_number, blood_group, qty, purpose || 'Voluntary Donor']);

    // Increment inventory units
    await exe("UPDATE blood_bank_stock SET units_available = units_available + ? WHERE blood_group = ?", [qty, blood_group]);

    res.redirect("/admin/blood_bank");
  } catch (err) {
    console.error("Error processing donation:", err);
    res.status(500).send("Donation logging failed");
  }
});

// 3. Issue / Transfuse Blood (Decreases Stock)
router.post("/blood_bank/issue", async (req, res) => {
  try {
    const { person_name, contact_number, blood_group, units, purpose } = req.body;
    const qty = parseInt(units) || 1;

    // Verify stock availability
    const checkStock = await exe("SELECT units_available FROM blood_bank_stock WHERE blood_group = ?", [blood_group]);
    if (!checkStock.length || checkStock[0].units_available < qty) {
      return res.status(400).send(`Insufficient blood units available for group ${blood_group}`);
    }

    // Log the transaction
    await exe(`
      INSERT INTO blood_transactions (person_name, contact_number, blood_group, units, transaction_type, purpose, transaction_date)
      VALUES (?, ?, ?, ?, 'Issue/Transfusion', ?, CURDATE())
    `, [person_name, contact_number, blood_group, qty, purpose || 'Transfusion Request']);

    // Deduct inventory units
    await exe("UPDATE blood_bank_stock SET units_available = units_available - ? WHERE blood_group = ?", [qty, blood_group]);

    res.redirect("/admin/blood_bank");
  } catch (err) {
    console.error("Error issuing blood:", err);
    res.status(500).send("Blood issuance failed");
  }
});
// ------------------------------------------------------
// OPERATION THEATER (OT) SCHEDULING
// ------------------------------------------------------

// 1. OT Schedule Dashboard
router.get("/ot_schedule", async (req, res) => {
  try {
    const schedules = await exe("SELECT * FROM ot_schedules ORDER BY surgery_date ASC, ot_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const counts = await exe(`
      SELECT 
        COUNT(*) AS total_surgeries,
        COUNT(CASE WHEN status = 'In Surgery' THEN 1 END) AS active_surgeries,
        COUNT(CASE WHEN status = 'Scheduled' THEN 1 END) AS scheduled_surgeries,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) AS completed_surgeries
      FROM ot_schedules
    `);

    res.render("admin/ot_schedule.ejs", {
      schedules: schedules || [],
      doctors: doctors || [],
      stats: (counts && counts[0]) ? counts[0] : { total_surgeries: 0, active_surgeries: 0, scheduled_surgeries: 0, completed_surgeries: 0 }
    });
  } catch (err) {
    console.error("Error loading OT schedule:", err);
    res.status(500).send(`Error loading OT schedule: ${err.message}`);
  }
});

// 2. Schedule New Procedure
router.post("/ot_schedule/save", async (req, res) => {
  try {
    const d = req.body;
    const ot_code = `SURG-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO ot_schedules (
        ot_code, theater_name, patient_name, procedure_name, 
        lead_surgeon, anesthesiologist, scrub_nurse, surgery_date, 
        scheduled_time, status, clinical_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?)
    `;
    await exe(sql, [
      ot_code,
      d.theater_name,
      d.patient_name,
      d.procedure_name,
      d.lead_surgeon || 'Dr. Rizwan',
      d.anesthesiologist || 'Dr. On Duty',
      d.scrub_nurse || 'Staff Nurse',
      d.surgery_date || new Date().toISOString().slice(0, 10),
      d.scheduled_time || '10:00 AM',
      d.clinical_notes || null
    ]);

    res.redirect("/admin/ot_schedule");
  } catch (err) {
    console.error("Error saving OT procedure:", err);
    res.status(500).send("Procedure booking failed");
  }
});

// 3. Update Procedure Status (Scheduled -> In Surgery -> Post-Op -> Completed)
router.post("/ot_schedule/update-status", async (req, res) => {
  try {
    const { ot_id, status } = req.body;
    await exe("UPDATE ot_schedules SET status = ? WHERE ot_id = ?", [status, ot_id]);
    res.redirect("/admin/ot_schedule");
  } catch (err) {
    console.error("Error updating OT status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Surgical Schedule
router.get("/ot_schedule/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM ot_schedules WHERE ot_id = ?", [req.params.id]);
    res.redirect("/admin/ot_schedule");
  } catch (err) {
    console.error("Error deleting OT schedule:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// PATIENT FEEDBACK & GRIEVANCE REDRESSAL
// ------------------------------------------------------

// 1. Feedback Dashboard
router.get("/feedback", async (req, res) => {
  try {
    const feedbacks = await exe("SELECT * FROM patient_feedback ORDER BY feedback_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_feedbacks,
        COALESCE(ROUND(AVG(overall_rating), 1), 0.0) AS average_rating,
        COUNT(CASE WHEN category = 'Complaint / Grievance' AND resolution_status != 'Closed' THEN 1 END) AS open_grievances,
        COUNT(CASE WHEN overall_rating = 5 THEN 1 END) AS five_star_count
      FROM patient_feedback
    `);

    res.render("admin/feedback.ejs", {
      feedbacks: feedbacks || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_feedbacks: 0, average_rating: 0, open_grievances: 0, five_star_count: 0 }
    });
  } catch (err) {
    console.error("Feedback fetch error:", err);
    res.status(500).send(`Error loading feedback: ${err.message}`);
  }
});

// 2. Submit New Feedback Entry
router.post("/feedback/save", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO patient_feedback (
        patient_name, patient_contact, department, doctor_name, 
        overall_rating, category, comments, resolution_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Under Review')
    `;
    await exe(sql, [
      d.patient_name,
      d.patient_contact,
      d.department,
      d.doctor_name || 'Dr. Rizwan',
      parseInt(d.overall_rating) || 5,
      d.category || 'General Feedback',
      d.comments
    ]);

    res.redirect("/admin/feedback");
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).send("Feedback submission failed");
  }
});

// 3. Update Grievance Resolution Status
router.post("/feedback/update-status", async (req, res) => {
  try {
    const { feedback_id, resolution_status } = req.body;
    await exe("UPDATE patient_feedback SET resolution_status = ? WHERE feedback_id = ?", [resolution_status, feedback_id]);
    res.redirect("/admin/feedback");
  } catch (err) {
    console.error("Error updating feedback status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Feedback Record
router.get("/feedback/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM patient_feedback WHERE feedback_id = ?", [req.params.id]);
    res.redirect("/admin/feedback");
  } catch (err) {
    console.error("Error deleting feedback:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// SYSTEM AUDIT TRAIL & SECURITY LOGS
// ------------------------------------------------------

// 1. Audit Logs Dashboard
router.get("/audit_logs", async (req, res) => {
  try {
    const logs = await exe("SELECT * FROM audit_logs ORDER BY log_id DESC LIMIT 100");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_logs,
        COUNT(CASE WHEN action_type = 'AUTH' THEN 1 END) AS auth_events,
        COUNT(CASE WHEN action_type = 'DELETE' THEN 1 END) AS deletion_events,
        COUNT(CASE WHEN created_at >= CURDATE() THEN 1 END) AS today_actions
      FROM audit_logs
    `);

    res.render("admin/audit_logs.ejs", {
      logs: logs || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_logs: 0, auth_events: 0, deletion_events: 0, today_actions: 0 }
    });
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).send(`Error loading logs: ${err.message}`);
  }
});

// 2. Clear Old Audit Logs (Keep last 30 days)
router.post("/audit_logs/purge", async (req, res) => {
  try {
    await exe("DELETE FROM audit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
    res.redirect("/admin/audit_logs");
  } catch (err) {
    console.error("Error purging logs:", err);
    res.status(500).send("Purge operation failed");
  }
});
// ------------------------------------------------------
// INSURANCE & TPA CLAIMS MANAGEMENT
// ------------------------------------------------------

// 1. Insurance Dashboard View
router.get("/insurance_claims", async (req, res) => {
  try {
    const claims = await exe("SELECT * FROM insurance_claims ORDER BY claim_id DESC");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_claims,
        COALESCE(SUM(claimed_amount), 0) AS total_claimed,
        COALESCE(SUM(approved_amount), 0) AS total_approved,
        COUNT(CASE WHEN claim_status IN ('Submitted', 'Under Review') THEN 1 END) AS pending_claims,
        COUNT(CASE WHEN claim_status = 'Approved' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN claim_status = 'Rejected' THEN 1 END) AS rejected_count
      FROM insurance_claims
    `);

    res.render("admin/insurance_claims.ejs", {
      claims: claims || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_claims: 0, total_claimed: 0, total_approved: 0, pending_claims: 0, approved_count: 0, rejected_count: 0 }
    });
  } catch (err) {
    console.error("Error loading insurance claims:", err);
    res.status(500).send(`Error loading claims: ${err.message}`);
  }
});

// 2. Submit New Insurance Claim
router.post("/insurance_claims/save", async (req, res) => {
  try {
    const d = req.body;
    const claim_number = `CLM-${Date.now().toString().slice(-5)}`;
    const sql = `
      INSERT INTO insurance_claims (
        claim_number, patient_name, policy_number, insurance_provider, 
        tpa_name, claimed_amount, admission_date, claim_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted')
    `;
    await exe(sql, [
      claim_number,
      d.patient_name,
      d.policy_number,
      d.insurance_provider,
      d.tpa_name || 'Direct Settlement',
      parseFloat(d.claimed_amount) || 0.0,
      d.admission_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/insurance_claims");
  } catch (err) {
    console.error("Error creating insurance claim:", err);
    res.status(500).send("Claim submission failed");
  }
});

// 3. Adjudicate / Update Claim Status
router.post("/insurance_claims/update-status", async (req, res) => {
  try {
    const { claim_id, claim_status, approved_amount, co_pay_amount, denial_reason } = req.body;
    await exe(`
      UPDATE insurance_claims 
      SET claim_status = ?, 
          approved_amount = ?, 
          co_pay_amount = ?, 
          denial_reason = ? 
      WHERE claim_id = ?
    `, [
      claim_status,
      parseFloat(approved_amount) || 0.0,
      parseFloat(co_pay_amount) || 0.0,
      denial_reason || null,
      claim_id
    ]);

    res.redirect("/admin/insurance_claims");
  } catch (err) {
    console.error("Error adjudicating claim:", err);
    res.status(500).send("Claim update failed");
  }
});

// 4. Delete Claim Record
router.get("/insurance_claims/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM insurance_claims WHERE claim_id = ?", [req.params.id]);
    res.redirect("/admin/insurance_claims");
  } catch (err) {
    console.error("Error deleting claim:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// BIOMEDICAL WASTE & COMPLIANCE
// ------------------------------------------------------

// 1. Bio-Waste Overview Dashboard
router.get("/biowaste", async (req, res) => {
  try {
    const logs = await exe("SELECT * FROM biomedical_waste ORDER BY waste_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_manifests,
        COALESCE(SUM(weight_kg), 0) AS total_weight_kg,
        COUNT(CASE WHEN waste_category LIKE 'Yellow%' THEN 1 END) AS yellow_bags,
        COUNT(CASE WHEN status = 'Collected in Ward' THEN 1 END) AS pending_pickup
      FROM biomedical_waste
    `);

    res.render("admin/biowaste.ejs", {
      logs: logs || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_manifests: 0, total_weight_kg: 0, yellow_bags: 0, pending_pickup: 0 }
    });
  } catch (err) {
    console.error("Biowaste dashboard error:", err);
    res.status(500).send(`Error loading bio-waste logs: ${err.message}`);
  }
});

// 2. Log New Biomedical Waste Handover
router.post("/biowaste/save", async (req, res) => {
  try {
    const d = req.body;
    const manifest_code = `BMW-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO biomedical_waste (
        manifest_code, ward_department, waste_category, weight_kg, 
        disposal_method, certified_handler, carrier_vehicle, 
        status, handover_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Collected in Ward', ?)
    `;
    await exe(sql, [
      manifest_code,
      d.ward_department,
      d.waste_category,
      parseFloat(d.weight_kg) || 0.0,
      d.disposal_method,
      d.certified_handler || 'Enviro Safe Logistics',
      d.carrier_vehicle || 'MH-12-BW-001',
      d.handover_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/biowaste");
  } catch (err) {
    console.error("Error creating biowaste log:", err);
    res.status(500).send("Manifest creation failed");
  }
});

// 3. Update Manifest Status
router.post("/biowaste/update-status", async (req, res) => {
  try {
    const { waste_id, status } = req.body;
    await exe("UPDATE biomedical_waste SET status = ? WHERE waste_id = ?", [status, waste_id]);
    res.redirect("/admin/biowaste");
  } catch (err) {
    console.error("Error updating biowaste status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Log Record
router.get("/biowaste/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM biomedical_waste WHERE waste_id = ?", [req.params.id]);
    res.redirect("/admin/biowaste");
  } catch (err) {
    console.error("Error deleting log:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// PATIENT DIETARY & MEAL NUTRITION
// ------------------------------------------------------

// 1. Dietary Overview Dashboard
router.get("/diet_plans", async (req, res) => {
  try {
    const dietPlans = await exe("SELECT * FROM patient_diet_plans ORDER BY diet_id DESC");
    const occupiedBeds = await exe("SELECT bed_number, patient_name FROM beds WHERE status = 'Occupied'");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_meals,
        COUNT(CASE WHEN delivery_status = 'Delivered' THEN 1 END) AS delivered_meals,
        COUNT(CASE WHEN diet_type LIKE 'NPO%' THEN 1 END) AS npo_fasting_count,
        COUNT(CASE WHEN delivery_status IN ('Ordered', 'Preparing in Kitchen') THEN 1 END) AS pending_kitchen
      FROM patient_diet_plans
      WHERE schedule_date = CURDATE()
    `);

    res.render("admin/diet_plans.ejs", {
      dietPlans: dietPlans || [],
      beds: occupiedBeds || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_meals: 0, delivered_meals: 0, npo_fasting_count: 0, pending_kitchen: 0 }
    });
  } catch (err) {
    console.error("Dietary dashboard error:", err);
    res.status(500).send(`Error loading dietary plans: ${err.message}`);
  }
});

// 2. Prescribe New Inpatient Diet Plan
router.post("/diet_plans/save", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO patient_diet_plans (
        patient_name, bed_room_number, diet_type, meal_slot, 
        allergies_restrictions, dietitian_instructions, 
        delivery_status, schedule_date
      ) VALUES (?, ?, ?, ?, ?, ?, 'Ordered', ?)
    `;
    await exe(sql, [
      d.patient_name,
      d.bed_room_number,
      d.diet_type,
      d.meal_slot,
      d.allergies_restrictions || 'None',
      d.dietitian_instructions || null,
      d.schedule_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/diet_plans");
  } catch (err) {
    console.error("Error creating diet prescription:", err);
    res.status(500).send("Diet plan prescription failed");
  }
});

// 3. Update Meal Delivery Status
router.post("/diet_plans/update-status", async (req, res) => {
  try {
    const { diet_id, delivery_status } = req.body;
    await exe("UPDATE patient_diet_plans SET delivery_status = ? WHERE diet_id = ?", [delivery_status, diet_id]);
    res.redirect("/admin/diet_plans");
  } catch (err) {
    console.error("Error updating meal delivery:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Diet Plan
router.get("/diet_plans/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM patient_diet_plans WHERE diet_id = ?", [req.params.id]);
    res.redirect("/admin/diet_plans");
  } catch (err) {
    console.error("Error deleting diet plan:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// MORTUARY & DEATH CERTIFICATION REGISTRY
// ------------------------------------------------------

// 1. Mortuary Overview Dashboard
router.get("/mortuary", async (req, res) => {
  try {
    const records = await exe("SELECT * FROM mortuary_records ORDER BY mortuary_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_records,
        COUNT(CASE WHEN status = 'In Mortuary Chamber' THEN 1 END) AS in_chamber_count,
        COUNT(CASE WHEN status = 'Autopsy / MLC Pending' THEN 1 END) AS mlc_pending_count,
        COUNT(CASE WHEN status = 'Released to Family' THEN 1 END) AS released_count
      FROM mortuary_records
    `);

    res.render("admin/mortuary.ejs", {
      records: records || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_records: 0, in_chamber_count: 0, mlc_pending_count: 0, released_count: 0 }
    });
  } catch (err) {
    console.error("Mortuary dashboard error:", err);
    res.status(500).send(`Error loading mortuary records: ${err.message}`);
  }
});

// 2. Register Deceased Patient & Chamber Allocation
router.post("/mortuary/save", async (req, res) => {
  try {
    const d = req.body;
    const deceased_code = `MORT-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO mortuary_records (
        deceased_code, patient_name, gender, age, date_of_death, 
        cause_of_death, certifying_doctor, freezer_chamber_no, 
        next_of_kin_name, next_of_kin_contact, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'In Mortuary Chamber')
    `;
    await exe(sql, [
      deceased_code,
      d.patient_name,
      d.gender || 'Male',
      parseInt(d.age) || 0,
      d.date_of_death || new Date().toISOString().slice(0, 19).replace('T', ' '),
      d.cause_of_death,
      d.certifying_doctor || 'Dr. Rizwan',
      d.freezer_chamber_no || 'Chamber-01',
      d.next_of_kin_name,
      d.next_of_kin_contact
    ]);

    res.redirect("/admin/mortuary");
  } catch (err) {
    console.error("Error creating mortuary entry:", err);
    res.status(500).send("Mortuary registration failed");
  }
});

// 3. Update Release Handover / Autopsy Status
router.post("/mortuary/update-status", async (req, res) => {
  try {
    const { mortuary_id, status } = req.body;
    const releaseDate = status === 'Released to Family' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    await exe(`
      UPDATE mortuary_records 
      SET status = ?, release_date = ? 
      WHERE mortuary_id = ?
    `, [status, releaseDate, mortuary_id]);

    res.redirect("/admin/mortuary");
  } catch (err) {
    console.error("Error updating mortuary status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Mortuary Record
router.get("/mortuary/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM mortuary_records WHERE mortuary_id = ?", [req.params.id]);
    res.redirect("/admin/mortuary");
  } catch (err) {
    console.error("Error deleting mortuary record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// VISITOR MANAGEMENT & GATE PASS SECURITY
// ------------------------------------------------------

// 1. Visitor Dashboard
router.get("/visitor_passes", async (req, res) => {
  try {
    const passes = await exe("SELECT * FROM visitor_passes ORDER BY pass_id DESC LIMIT 100");
    const occupiedBeds = await exe("SELECT bed_number, patient_name FROM beds WHERE status = 'Occupied'");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_passes,
        COUNT(CASE WHEN status = 'Active Inside' THEN 1 END) AS currently_inside,
        COUNT(CASE WHEN allowed_slot LIKE 'Special ICU%' AND status = 'Active Inside' THEN 1 END) AS icu_attendants,
        COUNT(CASE WHEN status = 'Checked Out' THEN 1 END) AS checked_out_today
      FROM visitor_passes
    `);

    res.render("admin/visitor_passes.ejs", {
      passes: passes || [],
      beds: occupiedBeds || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_passes: 0, currently_inside: 0, icu_attendants: 0, checked_out_today: 0 }
    });
  } catch (err) {
    console.error("Visitor pass error:", err);
    res.status(500).send(`Error loading visitor passes: ${err.message}`);
  }
});

// 2. Issue New Visitor Gate Pass
router.post("/visitor_passes/save", async (req, res) => {
  try {
    const d = req.body;
    const pass_code = `VIS-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO visitor_passes (
        pass_code, visitor_name, visitor_phone, id_proof_type, 
        id_proof_number, patient_name, bed_room_number, 
        relation_to_patient, allowed_slot, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active Inside')
    `;
    await exe(sql, [
      pass_code,
      d.visitor_name,
      d.visitor_phone,
      d.id_proof_type || 'Aadhaar',
      d.id_proof_number,
      d.patient_name,
      d.bed_room_number,
      d.relation_to_patient,
      d.allowed_slot || 'Evening (17:00 - 19:00)'
    ]);

    res.redirect("/admin/visitor_passes");
  } catch (err) {
    console.error("Error creating visitor pass:", err);
    res.status(500).send("Pass issuance failed");
  }
});

// 3. Check-Out Visitor
router.post("/visitor_passes/checkout", async (req, res) => {
  try {
    const { pass_id } = req.body;
    await exe("UPDATE visitor_passes SET status = 'Checked Out', check_out_time = NOW() WHERE pass_id = ?", [pass_id]);
    res.redirect("/admin/visitor_passes");
  } catch (err) {
    console.error("Error checking out visitor:", err);
    res.status(500).send("Check-out failed");
  }
});

// 4. Delete Visitor Record
router.get("/visitor_passes/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM visitor_passes WHERE pass_id = ?", [req.params.id]);
    res.redirect("/admin/visitor_passes");
  } catch (err) {
    console.error("Error deleting pass record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// CSSD & SURGICAL STERILIZATION MANAGEMENT
// ------------------------------------------------------

// 1. CSSD Sterilization Overview Dashboard
router.get("/cssd", async (req, res) => {
  try {
    const trays = await exe("SELECT * FROM cssd_sterilization ORDER BY tray_id DESC");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_trays,
        COUNT(CASE WHEN status = 'Sterile / Ready for OT' AND expiry_date >= CURDATE() THEN 1 END) AS sterile_ready,
        COUNT(CASE WHEN status = 'In Autoclave Cycle' THEN 1 END) AS active_cycles,
        COUNT(CASE WHEN expiry_date < CURDATE() OR status = 'Expired / Reprocess' THEN 1 END) AS expired_reprocess_count
      FROM cssd_sterilization
    `);

    res.render("admin/cssd.ejs", {
      trays: trays || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_trays: 0, sterile_ready: 0, active_cycles: 0, expired_reprocess_count: 0 }
    });
  } catch (err) {
    console.error("CSSD dashboard error:", err);
    res.status(500).send(`Error loading CSSD sterilization records: ${err.message}`);
  }
});

// 2. Register New Instrument Tray Sterilization Cycle
router.post("/cssd/save", async (req, res) => {
  try {
    const d = req.body;
    const tray_barcode = `CSSD-TRY-${Date.now().toString().slice(-4)}`;
    
    // Default expiry 14 days from sterilization date
    const sterDate = d.sterilization_date || new Date().toISOString().slice(0, 10);
    const expDate = new Date(sterDate);
    expDate.setDate(expDate.getDate() + 14);
    const formattedExpDate = expDate.toISOString().slice(0, 10);

    const sql = `
      INSERT INTO cssd_sterilization (
        tray_barcode, kit_name, origin_ward_ot, sterilization_method, 
        autoclave_machine_no, sterilized_by, biological_indicator, 
        sterilization_date, expiry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      tray_barcode,
      d.kit_name,
      d.origin_ward_ot,
      d.sterilization_method || 'Steam Autoclave (134°C)',
      d.autoclave_machine_no || 'Autoclave Unit A-1',
      d.sterilized_by || 'Tech. On Duty',
      d.biological_indicator || 'Passed (Negative)',
      sterDate,
      d.expiry_date || formattedExpDate,
      d.status || 'In Autoclave Cycle'
    ]);

    res.redirect("/admin/cssd");
  } catch (err) {
    console.error("Error creating CSSD sterilization record:", err);
    res.status(500).send("Sterilization cycle logging failed");
  }
});

// 3. Update Sterilization Status & Release for OT
router.post("/cssd/update-status", async (req, res) => {
  try {
    const { tray_id, status } = req.body;
    await exe("UPDATE cssd_sterilization SET status = ? WHERE tray_id = ?", [status, tray_id]);
    res.redirect("/admin/cssd");
  } catch (err) {
    console.error("Error updating CSSD status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Sterilization Record
router.get("/cssd/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM cssd_sterilization WHERE tray_id = ?", [req.params.id]);
    res.redirect("/admin/cssd");
  } catch (err) {
    console.error("Error deleting CSSD record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// HOSPITAL LINEN & LAUNDRY INVENTORY
// ------------------------------------------------------

// 1. Linen Dashboard View
router.get("/linen", async (req, res) => {
  try {
    const linens = await exe("SELECT * FROM linen_inventory ORDER BY linen_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COALESCE(SUM(total_units), 0) AS total_linens,
        COALESCE(SUM(clean_available), 0) AS total_clean,
        COALESCE(SUM(in_wash), 0) AS total_in_wash,
        COUNT(CASE WHEN hazard_quarantine = 'Bio-Hazard Isolation Wash' THEN 1 END) AS biohazard_batches
      FROM linen_inventory
    `);

    res.render("admin/linen.ejs", {
      linens: linens || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_linens: 0, total_clean: 0, total_in_wash: 0, biohazard_batches: 0 }
    });
  } catch (err) {
    console.error("Linen dashboard error:", err);
    res.status(500).send(`Error loading linen records: ${err.message}`);
  }
});

// 2. Register New Linen Batch
router.post("/linen/save", async (req, res) => {
  try {
    const d = req.body;
    const batch_code = `LIN-${Date.now().toString().slice(-4)}`;
    const total = parseInt(d.total_units) || 50;
    const inWash = parseInt(d.in_wash) || 0;
    const clean = total - inWash;

    const sql = `
      INSERT INTO linen_inventory (
        batch_code, item_type, ward_department, total_units, 
        clean_available, in_wash, hazard_quarantine, 
        last_laundered_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      batch_code,
      d.item_type,
      d.ward_department,
      total,
      clean,
      inWash,
      d.hazard_quarantine || 'Standard Wash',
      d.last_laundered_date || new Date().toISOString().slice(0, 10),
      d.status || 'Restocked in Ward'
    ]);

    res.redirect("/admin/linen");
  } catch (err) {
    console.error("Error creating linen batch:", err);
    res.status(500).send("Linen logging failed");
  }
});

// 3. Quick Update Laundry Stage
router.post("/linen/update-status", async (req, res) => {
  try {
    const { linen_id, status } = req.body;
    await exe("UPDATE linen_inventory SET status = ?, last_laundered_date = CURDATE() WHERE linen_id = ?", [status, linen_id]);
    res.redirect("/admin/linen");
  } catch (err) {
    console.error("Error updating laundry status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Linen Record
router.get("/linen/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM linen_inventory WHERE linen_id = ?", [req.params.id]);
    res.redirect("/admin/linen");
  } catch (err) {
    console.error("Error deleting linen batch:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// MEDICAL GAS (MGPS) & OXYGEN CYLINDER BANK
// ------------------------------------------------------

// 1. Oxygen & Gas Dashboard Overview
router.get("/mgps_oxygen", async (req, res) => {
  try {
    const lines = await exe("SELECT * FROM mgps_line_monitors ORDER BY line_id ASC");
    const cylinders = await exe("SELECT * FROM oxygen_cylinders ORDER BY cylinder_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_cylinders,
        COUNT(CASE WHEN fill_status = 'Full (Ready)' THEN 1 END) AS full_cylinders,
        COUNT(CASE WHEN fill_status = 'Depleted / Empty' THEN 1 END) AS empty_cylinders,
        (SELECT COUNT(*) FROM mgps_line_monitors WHERE status IN ('Critical Drop', 'Warning (Low Pressure)')) AS active_gas_alerts
      FROM oxygen_cylinders
    `);

    res.render("admin/mgps_oxygen.ejs", {
      lines: lines || [],
      cylinders: cylinders || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_cylinders: 0, full_cylinders: 0, empty_cylinders: 0, active_gas_alerts: 0 }
    });
  } catch (err) {
    console.error("MGPS dashboard error:", err);
    res.status(500).send(`Error loading MGPS oxygen records: ${err.message}`);
  }
});

// 2. Add / Register Cylinder in Gas Bank
router.post("/mgps_oxygen/save-cylinder", async (req, res) => {
  try {
    const d = req.body;
    const cylinder_barcode = `OXY-${d.cylinder_type.startsWith('D') ? 'JMB' : 'PRT'}-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO oxygen_cylinders (
        cylinder_barcode, cylinder_type, assigned_ward, pressure_psi, 
        fill_status, supplier_vendor, last_hydro_test
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      cylinder_barcode,
      d.cylinder_type,
      d.assigned_ward,
      parseInt(d.pressure_psi) || 2000,
      d.fill_status || 'Full (Ready)',
      d.supplier_vendor || 'Inox Air Products',
      d.last_hydro_test || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/mgps_oxygen");
  } catch (err) {
    console.error("Error creating cylinder record:", err);
    res.status(500).send("Cylinder registration failed");
  }
});

// 3. Update Cylinder Status (Dispense / Sent for Refill)
router.post("/mgps_oxygen/update-cylinder-status", async (req, res) => {
  try {
    const { cylinder_id, fill_status, pressure_psi } = req.body;
    await exe("UPDATE oxygen_cylinders SET fill_status = ?, pressure_psi = ? WHERE cylinder_id = ?", [
      fill_status,
      parseInt(pressure_psi) || 0,
      cylinder_id
    ]);
    res.redirect("/admin/mgps_oxygen");
  } catch (err) {
    console.error("Error updating cylinder status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Update Pipeline Manifold Line Pressure
router.post("/mgps_oxygen/update-line-pressure", async (req, res) => {
  try {
    const { line_id, current_pressure_bar } = req.body;
    const press = parseFloat(current_pressure_bar);

    const lineData = await exe("SELECT alarm_threshold_bar FROM mgps_line_monitors WHERE line_id = ?", [line_id]);
    let status = 'Optimal';
    if (lineData && lineData.length > 0) {
      if (press <= lineData[0].alarm_threshold_bar) {
        status = 'Critical Drop';
      } else if (press <= lineData[0].alarm_threshold_bar + 0.3) {
        status = 'Warning (Low Pressure)';
      }
    }

    await exe("UPDATE mgps_line_monitors SET current_pressure_bar = ?, status = ? WHERE line_id = ?", [press, status, line_id]);
    res.redirect("/admin/mgps_oxygen");
  } catch (err) {
    console.error("Error updating manifold pressure:", err);
    res.status(500).send("Pressure update failed");
  }
});

// 5. Delete Cylinder Record
router.get("/mgps_oxygen/delete-cylinder/:id", async (req, res) => {
  try {
    await exe("DELETE FROM oxygen_cylinders WHERE cylinder_id = ?", [req.params.id]);
    res.redirect("/admin/mgps_oxygen");
  } catch (err) {
    console.error("Error deleting cylinder record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// MATERNITY, LDR & NEONATAL NURSERY REGISTRY
// ------------------------------------------------------

// 1. Maternity Overview Dashboard
router.get("/maternity", async (req, res) => {
  try {
    const records = await exe("SELECT * FROM birth_maternity_records ORDER BY record_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_births,
        COUNT(CASE WHEN delivery_type = 'Normal Vaginal Delivery' THEN 1 END) AS normal_deliveries,
        COUNT(CASE WHEN delivery_type LIKE 'Cesarean%' THEN 1 END) AS c_sections,
        COUNT(CASE WHEN nursery_status IN ('NICU Incubator', 'Phototherapy Unit') THEN 1 END) AS active_nicu_cases
      FROM birth_maternity_records
    `);

    res.render("admin/maternity.ejs", {
      records: records || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_births: 0, normal_deliveries: 0, c_sections: 0, active_nicu_cases: 0 }
    });
  } catch (err) {
    console.error("Maternity dashboard error:", err);
    res.status(500).send(`Error loading maternity records: ${err.message}`);
  }
});

// 2. Register Delivery & Newborn Birth Record
router.post("/maternity/save", async (req, res) => {
  try {
    const d = req.body;
    const certCode = `BRTH-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO birth_maternity_records (
        birth_certificate_code, mother_name, father_name, contact_number, 
        delivery_type, lead_obstetrician, attending_pediatrician, 
        delivery_datetime, baby_gender, birth_weight_kg, 
        apgar_score_1min, apgar_score_5min, nursery_status, clinical_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      certCode,
      d.mother_name,
      d.father_name,
      d.contact_number,
      d.delivery_type || 'Normal Vaginal Delivery',
      d.lead_obstetrician || 'Dr. Rizwan',
      d.attending_pediatrician || 'Pediatric Consultant',
      d.delivery_datetime || new Date().toISOString().slice(0, 19).replace('T', ' '),
      d.baby_gender || 'Female',
      parseFloat(d.birth_weight_kg) || 3.00,
      parseInt(d.apgar_score_1min) || 8,
      parseInt(d.apgar_score_5min) || 9,
      d.nursery_status || 'Rooming-In with Mother',
      d.clinical_notes || null
    ]);

    res.redirect("/admin/maternity");
  } catch (err) {
    console.error("Error creating birth record:", err);
    res.status(500).send("Birth registration failed");
  }
});

// 3. Update Neonatal / Mother Care Status
router.post("/maternity/update-status", async (req, res) => {
  try {
    const { record_id, nursery_status } = req.body;
    await exe("UPDATE birth_maternity_records SET nursery_status = ? WHERE record_id = ?", [nursery_status, record_id]);
    res.redirect("/admin/maternity");
  } catch (err) {
    console.error("Error updating nursery status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Maternity Record
router.get("/maternity/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM birth_maternity_records WHERE record_id = ?", [req.params.id]);
    res.redirect("/admin/maternity");
  } catch (err) {
    console.error("Error deleting birth record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// ORGAN TRANSPLANT & DONOR REGISTRY
// ------------------------------------------------------

// 1. Organ Registry Overview Dashboard
router.get("/transplants", async (req, res) => {
  try {
    const records = await exe("SELECT * FROM organ_transplants ORDER BY transplant_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_cases,
        COUNT(CASE WHEN patient_type = 'Organ Donor' AND status != 'Transplant Completed' THEN 1 END) AS available_donors,
        COUNT(CASE WHEN patient_type LIKE 'Organ Recipient%' AND status = 'Registered & Queued' THEN 1 END) AS waiting_recipients,
        COUNT(CASE WHEN status = 'Harvest / Transport in Progress' THEN 1 END) AS active_transits
      FROM organ_transplants
    `);

    res.render("admin/transplants.ejs", {
      records: records || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_cases: 0, available_donors: 0, waiting_recipients: 0, active_transits: 0 }
    });
  } catch (err) {
    console.error("Transplant dashboard error:", err);
    res.status(500).send(`Error loading transplant registry: ${err.message}`);
  }
});

// 2. Register Organ Donor or Recipient
router.post("/transplants/save", async (req, res) => {
  try {
    const d = req.body;
    const case_code = `TX-REG-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO organ_transplants (
        case_code, patient_type, person_name, contact_number, 
        blood_group, organ_name, donor_category, urgency_tier, 
        government_approval_no, attending_surgeon, status, registration_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Registered & Queued', ?)
    `;
    await exe(sql, [
      case_code,
      d.patient_type,
      d.person_name,
      d.contact_number,
      d.blood_group || 'O+',
      d.organ_name,
      d.donor_category,
      d.urgency_tier || 'Status 2 (Elective Outpatient)',
      d.government_approval_no || 'NOTTO-PENDING',
      d.attending_surgeon || 'Dr. Rizwan',
      d.registration_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/transplants");
  } catch (err) {
    console.error("Error creating transplant entry:", err);
    res.status(500).send("Transplant registration failed");
  }
});

// 3. Update Match or Transplant Stage
router.post("/transplants/update-status", async (req, res) => {
  try {
    const { transplant_id, status } = req.body;
    await exe("UPDATE organ_transplants SET status = ? WHERE transplant_id = ?", [status, transplant_id]);
    res.redirect("/admin/transplants");
  } catch (err) {
    console.error("Error updating transplant status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Transplant Record
router.get("/transplants/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM organ_transplants WHERE transplant_id = ?", [req.params.id]);
    res.redirect("/admin/transplants");
  } catch (err) {
    console.error("Error deleting transplant record:", err);
    res.status(500).send("Delete failed");
  }
});
//
// ------------------------------------------------------
// PHYSIOTHERAPY & PHYSICAL REHABILITATION
// ------------------------------------------------------

// 1. Physiotherapy Dashboard View
router.get("/physiotherapy", async (req, res) => {
  try {
    const sessions = await exe("SELECT * FROM physiotherapy_sessions ORDER BY session_date DESC, session_id DESC");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_enrolled,
        COUNT(CASE WHEN session_status = 'Session Completed' AND session_date = CURDATE() THEN 1 END) AS completed_today,
        COUNT(CASE WHEN session_status = 'In Progress' THEN 1 END) AS active_now,
        COUNT(CASE WHEN patient_type = 'Inpatient (Bedside)' THEN 1 END) AS bedside_inpatient_count
      FROM physiotherapy_sessions
    `);

    res.render("admin/physiotherapy.ejs", {
      sessions: sessions || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_enrolled: 0, completed_today: 0, active_now: 0, bedside_inpatient_count: 0 }
    });
  } catch (err) {
    console.error("Physiotherapy dashboard error:", err);
    res.status(500).send(`Error loading physiotherapy records: ${err.message}`);
  }
});

// 2. Schedule New Physical Therapy Session
router.post("/physiotherapy/save", async (req, res) => {
  try {
    const d = req.body;
    const program_code = `PT-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO physiotherapy_sessions (
        program_code, patient_name, patient_contact, patient_type, 
        bed_room_no, rehab_category, prescribed_modality, 
        lead_physiotherapist, session_number, total_prescribed_sessions, 
        muscle_power_grade, session_date, session_status, therapist_progress_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?)
    `;
    await exe(sql, [
      program_code,
      d.patient_name,
      d.patient_contact,
      d.patient_type || 'Inpatient (Bedside)',
      d.bed_room_no || 'Rehab OPD Bay 1',
      d.rehab_category,
      d.prescribed_modality,
      d.lead_physiotherapist || 'Dr. Ananya Joshi (PT)',
      parseInt(d.session_number) || 1,
      parseInt(d.total_prescribed_sessions) || 10,
      d.muscle_power_grade || 'Grade 3 (Movement against Gravity)',
      d.session_date || new Date().toISOString().slice(0, 10),
      d.therapist_progress_notes || null
    ]);

    res.redirect("/admin/physiotherapy");
  } catch (err) {
    console.error("Error creating therapy session:", err);
    res.status(500).send("Rehabilitation scheduling failed");
  }
});

// 3. Update Session Progress & Muscle Grade
router.post("/physiotherapy/update-status", async (req, res) => {
  try {
    const { session_id, session_status, muscle_power_grade, therapist_progress_notes } = req.body;
    await exe(`
      UPDATE physiotherapy_sessions 
      SET session_status = ?, 
          muscle_power_grade = ?, 
          therapist_progress_notes = ? 
      WHERE session_id = ?
    `, [session_status, muscle_power_grade, therapist_progress_notes, session_id]);

    res.redirect("/admin/physiotherapy");
  } catch (err) {
    console.error("Error updating therapy status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Physiotherapy Record
router.get("/physiotherapy/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM physiotherapy_sessions WHERE session_id = ?", [req.params.id]);
    res.redirect("/admin/physiotherapy");
  } catch (err) {
    console.error("Error deleting therapy record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// TELEMEDICINE & VIRTUAL CONSULTATIONS
// ------------------------------------------------------

// 1. Telemedicine Overview Dashboard
router.get("/telemedicine", async (req, res) => {
  try {
    const sessions = await exe("SELECT * FROM telemedicine_sessions ORDER BY consultation_datetime ASC, telemed_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_telemed,
        COUNT(CASE WHEN session_status = 'Scheduled' THEN 1 END) AS scheduled_today,
        COUNT(CASE WHEN session_status = 'In Video Call' THEN 1 END) AS active_calls,
        COUNT(CASE WHEN payment_status = 'Paid / Captured' THEN 1 END) AS paid_consults
      FROM telemedicine_sessions
    `);

    res.render("admin/telemedicine.ejs", {
      sessions: sessions || [],
      doctors: doctors || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_telemed: 0, scheduled_today: 0, active_calls: 0, paid_consults: 0 }
    });
  } catch (err) {
    console.error("Telemedicine dashboard error:", err);
    res.status(500).send(`Error loading telemedicine records: ${err.message}`);
  }
});

// 2. Schedule New Video Consultation
router.post("/telemedicine/save", async (req, res) => {
  try {
    const d = req.body;
    const sessionCode = `TELE-${Date.now().toString().slice(-4)}`;
    const meetingUrl = `https://meet.jit.si/wellcure-${sessionCode.toLowerCase()}`;

    const sql = `
      INSERT INTO telemedicine_sessions (
        session_code, patient_name, patient_phone, patient_email, 
        consulting_doctor, department, consultation_datetime, 
        video_meeting_url, consultation_fee, payment_status, 
        session_status, patient_chief_complaint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?)
    `;
    await exe(sql, [
      sessionCode,
      d.patient_name,
      d.patient_phone,
      d.patient_email || null,
      d.consulting_doctor || 'Dr. Rizwan',
      d.department || 'General Medicine',
      d.consultation_datetime || new Date().toISOString().slice(0, 19).replace('T', ' '),
      meetingUrl,
      parseFloat(d.consultation_fee) || 500.00,
      d.payment_status || 'Paid / Captured',
      d.patient_chief_complaint
    ]);

    res.redirect("/admin/telemedicine");
  } catch (err) {
    console.error("Error creating telemed session:", err);
    res.status(500).send("Telemedicine appointment scheduling failed");
  }
});

// 3. Issue Digital Prescription & Complete Session
router.post("/telemedicine/complete-session", async (req, res) => {
  try {
    const { telemed_id, session_status, digital_prescription } = req.body;
    await exe(`
      UPDATE telemedicine_sessions 
      SET session_status = ?, 
          digital_prescription = ? 
      WHERE telemed_id = ?
    `, [session_status, digital_prescription, telemed_id]);

    res.redirect("/admin/telemedicine");
  } catch (err) {
    console.error("Error completing telemed session:", err);
    res.status(500).send("Session update failed");
  }
});

// 4. Delete Telemedicine Record
router.get("/telemedicine/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM telemedicine_sessions WHERE telemed_id = ?", [req.params.id]);
    res.redirect("/admin/telemedicine");
  } catch (err) {
    console.error("Error deleting telemed record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// INFECTION CONTROL & CLINICAL AUDIT (HAI)
// ------------------------------------------------------

// 1. Infection Control Dashboard View
router.get("/infection_control", async (req, res) => {
  try {
    const audits = await exe("SELECT * FROM infection_control_audits ORDER BY audit_date DESC, audit_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_audits,
        COUNT(CASE WHEN status = 'Active Surveillance' THEN 1 END) AS active_infections,
        COUNT(CASE WHEN isolation_protocol != 'Standard Precautions' AND status = 'Active Surveillance' THEN 1 END) AS active_isolations,
        COALESCE(ROUND(AVG(audit_score_percentage), 1), 0.0) AS avg_hygiene_score
      FROM infection_control_audits
    `);

    res.render("admin/infection_control.ejs", {
      audits: audits || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_audits: 0, active_infections: 0, active_isolations: 0, avg_hygiene_score: 0 }
    });
  } catch (err) {
    console.error("Infection control dashboard error:", err);
    res.status(500).send(`Error loading infection control records: ${err.message}`);
  }
});

// 2. Log New Infection Audit / Case
router.post("/infection_control/save", async (req, res) => {
  try {
    const d = req.body;
    const surveillance_code = `HAI-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO infection_control_audits (
        surveillance_code, ward_department, infection_type, 
        patient_name, isolated_organism, isolation_protocol, 
        audit_score_percentage, auditor_name, audit_date, 
        corrective_action, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active Surveillance')
    `;
    await exe(sql, [
      surveillance_code,
      d.ward_department,
      d.infection_type,
      d.patient_name || 'Ward Audit Sample',
      d.isolated_organism || 'Pending Lab Culture',
      d.isolation_protocol || 'Standard Precautions',
      parseFloat(d.audit_score_percentage) || 85.00,
      d.auditor_name || 'Infection Control Nurse',
      d.audit_date || new Date().toISOString().slice(0, 10),
      d.corrective_action || null
    ]);

    res.redirect("/admin/infection_control");
  } catch (err) {
    console.error("Error creating infection audit:", err);
    res.status(500).send("Infection audit registration failed");
  }
});

// 3. Update Audit / Isolation Status
router.post("/infection_control/update-status", async (req, res) => {
  try {
    const { audit_id, status, corrective_action } = req.body;
    await exe(`
      UPDATE infection_control_audits 
      SET status = ?, corrective_action = ? 
      WHERE audit_id = ?
    `, [status, corrective_action, audit_id]);

    res.redirect("/admin/infection_control");
  } catch (err) {
    console.error("Error updating infection status:", err);
    res.status(500).send("Status update failed");
  }
});

// 4. Delete Audit Entry
router.get("/infection_control/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM infection_control_audits WHERE audit_id = ?", [req.params.id]);
    res.redirect("/admin/infection_control");
  } catch (err) {
    console.error("Error deleting infection record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// MEDICO-LEGAL CASES (MLC) & POLICE INTIMATION
// ------------------------------------------------------

// 1. MLC Dashboard View
router.get("/mlc", async (req, res) => {
  try {
    const records = await exe("SELECT * FROM mlc_records ORDER BY incident_datetime DESC, mlc_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_mlc,
        COUNT(CASE WHEN intimation_status = 'Intimation Sent to Police' THEN 1 END) AS pending_police,
        COUNT(CASE WHEN injury_grade = 'Critical / Life-Threatening' THEN 1 END) AS critical_injuries,
        COUNT(CASE WHEN incident_type LIKE 'Road Traffic%' THEN 1 END) AS rta_cases
      FROM mlc_records
    `);

    res.render("admin/mlc.ejs", {
      records: records || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_mlc: 0, pending_police: 0, critical_injuries: 0, rta_cases: 0 }
    });
  } catch (err) {
    console.error("MLC dashboard error:", err);
    res.status(500).send(`Error loading MLC records: ${err.message}`);
  }
});

// 2. Register New Medico-Legal Case
router.post("/mlc/save", async (req, res) => {
  try {
    const d = req.body;
    const mlc_case_no = `MLC-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO mlc_records (
        mlc_case_no, patient_name, patient_contact, emergency_bed_no, 
        incident_type, injury_grade, police_station_name, 
        fir_station_diary_no, police_officer_name, police_officer_badge, 
        intimation_status, attending_cmo, clinical_injury_description, incident_datetime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Intimation Sent to Police', ?, ?, ?)
    `;
    await exe(sql, [
      mlc_case_no,
      d.patient_name,
      d.patient_contact,
      d.emergency_bed_no || 'Trauma Bay 1',
      d.incident_type,
      d.injury_grade || 'Grievous / Severe',
      d.police_station_name,
      d.fir_station_diary_no || 'Pending Intimation',
      d.police_officer_name || 'Constable On Duty',
      d.police_officer_badge || 'N/A',
      d.attending_cmo || 'Dr. Rizwan',
      d.clinical_injury_description,
      d.incident_datetime || new Date().toISOString().slice(0, 19).replace('T', ' ')
    ]);

    res.redirect("/admin/mlc");
  } catch (err) {
    console.error("Error creating MLC record:", err);
    res.status(500).send("MLC registration failed");
  }
});

// 3. Update Police Intimation / FIR Status
router.post("/mlc/update-status", async (req, res) => {
  try {
    const { mlc_id, intimation_status, fir_station_diary_no, police_officer_name } = req.body;
    await exe(`
      UPDATE mlc_records 
      SET intimation_status = ?, 
          fir_station_diary_no = ?, 
          police_officer_name = ? 
      WHERE mlc_id = ?
    `, [intimation_status, fir_station_diary_no, police_officer_name, mlc_id]);

    res.redirect("/admin/mlc");
  } catch (err) {
    console.error("Error updating MLC status:", err);
    res.status(500).send("MLC status update failed");
  }
});

// 4. Delete MLC Entry
router.get("/mlc/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM mlc_records WHERE mlc_id = ?", [req.params.id]);
    res.redirect("/admin/mlc");
  } catch (err) {
    console.error("Error deleting MLC record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// FACILITY MANAGEMENT & BREAKDOWN WORK ORDERS
// ------------------------------------------------------

// 1. Facility Work Orders Dashboard
router.get("/facility_maintenance", async (req, res) => {
  try {
    const orders = await exe("SELECT * FROM facility_work_orders ORDER BY ticket_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_tickets,
        COUNT(CASE WHEN status IN ('Open / Reported', 'Technician Assigned', 'Work In Progress') THEN 1 END) AS active_breakdowns,
        COUNT(CASE WHEN priority = 'Urgent / Clinical Critical' AND status != 'Closed' THEN 1 END) AS critical_alarms,
        COUNT(CASE WHEN status = 'Resolved & Tested' THEN 1 END) AS resolved_count
      FROM facility_work_orders
    `);

    res.render("admin/facility_maintenance.ejs", {
      orders: orders || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_tickets: 0, active_breakdowns: 0, critical_alarms: 0, resolved_count: 0 }
    });
  } catch (err) {
    console.error("Facility maintenance dashboard error:", err);
    res.status(500).send(`Error loading maintenance records: ${err.message}`);
  }
});

// 2. Raise New Maintenance Ticket
router.post("/facility_maintenance/save", async (req, res) => {
  try {
    const d = req.body;
    const ticket_code = `WO-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO facility_work_orders (
        ticket_code, location_ward, category, priority, 
        issue_description, reported_by, assigned_technician, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Open / Reported')
    `;
    await exe(sql, [
      ticket_code,
      d.location_ward,
      d.category,
      d.priority || 'Medium',
      d.issue_description,
      d.reported_by || 'Hospital Staff',
      d.assigned_technician || 'Maintenance Team'
    ]);

    res.redirect("/admin/facility_maintenance");
  } catch (err) {
    console.error("Error creating work order:", err);
    res.status(500).send("Work order ticket creation failed");
  }
});

// 3. Update Ticket Progress & Resolution Notes
router.post("/facility_maintenance/update-status", async (req, res) => {
  try {
    const { ticket_id, status, assigned_technician, completion_notes } = req.body;
    const resolvedTime = status === 'Resolved & Tested' || status === 'Closed' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    await exe(`
      UPDATE facility_work_orders 
      SET status = ?, 
          assigned_technician = ?, 
          completion_notes = ?, 
          resolved_at = COALESCE(?, resolved_at) 
      WHERE ticket_id = ?
    `, [status, assigned_technician, completion_notes, resolvedTime, ticket_id]);

    res.redirect("/admin/facility_maintenance");
  } catch (err) {
    console.error("Error updating work order:", err);
    res.status(500).send("Work order update failed");
  }
});

// 4. Delete Work Order Entry
router.get("/facility_maintenance/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM facility_work_orders WHERE ticket_id = ?", [req.params.id]);
    res.redirect("/admin/facility_maintenance");
  } catch (err) {
    console.error("Error deleting work order:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// DISASTER MANAGEMENT, MCI TRIAGE & EMERGENCY CODES
// ------------------------------------------------------

// 1. Disaster Management Dashboard
router.get("/disaster_management", async (req, res) => {
  try {
    const codes = await exe("SELECT * FROM emergency_code_alerts ORDER BY alert_id DESC LIMIT 25");
    const mciPatients = await exe("SELECT * FROM disaster_triage_patients ORDER BY triage_id DESC LIMIT 50");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        (SELECT COUNT(*) FROM emergency_code_alerts WHERE status = 'Active Alert') AS active_codes_count,
        (SELECT COUNT(*) FROM disaster_triage_patients WHERE triage_color_tag LIKE 'Red%') AS red_immediate_count,
        (SELECT COUNT(*) FROM disaster_triage_patients WHERE triage_color_tag LIKE 'Yellow%') AS yellow_delayed_count,
        (SELECT COUNT(*) FROM disaster_triage_patients) AS total_disaster_victims
    `);

    res.render("admin/disaster_management.ejs", {
      codes: codes || [],
      mciPatients: mciPatients || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { active_codes_count: 0, red_immediate_count: 0, yellow_delayed_count: 0, total_disaster_victims: 0 }
    });
  } catch (err) {
    console.error("Disaster management dashboard error:", err);
    res.status(500).send(`Error loading disaster management records: ${err.message}`);
  }
});

// 2. Broadcast / Trigger Hospital Emergency Code
router.post("/disaster_management/trigger-code", async (req, res) => {
  try {
    const d = req.body;
    const alert_code = `EMG-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO emergency_code_alerts (
        alert_code, code_type, location_zone, triggered_by, 
        response_team_lead, status, situation_notes
      ) VALUES (?, ?, ?, ?, ?, 'Active Alert', ?)
    `;
    await exe(sql, [
      alert_code,
      d.code_type,
      d.location_zone,
      d.triggered_by || 'Hospital Command Control',
      d.response_team_lead || 'RRT Commander',
      d.situation_notes || null
    ]);

    res.redirect("/admin/disaster_management");
  } catch (err) {
    console.error("Error triggering emergency code:", err);
    res.status(500).send("Emergency code broadcast failed");
  }
});

// 3. Stand Down Emergency Code
router.post("/disaster_management/stand-down-code", async (req, res) => {
  try {
    const { alert_id, status } = req.body;
    await exe("UPDATE emergency_code_alerts SET status = ?, stood_down_at = NOW() WHERE alert_id = ?", [status, alert_id]);
    res.redirect("/admin/disaster_management");
  } catch (err) {
    console.error("Error standing down emergency code:", err);
    res.status(500).send("Code update failed");
  }
});

// 4. Enroll Mass Casualty Triage Patient
router.post("/disaster_management/save-mci-patient", async (req, res) => {
  try {
    const d = req.body;
    const mci_tag_code = `MCI-TAG-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO disaster_triage_patients (
        mci_tag_code, incident_event_name, triage_color_tag, 
        patient_identifier, estimated_age_gender, assigned_clinical_zone, 
        primary_injury_assessment, disposition_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Under Resuscitation')
    `;
    await exe(sql, [
      mci_tag_code,
      d.incident_event_name || 'Mass Casualty Disaster Intake',
      d.triage_color_tag,
      d.patient_identifier || 'Unknown Trauma Patient',
      d.estimated_age_gender || 'Adult Unspecified',
      d.assigned_clinical_zone || 'Resuscitation Bay A',
      d.primary_injury_assessment
    ]);

    res.redirect("/admin/disaster_management");
  } catch (err) {
    console.error("Error creating MCI intake:", err);
    res.status(500).send("Disaster triage enrollment failed");
  }
});

// 5. Update MCI Patient Disposition
router.post("/disaster_management/update-mci-status", async (req, res) => {
  try {
    const { triage_id, disposition_status } = req.body;
    await exe("UPDATE disaster_triage_patients SET disposition_status = ? WHERE triage_id = ?", [disposition_status, triage_id]);
    res.redirect("/admin/disaster_management");
  } catch (err) {
    console.error("Error updating MCI patient status:", err);
    res.status(500).send("Status update failed");
  }
});

// 6. Delete MCI Patient Record
router.get("/disaster_management/delete-mci/:id", async (req, res) => {
  try {
    await exe("DELETE FROM disaster_triage_patients WHERE triage_id = ?", [req.params.id]);
    res.redirect("/admin/disaster_management");
  } catch (err) {
    console.error("Error deleting MCI record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// HOSPITAL UTILITIES & ENERGY RESERVES
// ------------------------------------------------------

// 1. Utilities Dashboard
router.get("/utilities", async (req, res) => {
  try {
    const utilities = await exe("SELECT * FROM utility_reserves ORDER BY utility_id ASC");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_monitors,
        COUNT(CASE WHEN status = 'Critical Shortage' THEN 1 END) AS critical_alerts,
        COUNT(CASE WHEN status = 'Optimal Level' THEN 1 END) AS optimal_count,
        COALESCE((SELECT current_level FROM utility_reserves WHERE utility_type LIKE 'Liquid Oxygen%' LIMIT 1), 0) AS lmo_current
      FROM utility_reserves
    `);

    res.render("admin/utilities.ejs", {
      utilities: utilities || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_monitors: 0, critical_alerts: 0, optimal_count: 0, lmo_current: 0 }
    });
  } catch (err) {
    console.error("Utilities dashboard error:", err);
    res.status(500).send(`Error loading utility records: ${err.message}`);
  }
});

// 2. Add / Register New Utility Monitor
router.post("/utilities/save", async (req, res) => {
  try {
    const d = req.body;
    const current = parseFloat(d.current_level) || 0;
    const threshold = parseFloat(d.min_alert_threshold) || 0;

    let status = 'Optimal Level';
    if (current <= threshold) {
      status = 'Critical Shortage';
    } else if (current <= threshold * 1.3) {
      status = 'Moderate Reserve';
    }

    const sql = `
      INSERT INTO utility_reserves (
        utility_name, utility_type, location_plant, current_level, 
        total_capacity, unit_of_measure, min_alert_threshold, status, last_refilled_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      d.utility_name,
      d.utility_type,
      d.location_plant,
      current,
      parseFloat(d.total_capacity) || 1000,
      d.unit_of_measure || 'Liters',
      threshold,
      status,
      d.last_refilled_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/utilities");
  } catch (err) {
    console.error("Error creating utility record:", err);
    res.status(500).send("Utility registration failed");
  }
});

// 3. Log Utility Refill / Level Meter Update
router.post("/utilities/update-level", async (req, res) => {
  try {
    const { utility_id, current_level } = req.body;
    const current = parseFloat(current_level);

    const record = await exe("SELECT min_alert_threshold FROM utility_reserves WHERE utility_id = ?", [utility_id]);
    let status = 'Optimal Level';
    if (record && record.length > 0) {
      const threshold = record[0].min_alert_threshold;
      if (current <= threshold) {
        status = 'Critical Shortage';
      } else if (current <= threshold * 1.3) {
        status = 'Moderate Reserve';
      }
    }

    await exe(`
      UPDATE utility_reserves 
      SET current_level = ?, status = ?, last_refilled_date = CURDATE() 
      WHERE utility_id = ?
    `, [current, status, utility_id]);

    res.redirect("/admin/utilities");
  } catch (err) {
    console.error("Error updating utility level:", err);
    res.status(500).send("Meter reading update failed");
  }
});

// 4. Delete Utility Monitor
router.get("/utilities/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM utility_reserves WHERE utility_id = ?", [req.params.id]);
    res.redirect("/admin/utilities");
  } catch (err) {
    console.error("Error deleting utility record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// STAFF CREDENTIALING & CLINICAL PRIVILEGING
// ------------------------------------------------------

// 1. Staff Credentialing Dashboard
router.get("/staff_credentials", async (req, res) => {
  try {
    const staff = await exe("SELECT * FROM staff_credentials ORDER BY license_expiry_date ASC, credential_id DESC");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_credentialed,
        COUNT(CASE WHEN credentialing_status = 'Privileged & Active' THEN 1 END) AS active_privileges,
        COUNT(CASE WHEN license_expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY) AND license_expiry_date >= CURDATE() THEN 1 END) AS renewals_due,
        COUNT(CASE WHEN license_expiry_date < CURDATE() OR credentialing_status = 'Credential Expired' THEN 1 END) AS expired_licenses
      FROM staff_credentials
    `);

    res.render("admin/staff_credentials.ejs", {
      staff: staff || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_credentialed: 0, active_privileges: 0, renewals_due: 0, expired_licenses: 0 }
    });
  } catch (err) {
    console.error("Staff credentialing dashboard error:", err);
    res.status(500).send(`Error loading credentialing records: ${err.message}`);
  }
});

// 2. Register New Staff Credential
router.post("/staff_credentials/save", async (req, res) => {
  try {
    const d = req.body;
    const licExp = new Date(d.license_expiry_date);
    const today = new Date();
    const diffDays = Math.ceil((licExp - today) / (1000 * 60 * 60 * 24));

    let status = 'Privileged & Active';
    if (diffDays < 0) {
      status = 'Credential Expired';
    } else if (diffDays <= 60) {
      status = 'Renewal Pending (<60 Days)';
    }

    const sql = `
      INSERT INTO staff_credentials (
        doctor_name, staff_role, department, council_registration_no, 
        state_medical_council, license_expiry_date, indemnity_insurance_policy, 
        indemnity_expiry_date, approved_clinical_privileges, credentialing_status, last_verified_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      d.doctor_name,
      d.staff_role,
      d.department,
      d.council_registration_no,
      d.state_medical_council || 'Maharashtra Medical Council (MMC)',
      d.license_expiry_date,
      d.indemnity_insurance_policy || 'IND-PENDING',
      d.indemnity_expiry_date,
      d.approved_clinical_privileges,
      status,
      d.last_verified_by || 'Medical Superintendent'
    ]);

    res.redirect("/admin/staff_credentials");
  } catch (err) {
    console.error("Error creating staff credential:", err);
    res.status(500).send("Staff credentialing registration failed");
  }
});

// 3. Update Verification & Privileges
router.post("/staff_credentials/update-status", async (req, res) => {
  try {
    const { credential_id, credentialing_status, approved_clinical_privileges, license_expiry_date, indemnity_expiry_date } = req.body;
    await exe(`
      UPDATE staff_credentials 
      SET credentialing_status = ?, 
          approved_clinical_privileges = ?, 
          license_expiry_date = ?, 
          indemnity_expiry_date = ? 
      WHERE credential_id = ?
    `, [credentialing_status, approved_clinical_privileges, license_expiry_date, indemnity_expiry_date, credential_id]);

    res.redirect("/admin/staff_credentials");
  } catch (err) {
    console.error("Error updating credentialing status:", err);
    res.status(500).send("Credentialing update failed");
  }
});

// 4. Delete Credential Record
router.get("/staff_credentials/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM staff_credentials WHERE credential_id = ?", [req.params.id]);
    res.redirect("/admin/staff_credentials");
  } catch (err) {
    console.error("Error deleting credential record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// NARCOTICS & CONTROLLED DRUG FORMULARY
// ------------------------------------------------------

// 1. Narcotics Dashboard
router.get("/narcotics", async (req, res) => {
  try {
    const drugs = await exe("SELECT * FROM narcotic_formulary ORDER BY drug_id ASC");
    const logs = await exe(`
      SELECT l.*, d.generic_name, d.strength 
      FROM narcotic_dispense_logs l 
      LEFT JOIN narcotic_formulary d ON l.drug_code = d.drug_code 
      ORDER BY l.dispense_id DESC LIMIT 30
    `);
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_drugs,
        COALESCE(SUM(current_stock_units), 0) AS total_vials,
        (SELECT COUNT(*) FROM narcotic_dispense_logs WHERE dispense_timestamp >= CURDATE()) AS dispensed_today,
        COUNT(CASE WHEN current_stock_units <= min_alert_units THEN 1 END) AS low_stock_alerts
      FROM narcotic_formulary
    `);

    res.render("admin/narcotics.ejs", {
      drugs: drugs || [],
      logs: logs || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_drugs: 0, total_vials: 0, dispensed_today: 0, low_stock_alerts: 0 }
    });
  } catch (err) {
    console.error("Narcotics dashboard error:", err);
    res.status(500).send(`Error loading narcotics records: ${err.message}`);
  }
});

// 2. Add New Controlled Substance to Formulary
router.post("/narcotics/save-drug", async (req, res) => {
  try {
    const d = req.body;
    const drug_code = `NARC-${d.generic_name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}`;
    const sql = `
      INSERT INTO narcotic_formulary (
        drug_code, generic_name, brand_name, dosage_form, 
        strength, controlled_schedule, current_stock_units, 
        min_alert_units, safe_storage_locker, last_audited_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      drug_code,
      d.generic_name,
      d.brand_name,
      d.dosage_form || 'Injectable Ampoule',
      d.strength,
      d.controlled_schedule || 'Schedule X / Narcotic',
      parseInt(d.current_stock_units) || 0,
      parseInt(d.min_alert_units) || 10,
      d.safe_storage_locker || 'Double-Lock Vault Room #1',
      d.last_audited_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/narcotics");
  } catch (err) {
    console.error("Error creating narcotic item:", err);
    res.status(500).send("Formulary registration failed");
  }
});

// 3. Dispense & Administer Controlled Narcotic
router.post("/narcotics/dispense", async (req, res) => {
  try {
    const d = req.body;
    const qty = parseInt(d.quantity_dispensed) || 1;

    // Check available vault stock
    const drugRow = await exe("SELECT current_stock_units FROM narcotic_formulary WHERE drug_code = ?", [d.drug_code]);
    if (!drugRow.length || drugRow[0].current_stock_units < qty) {
      return res.status(400).send(`Insufficient vault stock for narcotic drug code ${d.drug_code}`);
    }

    const newStock = drugRow[0].current_stock_units - qty;
    const logRef = `NLOG-${Date.now().toString().slice(-4)}`;

    // Insert audit log
    await exe(`
      INSERT INTO narcotic_dispense_logs (
        log_reference, drug_code, patient_name, ward_or_ot, 
        prescribing_doctor, administering_nurse, quantity_dispensed, 
        clinical_indication, balance_remaining_stock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logRef,
      d.drug_code,
      d.patient_name,
      d.ward_or_ot,
      d.prescribing_doctor || 'Dr. Rizwan',
      d.administering_nurse,
      qty,
      d.clinical_indication,
      newStock
    ]);

    // Deduct stock from vault
    await exe("UPDATE narcotic_formulary SET current_stock_units = ? WHERE drug_code = ?", [newStock, d.drug_code]);

    res.redirect("/admin/narcotics");
  } catch (err) {
    console.error("Error dispensing narcotic:", err);
    res.status(500).send("Narcotics dispensing failed");
  }
});

// 4. Delete Formulary Drug
router.get("/narcotics/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM narcotic_formulary WHERE drug_id = ?", [req.params.id]);
    res.redirect("/admin/narcotics");
  } catch (err) {
    console.error("Error deleting narcotic item:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// AMBULANCE FLEET & DISPATCH TELEMETRY
// ------------------------------------------------------

// 1. Ambulance Fleet Dashboard
router.get("/ambulance_fleet", async (req, res) => {
  try {
    const fleet = await exe("SELECT * FROM ambulance_fleet ORDER BY ambulance_id ASC");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_fleet,
        COUNT(CASE WHEN status = 'Available at Base' THEN 1 END) AS available_units,
        COUNT(CASE WHEN status IN ('Dispatched / En Route', 'On Scene / Resuscitation', 'Transit to Hospital') THEN 1 END) AS active_dispatches,
        COUNT(CASE WHEN vehicle_type LIKE 'Advanced Life%' THEN 1 END) AS als_units
      FROM ambulance_fleet
    `);

    res.render("admin/ambulance_fleet.ejs", {
      fleet: fleet || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_fleet: 0, available_units: 0, active_dispatches: 0, als_units: 0 }
    });
  } catch (err) {
    console.error("Ambulance fleet dashboard error:", err);
    res.status(500).send(`Error loading ambulance fleet: ${err.message}`);
  }
});

// 2. Add New Vehicle to Fleet
router.post("/ambulance_fleet/save", async (req, res) => {
  try {
    const d = req.body;
    const sql = `
      INSERT INTO ambulance_fleet (
        vehicle_number, vehicle_type, driver_name, driver_phone, 
        paramedic_name, current_location, fuel_level_percent, 
        oxygen_cylinder_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Available at Base')
    `;
    await exe(sql, [
      d.vehicle_number,
      d.vehicle_type || 'Advanced Life Support (ALS)',
      d.driver_name,
      d.driver_phone,
      d.paramedic_name,
      d.current_location || 'Main Hospital ER Bay',
      parseInt(d.fuel_level_percent) || 90,
      d.oxygen_cylinder_status || 'Full'
    ]);

    res.redirect("/admin/ambulance_fleet");
  } catch (err) {
    console.error("Error registering vehicle:", err);
    res.status(500).send("Ambulance registration failed");
  }
});

// 3. Dispatch / Telemetry Status Update
router.post("/ambulance_fleet/update-telemetry", async (req, res) => {
  try {
    const { ambulance_id, status, current_location, fuel_level_percent, oxygen_cylinder_status } = req.body;
    const dispatchTime = (status === 'Dispatched / En Route') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    await exe(`
      UPDATE ambulance_fleet 
      SET status = ?, 
          current_location = ?, 
          fuel_level_percent = ?, 
          oxygen_cylinder_status = ?, 
          last_dispatched_at = COALESCE(?, last_dispatched_at) 
      WHERE ambulance_id = ?
    `, [status, current_location, parseInt(fuel_level_percent) || 0, oxygen_cylinder_status, dispatchTime, ambulance_id]);

    res.redirect("/admin/ambulance_fleet");
  } catch (err) {
    console.error("Error updating telemetry:", err);
    res.status(500).send("Telemetry update failed");
  }
});

// 4. Delete Vehicle from Fleet
router.get("/ambulance_fleet/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM ambulance_fleet WHERE ambulance_id = ?", [req.params.id]);
    res.redirect("/admin/ambulance_fleet");
  } catch (err) {
    console.error("Error deleting ambulance:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// NURSING KARDEX, I/O & SHIFT HANDOVER (SBAR)
// ------------------------------------------------------

// 1. Kardex Dashboard
router.get("/nursing_kardex", async (req, res) => {
  try {
    const charts = await exe("SELECT * FROM nursing_kardex ORDER BY kardex_id DESC");
    const occupiedBeds = await exe("SELECT bed_number, patient_name FROM beds WHERE status = 'Occupied'");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_charts,
        COUNT(CASE WHEN status = 'Active Shift Chart' THEN 1 END) AS active_charts,
        COUNT(CASE WHEN fall_risk_tier = 'High Fall Risk' THEN 1 END) AS high_fall_risks,
        COUNT(CASE WHEN diet_code = 'NPO (Nil Per Os)' THEN 1 END) AS npo_alerts
      FROM nursing_kardex
    `);

    res.render("admin/nursing_kardex.ejs", {
      charts: charts || [],
      occupiedBeds: occupiedBeds || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_charts: 0, active_charts: 0, high_fall_risks: 0, npo_alerts: 0 }
    });
  } catch (err) {
    console.error("Nursing kardex error:", err);
    res.status(500).send(`Error loading nursing kardex: ${err.message}`);
  }
});

// 2. Save Nursing Kardex Chart
router.post("/nursing_kardex/save", async (req, res) => {
  try {
    const d = req.body;
    const chart_code = `KDX-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO nursing_kardex (
        chart_code, patient_name, bed_room_no, shift_type, 
        fall_risk_tier, diet_code, intake_fluids_ml, output_urine_ml, 
        sbar_situation, sbar_assessment, sbar_recommendation, 
        handover_nurse_outgoing, handover_nurse_incoming, status, logged_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active Shift Chart', ?)
    `;
    await exe(sql, [
      chart_code,
      d.patient_name,
      d.bed_room_no,
      d.shift_type || 'Morning (07:00 - 15:00)',
      d.fall_risk_tier || 'Low Risk',
      d.diet_code || 'Regular Solid',
      parseInt(d.intake_fluids_ml) || 0,
      parseInt(d.output_urine_ml) || 0,
      d.sbar_situation,
      d.sbar_assessment,
      d.sbar_recommendation,
      d.handover_nurse_outgoing,
      d.handover_nurse_incoming,
      d.logged_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/nursing_kardex");
  } catch (err) {
    console.error("Error saving nursing kardex:", err);
    res.status(500).send("Kardex registration failed");
  }
});

// 3. Sign Off / Close Shift Handover
router.post("/nursing_kardex/signoff", async (req, res) => {
  try {
    const { kardex_id } = req.body;
    await exe("UPDATE nursing_kardex SET status = 'Handover Signed & Closed' WHERE kardex_id = ?", [kardex_id]);
    res.redirect("/admin/nursing_kardex");
  } catch (err) {
    console.error("Error signing off kardex:", err);
    res.status(500).send("Handover sign-off failed");
  }
});

// 4. Delete Kardex Record
router.get("/nursing_kardex/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM nursing_kardex WHERE kardex_id = ?", [req.params.id]);
    res.redirect("/admin/nursing_kardex");
  } catch (err) {
    console.error("Error deleting kardex record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// PHARMACY e-MAR & BEDSIDE MEDICATION ADMINISTRATION
// ------------------------------------------------------

// 1. e-MAR Dashboard View
router.get("/emar_records", async (req, res) => {
  try {
    const records = await exe("SELECT * FROM emar_administrations ORDER BY scheduled_date DESC, scheduled_time ASC, admin_id DESC");
    const occupiedBeds = await exe("SELECT bed_number, patient_name FROM beds WHERE status = 'Occupied'");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_doses_scheduled,
        COUNT(CASE WHEN status = 'Administered (Given)' THEN 1 END) AS administered_count,
        COUNT(CASE WHEN status = 'Scheduled / Due' THEN 1 END) AS pending_due_count,
        COUNT(CASE WHEN status IN ('Patient Refused', 'Withheld / Doctor Hold', 'Missed Dose') THEN 1 END) AS exception_alerts
      FROM emar_administrations
    `);

    res.render("admin/emar_records.ejs", {
      records: records || [],
      beds: occupiedBeds || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_doses_scheduled: 0, administered_count: 0, pending_due_count: 0, exception_alerts: 0 }
    });
  } catch (err) {
    console.error("e-MAR dashboard error:", err);
    res.status(500).send(`Error loading e-MAR records: ${err.message}`);
  }
});

// 2. Schedule New Inpatient Medication Dose
router.post("/emar_records/save", async (req, res) => {
  try {
    const d = req.body;
    const schedule_code = `EMAR-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO emar_administrations (
        schedule_code, patient_name, bed_room_no, medication_name, 
        dosage_ordered, route_of_admin, scheduled_time, 
        administering_nurse, witness_nurse, status, clinical_notes, scheduled_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled / Due', ?, ?)
    `;
    await exe(sql, [
      schedule_code,
      d.patient_name,
      d.bed_room_no,
      d.medication_name,
      d.dosage_ordered,
      d.route_of_admin || 'Oral (PO)',
      d.scheduled_time || '18:00:00',
      d.administering_nurse || 'Staff Nurse On Duty',
      d.witness_nurse || null,
      d.clinical_notes || null,
      d.scheduled_date || new Date().toISOString().slice(0, 10)
    ]);

    res.redirect("/admin/emar_records");
  } catch (err) {
    console.error("Error creating e-MAR schedule:", err);
    res.status(500).send("e-MAR scheduling failed");
  }
});

// 3. Confirm Administration (Bedside Barcode Sign-Off)
router.post("/emar_records/administer", async (req, res) => {
  try {
    const { admin_id, status, administering_nurse, witness_nurse, clinical_notes } = req.body;
    const adminTime = (status === 'Administered (Given)') ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;

    await exe(`
      UPDATE emar_administrations 
      SET status = ?, 
          administering_nurse = ?, 
          witness_nurse = ?, 
          clinical_notes = ?, 
          administered_datetime = COALESCE(?, administered_datetime) 
      WHERE admin_id = ?
    `, [status, administering_nurse, witness_nurse, clinical_notes, adminTime, admin_id]);

    res.redirect("/admin/emar_records");
  } catch (err) {
    console.error("Error signing off e-MAR administration:", err);
    res.status(500).send("e-MAR administration update failed");
  }
});

// 4. Delete e-MAR Order
router.get("/emar_records/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM emar_administrations WHERE admin_id = ?", [req.params.id]);
    res.redirect("/admin/emar_records");
  } catch (err) {
    console.error("Error deleting e-MAR order:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// DISCHARGE SUMMARY & HOME CARE PLANNER
// ------------------------------------------------------

// 1. Discharge Summaries Dashboard
router.get("/discharge_summaries", async (req, res) => {
  try {
    const summaries = await exe("SELECT * FROM discharge_summaries ORDER BY summary_id DESC");
    const occupiedBeds = await exe("SELECT bed_number, patient_name FROM beds WHERE status = 'Occupied'");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_discharges,
        COUNT(CASE WHEN status = 'Handed to Patient / Bed Cleared' THEN 1 END) AS cleared_discharges,
        COUNT(CASE WHEN status = 'Approved by Consultant' THEN 1 END) AS approved_pending_handoff,
        COUNT(CASE WHEN discharge_type = 'Against Medical Advice (AMA / LAMA)' THEN 1 END) AS lama_cases
      FROM discharge_summaries
    `);

    res.render("admin/discharge_summaries.ejs", {
      summaries: summaries || [],
      beds: occupiedBeds || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_discharges: 0, cleared_discharges: 0, approved_pending_handoff: 0, lama_cases: 0 }
    });
  } catch (err) {
    console.error("Discharge summary dashboard error:", err);
    res.status(500).send(`Error loading discharge summaries: ${err.message}`);
  }
});

// 2. Create / Draft Discharge Summary
router.post("/discharge_summaries/save", async (req, res) => {
  try {
    const d = req.body;
    const discharge_code = `DSC-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO discharge_summaries (
        discharge_code, patient_name, bed_room_no, admission_date, 
        discharge_date, attending_doctor, primary_diagnosis, 
        secondary_diagnosis, hospital_course_summary, surgical_procedures_done, 
        discharge_medications, diet_and_activity_advice, urgent_warning_signs, 
        follow_up_datetime, discharge_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft / In Review')
    `;
    await exe(sql, [
      discharge_code,
      d.patient_name,
      d.bed_room_no,
      d.admission_date,
      d.discharge_date || new Date().toISOString().slice(0, 10),
      d.attending_doctor || 'Dr. Rizwan',
      d.primary_diagnosis,
      d.secondary_diagnosis || 'None',
      d.hospital_course_summary,
      d.surgical_procedures_done || 'None',
      d.discharge_medications,
      d.diet_and_activity_advice,
      d.urgent_warning_signs,
      d.follow_up_datetime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
      d.discharge_type || 'Regular / Stable'
    ]);

    res.redirect("/admin/discharge_summaries");
  } catch (err) {
    console.error("Error creating discharge summary:", err);
    res.status(500).send("Discharge summary drafting failed");
  }
});

// 3. Approve Summary & Clear Bed
router.post("/discharge_summaries/update-status", async (req, res) => {
  try {
    const { summary_id, status, bed_room_no } = req.body;
    await exe("UPDATE discharge_summaries SET status = ? WHERE summary_id = ?", [status, summary_id]);

    // If marked handed to patient and bed cleared, free up the bed in beds table
    if (status === 'Handed to Patient / Bed Cleared' && bed_room_no) {
      await exe("UPDATE beds SET status = 'Available', patient_name = NULL WHERE bed_number = ?", [bed_room_no]);
    }

    res.redirect("/admin/discharge_summaries");
  } catch (err) {
    console.error("Error updating discharge status:", err);
    res.status(500).send("Discharge status update failed");
  }
});

// 4. Delete Discharge Summary
router.get("/discharge_summaries/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM discharge_summaries WHERE summary_id = ?", [req.params.id]);
    res.redirect("/admin/discharge_summaries");
  } catch (err) {
    console.error("Error deleting discharge summary:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// INFORMED CONSENT & PROCEDURE AUTHORIZATIONS
// ------------------------------------------------------

// 1. Consent Dashboard
router.get("/procedure_consents", async (req, res) => {
  try {
    const consents = await exe("SELECT * FROM procedure_consents ORDER BY consent_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_consents,
        COUNT(CASE WHEN signature_status = 'Signed & Legally Validated' THEN 1 END) AS validated_consents,
        COUNT(CASE WHEN signature_status = 'Draft Awaiting Signatures' THEN 1 END) AS pending_signatures,
        COUNT(CASE WHEN procedure_category = 'Major Surgical Operation' THEN 1 END) AS surgical_consents
      FROM procedure_consents
    `);

    res.render("admin/procedure_consents.ejs", {
      consents: consents || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_consents: 0, validated_consents: 0, pending_signatures: 0, surgical_consents: 0 }
    });
  } catch (err) {
    console.error("Consent dashboard error:", err);
    res.status(500).send(`Error loading consent records: ${err.message}`);
  }
});

// 2. Register New Informed Consent
router.post("/procedure_consents/save", async (req, res) => {
  try {
    const d = req.body;
    const consent_code = `CNS-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO procedure_consents (
        consent_code, patient_name, patient_age, signee_type, 
        signee_name, signee_contact, procedure_category, procedure_name, 
        explaining_surgeon, anesthesiologist_name, language_explained, 
        witness_staff_name, signature_status, consent_datetime, risks_and_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await exe(sql, [
      consent_code,
      d.patient_name,
      parseInt(d.patient_age) || 30,
      d.signee_type || 'Self (Patient)',
      d.signee_name,
      d.signee_contact,
      d.procedure_category,
      d.procedure_name,
      d.explaining_surgeon || 'Dr. Rizwan',
      d.anesthesiologist_name || 'Dr. K. Saxena',
      d.language_explained || 'English',
      d.witness_staff_name || 'Nurse On Duty',
      d.signature_status || 'Signed & Legally Validated',
      d.consent_datetime || new Date().toISOString().slice(0, 19).replace('T', ' '),
      d.risks_and_notes
    ]);

    res.redirect("/admin/procedure_consents");
  } catch (err) {
    console.error("Error creating consent:", err);
    res.status(500).send("Consent logging failed");
  }
});

// 3. Update Consent Verification Status
router.post("/procedure_consents/update-status", async (req, res) => {
  try {
    const { consent_id, signature_status, witness_staff_name } = req.body;
    await exe(`
      UPDATE procedure_consents 
      SET signature_status = ?, witness_staff_name = ? 
      WHERE consent_id = ?
    `, [signature_status, witness_staff_name, consent_id]);

    res.redirect("/admin/procedure_consents");
  } catch (err) {
    console.error("Error updating consent status:", err);
    res.status(500).send("Consent update failed");
  }
});

// 4. Delete Consent Record
router.get("/procedure_consents/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM procedure_consents WHERE consent_id = ?", [req.params.id]);
    res.redirect("/admin/procedure_consents");
  } catch (err) {
    console.error("Error deleting consent:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// RADIOLOGY, PACS & DIAGNOSTIC IMAGING WORKLIST
// ------------------------------------------------------

// 1. Radiology Dashboard Worklist
router.get("/radiology", async (req, res) => {
  try {
    const studies = await exe("SELECT * FROM radiology_studies ORDER BY study_id DESC");
    const doctors = await exe("SELECT first_name, last_name FROM a_doctor");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_studies,
        COUNT(CASE WHEN study_status = 'Scan Completed (Image Acquired)' THEN 1 END) AS awaiting_reporting,
        COUNT(CASE WHEN study_status = 'Critical Findings Alerted' THEN 1 END) AS critical_alerts,
        COUNT(CASE WHEN priority = 'STAT / Emergency Trauma' THEN 1 END) AS stat_trauma_scans
      FROM radiology_studies
    `);

    res.render("admin/radiology.ejs", {
      studies: studies || [],
      doctors: doctors || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_studies: 0, awaiting_reporting: 0, critical_alerts: 0, stat_trauma_scans: 0 }
    });
  } catch (err) {
    console.error("Radiology dashboard error:", err);
    res.status(500).send(`Error loading radiology studies: ${err.message}`);
  }
});

// 2. Schedule New Imaging Study
router.post("/radiology/save", async (req, res) => {
  try {
    const d = req.body;
    const accession_number = `RAD-${Date.now().toString().slice(-4)}`;
    const sql = `
      INSERT INTO radiology_studies (
        accession_number, patient_name, patient_gender, patient_age, 
        modality, anatomical_region, referring_doctor, 
        reporting_radiologist, priority, study_status, scheduled_datetime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Study Scheduled', ?)
    `;
    await exe(sql, [
      accession_number,
      d.patient_name,
      d.patient_gender || 'Male',
      parseInt(d.patient_age) || 30,
      d.modality,
      d.anatomical_region,
      d.referring_doctor || 'Dr. Rizwan',
      d.reporting_radiologist || 'Dr. S. Kulkarni (MD Radio)',
      d.priority || 'Routine',
      d.scheduled_datetime || new Date().toISOString().slice(0, 19).replace('T', ' ')
    ]);

    res.redirect("/admin/radiology");
  } catch (err) {
    console.error("Error creating radiology study:", err);
    res.status(500).send("Radiology study scheduling failed");
  }
});

// 3. Submit Radiologist Report & Findings
router.post("/radiology/update-report", async (req, res) => {
  try {
    const { study_id, study_status, radiology_findings, radiologist_impression, reporting_radiologist } = req.body;
    await exe(`
      UPDATE radiology_studies 
      SET study_status = ?, 
          radiology_findings = ?, 
          radiologist_impression = ?, 
          reporting_radiologist = ? 
      WHERE study_id = ?
    `, [study_status, radiology_findings, radiologist_impression, reporting_radiologist, study_id]);

    res.redirect("/admin/radiology");
  } catch (err) {
    console.error("Error updating radiology report:", err);
    res.status(500).send("Radiology reporting update failed");
  }
});

// 4. Delete Radiology Study
router.get("/radiology/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM radiology_studies WHERE study_id = ?", [req.params.id]);
    res.redirect("/admin/radiology");
  } catch (err) {
    console.error("Error deleting radiology record:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// BLOOD BANK & TRANSFUSION SAFETY INVENTORY
// ------------------------------------------------------

// 1. Blood Bank Dashboard View
router.get("/blood_bank", async (req, res) => {
  try {
    const bloodUnits = await exe("SELECT * FROM blood_bank_inventory ORDER BY expiry_date ASC, bag_id DESC");
    const occupiedBeds = await exe("SELECT bed_number, patient_name FROM beds WHERE status = 'Occupied'");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_units,
        COUNT(CASE WHEN status = 'Available in Stock' THEN 1 END) AS available_stock,
        COUNT(CASE WHEN status = 'Reserved / Crossmatched' THEN 1 END) AS crossmatched_units,
        COUNT(CASE WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 5 DAY) AND status = 'Available in Stock' THEN 1 END) AS expiring_soon_alerts
      FROM blood_bank_inventory
    `);

    // Group-wise counts for quick visual grid
    const groupStats = await exe(`
      SELECT blood_group, COUNT(*) as units 
      FROM blood_bank_inventory 
      WHERE status = 'Available in Stock' 
      GROUP BY blood_group
    `);

    res.render("admin/blood_bank.ejs", {
      units: bloodUnits || [],
      beds: occupiedBeds || [],
      groupStats: groupStats || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_units: 0, available_stock: 0, crossmatched_units: 0, expiring_soon_alerts: 0 }
    });
  } catch (err) {
    console.error("Blood bank dashboard error:", err);
    res.status(500).send(`Error loading blood bank inventory: ${err.message}`);
  }
});

// 2. Register New Donor Blood Unit
router.post("/blood_bank/save", async (req, res) => {
  try {
    const d = req.body;
    const bag_barcode = `BB-${d.blood_group.replace('+', 'POS').replace('-', 'NEG')}-${Date.now().toString().slice(-4)}`;
    
    const sql = `
      INSERT INTO blood_bank_inventory (
        bag_barcode, donor_name, donor_contact, blood_group, 
        component_type, volume_ml, storage_refrigerator, 
        serology_screening, collection_date, expiry_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available in Stock')
    `;
    await exe(sql, [
      bag_barcode,
      d.donor_name,
      d.donor_contact,
      d.blood_group,
      d.component_type || 'Packed Red Blood Cells (PRBC)',
      parseInt(d.volume_ml) || 350,
      d.storage_refrigerator || 'Blood Bank Walk-in Chiller A (2-6°C)',
      d.serology_screening || 'Negative (Safe for Transfusion)',
      d.collection_date || new Date().toISOString().slice(0, 10),
      d.expiry_date
    ]);

    res.redirect("/admin/blood_bank");
  } catch (err) {
    console.error("Error registering blood unit:", err);
    res.status(500).send("Blood bag registration failed");
  }
});

// 3. Cross-match or Issue Blood Unit
router.post("/blood_bank/crossmatch", async (req, res) => {
  try {
    const { bag_id, status, crossmatched_patient, crossmatched_bed } = req.body;
    await exe(`
      UPDATE blood_bank_inventory 
      SET status = ?, crossmatched_patient = ?, crossmatched_bed = ? 
      WHERE bag_id = ?
    `, [status, crossmatched_patient || null, crossmatched_bed || null, bag_id]);

    res.redirect("/admin/blood_bank");
  } catch (err) {
    console.error("Error crossmatching blood unit:", err);
    res.status(500).send("Crossmatching update failed");
  }
});

// 4. Delete Blood Record
router.get("/blood_bank/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM blood_bank_inventory WHERE bag_id = ?", [req.params.id]);
    res.redirect("/admin/blood_bank");
  } catch (err) {
    console.error("Error deleting blood bag:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// PROCUREMENT, PURCHASE ORDERS (PO) & GRN SUPPLY CHAIN
// ------------------------------------------------------

// 1. Procurement Dashboard View
router.get("/procurement", async (req, res) => {
  try {
    const orders = await exe("SELECT * FROM procurement_orders ORDER BY po_id DESC");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_pos,
        COALESCE(SUM(total_order_amount), 0) AS total_procurement_val,
        COUNT(CASE WHEN delivery_status IN ('PO Dispatched to Vendor', 'Shipped / In Transit') THEN 1 END) AS active_in_transit,
        COUNT(CASE WHEN delivery_status = 'GRN Verified & Received' THEN 1 END) AS received_grn_count
      FROM procurement_orders
    `);

    res.render("admin/procurement.ejs", {
      orders: orders || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_pos: 0, total_procurement_val: 0, active_in_transit: 0, received_grn_count: 0 }
    });
  } catch (err) {
    console.error("Procurement dashboard error:", err);
    res.status(500).send(`Error loading procurement records: ${err.message}`);
  }
});

// 2. Raise New Purchase Order
router.post("/procurement/save", async (req, res) => {
  try {
    const d = req.body;
    const po_number = `PO-${Date.now().toString().slice(-4)}`;
    
    const sql = `
      INSERT INTO procurement_orders (
        po_number, vendor_name, vendor_contact, procurement_category, 
        items_summary, total_order_amount, payment_terms, expected_delivery_date, 
        delivery_status, receiving_warehouse, grn_number, po_issued_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PO Dispatched to Vendor', ?, 'Pending GRN', ?)
    `;
    await exe(sql, [
      po_number,
      d.vendor_name,
      d.vendor_contact,
      d.procurement_category,
      d.items_summary,
      parseFloat(d.total_order_amount) || 0,
      d.payment_terms || 'Net 30 Days',
      d.expected_delivery_date || new Date().toISOString().slice(0, 10),
      d.receiving_warehouse || 'Central Hospital Warehouse Basement',
      d.po_issued_by || 'Purchase Officer'
    ]);

    res.redirect("/admin/procurement");
  } catch (err) {
    console.error("Error creating purchase order:", err);
    res.status(500).send("Procurement order creation failed");
  }
});

// 3. Receive Goods & Generate GRN (Goods Received Note)
router.post("/procurement/update-grn", async (req, res) => {
  try {
    const { po_id, delivery_status, grn_number } = req.body;
    await exe(`
      UPDATE procurement_orders 
      SET delivery_status = ?, grn_number = ? 
      WHERE po_id = ?
    `, [delivery_status, grn_number, po_id]);

    res.redirect("/admin/procurement");
  } catch (err) {
    console.error("Error updating GRN status:", err);
    res.status(500).send("GRN update failed");
  }
});

// 4. Delete Purchase Order
router.get("/procurement/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM procurement_orders WHERE po_id = ?", [req.params.id]);
    res.redirect("/admin/procurement");
  } catch (err) {
    console.error("Error deleting purchase order:", err);
    res.status(500).send("Delete failed");
  }
});
// ------------------------------------------------------
// DOCTOR COMMISSION & HONORARIUM PAYOUTS
// ------------------------------------------------------

// 1. Doctor Commission Dashboard View
// ------------------------------------------------------
// DOCTOR COMMISSION & HONORARIUM PAYOUTS
// ------------------------------------------------------

// 1. Doctor Commission Dashboard View
router.get("/doctor_payouts", async (req, res) => {
  try {
    const payouts = await exe("SELECT * FROM doctor_payouts ORDER BY payout_id DESC");
    const doctors = await exe("SELECT first_name, last_name, department FROM a_doctor");
    const departments = await exe("SELECT department_name FROM departments");

    const statsResult = await exe(`
      SELECT 
        COUNT(*) AS total_statements,
        COALESCE(SUM(final_payable_amount), 0) AS total_disbursed_volume,
        COUNT(CASE WHEN payout_status = 'Pending Audit' THEN 1 END) AS pending_audits,
        COUNT(CASE WHEN payout_status = 'Approved by Accounts' THEN 1 END) AS approved_for_payment
      FROM doctor_payouts
    `);

    res.render("admin/doctor_payouts.ejs", {
      payouts: payouts || [],
      doctors: doctors || [],
      departments: departments || [],
      stats: (statsResult && statsResult[0]) ? statsResult[0] : { total_statements: 0, total_disbursed_volume: 0, pending_audits: 0, approved_for_payment: 0 }
    });
  } catch (err) {
    console.error("Doctor payouts dashboard error:", err);
    res.status(500).send(`Error loading doctor payouts: ${err.message}`);
  }
});

// 2. Generate Doctor Honorarium Statement
router.post("/doctor_payouts/save", async (req, res) => {
  try {
    const d = req.body;
    const payout_reference = `DOC-PAY-${Date.now().toString().slice(-4)}`;
    
    const opdRev = parseFloat(d.gross_opd_revenue) || 0;
    const ipdRev = parseFloat(d.gross_ipd_revenue) || 0;
    const totalGross = opdRev + ipdRev;
    const sharePct = parseInt(d.doctor_share_percentage) || 70;
    
    const netCommission = totalGross * (sharePct / 100);
    const tds = netCommission * 0.10; // Standard 10% TDS withholding
    const finalPayable = netCommission - tds;

    const currentMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // 15 columns matched to exactly 15 placeholders (?)
    const sql = `
      INSERT INTO doctor_payouts (
        payout_reference, 
        doctor_name, 
        department, 
        billing_month, 
        total_opd_consultations, 
        gross_opd_revenue, 
        total_ipd_surgeries, 
        gross_ipd_revenue, 
        doctor_share_percentage, 
        doctor_net_commission, 
        tds_deduction_amount, 
        final_payable_amount, 
        payout_status, 
        disbursement_mode, 
        transaction_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await exe(sql, [
      payout_reference,
      d.doctor_name,
      d.department,
      d.billing_month || currentMonth,
      parseInt(d.total_opd_consultations) || 0,
      opdRev,
      parseInt(d.total_ipd_surgeries) || 0,
      ipdRev,
      sharePct,
      netCommission,
      tds,
      finalPayable,
      'Pending Audit',
      d.disbursement_mode || 'Direct Bank Transfer (NEFT/RTGS)',
      d.transaction_ref || 'Pending Transfer'
    ]);

    res.redirect("/admin/doctor_payouts");
  } catch (err) {
    console.error("Error creating doctor payout statement:", err);
    res.status(500).send("Payout statement generation failed");
  }
});

// 3. Update Payout Clearance & Disbursement Status
router.post("/doctor_payouts/update-status", async (req, res) => {
  try {
    const { payout_id, payout_status, disbursement_mode, transaction_ref } = req.body;
    await exe(`
      UPDATE doctor_payouts 
      SET payout_status = ?, 
          disbursement_mode = ?, 
          transaction_ref = ? 
      WHERE payout_id = ?
    `, [payout_status, disbursement_mode, transaction_ref, payout_id]);

    res.redirect("/admin/doctor_payouts");
  } catch (err) {
    console.error("Error updating payout status:", err);
    res.status(500).send("Payout status update failed");
  }
});

// 4. Delete Payout Statement
router.get("/doctor_payouts/delete/:id", async (req, res) => {
  try {
    await exe("DELETE FROM doctor_payouts WHERE payout_id = ?", [req.params.id]);
    res.redirect("/admin/doctor_payouts");
  } catch (err) {
    console.error("Error deleting payout record:", err);
    res.status(500).send("Delete failed");
  }
});
exports.getAllInvoices = async (req, res) => {
    try {
        const query = `
            SELECT 
                i.id,
                i.invoice_number,
                i.net_amount,
                i.payment_status,
                i.payment_method,
                i.created_at,
                p.patient_name,
                d.name AS doctor_name
            FROM invoices i
            LEFT JOIN patient_records p ON i.patient_id = p.id
            LEFT JOIN a_doctor d ON i.doctor_id = d.id
            ORDER BY i.created_at DESC;
        `;
        const [rows] = await db.query(query);
        return res.status(200).json({ success: true, data: rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 2. Fetch complete invoice details with breakdown for printing/receipt
exports.getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;

        const [invoiceRows] = await db.query(`
            SELECT 
                i.*,
                p.patient_name,
                p.phone_number,
                p.age,
                p.gender,
                d.name AS doctor_name
            FROM invoices i
            LEFT JOIN patient_records p ON i.patient_id = p.id
            LEFT JOIN a_doctor d ON i.doctor_id = d.id
            WHERE i.id = ?
        `, [id]);

        if (invoiceRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Invoice not found.' });
        }

        const [items] = await db.query(`
            SELECT * FROM invoice_items WHERE invoice_id = ?
        `, [id]);

        return res.status(200).json({
            success: true,
            data: {
                ...invoiceRows[0],
                items
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Create a new invoice and insert all line items atomically
exports.createInvoice = async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const {
            patient_id,
            doctor_id,
            discount_amount = 0,
            tax_amount = 0,
            payment_status = 'Pending',
            payment_method = 'Cash',
            notes = '',
            items = [] // [{ item_type, description, quantity, unit_price }]
        } = req.body;

        if (!patient_id || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Patient and at least one line item are required.' });
        }

        // Calculate subtotal and net total
        const total_amount = items.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);
        const net_amount = Number(total_amount) - Number(discount_amount) + Number(tax_amount);

        // Generate unique invoice number
        const invoice_number = `INV-${Date.now().toString().slice(-6)}`;

        // Insert into invoices
        const [invoiceResult] = await connection.query(`
            INSERT INTO invoices 
            (invoice_number, patient_id, doctor_id, total_amount, discount_amount, tax_amount, net_amount, payment_status, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            invoice_number,
            patient_id,
            doctor_id || null,
            total_amount,
            discount_amount,
            tax_amount,
            net_amount,
            payment_status,
            payment_method,
            notes
        ]);

        const invoiceId = invoiceResult.insertId;

        // Prepare line item bulk insert
        const itemRows = items.map(item => [
            invoiceId,
            item.item_type,
            item.description,
            Number(item.quantity),
            Number(item.unit_price),
            Number(item.quantity) * Number(item.unit_price)
        ]);

        await connection.query(`
            INSERT INTO invoice_items 
            (invoice_id, item_type, description, quantity, unit_price, total_price)
            VALUES ?
        `, [itemRows]);

        await connection.commit();
        return res.status(201).json({
            success: true,
            message: 'Invoice generated successfully.',
            invoice_id: invoiceId,
            invoice_number
        });
    } catch (error) {
        await connection.rollback();
        return res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
};

// 4. Update payment status (e.g., mark Paid)
exports.updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status, payment_method } = req.body;

        await db.query(`
            UPDATE invoices 
            SET payment_status = ?, payment_method = ? 
            WHERE id = ?
        `, [payment_status, payment_method, id]);

        return res.status(200).json({ success: true, message: 'Payment status updated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
///

// 1. GET: Render Billing Form & Invoices List
router.get("/billing", async function (req, res) {
    try {
        var patients = await exe("SELECT id, patient_name FROM patient_records ORDER BY patient_name ASC");
        var doctors = await exe("SELECT id, name FROM a_doctor ORDER BY name ASC");
        var invoices = await exe(`
            SELECT 
                i.id,
                i.invoice_number,
                i.net_amount,
                i.payment_status,
                i.payment_method,
                DATE_FORMAT(i.created_at, '%d-%b-%Y %h:%i %p') AS formatted_date,
                p.patient_name,
                d.name AS doctor_name
            FROM invoices i
            LEFT JOIN patient_records p ON i.patient_id = p.id
            LEFT JOIN a_doctor d ON i.doctor_id = d.id
            ORDER BY i.id DESC
        `);

        res.render("billing.ejs", {
            title: "Billing & Invoices",
            patients: patients,
            doctors: doctors,
            invoices: invoices,
            success: req.query.success || null
        });
    } catch (error) {
        console.error("Error loading billing page:", error);
        res.status(500).send("Database Error: " + error.message);
    }
});

// 2. POST: Create Invoice and Itemized Rows
router.post("/billing/create", async function (req, res) {
    try {
        var {
            patient_id,
            doctor_id,
            discount_amount = 0,
            tax_amount = 0,
            payment_status = "Pending",
            payment_method = "Cash",
            notes = "",
            item_type,
            item_desc,
            item_qty,
            item_price
        } = req.body;

        var types = Array.isArray(item_type) ? item_type : [item_type];
        var descriptions = Array.isArray(item_desc) ? item_desc : [item_desc];
        var quantities = Array.isArray(item_qty) ? item_qty : [item_qty];
        var prices = Array.isArray(item_price) ? item_price : [item_price];

        var total_amount = 0;
        var lineItems = [];

        for (var i = 0; i < types.length; i++) {
            var qty = parseFloat(quantities[i]) || 1;
            var price = parseFloat(prices[i]) || 0;
            var lineTotal = qty * price;
            total_amount += lineTotal;

            lineItems.push({
                type: types[i] || "Other",
                description: descriptions[i] || "Medical Service",
                quantity: qty,
                unit_price: price,
                total_price: lineTotal
            });
        }

        var discount = parseFloat(discount_amount) || 0;
        var tax = parseFloat(tax_amount) || 0;
        var net_amount = total_amount - discount + tax;
        var invoice_number = "INV-" + Math.floor(100000 + Math.random() * 900000);

        // 1. Insert into invoices table
        var invoiceSql = `
            INSERT INTO invoices 
            (invoice_number, patient_id, doctor_id, total_amount, discount_amount, tax_amount, net_amount, payment_status, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        var invoiceResult = await exe(invoiceSql, [
            invoice_number,
            patient_id,
            doctor_id || null,
            total_amount,
            discount,
            tax,
            net_amount,
            payment_status,
            payment_method,
            notes
        ]);

        var invoiceId = invoiceResult.insertId;

        // 2. Insert itemized lines into invoice_items
        var itemSql = `
            INSERT INTO invoice_items 
            (invoice_id, item_type, description, quantity, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        for (var j = 0; j < lineItems.length; j++) {
            var item = lineItems[j];
            await exe(itemSql, [
                invoiceId,
                item.type,
                item.description,
                item.quantity,
                item.unit_price,
                item.total_price
            ]);
        }

        res.redirect("/admin/billing?success=Invoice+" + invoice_number + "+created+successfully");
    } catch (error) {
        console.error("Invoice creation failed:", error);
        res.status(500).send("Database Insertion Error: " + error.message);
    }
});

// 3. GET: Print/View Invoice by ID
router.get("/billing/invoice/:id", async function (req, res) {
    try {
        var id = req.params.id;

        var invoiceRows = await exe(`
            SELECT 
                i.*,
                p.patient_name,
                p.phone_number,
                d.name AS doctor_name
            FROM invoices i
            LEFT JOIN patient_records p ON i.patient_id = p.id
            LEFT JOIN a_doctor d ON i.doctor_id = d.id
            WHERE i.id = ?
        `, [id]);

        if (invoiceRows.length === 0) {
            return res.status(404).send("Invoice not found");
        }

        var items = await exe("SELECT * FROM invoice_items WHERE invoice_id = ?", [id]);

        res.render("invoice_print.ejs", {
            invoice: invoiceRows[0],
            items: items
        });
    } catch (error) {
        res.status(500).send("Error loading invoice: " + error.message);
    }
});

module.exports = router;

module.exports = router;