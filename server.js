const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================
   DATABASE
========================= */

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
  {
    id: "zzxx",
    name: "ኪሩቤል አመስግን",
    grade: 1
  },
  {
    id: "ccvv",
    name: "አለማየሁ ሰላም",
    grade: 2
  },
  {
    id: "bbnn",
    name: "ሰላም አያሌው",
    grade: 3
  },
  {
    id: "hhjj",
    name: "ሰራዊት ጌታሁን",
    grade: 4
  },
  {
    id: "vvyy",
    name: "አህመድ ኑረዲን",
    grade: 5
  },
  {
    id: "zzee",
    name: "የአብ ሥራ መሰረት",
    grade: 6
  },
  {
    id: "mmyy",
    name: "ሀብታሙ ጎሃፅባህ",
    grade: 7
  },
  {
    id: "ggzz",
    name: "አለሙአየለ",
    grade: 8
  }
];

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(50) PRIMARY KEY,
        name TEXT NOT NULL,
        grade INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL,
        student_name TEXT NOT NULL,
        grade INTEGER NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'ETB',
        merchant_reference VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        payment_month VARCHAR(7) NOT NULL,
        phone VARCHAR(30),
        chapa_reference VARCHAR(100),
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
    console.error("Database initialization error:", error.message);
  }
}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "HG system school payment backend is running",
    version: "4.0"
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

app.get("/verify-student/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId.trim().toLowerCase();

    const result = await pool.query(
      `
      SELECT id, name, grade
      FROM students
      WHERE LOWER(id) = LOWER($1)
      `,
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    res.json({
      status: "success",
      student: result.rows[0]
    });

  } catch (error) {
    console.error("Verify student error:", error.message);

    res.status(500).json({
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
      amount,
      phone
    } = req.body;

    if (!student_id) {
      return res.status(400).json({
        status: "error",
        message: "Student ID is required"
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Valid amount is required"
      });
    }

    if (!phone) {
      return res.status(400).json({
        status: "error",
        message: "Phone number is required"
      });
    }

    const studentResult = await pool.query(
      `
      SELECT id, name, grade
      FROM students
      WHERE LOWER(id) = LOWER($1)
      `,
      [student_id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Student not found"
      });
    }

    const student = studentResult.rows[0];

    /* =========================
       PHONE NORMALIZATION
    ========================= */

    let normalizedPhone = String(phone).trim();

    if (normalizedPhone.startsWith("0")) {
      normalizedPhone = "+251" + normalizedPhone.substring(1);
    }

    if (normalizedPhone.startsWith("251")) {
      normalizedPhone = "+" + normalizedPhone;
    }

    /* =========================
       MERCHANT REFERENCE
    ========================= */

    const merchantReference =
      "HG" +
      student.id +
      Date.now().toString().slice(-10);

    const paymentMonth =
      new Date().toISOString().slice(0, 7);

    /* =========================
       CHAPA REQUEST
    ========================= */

    const chapaResponse = await axios.post(
      "https://api.chapa.global/v2/payments/hosted",
      {
        amount: Number(amount),
        currency: "ETB",

        first_name: student.name,
        last_name: "Student",

        phone_number: normalizedPhone,

        tx_ref: merchantReference,

        callback_url:
          "https://hg-system-payment.onrender.com/payment-success",

        return_url:
          "https://hg-system-payment.onrender.com/payment-success",

        customization: {
          title: "HG System School",
          description: "School monthly payment"
        }
      },
      {
        headers: {
          Authorization:
            `Bearer ${process.env.CHAPA_SECRET_KEY}`,

          "Content-Type":
            "application/json"
        }
      }
    );

    const checkoutUrl =
      chapaResponse.data?.data?.checkout_url;

    if (!checkoutUrl) {
      console.error(
        "Chapa response:",
        chapaResponse.data
      );

      return res.status(500).json({
        status: "error",
        message: "Chapa did not return checkout URL",
        chapa: chapaResponse.data
      });
    }

    /* =========================
       SAVE PENDING PAYMENT
    ========================= */

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
        Number(amount),
        "ETB",
        merchantReference,
        "pending",
        paymentMonth,
        normalizedPhone
      ]
    );

    res.json({
      status: "success",
      message: "Checkout created",
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade
      },
      merchant_reference: merchantReference,
      checkout_url: checkoutUrl
    });

  } catch (error) {
    console.error(
      "Create checkout error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to create Chapa checkout",
      details:
        error.response?.data || error.message
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
      const reference =
        req.params.reference.trim();

      const chapaResponse = await axios.get(
        `https://api.chapa.global/v2/payments/${encodeURIComponent(reference)}/verify`,
        {
          headers: {
            Authorization:
              `Bearer ${process.env.CHAPA_SECRET_KEY}`,

            "Content-Type":
              "application/json"
          }
        }
      );

      const payment =
        chapaResponse.data?.data;

      if (!payment) {
        return res.status(404).json({
          status: "error",
          message: "Payment information not found"
        });
      }

      /* =========================
         IMPORTANT:
         CHAPA RETURNS "SUCCESS"
         IN UPPERCASE
      ========================= */

      const isSuccessful =
        String(payment.status).toUpperCase() ===
        "SUCCESS";

      if (isSuccessful) {

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
              payment.chapa_reference ||
                reference,

              payment.merchant_reference
            ]
          );

        if (updateResult.rows.length === 0) {
          return res.status(404).json({
            status: "error",
            message:
              "Payment verified by Chapa, but local payment record was not found",
            payment
          });
        }

        return res.json({
          status: "success",
          paid: true,
          message: "Payment verified successfully",
          payment,
          database: updateResult.rows[0]
        });
      }

      /* =========================
         PAYMENT NOT SUCCESSFUL
      ========================= */

      await pool.query(
        `
        UPDATE payments
        SET
          status = 'failed',
          chapa_reference = $1
        WHERE merchant_reference = $2
          AND status <> 'paid'
        `,
        [
          payment.chapa_reference ||
            reference,

          payment.merchant_reference
        ]
      );

      return res.json({
        status: "success",
        paid: false,
        message: "Payment is not successful",
        payment
      });

    } catch (error) {
      console.error(
        "Payment verification error:",
        error.response?.data ||
          error.message
      );

      res.status(500).json({
        status: "error",
        message: "Payment verification failed",
        details:
          error.response?.data ||
          error.message
      });
    }
  }
);

