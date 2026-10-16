const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARE
========================= */

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
   TEST STUDENTS
========================= */

const students = [
  {
    id: "zzxx",
    name: "ኪሩቤል አመስግን",
    grade: "1"
  },
  {
    id: "ccvv",
    name: "አለማየሁ ሰላም",
    grade: "2"
  },
  {
    id: "bbnn",
    name: "ሰላም አያሌው",
    grade: "3"
  },
  {
    id: "hhjj",
    name: "ሰራዊት ጌታሁን",
    grade: "4"
  },
  {
    id: "vvyy",
    name: "አህመድ ኑረዲን",
    grade: "5"
  },
  {
    id: "zzee",
    name: "የአብ ሥራ መሰረት",
    grade: "6"
  },
  {
    id: "mmyy",
    name: "ሀብታሙ ጎሃፅባህ",
    grade: "7"
  },
  {
    id: "ggzz",
    name: "አለሙአየለ",
    grade: "8"
  }
];

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "success",
    message: "HG system school payment backend is running"
  });
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

/* =========================
   VERIFY STUDENT
========================= */

app.post("/verify-student", (req, res) => {
  try {
    const {
      student_id,
      first_name
    } = req.body;

    if (!student_id || !first_name) {
      return res.status(400).json({
        status: "error",
        message: "Student ID and name are required"
      });
    }

    const student = students.find(
      (item) =>
        item.id.toLowerCase() ===
          String(student_id).trim().toLowerCase() &&
        item.name.trim() ===
          String(first_name).trim()
    );

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student information is incorrect"
      });
    }

    return res.json({
      status: "success",
      message: "Student verified successfully",
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade
      }
    });

  } catch (error) {
    console.error(
      "Student verification error:",
      error
    );

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

    /* =========================
       REQUIRED INFORMATION
    ========================= */

    if (
      !student_id ||
      !first_name ||
      !phone
    ) {
      return res.status(400).json({
        status: "error",
        message: "Student information is required"
      });
    }

    /* =========================
       VERIFY STUDENT
    ========================= */

    const student = students.find(
      (item) =>
        item.id.toLowerCase() ===
          String(student_id).trim().toLowerCase() &&
        item.name.trim() ===
          String(first_name).trim()
    );

    if (!student) {
      return res.status(404).json({
        status: "error",
        message: "Student ID or name is incorrect"
      });
    }

    /* =========================
       CHECK CURRENCY
    ========================= */

    if (currency !== "ETB") {
      return res.status(400).json({
        status: "error",
        message: "Currency must be ETB"
      });
    }

    /* =========================
       PAYMENT AMOUNT
    ========================= */

    const paymentAmount = Number(amount);

    if (
      !paymentAmount ||
      paymentAmount <= 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid payment amount"
      });
    }

    /* =========================
       PHONE FORMAT
       Chapa V2 requires
       international format
    ========================= */

    let customerPhone =
      String(phone).trim();

    if (
      customerPhone.startsWith("0")
    ) {
      customerPhone =
        "+251" +
        customerPhone.substring(1);
    }

    /* =========================
       MERCHANT REFERENCE

       IMPORTANT:
       Keep this short and unique.
    ========================= */

    const merchantReference =
      "HG" +
      student.id +
      Date.now().toString().slice(-10);

    /* =========================
       CHECK SECRET KEY
    ========================= */

    if (!process.env.CHAPA_SECRET_KEY) {
      console.error(
        "CHAPA_SECRET_KEY is missing"
      );

      return res.status(500).json({
        status: "error",
        message: "Chapa secret key is not configured"
      });
    }

    /* =========================
       CHAPA V2 HOSTED CHECKOUT
    ========================= */

    const chapaResponse = await fetch(
      "https://api.chapa.global/v2/payments/hosted",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${process.env.CHAPA_SECRET_KEY}`,

          "Content-Type":
            "application/json",

          "Accept":
            "application/json"
        },

        body: JSON.stringify({
          amount: paymentAmount,

          currency: "ETB",

          merchant_reference:
            merchantReference,

          customer: {
            first_name:
              student.name,

            last_name:
              "Student",

            phone_number:
              customerPhone
          },

          meta: {
            student_id:
              student.id,

            student_name:
              student.name,

            grade:
              student.grade,

            source:
              "HG-system-school"
          }
        })
      }
    );

    /* =========================
       READ CHAPA RESPONSE
    ========================= */

    const data =
      await chapaResponse.json();

    console.log(
      "Chapa response:",
      JSON.stringify(data)
    );

    /* =========================
       CHAPA ERROR
    ========================= */

    if (!chapaResponse.ok) {
      return res.status(
        chapaResponse.status
      ).json({
        status: "error",

        message:
          data?.message ||
          data?.error?.message ||
          "Chapa payment initialization failed",

        chapa: data
      });
    }

    /* =========================
       GET CHECKOUT URL
    ========================= */

    const checkoutUrl =
      data?.data?.checkout_url;

    if (!checkoutUrl) {
      return res.status(500).json({
        status: "error",

        message:
          "Chapa did not return checkout URL",

        chapa: data
      });
    }

    /* =========================
       SUCCESS
    ========================= */

    return res.json({
      status: "success",

      message:
        "Payment initialized successfully",

      checkout_url:
        checkoutUrl,

      merchant_reference:
        merchantReference,

      student: {
        id:
          student.id,

        name:
          student.name,

        grade:
          student.grade
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

      error:
        error.message
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(
    `HG system server running on port ${PORT}`
  );
});
