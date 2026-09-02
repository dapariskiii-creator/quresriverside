require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("trust proxy", 1);

// ======================================================
// BASIC CONFIG
// ======================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "quresriverside-secret",

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

// ======================================================
// UPLOAD
// ======================================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();

        const name =
            Date.now() +
            "-" +
            Math.floor(Math.random() * 1000000000) +
            ext;

        cb(null, name);
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
            cb(new Error("Format gambar tidak didukung."));
        }
    }
});

// ======================================================
// MYSQL
// ======================================================

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

// ======================================================
// STATIC FILES
// ======================================================

app.use(express.static(path.join(__dirname, "public")));

app.use(
    "/uploads",
    express.static(uploadDir)
);

// ======================================================
// AUTH MIDDLEWARE
// ======================================================

function auth(req, res, next) {
    if (!req.session.admin) {
        return res.status(401).json({
            error: "Silakan login sebagai admin."
        });
    }

    next();
}

// ======================================================
// DATABASE SETUP
// ======================================================

async function setupDatabase() {
    try {
        const conn = await pool.getConnection();

        try {
            await conn.query("SELECT 1");

            console.log("MySQL berhasil terhubung.");

            // ------------------------------------------------
            // ADMINS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS admins (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // MENU
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS menu (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    category ENUM(
                        'minuman',
                        'snack',
                        'makanan'
                    ) NOT NULL,
                    price DECIMAL(12,2) NOT NULL DEFAULT 0,
                    stock INT NOT NULL DEFAULT 0,
                    description TEXT,
                    image_url VARCHAR(500),
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // ORDERS
            // ID hanya digunakan sebagai ID database internal.
            // Tidak ditampilkan sebagai nomor pesanan.
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    customer_name VARCHAR(120) NOT NULL,
                    table_number VARCHAR(50),
                    total DECIMAL(12,2) NOT NULL DEFAULT 0,
                    status ENUM(
                        'baru',
                        'diproses',
                        'selesai',
                        'dibatalkan'
                    ) NOT NULL DEFAULT 'baru',
                    payment_status ENUM(
                        'belum_bayar',
                        'dibayar'
                    ) NOT NULL DEFAULT 'belum_bayar',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // ORDER ITEMS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS order_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    order_id INT NOT NULL,
                    menu_id INT NOT NULL,
                    menu_name VARCHAR(120) NOT NULL,
                    price DECIMAL(12,2) NOT NULL DEFAULT 0,
                    qty INT NOT NULL DEFAULT 1,
                    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX(order_id),
                    INDEX(menu_id)
                )
            `);

            // ------------------------------------------------
            // MIGRATION HPP
            // ------------------------------------------------

            await addColumnIfMissing(
                conn,
                "order_items",
                "unit_hpp",
                "DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER subtotal"
            );

            await addColumnIfMissing(
                conn,
                "order_items",
                "hpp",
                "DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER unit_hpp"
            );

            // ------------------------------------------------
            // SUPPLIERS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS suppliers (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(150) NOT NULL,
                    contact VARCHAR(100),
                    address TEXT,
                    notes TEXT,
                    payment_terms VARCHAR(100),
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // INGREDIENTS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS ingredients (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(150) NOT NULL UNIQUE,
                    unit VARCHAR(30) NOT NULL,
                    current_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
                    minimum_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
                    average_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
                    notes TEXT,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // PURCHASES
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS purchases (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    supplier_id INT UNSIGNED NULL,
                    purchase_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    invoice_number VARCHAR(100),
                    subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
                    notes TEXT,
                    status ENUM(
                        'draft',
                        'completed',
                        'cancelled'
                    ) NOT NULL DEFAULT 'completed',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // PURCHASE ITEMS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS purchase_items (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    purchase_id BIGINT UNSIGNED NOT NULL,
                    ingredient_id INT UNSIGNED NOT NULL,
                    quantity DECIMAL(14,3) NOT NULL,
                    unit_cost DECIMAL(14,4) NOT NULL,
                    total_cost DECIMAL(15,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    INDEX(purchase_id),
                    INDEX(ingredient_id)
                )
            `);

            // ------------------------------------------------
            // RECIPES
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS recipes (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    menu_id INT NOT NULL UNIQUE,
                    notes TEXT,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // RECIPE ITEMS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS recipe_items (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    recipe_id INT UNSIGNED NOT NULL,
                    ingredient_id INT UNSIGNED NOT NULL,
                    quantity DECIMAL(14,3) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    UNIQUE KEY recipe_ingredient (
                        recipe_id,
                        ingredient_id
                    ),

                    INDEX(recipe_id),
                    INDEX(ingredient_id)
                )
            `);

            // ------------------------------------------------
            // STOCK MOVEMENTS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS stock_movements (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    ingredient_id INT UNSIGNED NOT NULL,
                    movement_type ENUM(
                        'opening',
                        'purchase',
                        'sale',
                        'sale_reversal',
                        'adjustment'
                    ) NOT NULL,
                    quantity DECIMAL(14,3) NOT NULL,
                    stock_after DECIMAL(14,3) NOT NULL,
                    reference_type VARCHAR(50),
                    reference_id BIGINT UNSIGNED,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    INDEX(ingredient_id),
                    INDEX(movement_type)
                )
            `);

            // ------------------------------------------------
            // ORDER ITEM INGREDIENTS
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS order_item_ingredients (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    order_item_id INT NOT NULL,
                    ingredient_id INT UNSIGNED NOT NULL,
                    quantity DECIMAL(14,3) NOT NULL,
                    unit_cost DECIMAL(14,4) NOT NULL,
                    total_cost DECIMAL(15,2) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                    INDEX(order_item_id),
                    INDEX(ingredient_id)
                )
            `);

            // ------------------------------------------------
            // OPERATIONAL EXPENSES
            // ------------------------------------------------

            await conn.query(`
                CREATE TABLE IF NOT EXISTS operational_expenses (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    expense_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    category VARCHAR(100) NOT NULL,
                    description VARCHAR(255),
                    amount DECIMAL(15,2) NOT NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
            `);

            // ------------------------------------------------
            // DEFAULT ADMIN
            // ------------------------------------------------

            const [admins] = await conn.query(`
                SELECT id
                FROM admins
                LIMIT 1
            `);

            if (admins.length === 0) {
                const username =
                    process.env.ADMIN_USERNAME ||
                    "admin";

                const password =
                    process.env.ADMIN_PASSWORD ||
                    "admin123";

                const hash =
                    await bcrypt.hash(
                        password,
                        10
                    );

                await conn.query(
                    `
                    INSERT INTO admins
                    (
                        username,
                        password_hash
                    )
                    VALUES (?, ?)
                    `,
                    [
                        username,
                        hash
                    ]
                );

                console.log(
                    `Admin default dibuat: ${username}`
                );
            }

            console.log(
                "Database Qures Riverside siap."
            );

        } finally {
            conn.release();
        }

        return true;

    } catch (error) {
        console.error(
            "DATABASE SETUP ERROR:",
            error.message
        );

        return false;
    }
}

// ======================================================
// ADD COLUMN IF MISSING
// ======================================================

async function addColumnIfMissing(
    conn,
    table,
    column,
    definition
) {
    const [rows] = await conn.query(
        `
        SELECT COUNT(*) AS jumlah
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        `,
        [
            table,
            column
        ]
    );

    if (
        Number(rows[0].jumlah) === 0
    ) {
        await conn.query(
            `
            ALTER TABLE ${table}
            ADD COLUMN ${column} ${definition}
            `
        );

        console.log(
            `Kolom ${table}.${column} berhasil ditambahkan.`
        );
    }
}

// ======================================================
// LOGIN
// ======================================================

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const username =
                String(
                    req.body.username || ""
                ).trim();

            const password =
                String(
                    req.body.password || ""
                );

            if (
                !username ||
                !password
            ) {
                return res.status(400).json({
                    error:
                        "Username dan password wajib diisi."
                });
            }

            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM admins
                    WHERE username = ?
                    LIMIT 1
                    `,
                    [
                        username
                    ]
                );

            if (
                rows.length === 0
            ) {
                return res.status(401).json({
                    error:
                        "Username atau password salah."
                });
            }

            const admin =
                rows[0];

            const valid =
                await bcrypt.compare(
                    password,
                    admin.password_hash
                );

            if (!valid) {
                return res.status(401).json({
                    error:
                        "Username atau password salah."
                });
            }

            req.session.admin = {
                id: admin.id,
                username: admin.username
            };

            res.json({
                ok: true,
                username:
                    admin.username
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Login gagal."
            });
        }
    }
);

