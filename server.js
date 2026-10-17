const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* =========================
   CORS
========================= */

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* =========================
   DATABASE
========================= */

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   STUDENTS
========================= */

const students = [
  { id: "zzxx", name: "ኪሩቤል አመስግን", grade: "1" },
  { id: "ccvv", name: "አለማየሁ ሰላም", grade: "2" },
  { id: "bbnn", name: "ሰላም አያሌው", grade: "3" },
  { id: "hhjj", name: "ሰራዊት ጌታሁን", grade: "4" },
  { id: "vvyy", name: "አህመድ ኑረዲን", grade: "5" },
  { id: "zzee", name: "የአብ ሥራ መሰረት", grade: "6" },
  { id: "mmyy", name: "ሀብታሙ ጎሃፅባህ", grade: "7" },
  { id: "ggzz", name: "አለሙአየለ", grade: "8" }
];

/* =========================
   CREATE DATABASE TABLES
========================= */

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(50) PRIMARY KEY,
        name TEXT NOT NULL,
        grade VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        student_name TEXT NOT NULL,
        grade VARCHAR(20) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
        merchant_reference VARCHAR(150) UNIQUE NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        payment_month VARCHAR(20),
        phone VARCHAR(30),
        chapa_reference VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP
      )
    `);

    for (const student of students) {
      await pool.query(
        `
        INSERT INTO students (id, name, grade)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          grade = EXCLUDED.grade
        `,
        [student.id, student.name, student.grade]
      );
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "HG system school payment backend is running",
    version: "3.0"
  });
});

/* =========================
   HEALTH
========================= */

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
      service: "HG system school payment"
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      database: "disconnected",
      message: error.message
    });
  }
});

/* =========================
   VERIFY STUDENT
========================= */

app.post("/verify-student", async (req, res) => {
  try {
    const { student_id, first_name } = req.body;

    if (!student_id || !first_name) {
      return res.status(400).json({
        status: "error",
        message: "Student ID and name are required"
      });
    }

    const result = await pool.query(
      `
      SELECT id, name, grade
      FROM students
      WHERE LOWER(id) = LOWER($1)
      AND name = $2
      `,
      [
        String(student_id).trim(),
        String(first_name).trim()
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student information is incorrect"
      });
    }

    return res.json({
      status: "success",
      message: "Student verified successfully",
      student: result.rows[0]
    });

  } catch (error) {
    console.error("Student verification error:", error);

    return res.status(500).json({
      status: "error",
      message: "Server error"
    });
  }
});

/* =========================
   CREATE CHAPA CHECKOUT
========================= */

app.post("/create-checkout", async (req, res) => {
  try {
    const {
      student_id,
      first_name,
      phone,
      amount,
      currency
    } = req.body;

    if (!student_id || !first_name || !phone) {
      return res.status(400).json({
        status: "error",
        message: "Student information is required"
      });
    }

    const studentResult = await pool.query(
      `
      SELECT id, name, grade
      FROM students
      WHERE LOWER(id) = LOWER($1)
      AND name = $2
      `,
      [
        String(student_id).trim(),
        String(first_name).trim()
      ]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student ID or name is incorrect"
      });
    }

    const student = studentResult.rows[0];

    if (currency !== "ETB") {
      return res.status(400).json({
        status: "error",
        message: "Currency must be ETB"
      });
    }

    const paymentAmount = Number(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid payment amount"
      });
    }

    let customerPhone = String(phone).trim();

    if (customerPhone.startsWith("0")) {
      customerPhone = "+251" + customerPhone.substring(1);
    }

    const merchantReference =
      "HG" +
      student.id +
      Date.now().toString().slice(-10);

    if (!process.env.CHAPA_SECRET_KEY) {
      return res.status(500).json({
        status: "error",
        message: "Chapa secret key is not configured"
      });
    }

    /* =========================
       CREATE CHAPA PAYMENT
    ========================= */

    const chapaResponse = await fetch(
      "https://api.chapa.global/v2/payments/hosted",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${process.env.CHAPA_SECRET_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },

        body: JSON.stringify({
          amount: paymentAmount,
          currency: "ETB",

          merchant_reference:
            merchantReference,

          customer: {
            first_name: student.name,
            last_name: "Student",
            phone_number: customerPhone
          },

          meta: {
            student_id: student.id,
            student_name: student.name,
            grade: student.grade,
            source: "HG-system-school"
          }
        })
      }
    );

    const data = await chapaResponse.json();

    console.log(
      "Chapa response:",
      JSON.stringify(data)
    );

    if (!chapaResponse.ok) {
      return res.status(chapaResponse.status).json({
        status: "error",
        message:
          data?.message ||
          data?.error?.message ||
          "Chapa payment initialization failed",
        chapa: data
      });
    }

    const checkoutUrl =
      data?.data?.checkout_url;

    if (!checkoutUrl) {
      return res.status(500).json({
        status: "error",
        message: "Chapa did not return checkout URL",
        chapa: data
      });
    }

    /* =========================
       SAVE PENDING PAYMENT
    ========================= */

    const paymentMonth =
      new Date().toISOString().slice(0, 7);

    await pool.query(
      `
      INSERT INTO payments (
        student_id,
        student_name,
        grade,
        amount,
        currency,
        merchant_reference,
        status,
        payment_month,
        phone
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        student.id,
        student.name,
        student.grade,
        paymentAmount,
        "ETB",
        merchantReference,
        "pending",
        paymentMonth,
        customerPhone
      ]
    );

    return res.json({
      status: "success",
      message: "Payment initialized successfully",

      checkout_url:
        checkoutUrl,

      merchant_reference:
        merchantReference,

      student: {
        id: student.id,
        name: student.name,
        grade: student.grade
      }
    });

  } catch (error) {
    console.error(
      "Create checkout error:",
      error
    );

    return res.status(500).json({
      status: "error",
      message:
        "Server error while creating payment",
      error: error.message
    });
  }
});

