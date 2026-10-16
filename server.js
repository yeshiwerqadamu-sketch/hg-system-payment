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

    /* Check required information */

    if (!student_id || !first_name || !phone) {
      return res.status(400).json({
        status: "error",
        message: "Student information is required"
      });
    }

    /* Only allow ETB */

    if (currency !== "ETB") {
      return res.status(400).json({
        status: "error",
        message: "Currency must be ETB"
      });
    }

    /* Payment amount */

    const paymentAmount = Number(amount);

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid payment amount"
      });
    }

    /* Unique merchant reference */

    const merchantReference =
      "HG-" +
      student_id +
      "-" +
      Date.now();

    /* =========================
       CHAPA PAYMENT REQUEST
    ========================= */

    const chapaResponse = await fetch(
      "https://api.chapa.global/v2/payments/hosted",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${process.env.CHAPA_SECRET_KEY}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          amount: paymentAmount,

          currency: "ETB",

          merchant_reference:
            merchantReference,

          customer: {
            first_name:
              first_name,

            last_name:
              "Student",

            phone_number:
              phone
          },

          meta: {
            student_id:
              student_id,

            source:
              "HG-system-school"
          }
        })
      }
    );

    /* Read Chapa response */

    const data =
      await chapaResponse.json();

    console.log(
      "Chapa response:",
      data
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
          data.message ||
          "Chapa payment initialization failed",

        chapa:
          data
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

        chapa:
          data
      });
    }

    /* =========================
       SEND URL TO FRONTEND
    ========================= */

    return res.json({
      status: "success",

      checkout_url:
        checkoutUrl,

      merchant_reference:
        merchantReference
    });

  } catch (error) {
    console.error(
      "Create checkout error:",
      error
    );

    return res.status(500).json({
      status: "error",

      message:
        "Server error while creating payment"
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