// ======================================================
// CHECK LOGIN
// ======================================================

app.get(
    "/api/me",
    (req, res) => {

        res.json({
            logged_in:
                !!req.session.admin,

            username:
                req.session.admin
                    ? req.session.admin.username
                    : null
        });
    }
);

// ======================================================
// LOGOUT
// ======================================================

app.post(
    "/api/logout",
    auth,
    (req, res) => {

        req.session.destroy(
            function () {
                res.json({
                    ok: true
                });
            }
        );
    }
);

// ======================================================
// UPLOAD IMAGE
// ======================================================

app.post(
    "/api/admin/upload",
    auth,
    upload.single("image"),
    async (req, res) => {

        try {

            if (!req.file) {
                return res.status(400).json({
                    error:
                        "Foto belum dipilih."
                });
            }

            res.json({
                ok: true,

                image_url:
                    "/uploads/" +
                    req.file.filename
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Upload gagal."
            });
        }
    }
);

// ======================================================
// GET MENU CUSTOMER
// ======================================================

app.get(
    "/api/menu",
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
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
                    ORDER BY id ASC
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

// ======================================================
// CREATE ORDER
// ======================================================

app.post(
    "/api/orders",
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const customerName =
                String(
                    req.body.customer_name || ""
                ).trim();

            const tableNumber =
                String(
                    req.body.table_number || ""
                ).trim();

            const items =
                Array.isArray(
                    req.body.items
                )
                    ? req.body.items
                    : [];

            if (
                !customerName
            ) {
                return res.status(400).json({
                    error:
                        "Nama pelanggan wajib diisi."
                });
            }

            if (
                items.length === 0
            ) {
                return res.status(400).json({
                    error:
                        "Pesanan kosong."
                });
            }

            // ----------------------------------------------
            // Gabungkan menu yang sama
            // ----------------------------------------------

            const cart = {};

            for (
                const item
                of items
            ) {

                const menuId =
                    Number(
                        item.menu_id
                    );

                const qty =
                    Number(
                        item.qty
                    );

                if (
                    !Number.isInteger(
                        menuId
                    ) ||
                    !Number.isInteger(
                        qty
                    ) ||
                    qty <= 0
                ) {
                    continue;
                }

                cart[menuId] =
                    (
                        cart[menuId] || 0
                    ) + qty;
            }

            const menuIds =
                Object.keys(cart).map(
                    Number
                );

            if (
                menuIds.length === 0
            ) {
                return res.status(400).json({
                    error:
                        "Item pesanan tidak valid."
                });
            }

            await conn.beginTransaction();

            const finalItems = [];

            // ----------------------------------------------
            // Ambil menu
            // ----------------------------------------------

            for (
                const menuId
                of menuIds
            ) {

                const qty =
                    cart[menuId];

                const [rows] =
                    await conn.query(
                        `
                        SELECT
                            id,
                            name,
                            price,
                            stock,
                            active
                        FROM menu
                        WHERE id = ?
                        FOR UPDATE
                        `,
                        [
                            menuId
                        ]
                    );

                if (
                    rows.length === 0
                ) {
                    throw new Error(
                        "Menu tidak ditemukan."
                    );
                }

                const menu =
                    rows[0];

                if (
                    Number(
                        menu.active
                    ) !== 1
                ) {
                    throw new Error(
                        `Menu ${menu.name} sedang tidak tersedia.`
                    );
                }

                if (
                    Number(menu.stock) <
                    qty
                ) {
                    throw new Error(
                        `Stok ${menu.name} tidak mencukupi.`
                    );
                }

                finalItems.push({
                    id:
                        menu.id,

                    name:
                        menu.name,

                    price:
                        Number(
                            menu.price
                        ),

                    qty:
                        qty,

                    subtotal:
                        Number(
                            menu.price
                        ) * qty
                });
            }

            // ----------------------------------------------
            // Hitung HPP + bahan
            // ----------------------------------------------

            for (
                const item
                of finalItems
            ) {

                const [recipeRows] =
                    await conn.query(
                        `
                        SELECT id
                        FROM recipes
                        WHERE menu_id = ?
                        AND is_active = 1
                        LIMIT 1
                        `,
                        [
                            item.id
                        ]
                    );

                item.unit_hpp = 0;
                item.hpp = 0;
                item.recipe_items = [];

                if (
                    recipeRows.length === 0
                ) {
                    continue;
                }

                const recipeId =
                    recipeRows[0].id;

                const [recipeItems] =
                    await conn.query(
                        `
                        SELECT
                            ri.ingredient_id,
                            ri.quantity,
                            i.name,
                            i.unit,
                            i.current_stock,
                            i.average_cost
                        FROM recipe_items ri
                        JOIN ingredients i
                            ON i.id = ri.ingredient_id
                        WHERE
                            ri.recipe_id = ?
                        AND
                            i.is_active = 1
                        ORDER BY
                            ri.ingredient_id
                        `,
                        [
                            recipeId
                        ]
                    );

                if (
                    recipeItems.length === 0
                ) {
                    throw new Error(
                        `Resep ${item.name} belum memiliki bahan.`
                    );
                }

                for (
                    const recipeItem
                    of recipeItems
                ) {

                    const needed =
                        Number(
                            recipeItem.quantity
                        ) *
                        item.qty;

                    const stock =
                        Number(
                            recipeItem.current_stock
                        );

                    if (
                        stock <
                        needed
                    ) {
                        throw new Error(
                            `Stok bahan ${recipeItem.name} tidak cukup untuk ${item.name}.`
                        );
                    }

                    const cost =
                        Number(
                            recipeItem.average_cost
                        );

                    item.unit_hpp +=
                        Number(
                            recipeItem.quantity
                        ) *
                        cost;

                    item.recipe_items.push({
                        ingredient_id:
                            Number(
                                recipeItem.ingredient_id
                            ),

                        quantity:
                            needed,

                        unit_cost:
                            cost,

                        total_cost:
                            needed * cost
                    });
                }

                item.hpp =
                    item.unit_hpp *
                    item.qty;
            }

            // ----------------------------------------------
            // Total
            // ----------------------------------------------

            const total =
                finalItems.reduce(
                    function (
                        sum,
                        item
                    ) {
                        return (
                            sum +
                            item.subtotal
                        );
                    },
                    0
                );

            // ----------------------------------------------
            // Insert order
            // ID hanya untuk database internal.
            // Tidak dikirim sebagai nomor pesanan.
            // ----------------------------------------------

            const [orderResult] =
                await conn.query(
                    `
                    INSERT INTO orders
                    (
                        customer_name,
                        table_number,
                        total,
                        status,
                        payment_status
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        'baru',
                        'belum_bayar'
                    )
                    `,
                    [
                        customerName,
                        tableNumber,
                        total
                    ]
                );

            const orderId =
                orderResult.insertId;

            // ----------------------------------------------
            // Insert order items
            // ----------------------------------------------

            for (
                const item
                of finalItems
            ) {

                const [itemResult] =
                    await conn.query(
                        `
                        INSERT INTO order_items
                        (
                            order_id,
                            menu_id,
                            menu_name,
                            price,
                            qty,
                            subtotal,
                            unit_hpp,
                            hpp
                        )
                        VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?
                        )
                        `,
                        [
                            orderId,
                            item.id,
                            item.name,
                            item.price,
                            item.qty,
                            item.subtotal,
                            item.unit_hpp,
                            item.hpp
                        ]
                    );

                const orderItemId =
                    itemResult.insertId;

                // ------------------------------------------
                // Simpan snapshot bahan
                // ------------------------------------------

                for (
                    const used
                    of item.recipe_items
                ) {

                    await conn.query(
                        `
                        INSERT INTO order_item_ingredients
                        (
                            order_item_id,
                            ingredient_id,
                            quantity,
                            unit_cost,
                            total_cost
                        )
                        VALUES (
                            ?,
                            ?,
                            ?,
                            ?,
                            ?
                        )
                        `,
                        [
                            orderItemId,
                            used.ingredient_id,
                            used.quantity,
                            used.unit_cost,
                            used.total_cost
                        ]
                    );

                    // --------------------------------------
                    // Potong bahan
                    // --------------------------------------

                    const [
                        ingredientRows
                    ] =
                        await conn.query(
                            `
                            SELECT
                                current_stock
                            FROM ingredients
                            WHERE id = ?
                            FOR UPDATE
                            `,
                            [
                                used.ingredient_id
                            ]
                        );

                    if (
                        ingredientRows.length === 0
                    ) {
                        throw new Error(
                            "Bahan baku tidak ditemukan."
                        );
                    }

                    const oldStock =
                        Number(
                            ingredientRows[0]
                                .current_stock
                        );

                    const newStock =
                        oldStock -
                        Number(
                            used.quantity
                        );

                    if (
                        newStock < 0
                    ) {
                        throw new Error(
                            "Stok bahan tidak mencukupi."
                        );
                    }

                    await conn.query(
                        `
                        UPDATE ingredients
                        SET current_stock = ?
                        WHERE id = ?
                        `,
                        [
                            newStock,
                            used.ingredient_id
                        ]
                    );

                    await conn.query(
                        `
                        INSERT INTO stock_movements
                        (
                            ingredient_id,
                            movement_type,
                            quantity,
                            stock_after,
                            reference_type,
                            reference_id,
                            notes
                        )
                        VALUES (
                            ?,
                            'sale',
                            ?,
                            ?,
                            'order',
                            ?,
                            ?
                        )
                        `,
                        [
                            used.ingredient_id,
                            -Number(
                                used.quantity
                            ),
                            newStock,
                            orderId,
                            `Pemakaian bahan ${item.name}`
                        ]
                    );
                }

                // ------------------------------------------
                // Potong stok menu
                // ------------------------------------------

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

            const totalHpp =
                finalItems.reduce(
                    function (
                        sum,
                        item
                    ) {
                        return (
                            sum +
                            Number(
                                item.hpp || 0
                            )
                        );
                    },
                    0
                );

            res.json({
                ok: true,

                total:
                    total,

                hpp:
                    totalHpp
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(
                "CREATE ORDER:",
                error.message
            );

            res.status(400).json({
                error:
                    error.message ||
                    "Pesanan gagal dibuat."
            });

        } finally {
            conn.release();
        }
    }
);

// ======================================================
// GET ORDERS
// TANPA NOMOR PESANAN
// ======================================================

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
                        id DESC
                    `
                );

            const [items] =
                await pool.query(
                    `
                    SELECT *
                    FROM order_items
                    ORDER BY id ASC
                    `
                );

            const grouped = {};

            for (
                const item
                of items
            ) {

                if (
                    !grouped[item.order_id]
                ) {
                    grouped[item.order_id] = [];
                }

                grouped[item.order_id]
                    .push(item);
            }

            const result =
                orders.map(
                    function (order) {

                        return {
                            ...order,

                            items:
                                grouped[
                                    order.id
                                ] || []
                        };
                    }
                );

            res.json(result);

        } catch (error) {

            console.error(
                "GET ORDERS ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Gagal mengambil pesanan."
            });
        }
    }
);

// ======================================================
// CANCEL ORDER - RESTORE STOCK
// ======================================================

async function cancelOrderInventory(
    conn,
    orderId
) {

    const [items] =
        await conn.query(
            `
            SELECT
                id,
                menu_id,
                qty,
                menu_name
            FROM order_items
            WHERE order_id = ?
            ORDER BY id
            `,
            [
                orderId
            ]
        );

    // ----------------------------------------------
    // Kembalikan stok menu
    // ----------------------------------------------

    for (
        const item
        of items
    ) {

        await conn.query(
            `
            UPDATE menu
            SET stock = stock + ?
            WHERE id = ?
            `,
            [
                Number(
                    item.qty
                ),

                Number(
                    item.menu_id
                )
            ]
        );
    }

    // ----------------------------------------------
    // Kembalikan bahan
    // ----------------------------------------------

    for (
        const item
        of items
    ) {

        const [
            ingredientRows
        ] =
            await conn.query(
                `
                SELECT
                    ingredient_id,
                    quantity
                FROM order_item_ingredients
                WHERE order_item_id = ?
                `,
                [
                    item.id
                ]
            );

        for (
            const used
            of ingredientRows
        ) {

            const [
                stockRows
            ] =
                await conn.query(
                    `
                    SELECT
                        current_stock
                    FROM ingredients
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [
                        used.ingredient_id
                    ]
                );

            if (
                stockRows.length === 0
            ) {
                continue;
            }

            const oldStock =
                Number(
                    stockRows[0]
                        .current_stock
                );

            const qty =
                Number(
                    used.quantity
                );

            const newStock =
                oldStock +
                qty;

            await conn.query(
                `
                UPDATE ingredients
                SET current_stock = ?
                WHERE id = ?
                `,
                [
                    newStock,
                    used.ingredient_id
                ]
            );

            await conn.query(
                `
                INSERT INTO stock_movements
                (
                    ingredient_id,
                    movement_type,
                    quantity,
                    stock_after,
                    reference_type,
                    reference_id,
                    notes
                )
                VALUES (
                    ?,
                    'sale_reversal',
                    ?,
                    ?,
                    'order',
                    ?,
                    ?
                )
                `,
                [
                    used.ingredient_id,
                    qty,
                    newStock,
                    orderId,
                    "Pengembalian bahan pesanan"
                ]
            );
        }
    }
}

