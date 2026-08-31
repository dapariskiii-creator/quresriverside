require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// =========================
// MYSQL AIVEN
// =========================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  ssl: {
    rejectUnauthorized: false
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// =========================
// MIDDLEWARE
// =========================
app.use(express.json({ limit: "1mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "CHANGE_THIS_SECRET",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

// =========================
// DEMO MENU
// =========================
const DEMO_MENU = [
  [
    "Kopi Susu Riverside",
    "minuman",
    18000,
    50,
    "Espresso, susu segar, gula aren.",
    "/images/kopi-susu.jpg"
  ],
  [
    "Americano",
    "minuman",
    15000,
    50,
    "Espresso dengan air mineral, ringan dan clean.",
    "/images/americano.jpg"
  ],
  [
    "Cappuccino",
    "minuman",
    20000,
    40,
    "Espresso, steamed milk dan foam lembut.",
    "/images/cappuccino.jpg"
  ],
  [
    "Kentang Goreng",
    "snack",
    15000,
    40,
    "French fries renyah dengan saus.",
    "/images/kentang.jpg"
  ],
  [
    "Pisang Goreng",
    "snack",
    14000,
    35,
    "Pisang goreng hangat dan renyah.",
    "/images/pisang.jpg"
  ],
  [
    "Roti Bakar Cokelat",
    "snack",
    16000,
    30,
    "Roti bakar hangat dengan cokelat.",
    "/images/roti.jpg"
  ],
  [
    "Nasi Goreng Riverside",
    "makanan",
    22000,
    40,
    "Nasi goreng spesial dengan telur.",
    "/images/nasgor.jpg"
  ],
  [
    "Mie Goreng",
    "makanan",
    20000,
    40,
    "Mie goreng gurih dengan sayuran.",
    "/images/mie.jpg"
  ],
  [
    "Rice Bowl Ayam",
    "makanan",
    24000,
    35,
    "Ayam crispy, nasi dan sambal.",
    "/images/rice-bowl.jpg"
  ]
];

// =========================
// DATABASE SETUP
// =========================
async function setup() {
  try {
    await pool.query("SELECT 1");

    console.log("MySQL Aiven berhasil terhubung.");

    const [adminRows] = await pool.query(
      "SELECT id FROM admins LIMIT 1"
    );

    if (!adminRows.length) {
      const username = process.env.ADMIN_USERNAME || "admin";
      const password = process.env.ADMIN_PASSWORD || "admin123";

      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        "INSERT INTO admins(username,password_hash) VALUES(?,?)",
        [username, hash]
      );

      console.log(`Admin dibuat: ${username}`);
    }

    const [menuRows] = await pool.query(
      "SELECT id FROM menu LIMIT 1"
    );

    if (!menuRows.length) {
      for (const m of DEMO_MENU) {
        await pool.query(
          `INSERT INTO menu
          (name,category,price,stock,description,image_url)
          VALUES(?,?,?,?,?,?)`,
          m
        );
      }

      console.log("9 menu demo berhasil dimasukkan.");
    }

    return true;
  } catch (error) {
    console.error("GAGAL CONNECT MYSQL:", error.message);
    return false;
  }
}

// =========================
// AUTH
// =========================
function auth(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({
      error: "Login kasir diperlukan."
    });
  }

  next();
}

// =========================
// MENU
// =========================
app.get("/api/menu", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id,name,category,price,stock,description,image_url
       FROM menu
       WHERE active=1
       ORDER BY FIELD(category,'minuman','snack','makanan'),id`
    );

    res.json(rows);
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal mengambil menu."
    });
  }
});

// =========================
// ORDERS
// =========================
app.post("/api/orders", async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const {
      customer_name,
      table_number,
      items
    } = req.body;

    if (
      !customer_name ||
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({
        error: "Nama dan pesanan wajib diisi."
      });
    }

    await conn.beginTransaction();

    const clean = [];

    for (const raw of items) {
      const qty = Number(raw.qty);
      const id = Number(raw.menu_id);

      if (
        !Number.isInteger(qty) ||
        qty < 1 ||
        qty > 99
      ) {
        continue;
      }

      const [rows] = await conn.query(
        `SELECT id,name,price,stock
         FROM menu
         WHERE id=? AND active=1
         FOR UPDATE`,
        [id]
      );

      const m = rows[0];

      if (!m || m.stock < qty) {
        continue;
      }

      clean.push({
        ...m,
        qty,
        subtotal: m.price * qty
      });
    }

    if (!clean.length) {
      await conn.rollback();

      return res.status(400).json({
        error: "Menu habis atau pesanan tidak valid."
      });
    }

    const total = clean.reduce(
      (s, x) => s + x.subtotal,
      0
    );

    const [order] = await conn.query(
      `INSERT INTO orders
       (customer_name,table_number,total)
       VALUES(?,?,?)`,
      [
        String(customer_name).trim(),
        String(table_number || "").trim(),
        total
      ]
    );

    for (const x of clean) {
      await conn.query(
        `INSERT INTO order_items
        (order_id,menu_id,menu_name,price,qty,subtotal)
        VALUES(?,?,?,?,?,?)`,
        [
          order.insertId,
          x.id,
          x.name,
          x.price,
          x.qty,
          x.subtotal
        ]
      );

      await conn.query(
        "UPDATE menu SET stock=stock-? WHERE id=?",
        [x.qty, x.id]
      );
    }

    await conn.commit();

    res.json({
      ok: true,
      order_id: order.insertId,
      total
    });
  } catch (e) {
    await conn.rollback();

    console.error(e);

    res.status(500).json({
      error: "Pesanan gagal disimpan."
    });
  } finally {
    conn.release();
  }
});

// =========================
// LOGIN
// =========================
app.post("/api/login", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM admins
       WHERE username=?
       LIMIT 1`,
      [req.body.username]
    );

    const admin = rows[0];

    if (
      !admin ||
      !(await bcrypt.compare(
        req.body.password,
        admin.password_hash
      ))
    ) {
      return res.status(401).json({
        error: "Username atau password salah."
      });
    }

    req.session.admin = {
      id: admin.id,
      username: admin.username
    };

    res.json({
      ok: true,
      username: admin.username
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Login gagal."
    });
  }
});