/* =========================
   VERIFY PAYMENT
========================= */

app.get(
  "/verify-payment/:reference",
  async (req, res) => {

    try {

      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          status: "error",
          message: "Payment reference is required"
        });
      }

      if (!process.env.CHAPA_SECRET_KEY) {
        return res.status(500).json({
          status: "error",
          message:
            "Chapa secret key is not configured"
        });
      }

      const chapaResponse = await fetch(
        `https://api.chapa.global/v2/payments/${encodeURIComponent(reference)}/verify`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${process.env.CHAPA_SECRET_KEY}`,

            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          }
        }
      );

      const data =
        await chapaResponse.json();

      console.log(
        "Chapa verification:",
        JSON.stringify(data)
      );

      if (!chapaResponse.ok) {
        return res.status(chapaResponse.status).json({
          status: "error",
          message:
            data?.message ||
            "Payment verification failed",
          chapa: data
        });
      }

      const payment = data?.data;

      /* =========================
         PAYMENT SUCCESS
      ========================= */

      if (payment?.status === "success") {

        const updateResult =
          await pool.query(
            `
            UPDATE payments
            SET
              status = 'paid',
              chapa_reference = $1,
              paid_at = CURRENT_TIMESTAMP
            WHERE merchant_reference = $2
            RETURNING *
            `,
            [
              reference,
              reference
            ]
          );

        return res.json({
          status: "success",
          paid: true,
          message:
            "Payment verified and saved successfully",

          payment: payment,

          database: {
            updated:
              updateResult.rowCount > 0,
            record:
              updateResult.rows[0] || null
          }
        });
      }

      /* =========================
         PAYMENT NOT SUCCESSFUL
      ========================= */

      await pool.query(
        `
        UPDATE payments
        SET status = 'failed'
        WHERE merchant_reference = $1
        AND status != 'paid'
        `,
        [reference]
      );

      return res.json({
        status: "success",
        paid: false,
        message:
          "Payment is not successful",
        payment: payment
      });

    } catch (error) {

      console.error(
        "Payment verification error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Server error while verifying payment"
      });
    }
  }
);

/* =========================
   GET STUDENT PAYMENT STATUS
========================= */

app.get(
  "/student/:studentId/payments",
  async (req, res) => {

    try {

      const { studentId } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            student_id,
            student_name,
            grade,
            amount,
            currency,
            payment_month,
            status,
            merchant_reference,
            chapa_reference,
            created_at,
            paid_at
          FROM payments
          WHERE LOWER(student_id) = LOWER($1)
          ORDER BY created_at DESC
          `,
          [studentId]
        );

      return res.json({
        status: "success",
        student_id: studentId,
        payments: result.rows
      });

    } catch (error) {

      console.error(
        "Student payment status error:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Server error while getting payment status"
      });
    }
  }
);

/* =========================
   GET ALL STUDENTS
========================= */

app.get("/students", async (req, res) => {

  try {

    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        s.grade,
        COALESCE(
          (
            SELECT p.status
            FROM payments p
            WHERE p.student_id = s.id
            ORDER BY p.created_at DESC
            LIMIT 1
          ),
          'not_paid'
        ) AS payment_status
      FROM students s
      ORDER BY CAST(s.grade AS INTEGER), s.name
    `);

    return res.json({
      status: "success",
      students: result.rows
    });

  } catch (error) {

    console.error(
      "Get students error:",
      error
    );

    return res.status(500).json({
      status: "error",
      message:
        "Server error while getting students"
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, async () => {

  console.log(
    `HG system server running on port ${PORT}`
  );

  await initializeDatabase();

});