// ======================================================
// UPDATE ORDER
// ======================================================

app.patch(
    "/api/orders/:id",
    auth,
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const orderId =
                Number(
                    req.params.id
                );

            const newStatus =
                req.body.status;

            const newPayment =
                req.body.payment_status;

            await conn.beginTransaction();

            const [rows] =
                await conn.query(
                    `
                    SELECT *
                    FROM orders
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [
                        orderId
                    ]
                );

            if (
                rows.length === 0
            ) {
                throw new Error(
                    "Pesanan tidak ditemukan."
                );
            }

            const order =
                rows[0];

            const oldStatus =
                order.status;

            // ----------------------------------------------
            // Batalkan
            // ----------------------------------------------

            if (
                newStatus === "dibatalkan" &&
                oldStatus !== "dibatalkan"
            ) {

                await cancelOrderInventory(
                    conn,
                    orderId
                );
            }

            // ----------------------------------------------
            // Update
            // ----------------------------------------------

            if (
                newStatus &&
                newPayment
            ) {

                await conn.query(
                    `
                    UPDATE orders
                    SET
                        status = ?,
                        payment_status = ?
                    WHERE id = ?
                    `,
                    [
                        newStatus,
                        newPayment,
                        orderId
                    ]
                );

            } else if (
                newStatus
            ) {

                await conn.query(
                    `
                    UPDATE orders
                    SET status = ?
                    WHERE id = ?
                    `,
                    [
                        newStatus,
                        orderId
                    ]
                );

            } else if (
                newPayment
            ) {

                await conn.query(
                    `
                    UPDATE orders
                    SET payment_status = ?
                    WHERE id = ?
                    `,
                    [
                        newPayment,
                        orderId
                    ]
                );

            } else {
                throw new Error(
                    "Tidak ada data yang diubah."
                );
            }

            await conn.commit();

            res.json({
                ok: true
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(error);

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal mengubah pesanan."
            });

        } finally {
            conn.release();
        }
    }
);

// ======================================================
// DELETE ORDER
// ======================================================

app.delete(
    "/api/orders/:id",
    auth,
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const orderId =
                Number(req.params.id);

            if (
                !Number.isInteger(orderId) ||
                orderId <= 0
            ) {
                return res.status(400).json({
                    error:
                        "ID pesanan tidak valid."
                });
            }

            await conn.beginTransaction();

            const [orders] =
                await conn.query(
                    `
                    SELECT *
                    FROM orders
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [orderId]
                );

            if (
                orders.length === 0
            ) {
                throw new Error(
                    "Pesanan tidak ditemukan."
                );
            }

            const order =
                orders[0];

            if (
                order.status !== "dibatalkan"
            ) {

                await cancelOrderInventory(
                    conn,
                    orderId
                );
            }

            const [items] =
                await conn.query(
                    `
                    SELECT id
                    FROM order_items
                    WHERE order_id = ?
                    `,
                    [orderId]
                );

            const itemIds =
                items.map(
                    item => Number(item.id)
                );

            if (
                itemIds.length > 0
            ) {

                await conn.query(
                    `
                    DELETE FROM order_item_ingredients
                    WHERE order_item_id IN (?)
                    `,
                    [itemIds]
                );
            }

            await conn.query(
                `
                DELETE FROM order_items
                WHERE order_id = ?
                `,
                [orderId]
            );

            await conn.query(
                `
                DELETE FROM orders
                WHERE id = ?
                `,
                [orderId]
            );

            await conn.commit();

            res.json({
                ok: true,
                message:
                    "Pesanan berhasil dihapus."
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(
                "DELETE ORDER ERROR:",
                error
            );

            res.status(500).json({
                error:
                    error.message ||
                    "Gagal menghapus pesanan."
            });

        } finally {

            conn.release();
        }
    }
);

