require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// FOLDER UPLOAD FOTO
// =====================================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// =====================================================
// KONFIGURASI MULTER
// =====================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();

        const filename =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000000) +
            ext;

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        const allowed = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("File harus berupa gambar."));
        }
    }
});

// =====================================================
// MYSQL AIVEN
// =====================================================

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

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({
    limit: "10mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "10mb"
}));

app.use(session({
    secret: process.env.SESSION_SECRET || "qures-riverside-secret",

    resave: false,

    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000
    }
}));

// =====================================================
// STATIC WEBSITE
// =====================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// =====================================================
// STATIC FOTO UPLOAD
// =====================================================

app.use(
    "/uploads",
    express.static(uploadDir)
);

// =====================================================
// DEMO MENU
// =====================================================

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

// =====================================================
// DATABASE SETUP
// =====================================================

async function setup() {
    try {
        await pool.query("SELECT 1");

        console.log("MySQL Aiven berhasil terhubung.");

        // =================================================
        // BUAT TABEL JIKA BELUM ADA
        // =================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS menu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL,
                price DECIMAL(12,2) NOT NULL DEFAULT 0,
                stock INT NOT NULL DEFAULT 0,
                description TEXT,
                image_url VARCHAR(500),
                active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                table_number VARCHAR(100),
                total DECIMAL(12,2) NOT NULL DEFAULT 0,
                status VARCHAR(50) NOT NULL DEFAULT 'baru',
                payment_status VARCHAR(50) NOT NULL DEFAULT 'belum_bayar',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                menu_id INT NOT NULL,
                menu_name VARCHAR(255) NOT NULL,
                price DECIMAL(12,2) NOT NULL DEFAULT 0,
                qty INT NOT NULL DEFAULT 1,
                subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX(order_id),
                INDEX(menu_id)
            )
        `);

        // =================================================
        // ADMIN DEFAULT
        // =================================================

        const [adminRows] = await pool.query(
            "SELECT id FROM admins LIMIT 1"
        );

        if (adminRows.length === 0) {
            const username =
                process.env.ADMIN_USERNAME || "admin";

            const password =
                process.env.ADMIN_PASSWORD || "admin123";

            const hash =
                await bcrypt.hash(password, 10);

            await pool.query(
                `
                INSERT INTO admins
                (username, password_hash)
                VALUES (?, ?)
                `,
                [
                    username,
                    hash
                ]
            );

            console.log(
                `Admin dibuat: ${username}`
            );
        }

        // =================================================
        // DEMO MENU
        // =================================================

        const [menuRows] = await pool.query(
            "SELECT id FROM menu LIMIT 1"
        );

        if (menuRows.length === 0) {
            for (const menu of DEMO_MENU) {
                await pool.query(
                    `
                    INSERT INTO menu
                    (
                        name,
                        category,
                        price,
                        stock,
                        description,
                        image_url
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    menu
                );
            }

            console.log(
                "9 menu demo berhasil dimasukkan."
            );
        }

        console.log("Database siap.");

        return true;

    } catch (error) {
        console.error(
            "GAGAL SETUP MYSQL:",
            error.message
        );

        return false;
    }
}

// =====================================================
// AUTH
// =====================================================

function auth(req, res, next) {
    if (!req.session.admin) {
        return res.status(401).json({
            error: "Login kasir diperlukan."
        });
    }

    next();
}

// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", async (req, res) => {
    try {
        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        if (!username || !password) {
            return res.status(400).json({
                error: "Username dan password wajib diisi."
            });
        }

        const [rows] = await pool.query(
            `
            SELECT *
            FROM admins
            WHERE username = ?
            LIMIT 1
            `,
            [username]
        );

        const admin = rows[0];

        if (!admin) {
            return res.status(401).json({
                error: "Username atau password salah."
            });
        }

        const valid =
            await bcrypt.compare(
                password,
                admin.password_hash
            );

        if (!valid) {
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

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Login gagal."
        });
    }
});

// =====================================================
// CHECK LOGIN
// =====================================================

app.get("/api/me", (req, res) => {
    res.json({
        logged_in: !!req.session.admin,

        username:
            req.session.admin?.username || null
    });
});

// =====================================================
// LOGOUT
// =====================================================

app.post("/api/logout", auth, (req, res) => {
    req.session.destroy(() => {
        res.json({
            ok: true
        });
    });
});

// =====================================================
// UPLOAD FOTO MENU
// =====================================================

app.post(
    "/api/admin/upload",
    auth,
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: "Foto belum dipilih."
                });
            }

            const imageUrl =
                "/uploads/" + req.file.filename;

            res.json({
                ok: true,
                image_url: imageUrl
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error: "Gagal mengupload foto."
            });
        }
    }
);

// =====================================================
// MENU UNTUK PEMBELI
// =====================================================