// =========================
// CHECK LOGIN
// =========================
app.get("/api/me", (req, res) => {
  res.json({
    logged_in: !!req.session.admin,
    username: req.session.admin?.username || null
  });
});

// =========================
// LOGOUT
// =========================
app.post("/api/logout", auth, (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

// =========================
// GET ORDERS
// =========================
app.get("/api/orders", auth, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT *
       FROM orders
       ORDER BY FIELD(
         status,
         'baru',
         'diproses',
         'selesai',
         'dibatalkan'
       ), id DESC`
    );

    const [items] = await pool.query(
      "SELECT * FROM order_items ORDER BY id"
    );

    const map = {};

    items.forEach((i) => {
      (map[i.order_id] ??= []).push(i);
    });

    res.json(
      orders.map((o) => ({
        ...o,
        items: map[o.id] || []
      }))
    );
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal mengambil pesanan."
    });
  }
});

// =========================
// UPDATE ORDER
// =========================
app.patch("/api/orders/:id", auth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const {
      status,
      payment_status
    } = req.body;

    const statuses = [
      "baru",
      "diproses",
      "selesai",
      "dibatalkan"
    ];

    const payments = [
      "belum_bayar",
      "dibayar"
    ];

    if (
      status &&
      !statuses.includes(status)
    ) {
      return res.status(400).json({
        error: "Status tidak valid."
      });
    }

    if (
      payment_status &&
      !payments.includes(payment_status)
    ) {
      return res.status(400).json({
        error: "Pembayaran tidak valid."
      });
    }

    if (status && payment_status) {
      await pool.query(
        `UPDATE orders
         SET status=?,payment_status=?
         WHERE id=?`,
        [
          status,
          payment_status,
          id
        ]
      );
    } else if (status) {
      await pool.query(
        "UPDATE orders SET status=? WHERE id=?",
        [status, id]
      );
    } else if (payment_status) {
      await pool.query(
        "UPDATE orders SET payment_status=? WHERE id=?",
        [payment_status, id]
      );
    }

    res.json({
      ok: true
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal memperbarui order."
    });
  }
});

// =========================
// DELETE ORDER
// =========================
app.delete("/api/orders/:id", auth, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM orders WHERE id=?",
      [Number(req.params.id)]
    );

    res.json({
      ok: true
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal menghapus order."
    });
  }
});

// =========================
// ADMIN MENU
// =========================
app.get("/api/admin/menu", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *
       FROM menu
       ORDER BY active DESC,
       FIELD(category,'minuman','snack','makanan'),
       id`
    );

    res.json(rows);
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal mengambil menu."
    });
  }
});