// ======================================================
// ADMIN MENU
// ======================================================

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
                    ORDER BY id ASC
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

// ======================================================
// ADD MENU
// ======================================================

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

            if (
                !name ||
                !category
            ) {
                return res.status(400).json({
                    error:
                        "Nama dan kategori wajib diisi."
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

                id:
                    result.insertId
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

// ======================================================
// UPDATE MENU
// ======================================================

app.put(
    "/api/admin/menu/:id",
    auth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

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
                    active === false ||
                    active === 0
                        ? 0
                        : 1,
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

// ======================================================
// DELETE / NONAKTIF MENU
// ======================================================

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
                    Number(
                        req.params.id
                    )
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

// ======================================================
// SUPPLIERS
// ======================================================

app.get(
    "/api/admin/suppliers",
    auth,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM suppliers
                    ORDER BY name ASC
                    `
                );

            res.json(rows);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil supplier."
            });
        }
    }
);

app.post(
    "/api/admin/suppliers",
    auth,
    async (req, res) => {

        try {

            const {
                name,
                contact,
                address,
                notes,
                payment_terms
            } = req.body;

            if (
                !String(name || "").trim()
            ) {
                return res.status(400).json({
                    error:
                        "Nama supplier wajib diisi."
                });
            }

            const [result] =
                await pool.query(
                    `
                    INSERT INTO suppliers
                    (
                        name,
                        contact,
                        address,
                        notes,
                        payment_terms
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        String(name).trim(),
                        String(
                            contact || ""
                        ).trim(),
                        String(
                            address || ""
                        ).trim(),
                        String(
                            notes || ""
                        ).trim(),
                        String(
                            payment_terms || ""
                        ).trim()
                    ]
                );

            res.json({
                ok: true,

                id:
                    result.insertId
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menambahkan supplier."
            });
        }
    }
);

app.put(
    "/api/admin/suppliers/:id",
    auth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const {
                name,
                contact,
                address,
                notes,
                payment_terms,
                is_active
            } = req.body;

            await pool.query(
                `
                UPDATE suppliers
                SET
                    name = ?,
                    contact = ?,
                    address = ?,
                    notes = ?,
                    payment_terms = ?,
                    is_active = ?
                WHERE id = ?
                `,
                [
                    String(name).trim(),
                    String(
                        contact || ""
                    ).trim(),
                    String(
                        address || ""
                    ).trim(),
                    String(
                        notes || ""
                    ).trim(),
                    String(
                        payment_terms || ""
                    ).trim(),
                    is_active === false
                        ? 0
                        : 1,
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
                    "Gagal memperbarui supplier."
            });
        }
    }
);