app.get("/api/menu", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT
                id,
                name,
                category,
                price,
                stock,
                description,
                image_url
            FROM menu
            WHERE active = 1
            ORDER BY
                FIELD(
                    category,
                    'minuman',
                    'snack',
                    'makanan'
                ),
                id
            `
        );

        res.json(rows);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Gagal mengambil menu."
        });
    }
});

// =====================================================
// PESANAN PEMBELI
// =====================================================

app.post("/api/orders", async (req, res) => {
    const conn =
        await pool.getConnection();

    try {
        const {
            customer_name,
            table_number,
            items
        } = req.body;

        if (
            !customer_name ||
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                error:
                    "Nama dan pesanan wajib diisi."
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

            const [rows] =
                await conn.query(
                    `
                    SELECT
                        id,
                        name,
                        price,
                        stock
                    FROM menu
                    WHERE id = ?
                    AND active = 1
                    FOR UPDATE
                    `,
                    [id]
                );

            const menu = rows[0];

            if (!menu) {
                continue;
            }

            if (Number(menu.stock) < qty) {
                continue;
            }

            clean.push({
                ...menu,
                qty,
                subtotal:
                    Number(menu.price) * qty
            });
        }

        if (clean.length === 0) {
            await conn.rollback();

            return res.status(400).json({
                error:
                    "Menu habis atau pesanan tidak valid."
            });
        }

        const total =
            clean.reduce(
                (sum, item) =>
                    sum + item.subtotal,
                0
            );

        const [order] =
            await conn.query(
                `
                INSERT INTO orders
                (
                    customer_name,
                    table_number,
                    total
                )
                VALUES (?, ?, ?)
                `,
                [
                    String(
                        customer_name
                    ).trim(),

                    String(
                        table_number || ""
                    ).trim(),

                    total
                ]
            );

        for (const item of clean) {
            await conn.query(
                `
                INSERT INTO order_items
                (
                    order_id,
                    menu_id,
                    menu_name,
                    price,
                    qty,
                    subtotal
                )
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    order.insertId,
                    item.id,
                    item.name,
                    item.price,
                    item.qty,
                    item.subtotal
                ]
            );

            await conn.query(
                `
                UPDATE menu
                SET stock = stock - ?
                WHERE id = ?
                `,
                [
                    item.qty,
                    item.id
                ]
            );
        }

        await conn.commit();

        res.json({
            ok: true,
            order_id: order.insertId,
            total
        });

    } catch (error) {
        await conn.rollback();

        console.error(error);

        res.status(500).json({
            error:
                "Pesanan gagal disimpan."
        });

    } finally {
        conn.release();
    }
});

// =====================================================
// GET ORDERS KASIR
// =====================================================

app.get(
    "/api/orders",
    auth,
    async (req, res) => {
        try {
            const [orders] =
                await pool.query(
                    `
                    SELECT *
                    FROM orders
                    ORDER BY
                        FIELD(
                            status,
                            'baru',
                            'diproses',
                            'selesai',
                            'dibatalkan'
                        ),
                        id DESC
                    `
                );

            const [items] =
                await pool.query(
                    `
                    SELECT *
                    FROM order_items
                    ORDER BY id
                    `
                );

            const map = {};

            for (const item of items) {
                if (!map[item.order_id]) {
                    map[item.order_id] = [];
                }

                map[item.order_id].push(item);
            }

            res.json(
                orders.map(order => ({
                    ...order,
                    items:
                        map[order.id] || []
                }))
            );

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil pesanan."
            });
        }
    }
);

// =====================================================
// UPDATE ORDER
// =====================================================

app.patch(
    "/api/orders/:id",
    auth,
    async (req, res) => {
        try {
            const id =
                Number(req.params.id);

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
                    error:
                        "Status tidak valid."
                });
            }

            if (
                payment_status &&
                !payments.includes(
                    payment_status
                )
            ) {
                return res.status(400).json({
                    error:
                        "Status pembayaran tidak valid."
                });
            }

            if (
                status &&
                payment_status
            ) {
                await pool.query(
                    `
                    UPDATE orders
                    SET
                        status = ?,
                        payment_status = ?
                    WHERE id = ?
                    `,
                    [
                        status,
                        payment_status,
                        id
                    ]
                );

            } else if (status) {
                await pool.query(
                    `
                    UPDATE orders
                    SET status = ?
                    WHERE id = ?
                    `,
                    [
                        status,
                        id
                    ]
                );

            } else if (payment_status) {
                await pool.query(
                    `
                    UPDATE orders
                    SET payment_status = ?
                    WHERE id = ?
                    `,
                    [
                        payment_status,
                        id
                    ]
                );
            }

            res.json({
                ok: true
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal memperbarui order."
            });
        }
    }
);

// =====================================================
// DELETE ORDER
// =====================================================

app.delete(
    "/api/orders/:id",
    auth,
    async (req, res) => {
        try {
            const id =
                Number(req.params.id);

            await pool.query(
                `
                DELETE FROM order_items
                WHERE order_id = ?
                `,
                [id]
            );

            await pool.query(
                `
                DELETE FROM orders
                WHERE id = ?
                `,
                [id]
            );

            res.json({
                ok: true
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menghapus order."
            });
        }
    }
);