// =========================
// ADD MENU
// =========================
app.post("/api/admin/menu", auth, async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      stock,
      description,
      image_url
    } = req.body;

    if (
      !name ||
      !["minuman", "snack", "makanan"].includes(category)
    ) {
      return res.status(400).json({
        error: "Data menu tidak valid."
      });
    }

    const [r] = await pool.query(
      `INSERT INTO menu
       (name,category,price,stock,description,image_url)
       VALUES(?,?,?,?,?,?)`,
      [
        name,
        category,
        Number(price) || 0,
        Number(stock) || 0,
        description || "",
        image_url || ""
      ]
    );

    res.json({
      ok: true,
      id: r.insertId
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal menambahkan menu."
    });
  }
});

// =========================
// UPDATE MENU
// =========================
app.put("/api/admin/menu/:id", auth, async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      stock,
      description,
      image_url,
      active
    } = req.body;

    await pool.query(
      `UPDATE menu
       SET name=?,
           category=?,
           price=?,
           stock=?,
           description=?,
           image_url=?,
           active=?
       WHERE id=?`,
      [
        name,
        category,
        Number(price) || 0,
        Number(stock) || 0,
        description || "",
        image_url || "",
        active ? 1 : 0,
        Number(req.params.id)
      ]
    );

    res.json({
      ok: true
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal memperbarui menu."
    });
  }
});

// =========================
// DELETE MENU
// =========================
app.delete("/api/admin/menu/:id", auth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE menu SET active=0 WHERE id=?",
      [Number(req.params.id)]
    );

    res.json({
      ok: true
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal menghapus menu."
    });
  }
});

// =========================
// REPORT
// =========================
app.get("/api/admin/report", auth, async (req, res) => {
  try {
    const [[s]] = await pool.query(`
      SELECT
        COUNT(*) orders,
        COALESCE(
          SUM(
            CASE
              WHEN status!='dibatalkan'
              THEN total
              ELSE 0
            END
          ),
          0
        ) revenue,
        COALESCE(
          SUM(
            CASE
              WHEN status!='dibatalkan'
              AND payment_status='dibayar'
              THEN total
              ELSE 0
            END
          ),
          0
        ) paid
      FROM orders
      WHERE DATE(created_at)=CURDATE()
    `);

    const [top] = await pool.query(`
      SELECT
        menu_name,
        SUM(qty) qty,
        SUM(subtotal) revenue
      FROM order_items oi
      JOIN orders o
        ON o.id=oi.order_id
      WHERE DATE(o.created_at)=CURDATE()
        AND o.status!='dibatalkan'
      GROUP BY menu_id,menu_name
      ORDER BY qty DESC
      LIMIT 10
    `);

    res.json({
      date: new Date().toISOString().slice(0, 10),
      ...s,
      top
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: "Gagal mengambil laporan."
    });
  }
});

// =========================
// KASIR
// =========================
app.get("/kasir", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "kasir.html")
  );
});

// =========================
// START SERVER
// =========================
app.listen(
  PORT,
  "0.0.0.0",
  async () => {
    console.log(
      `Qures Riverside online server berjalan di port ${PORT}`
    );

    await setup();
  }
);