// ======================================================
// INGREDIENTS
// ======================================================

app.get(
    "/api/admin/ingredients",
    auth,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        *,
                        CASE
                            WHEN current_stock <= minimum_stock
                            THEN 1
                            ELSE 0
                        END AS low_stock
                    FROM ingredients
                    ORDER BY name ASC
                    `
                );

            res.json(rows);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil bahan baku."
            });
        }
    }
);

// ======================================================
// ADD INGREDIENT
// ======================================================

app.post(
    "/api/admin/ingredients",
    auth,
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const {
                name,
                unit,
                current_stock,
                minimum_stock,
                average_cost,
                notes
            } = req.body;

            if (
                !String(name || "").trim() ||
                !String(unit || "").trim()
            ) {
                return res.status(400).json({
                    error:
                        "Nama dan satuan wajib diisi."
                });
            }

            await conn.beginTransaction();

            const stock =
                Number(
                    current_stock
                ) || 0;

            const minimum =
                Number(
                    minimum_stock
                ) || 0;

            const cost =
                Number(
                    average_cost
                ) || 0;

            const [result] =
                await conn.query(
                    `
                    INSERT INTO ingredients
                    (
                        name,
                        unit,
                        current_stock,
                        minimum_stock,
                        average_cost,
                        notes
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [
                        String(name).trim(),
                        String(unit).trim(),
                        stock,
                        minimum,
                        cost,
                        String(
                            notes || ""
                        ).trim()
                    ]
                );

            if (
                stock !== 0
            ) {

                await conn.query(
                    `
                    INSERT INTO stock_movements
                    (
                        ingredient_id,
                        movement_type,
                        quantity,
                        stock_after,
                        reference_type,
                        reference_id,
                        notes
                    )
                    VALUES (
                        ?,
                        'opening',
                        ?,
                        ?,
                        'ingredient',
                        ?,
                        'Stok awal'
                    )
                    `,
                    [
                        result.insertId,
                        stock,
                        stock,
                        result.insertId
                    ]
                );
            }

            await conn.commit();

            res.json({
                ok: true,

                id:
                    result.insertId
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(error);

            res.status(500).json({
                error:
                    error.message ||
                    "Gagal menambahkan bahan."
            });

        } finally {
            conn.release();
        }
    }
);

// ======================================================
// UPDATE INGREDIENT
// ======================================================

app.put(
    "/api/admin/ingredients/:id",
    auth,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            const {
                name,
                unit,
                minimum_stock,
                average_cost,
                notes,
                is_active
            } = req.body;

            await pool.query(
                `
                UPDATE ingredients
                SET
                    name = ?,
                    unit = ?,
                    minimum_stock = ?,
                    average_cost = ?,
                    notes = ?,
                    is_active = ?
                WHERE id = ?
                `,
                [
                    String(name).trim(),
                    String(unit).trim(),
                    Number(
                        minimum_stock
                    ) || 0,
                    Number(
                        average_cost
                    ) || 0,
                    String(
                        notes || ""
                    ).trim(),
                    is_active === false
                        ? 0
                        : 1,
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
                    "Gagal memperbarui bahan."
            });
        }
    }
);

// ======================================================
// ADJUST INGREDIENT
// ======================================================

app.post(
    "/api/admin/ingredients/:id/adjust",
    auth,
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const id =
                Number(
                    req.params.id
                );

            const quantity =
                Number(
                    req.body.quantity
                );

            if (
                !Number.isFinite(
                    quantity
                ) ||
                quantity === 0
            ) {
                return res.status(400).json({
                    error:
                        "Jumlah tidak valid."
                });
            }

            await conn.beginTransaction();

            const [rows] =
                await conn.query(
                    `
                    SELECT
                        current_stock
                    FROM ingredients
                    WHERE id = ?
                    FOR UPDATE
                    `,
                    [
                        id
                    ]
                );

            if (
                rows.length === 0
            ) {
                throw new Error(
                    "Bahan tidak ditemukan."
                );
            }

            const oldStock =
                Number(
                    rows[0].current_stock
                );

            const newStock =
                oldStock +
                quantity;

            if (
                newStock < 0
            ) {
                throw new Error(
                    "Stok tidak boleh negatif."
                );
            }

            await conn.query(
                `
                UPDATE ingredients
                SET current_stock = ?
                WHERE id = ?
                `,
                [
                    newStock,
                    id
                ]
            );

            await conn.query(
                `
                INSERT INTO stock_movements
                (
                    ingredient_id,
                    movement_type,
                    quantity,
                    stock_after,
                    reference_type,
                    reference_id,
                    notes
                )
                VALUES (
                    ?,
                    'adjustment',
                    ?,
                    ?,
                    'manual',
                    ?,
                    ?
                )
                `,
                [
                    id,
                    quantity,
                    newStock,
                    id,
                    String(
                        req.body.notes ||
                        "Penyesuaian stok"
                    )
                ]
            );

            await conn.commit();

            res.json({
                ok: true,

                stock:
                    newStock
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(error);

            res.status(500).json({
                error:
                    error.message ||
                    "Gagal mengubah stok."
            });

        } finally {
            conn.release();
        }
    }
);