// =====================================================
// GET MENU ADMIN
// =====================================================

app.get(
    "/api/admin/menu",
    auth,
    async (req, res) => {
        try {
            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM menu
                    ORDER BY
                        active DESC,
                        FIELD(
                            category,
                            'minuman',
                            'snack',
                            'makanan'
                        ),
                        id
                    `
                );

            res.json(rows);

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil menu."
            });
        }
    }
);

// =====================================================
// TAMBAH MENU
// =====================================================

app.post(
    "/api/admin/menu",
    auth,
    async (req, res) => {
        try {
            const {
                name,
                category,
                price,
                stock,
                description,
                image_url
            } = req.body;

            const categories = [
                "minuman",
                "snack",
                "makanan"
            ];

            if (
                !name ||
                !categories.includes(category)
            ) {
                return res.status(400).json({
                    error:
                        "Data menu tidak valid."
                });
            }

            const [result] =
                await pool.query(
                    `
                    INSERT INTO menu
                    (
                        name,
                        category,
                        price,
                        stock,
                        description,
                        image_url,
                        active
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    `,
                    [
                        String(name).trim(),
                        category,
                        Number(price) || 0,
                        Number(stock) || 0,
                        String(
                            description || ""
                        ).trim(),
                        String(
                            image_url || ""
                        ).trim()
                    ]
                );

            res.json({
                ok: true,
                id: result.insertId
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menambahkan menu."
            });
        }
    }
);

// =====================================================
// UPDATE MENU
// =====================================================

app.put(
    "/api/admin/menu/:id",
    auth,
    async (req, res) => {
        try {
            const id =
                Number(req.params.id);

            const {
                name,
                category,
                price,
                stock,
                description,
                image_url,
                active
            } = req.body;

            const categories = [
                "minuman",
                "snack",
                "makanan"
            ];

            if (
                !name ||
                !categories.includes(category)
            ) {
                return res.status(400).json({
                    error:
                        "Data menu tidak valid."
                });
            }

            await pool.query(
                `
                UPDATE menu
                SET
                    name = ?,
                    category = ?,
                    price = ?,
                    stock = ?,
                    description = ?,
                    image_url = ?,
                    active = ?
                WHERE id = ?
                `,
                [
                    String(name).trim(),
                    category,
                    Number(price) || 0,
                    Number(stock) || 0,
                    String(
                        description || ""
                    ).trim(),
                    String(
                        image_url || ""
                    ).trim(),
                    active ? 1 : 0,
                    id
                ]
            );

            res.json({
                ok: true
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal memperbarui menu."
            });
        }
    }
);

// =====================================================
// NONAKTIFKAN MENU
// =====================================================

app.delete(
    "/api/admin/menu/:id",
    auth,
    async (req, res) => {
        try {
            await pool.query(
                `
                UPDATE menu
                SET active = 0
                WHERE id = ?
                `,
                [
                    Number(req.params.id)
                ]
            );

            res.json({
                ok: true
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menonaktifkan menu."
            });
        }
    }
);

// =====================================================
// REPORT
// =====================================================

app.get(
    "/api/admin/report",
    auth,
    async (req, res) => {
        try {
            const [[summary]] =
                await pool.query(
                    `
                    SELECT
                        COUNT(*) AS orders,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN status != 'dibatalkan'
                                    THEN total
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS revenue,

                        COALESCE(
                            SUM(
                                CASE
                                    WHEN
                                        status != 'dibatalkan'
                                        AND payment_status = 'dibayar'
                                    THEN total
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS paid

                    FROM orders

                    WHERE
                        DATE(created_at) =
                        CURDATE()
                    `
                );

            const [top] =
                await pool.query(
                    `
                    SELECT
                        menu_name,
                        SUM(qty) AS qty,
                        SUM(subtotal) AS revenue

                    FROM order_items oi

                    JOIN orders o
                        ON o.id = oi.order_id

                    WHERE
                        DATE(o.created_at) =
                        CURDATE()

                        AND
                        o.status != 'dibatalkan'

                    GROUP BY
                        menu_id,
                        menu_name

                    ORDER BY
                        qty DESC

                    LIMIT 10
                    `
                );

            res.json({
                date:
                    new Date()
                        .toISOString()
                        .slice(0, 10),

                orders:
                    Number(
                        summary.orders || 0
                    ),

                revenue:
                    Number(
                        summary.revenue || 0
                    ),

                paid:
                    Number(
                        summary.paid || 0
                    ),

                top
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil laporan."
            });
        }
    }
);

// =====================================================
// HALAMAN KASIR
// =====================================================

app.get("/kasir", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "public",
            "kasir.html"
        )
    );
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (error, req, res, next) => {
        console.error(error);

        if (error instanceof multer.MulterError) {
            return res.status(400).json({
                error: "Ukuran foto maksimal 5 MB."
            });
        }

        if (error) {
            return res.status(400).json({
                error: error.message || "Terjadi kesalahan."
            });
        }

        next();
    }
);

// =====================================================
// START SERVER
// =====================================================

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