/* =========================
   PAYMENT SUCCESS PAGE
========================= */

app.get("/payment-success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
        content="width=device-width, initial-scale=1.0">

      <title>HG System Payment</title>

      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background:
            linear-gradient(
              135deg,
              #062e2e,
              #0b4f4f,
              #061f1f
            );
          font-family: Arial, sans-serif;
          color: white;
        }

        .box {
          width: 90%;
          max-width: 420px;
          padding: 35px;
          text-align: center;
          border-radius: 25px;
          background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.18);
          backdrop-filter: blur(20px);
          box-shadow:
            0 20px 60px rgba(0,0,0,.35);
        }

        .icon {
          font-size: 70px;
          margin-bottom: 15px;
        }

        h1 {
          margin-bottom: 10px;
        }

        p {
          opacity: .85;
          line-height: 1.6;
        }

        .btn {
          display: inline-block;
          margin-top: 20px;
          padding: 13px 25px;
          border-radius: 12px;
          background: #00d084;
          color: white;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>

    <body>

      <div class="box">

        <div class="icon">⏳</div>

        <h1>Payment Received</h1>

        <p>
          Your payment was returned from Chapa.
        </p>

        <p>
          The school system will verify the
          payment before marking it as paid.
        </p>

        <a class="btn"
          href="https://hg-system-payment.onrender.com/students">
          View Students
        </a>

      </div>

    </body>
    </html>
  `);
});

/* =========================
   GET STUDENT PAYMENTS
========================= */

app.get(
  "/student/:studentId/payments",
  async (req, res) => {
    try {
      const studentId =
        req.params.studentId.trim();

      const result = await pool.query(
        `
        SELECT *
        FROM payments
        WHERE LOWER(student_id) = LOWER($1)
        ORDER BY created_at DESC
        `,
        [studentId]
      );

      res.json({
        status: "success",
        student_id: studentId,
        payments: result.rows
      });

    } catch (error) {
      console.error(
        "Student payments error:",
        error.message
      );

      res.status(500).json({
        status: "error",
        message: "Server error"
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
              AND p.payment_month =
                  TO_CHAR(
                    CURRENT_DATE,
                    'YYYY-MM'
                  )
            ORDER BY p.created_at DESC
            LIMIT 1
          ),
          'not_paid'
        ) AS payment_status

      FROM students s
      ORDER BY s.grade ASC
    `);

    res.json({
      status: "success",
      students: result.rows
    });

  } catch (error) {
    console.error(
      "Students error:",
      error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to load students"
    });
  }
});

/* =========================
   GET MONTHLY PAYMENTS
========================= */

app.get("/payments/month/:month", async (req, res) => {
  try {

    const month = req.params.month;

    const result = await pool.query(
      `
      SELECT
        student_id,
        student_name,
        grade,
        amount,
        currency,
        merchant_reference,
        status,
        payment_month,
        phone,
        chapa_reference,
        created_at,
        paid_at
      FROM payments
      WHERE payment_month = $1
      ORDER BY grade ASC, student_name ASC
      `,
      [month]
    );

    res.json({
      status: "success",
      month,
      payments: result.rows
    });

  } catch (error) {

    console.error(
      "Monthly payments error:",
      error.message
    );

    res.status(500).json({
      status: "error",
      message: "Unable to load monthly payments"
    });
  }
});

/* =========================
   SERVER START
========================= */

app.listen(PORT, async () => {

  console.log(
    `HG system server running on port ${PORT}`
  );

  await initializeDatabase();

});