// ======================================================
// PURCHASES
// ======================================================

app.get(
    "/api/admin/purchases",
    auth,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        p.*,
                        s.name AS supplier_name
                    FROM purchases p
                    LEFT JOIN suppliers s
                        ON s.id = p.supplier_id
                    ORDER BY p.id DESC
                    `
                );

            for (
                const purchase
                of rows
            ) {

                const [items] =
                    await pool.query(
                        `
                        SELECT
                            pi.*,
                            i.name AS ingredient_name,
                            i.unit
                        FROM purchase_items pi
                        LEFT JOIN ingredients i
                            ON i.id = pi.ingredient_id
                        WHERE
                            pi.purchase_id = ?
                        ORDER BY pi.id
                        `,
                        [
                            purchase.id
                        ]
                    );

                purchase.items =
                    items;
            }

            res.json(rows);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil pembelian."
            });
        }
    }
);

// ======================================================
// CREATE PURCHASE
// ======================================================

app.post(
    "/api/admin/purchases",
    auth,
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const {
                supplier_id,
                purchase_date,
                invoice_number,
                notes,
                items
            } = req.body;

            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {
                return res.status(400).json({
                    error:
                        "Item pembelian kosong."
                });
            }

            await conn.beginTransaction();

            const cleanItems = [];

            let subtotal = 0;

            for (
                const item
                of items
            ) {

                const ingredientId =
                    Number(
                        item.ingredient_id
                    );

                const quantity =
                    Number(
                        item.quantity
                    );

                const unitCost =
                    Number(
                        item.unit_cost
                    );

                if (
                    !Number.isInteger(
                        ingredientId
                    ) ||
                    quantity <= 0 ||
                    unitCost < 0
                ) {
                    continue;
                }

                const totalCost =
                    quantity *
                    unitCost;

                subtotal +=
                    totalCost;

                cleanItems.push({
                    ingredientId,
                    quantity,
                    unitCost,
                    totalCost
                });
            }

            if (
                cleanItems.length === 0
            ) {
                throw new Error(
                    "Item pembelian tidak valid."
                );
            }

            const [purchaseResult] =
                await conn.query(
                    `
                    INSERT INTO purchases
                    (
                        supplier_id,
                        purchase_date,
                        invoice_number,
                        subtotal,
                        notes,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, 'completed')
                    `,
                    [
                        supplier_id
                            ? Number(
                                supplier_id
                            )
                            : null,

                        purchase_date ||
                            new Date(),

                        invoice_number
                            ? String(
                                invoice_number
                            ).trim()
                            : null,

                        subtotal,

                        String(
                            notes || ""
                        ).trim()
                    ]
                );

            const purchaseId =
                purchaseResult.insertId;

            for (
                const item
                of cleanItems
            ) {

                const [rows] =
                    await conn.query(
                        `
                        SELECT
                            current_stock,
                            average_cost
                        FROM ingredients
                        WHERE id = ?
                        FOR UPDATE
                        `,
                        [
                            item.ingredientId
                        ]
                    );

                if (
                    rows.length === 0
                ) {
                    throw new Error(
                        "Bahan pembelian tidak ditemukan."
                    );
                }

                const oldStock =
                    Number(
                        rows[0]
                            .current_stock
                    );

                const oldCost =
                    Number(
                        rows[0]
                            .average_cost
                    );

                const newStock =
                    oldStock +
                    item.quantity;

                let newCost =
                    item.unitCost;

                if (
                    newStock > 0
                ) {
                    newCost =
                        (
                            (
                                oldStock *
                                oldCost
                            ) +
                            (
                                item.quantity *
                                item.unitCost
                            )
                        ) /
                        newStock;
                }

                await conn.query(
                    `
                    INSERT INTO purchase_items
                    (
                        purchase_id,
                        ingredient_id,
                        quantity,
                        unit_cost,
                        total_cost
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        purchaseId,
                        item.ingredientId,
                        item.quantity,
                        item.unitCost,
                        item.totalCost
                    ]
                );

                await conn.query(
                    `
                    UPDATE ingredients
                    SET
                        current_stock = ?,
                        average_cost = ?
                    WHERE id = ?
                    `,
                    [
                        newStock,
                        newCost,
                        item.ingredientId
                    ]
                );

                await conn.query(
                    `
                    INSERT INTO stock_movements
                    (
                        ingredient_id,
                        movement_type,
                        quantity,
                        stock_after,
                        reference_type,
                        reference_id,
                        notes
                    )
                    VALUES (
                        ?,
                        'purchase',
                        ?,
                        ?,
                        'purchase',
                        ?,
                        'Pembelian bahan'
                    )
                    `,
                    [
                        item.ingredientId,
                        item.quantity,
                        newStock,
                        purchaseId
                    ]
                );
            }

            await conn.commit();

            res.json({
                ok: true,

                purchase_id:
                    purchaseId,

                subtotal:
                    subtotal
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(error);

            res.status(500).json({
                error:
                    error.message ||
                    "Gagal menyimpan pembelian."
            });

        } finally {
            conn.release();
        }
    }
);

// ======================================================
// RECIPES
// ======================================================

app.get(
    "/api/admin/recipes",
    auth,
    async (req, res) => {

        try {

            const [recipes] =
                await pool.query(
                    `
                    SELECT
                        r.*,
                        m.name AS menu_name,
                        m.price
                    FROM recipes r
                    LEFT JOIN menu m
                        ON m.id = r.menu_id
                    ORDER BY m.name ASC
                    `
                );

            for (
                const recipe
                of recipes
            ) {

                const [items] =
                    await pool.query(
                        `
                        SELECT
                            ri.id,
                            ri.ingredient_id,
                            ri.quantity,
                            i.name AS ingredient_name,
                            i.unit,
                            i.average_cost
                        FROM recipe_items ri
                        LEFT JOIN ingredients i
                            ON i.id =
                            ri.ingredient_id
                        WHERE
                            ri.recipe_id = ?
                        ORDER BY ri.id ASC
                        `,
                        [
                            recipe.id
                        ]
                    );

                recipe.items =
                    items;

                recipe.hpp =
                    items.reduce(
                        function (
                            total,
                            item
                        ) {
                            return (
                                total +
                                (
                                    Number(
                                        item.quantity
                                    ) *
                                    Number(
                                        item.average_cost
                                    )
                                )
                            );
                        },
                        0
                    );
            }

            res.json(recipes);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil resep."
            });
        }
    }
);

// ======================================================
// SAVE RECIPE
// ======================================================

app.post(
    "/api/admin/recipes",
    auth,
    async (req, res) => {

        const conn =
            await pool.getConnection();

        try {

            const menuId =
                Number(
                    req.body.menu_id
                );

            const notes =
                String(
                    req.body.notes || ""
                ).trim();

            const items =
                Array.isArray(
                    req.body.items
                )
                    ? req.body.items
                    : [];

            if (
                !Number.isInteger(
                    menuId
                ) ||
                items.length === 0
            ) {
                return res.status(400).json({
                    error:
                        "Data resep tidak valid."
                });
            }

            await conn.beginTransaction();

            const [menuRows] =
                await conn.query(
                    `
                    SELECT id
                    FROM menu
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        menuId
                    ]
                );

            if (
                menuRows.length === 0
            ) {
                throw new Error(
                    "Menu tidak ditemukan."
                );
            }

            let recipeId;

            const [recipeRows] =
                await conn.query(
                    `
                    SELECT id
                    FROM recipes
                    WHERE menu_id = ?
                    LIMIT 1
                    `,
                    [
                        menuId
                    ]
                );

            if (
                recipeRows.length > 0
            ) {

                recipeId =
                    recipeRows[0].id;

                await conn.query(
                    `
                    UPDATE recipes
                    SET
                        notes = ?,
                        is_active = 1
                    WHERE id = ?
                    `,
                    [
                        notes,
                        recipeId
                    ]
                );

                await conn.query(
                    `
                    DELETE FROM recipe_items
                    WHERE recipe_id = ?
                    `,
                    [
                        recipeId
                    ]
                );

            } else {

                const [result] =
                    await conn.query(
                        `
                        INSERT INTO recipes
                        (
                            menu_id,
                            notes,
                            is_active
                        )
                        VALUES (?, ?, 1)
                        `,
                        [
                            menuId,
                            notes
                        ]
                    );

                recipeId =
                    result.insertId;
            }

            for (
                const item
                of items
            ) {

                const ingredientId =
                    Number(
                        item.ingredient_id
                    );

                const quantity =
                    Number(
                        item.quantity
                    );

                if (
                    !Number.isInteger(
                        ingredientId
                    ) ||
                    quantity <= 0
                ) {
                    continue;
                }

                await conn.query(
                    `
                    INSERT INTO recipe_items
                    (
                        recipe_id,
                        ingredient_id,
                        quantity
                    )
                    VALUES (?, ?, ?)
                    `,
                    [
                        recipeId,
                        ingredientId,
                        quantity
                    ]
                );
            }

            await conn.commit();

            res.json({
                ok: true,

                recipe_id:
                    recipeId
            });

        } catch (error) {

            try {
                await conn.rollback();
            } catch (_) {}

            console.error(error);

            res.status(500).json({
                error:
                    error.message ||
                    "Gagal menyimpan resep."
            });

        } finally {
            conn.release();
        }
    }
);

// ======================================================
// DELETE RECIPE
// ======================================================

app.delete(
    "/api/admin/recipes/:id",
    auth,
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM recipes
                WHERE id = ?
                `,
                [
                    Number(
                        req.params.id
                    )
                ]
            );

            res.json({
                ok: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menghapus resep."
            });
        }
    }
);

// ======================================================
// STOCK MOVEMENTS
// ======================================================

app.get(
    "/api/admin/stock-movements",
    auth,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT
                        sm.*,
                        i.name AS ingredient_name,
                        i.unit
                    FROM stock_movements sm
                    LEFT JOIN ingredients i
                        ON i.id =
                        sm.ingredient_id
                    ORDER BY
                        sm.id DESC
                    LIMIT 200
                    `
                );

            res.json(rows);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil riwayat stok."
            });
        }
    }
);

// ======================================================
// LOW STOCK
// ======================================================

app.get(
    "/api/admin/low-stock",
    auth,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM ingredients
                    WHERE
                        is_active = 1
                    AND
                        current_stock <= minimum_stock
                    ORDER BY
                        current_stock ASC
                    `
                );

            res.json(rows);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil stok menipis."
            });
        }
    }
);

// ======================================================
// HPP
// ======================================================

app.get(
    "/api/admin/hpp",
    auth,
    async (req, res) => {

        try {

            const [menus] =
                await pool.query(
                    `
                    SELECT
                        id,
                        name,
                        category,
                        price
                    FROM menu
                    ORDER BY name ASC
                    `
                );

            const result = [];

            for (
                const menu
                of menus
            ) {

                const [rows] =
                    await pool.query(
                        `
                        SELECT
                            COALESCE(
                                SUM(
                                    ri.quantity *
                                    i.average_cost
                                ),
                                0
                            ) AS hpp
                        FROM recipes r
                        LEFT JOIN recipe_items ri
                            ON ri.recipe_id = r.id
                        LEFT JOIN ingredients i
                            ON i.id =
                            ri.ingredient_id
                        WHERE
                            r.menu_id = ?
                        AND
                            r.is_active = 1
                        `,
                        [
                            menu.id
                        ]
                    );

                const hpp =
                    Number(
                        rows[0].hpp || 0
                    );

                const price =
                    Number(
                        menu.price || 0
                    );

                result.push({
                    menu_id:
                        menu.id,

                    name:
                        menu.name,

                    category:
                        menu.category,

                    price:
                        price,

                    hpp:
                        hpp,

                    gross_profit:
                        price - hpp,

                    margin_percent:
                        price > 0
                            ? (
                                (
                                    price -
                                    hpp
                                ) /
                                price
                            ) * 100
                            : 0
                });
            }

            res.json(result);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menghitung HPP."
            });
        }
    }
);

// ======================================================
// EXPENSES
// ======================================================

app.get(
    "/api/admin/expenses",
    auth,
    async (req, res) => {

        try {

            const [rows] =
                await pool.query(
                    `
                    SELECT *
                    FROM operational_expenses
                    ORDER BY
                        expense_date DESC,
                        id DESC
                    `
                );

            res.json(rows);

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil biaya."
            });
        }
    }
);

app.post(
    "/api/admin/expenses",
    auth,
    async (req, res) => {

        try {

            const {
                expense_date,
                category,
                description,
                amount,
                notes
            } = req.body;

            const nominal =
                Number(
                    amount
                );

            if (
                !String(
                    category || ""
                ).trim() ||
                !Number.isFinite(
                    nominal
                ) ||
                nominal <= 0
            ) {
                return res.status(400).json({
                    error:
                        "Data biaya tidak valid."
                });
            }

            const [result] =
                await pool.query(
                    `
                    INSERT INTO operational_expenses
                    (
                        expense_date,
                        category,
                        description,
                        amount,
                        notes
                    )
                    VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        expense_date ||
                            new Date(),

                        String(
                            category
                        ).trim(),

                        String(
                            description || ""
                        ).trim(),

                        nominal,

                        String(
                            notes || ""
                        ).trim()
                    ]
                );

            res.json({
                ok: true,

                id:
                    result.insertId
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menambahkan biaya."
            });
        }
    }
);

app.delete(
    "/api/admin/expenses/:id",
    auth,
    async (req, res) => {

        try {

            await pool.query(
                `
                DELETE FROM operational_expenses
                WHERE id = ?
                `,
                [
                    Number(
                        req.params.id
                    )
                ]
            );

            res.json({
                ok: true
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal menghapus biaya."
            });
        }
    }
);

// ======================================================
// DASHBOARD
// ======================================================

app.get(
    "/api/admin/dashboard",
    auth,
    async (req, res) => {

        try {

            const [[sales]] =
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

            const [[hpp]] =
                await pool.query(
                    `
                    SELECT
                        COALESCE(
                            SUM(oi.hpp),
                            0
                        ) AS total
                    FROM order_items oi
                    JOIN orders o
                        ON o.id =
                        oi.order_id
                    WHERE
                        DATE(o.created_at) =
                        CURDATE()
                    AND
                        o.status != 'dibatalkan'
                    `
                );

            const [[expense]] =
                await pool.query(
                    `
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        ) AS total
                    FROM operational_expenses
                    WHERE
                        DATE(expense_date) =
                        CURDATE()
                    `
                );

            const revenue =
                Number(
                    sales.revenue || 0
                );

            const paid =
                Number(
                    sales.paid || 0
                );

            const totalHpp =
                Number(
                    hpp.total || 0
                );

            const expenses =
                Number(
                    expense.total || 0
                );

            res.json({
                orders:
                    Number(
                        sales.orders || 0
                    ),

                revenue,

                paid,

                hpp:
                    totalHpp,

                gross_profit:
                    revenue -
                    totalHpp,

                expenses,

                net_profit:
                    revenue -
                    totalHpp -
                    expenses
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil dashboard."
            });
        }
    }
);

// ======================================================
// REPORT
// ======================================================

app.get(
    "/api/admin/report",
    auth,
    async (req, res) => {

        try {

            const [[sales]] =
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

            const [[hpp]] =
                await pool.query(
                    `
                    SELECT
                        COALESCE(
                            SUM(oi.hpp),
                            0
                        ) AS total
                    FROM order_items oi
                    JOIN orders o
                        ON o.id =
                        oi.order_id
                    WHERE
                        DATE(o.created_at) =
                        CURDATE()
                    AND
                        o.status != 'dibatalkan'
                    `
                );

            const [[expense]] =
                await pool.query(
                    `
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        ) AS total
                    FROM operational_expenses
                    WHERE
                        DATE(expense_date) =
                        CURDATE()
                    `
                );

            const [top] =
                await pool.query(
                    `
                    SELECT
                        oi.menu_name,
                        SUM(oi.qty) AS qty,
                        SUM(oi.subtotal) AS revenue,
                        SUM(oi.hpp) AS hpp
                    FROM order_items oi
                    JOIN orders o
                        ON o.id =
                        oi.order_id
                    WHERE
                        DATE(o.created_at) =
                        CURDATE()
                    AND
                        o.status != 'dibatalkan'
                    GROUP BY
                        oi.menu_id,
                        oi.menu_name
                    ORDER BY
                        qty DESC
                    LIMIT 10
                    `
                );

            const revenue =
                Number(
                    sales.revenue || 0
                );

            const paid =
                Number(
                    sales.paid || 0
                );

            const totalHpp =
                Number(
                    hpp.total || 0
                );

            const expenses =
                Number(
                    expense.total || 0
                );

            res.json({
                orders:
                    Number(
                        sales.orders || 0
                    ),

                revenue,

                paid,

                hpp:
                    totalHpp,

                gross_profit:
                    revenue -
                    totalHpp,

                expenses,

                net_profit:
                    revenue -
                    totalHpp -
                    expenses,

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

// ======================================================
// KASIR PAGE
// ======================================================

app.get(
    "/kasir",
    function (req, res) {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "kasir.html"
            )
        );
    }
);

// ======================================================
// HEALTH
// ======================================================

app.get(
    "/api/health",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT 1"
            );

            res.json({
                ok: true,
                database: "connected"
            });

        } catch (error) {

            res.status(500).json({
                ok: false,
                database: "disconnected"
            });
        }
    }
);

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            error instanceof
            multer.MulterError
        ) {

            return res.status(400).json({
                error:
                    "Upload gambar gagal."
            });
        }

        res.status(500).json({
            error:
                error.message ||
                "Terjadi kesalahan server."
        });
    }
);

// ======================================================
// START
// ======================================================

async function start() {

    const ready =
        await setupDatabase();

    if (!ready) {

        console.error(
            "Server dihentikan karena database gagal."
        );

        process.exit(1);
    }

    app.listen(
        PORT,
        "0.0.0.0",
        function () {

            console.log("");
            console.log(
                "===================================="
            );
            console.log(
                "      QURES RIVERSIDE"
            );
            console.log(
                "===================================="
            );
            console.log(
                `Server berjalan di port ${PORT}`
            );
            console.log(
                "Inventory : ON"
            );
            console.log(
                "Recipe    : ON"
            );
            console.log(
                "HPP       : ON"
            );
            console.log(
                "===================================="
            );
        }
    );
}

start();