require("dotenv").config();

const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set("trust proxy", 1);

// ======================================================
// POSTGRESQL / NEON
// ======================================================

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL belum diset.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on("error", (error) => {
    console.error("❌ PostgreSQL pool error:", error);
});

// ======================================================
// SESSION
// ======================================================

const PgStore = connectPgSimple(session);

const sessionStore = new PgStore({
    pool,
    createTableIfMissing: true,
    tableName: "user_sessions"
});

app.use(
    session({
        store: sessionStore,
        secret:
            process.env.SESSION_SECRET ||
            "CHANGE_THIS_SESSION_SECRET",
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
// BASIC CONFIG
// ======================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "10mb"
}));

// ======================================================
// UPLOAD
// ======================================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true
    });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const ext =
            path.extname(file.originalname).toLowerCase();

        const name =
            Date.now() +
            "-" +
            Math.floor(Math.random() * 1000000000) +
            ext;

        cb(null, name);
    }
});

const upload = multer({
    storage,
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
// STATIC
// ======================================================

app.use(express.static(path.join(__dirname, "public")));
app.use(
    "/uploads",
    express.static(uploadDir)
);

// ======================================================
// DATABASE HELPERS
// ======================================================

async function query(text, params = []) {
    const result = await pool.query(text, params);
    return result.rows;
}

async function execute(text, params = []) {
    return pool.query(text, params);
}

async function transaction(callback) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await callback(client);

        await client.query("COMMIT");

        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (_) {}

        throw error;
    } finally {
        client.release();
    }
}

// ======================================================
// AUTH
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
        await query("SELECT 1");

        console.log(
            "✅ PostgreSQL / Neon berhasil terhubung."
        );

        const admins = await query(`
            SELECT id
            FROM admins
            LIMIT 1
        `);

        if (admins.length === 0) {
            const username =
                process.env.ADMIN_USERNAME || "admin";

            const password =
                process.env.ADMIN_PASSWORD || "admin123";

            const hash =
                await bcrypt.hash(password, 10);

            await query(
                `
                INSERT INTO admins
                (
                    username,
                    password_hash
                )
                VALUES
                ($1, $2)
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
            "✅ Database Qures Riverside siap."
        );

        return true;
    } catch (error) {
        console.error(
            "❌ DATABASE SETUP ERROR:"
        );

        console.error(error);

        return false;
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

            if (!username || !password) {
                return res.status(400).json({
                    error:
                        "Username dan password wajib diisi."
                });
            }

            const rows = await query(
                `
                SELECT
                    id,
                    username,
                    password_hash
                FROM admins
                WHERE username = $1
                LIMIT 1
                `,
                [username]
            );

            if (rows.length === 0) {
                return res.status(401).json({
                    error:
                        "Username atau password salah."
                });
            }

            const admin = rows[0];

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
                username: admin.username
            });
        } catch (error) {
            console.error(
                "LOGIN ERROR:",
                error
            );

            res.status(500).json({
                error: "Login gagal."
            });
        }
    }
);

// ======================================================
// ME
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
            function (error) {
                if (error) {
                    console.error(
                        "LOGOUT ERROR:",
                        error
                    );

                    return res.status(500).json({
                        error:
                            "Logout gagal."
                    });
                }

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
            console.error(
                "UPLOAD ERROR:",
                error
            );

            res.status(500).json({
                error:
                    "Upload gagal."
            });
        }
    }
);

// ======================================================
// CUSTOMER MENU
// ======================================================

app.get(
    "/api/menu",
    async (req, res) => {
        try {
            const rows = await query(`
                SELECT
                    id,
                    name,
                    category,
                    price,
                    stock,
                    description,
                    image_url
                FROM menu
                WHERE active = TRUE
                ORDER BY id ASC
            `);

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
        try {
            const result =
                await transaction(
                    async (conn) => {
                        const customerName =
                            String(
                                req.body.customer_name ||
                                ""
                            ).trim();

                        const tableNumber =
                            String(
                                req.body.table_number ||
                                ""
                            ).trim();

                        const items =
                            Array.isArray(
                                req.body.items
                            )
                                ? req.body.items
                                : [];

                        if (!customerName) {
                            throw new Error(
                                "Nama pelanggan wajib diisi."
                            );
                        }

                        if (items.length === 0) {
                            throw new Error(
                                "Pesanan kosong."
                            );
                        }

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
                                (cart[menuId] || 0) +
                                qty;
                        }

                        const menuIds =
                            Object.keys(
                                cart
                            ).map(Number);

                        if (
                            menuIds.length === 0
                        ) {
                            throw new Error(
                                "Item pesanan tidak valid."
                            );
                        }

                        const finalItems = [];

                        for (
                            const menuId
                            of menuIds
                        ) {
                            const qty =
                                cart[menuId];

                            const menuRows =
                                await conn.query(
                                    `
                                    SELECT
                                        id,
                                        name,
                                        price,
                                        stock,
                                        active
                                    FROM menu
                                    WHERE id = $1
                                    FOR UPDATE
                                    `,
                                    [menuId]
                                );

                            if (
                                menuRows.rows
                                    .length === 0
                            ) {
                                throw new Error(
                                    "Menu tidak ditemukan."
                                );
                            }

                            const menu =
                                menuRows.rows[0];

                            if (
                                menu.active !== true
                            ) {
                                throw new Error(
                                    `Menu ${menu.name} sedang tidak tersedia.`
                                );
                            }

                            if (
                                Number(
                                    menu.stock
                                ) < qty
                            ) {
                                throw new Error(
                                    `Stok ${menu.name} tidak mencukupi.`
                                );
                            }

                            finalItems.push({
                                id: menu.id,
                                name: menu.name,
                                price:
                                    Number(
                                        menu.price
                                    ),
                                qty,

                                subtotal:
                                    Number(
                                        menu.price
                                    ) * qty
                            });
                        }

                        // HPP + BAHAN
                        for (
                            const item
                            of finalItems
                        ) {
                            item.unit_hpp = 0;
                            item.hpp = 0;
                            item.recipe_items = [];

                            const recipeRows =
                                await conn.query(
                                    `
                                    SELECT id
                                    FROM recipes
                                    WHERE menu_id = $1
                                    AND is_active = TRUE
                                    LIMIT 1
                                    `,
                                    [item.id]
                                );

                            if (
                                recipeRows.rows
                                    .length === 0
                            ) {
                                continue;
                            }

                            const recipeId =
                                recipeRows.rows[0]
                                    .id;

                            const recipeItems =
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
                                        ON i.id =
                                           ri.ingredient_id
                                    WHERE ri.recipe_id = $1
                                    AND i.is_active = TRUE
                                    ORDER BY
                                        ri.ingredient_id
                                    `,
                                    [recipeId]
                                );

                            if (
                                recipeItems.rows
                                    .length === 0
                            ) {
                                throw new Error(
                                    `Resep ${item.name} belum memiliki bahan.`
                                );
                            }

                            for (
                                const recipeItem
                                of recipeItems.rows
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
                                    stock < needed
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
                                    ) * cost;

                                item.recipe_items.push({
                                    ingredient_id:
                                        Number(
                                            recipeItem
                                                .ingredient_id
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

                        const total =
                            finalItems.reduce(
                                (
                                    sum,
                                    item
                                ) =>
                                    sum +
                                    item.subtotal,
                                0
                            );

                        const orderResult =
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
                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3,
                                    'baru',
                                    'belum_bayar'
                                )
                                RETURNING id
                                `,
                                [
                                    customerName,
                                    tableNumber ||
                                        null,
                                    total
                                ]
                            );

                        const orderId =
                            orderResult.rows[0]
                                .id;

                        for (
                            const item
                            of finalItems
                        ) {
                            const itemResult =
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
                                    VALUES
                                    (
                                        $1,
                                        $2,
                                        $3,
                                        $4,
                                        $5,
                                        $6,
                                        $7,
                                        $8
                                    )
                                    RETURNING id
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
                                itemResult.rows[0]
                                    .id;

                            for (
                                const used
                                of item.recipe_items
                            ) {
                                await conn.query(
                                    `
                                    INSERT INTO
                                        order_item_ingredients
                                    (
                                        order_item_id,
                                        ingredient_id,
                                        quantity,
                                        unit_cost,
                                        total_cost
                                    )
                                    VALUES
                                    (
                                        $1,
                                        $2,
                                        $3,
                                        $4,
                                        $5
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

                                const ingredientResult =
                                    await conn.query(
                                        `
                                        SELECT
                                            current_stock
                                        FROM ingredients
                                        WHERE id = $1
                                        FOR UPDATE
                                        `,
                                        [
                                            used.ingredient_id
                                        ]
                                    );

                                if (
                                    ingredientResult
                                        .rows.length === 0
                                ) {
                                    throw new Error(
                                        "Bahan baku tidak ditemukan."
                                    );
                                }

                                const oldStock =
                                    Number(
                                        ingredientResult
                                            .rows[0]
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
                                    SET current_stock = $1
                                    WHERE id = $2
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
                                    VALUES
                                    (
                                        $1,
                                        'sale',
                                        $2,
                                        $3,
                                        'order',
                                        $4,
                                        $5
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

                            await conn.query(
                                `
                                UPDATE menu
                                SET stock =
                                    stock - $1
                                WHERE id = $2
                                `,
                                [
                                    item.qty,
                                    item.id
                                ]
                            );
                        }

                        return {
                            total,

                            hpp:
                                finalItems.reduce(
                                    (
                                        sum,
                                        item
                                    ) =>
                                        sum +
                                        item.hpp,
                                    0
                                )
                        };
                    }
                );

            res.json({
                ok: true,
                total: result.total,
                hpp: result.hpp
            });
        } catch (error) {
            console.error(
                "CREATE ORDER ERROR:",
                error
            );

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal membuat pesanan."
            });
        }
    }
);

// ======================================================
// GET ORDERS
// ======================================================

app.get(
    "/api/orders",
    auth,
    async (req, res) => {
        try {
            const orders =
                await query(`
                    SELECT *
                    FROM orders
                    ORDER BY id DESC
                `);

            const items =
                await query(`
                    SELECT *
                    FROM order_items
                    ORDER BY id ASC
                `);

            const itemMap = {};

            for (
                const item
                of items
            ) {
                if (!itemMap[item.order_id]) {
                    itemMap[item.order_id] = [];
                }

                itemMap[item.order_id]
                    .push(item);
            }

            const result =
                orders.map(
                    (order) => ({
                        ...order,

                        items:
                            itemMap[
                                order.id
                            ] || []
                    })
                );

            res.json(result);
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil pesanan."
            });
        }
    }
);

// ======================================================
// CANCEL ORDER INVENTORY
// ======================================================

async function cancelOrderInventory(
    conn,
    orderId
) {
    const orderItems =
        await conn.query(
            `
            SELECT
                id,
                menu_id,
                qty
            FROM order_items
            WHERE order_id = $1
            `,
            [orderId]
        );

    for (
        const item
        of orderItems.rows
    ) {
        await conn.query(
            `
            UPDATE menu
            SET stock =
                stock + $1
            WHERE id = $2
            `,
            [
                Number(item.qty),
                item.menu_id
            ]
        );

        const usedItems =
            await conn.query(
                `
                SELECT
                    ingredient_id,
                    quantity
                FROM order_item_ingredients
                WHERE order_item_id = $1
                `,
                [item.id]
            );

        for (
            const used
            of usedItems.rows
        ) {
            const ingredient =
                await conn.query(
                    `
                    SELECT
                        current_stock
                    FROM ingredients
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [used.ingredient_id]
                );

            if (
                ingredient.rows.length === 0
            ) {
                continue;
            }

            const oldStock =
                Number(
                    ingredient.rows[0]
                        .current_stock
                );

            const newStock =
                oldStock +
                Number(
                    used.quantity
                );

            await conn.query(
                `
                UPDATE ingredients
                SET current_stock = $1
                WHERE id = $2
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
                VALUES
                (
                    $1,
                    'sale_reversal',
                    $2,
                    $3,
                    'order',
                    $4,
                    $5
                )
                `,
                [
                    used.ingredient_id,
                    Number(
                        used.quantity
                    ),
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
        try {
            const orderId =
                Number(req.params.id);

            if (
                !Number.isInteger(
                    orderId
                )
            ) {
                return res.status(400).json({
                    error:
                        "ID pesanan tidak valid."
                });
            }

            const {
                status,
                payment_status
            } = req.body;

            await transaction(
                async (conn) => {
                    const rows =
                        await conn.query(
                            `
                            SELECT *
                            FROM orders
                            WHERE id = $1
                            FOR UPDATE
                            `,
                            [orderId]
                        );

                    if (
                        rows.rows.length === 0
                    ) {
                        throw new Error(
                            "Pesanan tidak ditemukan."
                        );
                    }

                    const oldStatus =
                        rows.rows[0]
                            .status;

                    if (
                        status ===
                            "dibatalkan" &&
                        oldStatus !==
                            "dibatalkan"
                    ) {
                        await cancelOrderInventory(
                            conn,
                            orderId
                        );
                    }

                    const newStatus =
                        status !== undefined
                            ? status
                            : oldStatus;

                    const newPayment =
                        payment_status !==
                        undefined
                            ? payment_status
                            : rows.rows[0]
                                  .payment_status;

                    await conn.query(
                        `
                        UPDATE orders
                        SET
                            status = $1,
                            payment_status = $2
                        WHERE id = $3
                        `,
                        [
                            newStatus,
                            newPayment,
                            orderId
                        ]
                    );
                }
            );

            res.json({
                ok: true
            });
        } catch (error) {
            console.error(error);

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal memperbarui pesanan."
            });
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
        try {
            const orderId =
                Number(req.params.id);

            if (
                !Number.isInteger(
                    orderId
                )
            ) {
                return res.status(400).json({
                    error:
                        "ID pesanan tidak valid."
                });
            }

            await transaction(
                async (conn) => {
                    const rows =
                        await conn.query(
                            `
                            SELECT status
                            FROM orders
                            WHERE id = $1
                            FOR UPDATE
                            `,
                            [orderId]
                        );

                    if (
                        rows.rows.length === 0
                    ) {
                        throw new Error(
                            "Pesanan tidak ditemukan."
                        );
                    }

                    if (
                        rows.rows[0].status !==
                        "dibatalkan"
                    ) {
                        await cancelOrderInventory(
                            conn,
                            orderId
                        );
                    }

                    await conn.query(
                        `
                        DELETE FROM
                            order_item_ingredients
                        WHERE order_item_id IN
                        (
                            SELECT id
                            FROM order_items
                            WHERE order_id = $1
                        )
                        `,
                        [orderId]
                    );

                    await conn.query(
                        `
                        DELETE FROM order_items
                        WHERE order_id = $1
                        `,
                        [orderId]
                    );

                    await conn.query(
                        `
                        DELETE FROM orders
                        WHERE id = $1
                        `,
                        [orderId]
                    );
                }
            );

            res.json({
                ok: true
            });
        } catch (error) {
            console.error(error);

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal menghapus pesanan."
            });
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
            const rows =
                await query(`
                    SELECT *
                    FROM menu
                    ORDER BY id ASC
                `);

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

            const menuName =
                String(name || "").trim();

            const menuPrice =
                Number(price);

            const menuStock =
                Number(stock || 0);

            if (
                !menuName ||
                !Number.isFinite(
                    menuPrice
                )
            ) {
                return res.status(400).json({
                    error:
                        "Data menu tidak valid."
                });
            }

            const result =
                await execute(
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
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        TRUE
                    )
                    RETURNING id
                    `,
                    [
                        menuName,
                        String(
                            category || ""
                        ).trim(),
                        menuPrice,
                        Number.isFinite(
                            menuStock
                        )
                            ? menuStock
                            : 0,
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
                    result.rows[0].id
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

            await execute(
                `
                UPDATE menu
                SET
                    name = $1,
                    category = $2,
                    price = $3,
                    stock = $4,
                    description = $5,
                    image_url = $6,
                    active = $7
                WHERE id = $8
                `,
                [
                    String(
                        name || ""
                    ).trim(),

                    String(
                        category || ""
                    ).trim(),

                    Number(price) || 0,

                    Number(stock) || 0,

                    String(
                        description || ""
                    ).trim(),

                    String(
                        image_url || ""
                    ).trim(),

                    !(
                        active === false ||
                        active === 0
                    ),

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

app.delete(
    "/api/admin/menu/:id",
    auth,
    async (req, res) => {
        try {
            await execute(
                `
                UPDATE menu
                SET active = FALSE
                WHERE id = $1
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
                    "Gagal menghapus menu."
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
            const rows =
                await query(`
                    SELECT *
                    FROM suppliers
                    ORDER BY name ASC
                `);

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
                !String(
                    name || ""
                ).trim()
            ) {
                return res.status(400).json({
                    error:
                        "Nama supplier wajib diisi."
                });
            }

            const result =
                await execute(
                    `
                    INSERT INTO suppliers
                    (
                        name,
                        contact,
                        address,
                        notes,
                        payment_terms
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )
                    RETURNING id
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
                    result.rows[0].id
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
                Number(req.params.id);

            const {
                name,
                contact,
                address,
                notes,
                payment_terms,
                is_active
            } = req.body;

            await execute(
                `
                UPDATE suppliers
                SET
                    name = $1,
                    contact = $2,
                    address = $3,
                    notes = $4,
                    payment_terms = $5,
                    is_active = $6
                WHERE id = $7
                `,
                [
                    String(
                        name || ""
                    ).trim(),

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

                    is_active !== false,

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
            const rows =
                await query(`
                    SELECT
                        *,
                        CASE
                            WHEN current_stock <= minimum_stock
                            THEN TRUE
                            ELSE FALSE
                        END AS low_stock
                    FROM ingredients
                    ORDER BY name ASC
                `);

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

app.post(
    "/api/admin/ingredients",
    auth,
    async (req, res) => {
        try {
            const result =
                await transaction(
                    async (conn) => {
                        const name =
                            String(
                                req.body.name ||
                                ""
                            ).trim();

                        const unit =
                            String(
                                req.body.unit ||
                                ""
                            ).trim();

                        const stock =
                            Number(
                                req.body.current_stock ||
                                0
                            );

                        const minimumStock =
                            Number(
                                req.body.minimum_stock ||
                                0
                            );

                        const averageCost =
                            Number(
                                req.body.average_cost ||
                                0
                            );

                        const notes =
                            String(
                                req.body.notes ||
                                ""
                            ).trim();

                        if (
                            !name ||
                            !unit
                        ) {
                            throw new Error(
                                "Nama dan satuan bahan wajib diisi."
                            );
                        }

                        if (
                            !Number.isFinite(
                                stock
                            ) ||
                            !Number.isFinite(
                                minimumStock
                            ) ||
                            !Number.isFinite(
                                averageCost
                            )
                        ) {
                            throw new Error(
                                "Data bahan tidak valid."
                            );
                        }

                        if (stock < 0) {
                            throw new Error(
                                "Stok tidak boleh negatif."
                            );
                        }

                        const inserted =
                            await conn.query(
                                `
                                INSERT INTO ingredients
                                (
                                    name,
                                    unit,
                                    current_stock,
                                    minimum_stock,
                                    average_cost,
                                    notes,
                                    is_active
                                )
                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3,
                                    $4,
                                    $5,
                                    $6,
                                    TRUE
                                )
                                RETURNING id
                                `,
                                [
                                    name,
                                    unit,
                                    stock,
                                    minimumStock,
                                    averageCost,
                                    notes
                                ]
                            );

                        const id =
                            inserted.rows[0]
                                .id;

                        if (stock !== 0) {
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
                                VALUES
                                (
                                    $1,
                                    'opening',
                                    $2,
                                    $3,
                                    'ingredient',
                                    $4,
                                    $5
                                )
                                `,
                                [
                                    id,
                                    stock,
                                    stock,
                                    id,
                                    "Stok awal"
                                ]
                            );
                        }

                        return id;
                    }
                );

            res.json({
                ok: true,
                id: result
            });
        } catch (error) {
            console.error(error);

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal menambahkan bahan."
            });
        }
    }
);

app.put(
    "/api/admin/ingredients/:id",
    auth,
    async (req, res) => {
        try {
            const id =
                Number(req.params.id);

            const {
                name,
                unit,
                minimum_stock,
                average_cost,
                notes,
                is_active
            } = req.body;

            await execute(
                `
                UPDATE ingredients
                SET
                    name = $1,
                    unit = $2,
                    minimum_stock = $3,
                    average_cost = $4,
                    notes = $5,
                    is_active = $6
                WHERE id = $7
                `,
                [
                    String(
                        name || ""
                    ).trim(),

                    String(
                        unit || ""
                    ).trim(),

                    Number(
                        minimum_stock || 0
                    ),

                    Number(
                        average_cost || 0
                    ),

                    String(
                        notes || ""
                    ).trim(),

                    is_active !== false,

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

app.post(
    "/api/admin/ingredients/:id/adjust",
    auth,
    async (req, res) => {
        try {
            const result =
                await transaction(
                    async (conn) => {
                        const id =
                            Number(
                                req.params.id
                            );

                        const quantity =
                            Number(
                                req.body.quantity
                            );

                        const notes =
                            String(
                                req.body.notes ||
                                "Penyesuaian stok"
                            ).trim();

                        if (
                            !Number.isFinite(
                                quantity
                            ) ||
                            quantity === 0
                        ) {
                            throw new Error(
                                "Jumlah penyesuaian tidak valid."
                            );
                        }

                        const rows =
                            await conn.query(
                                `
                                SELECT
                                    current_stock
                                FROM ingredients
                                WHERE id = $1
                                FOR UPDATE
                                `,
                                [id]
                            );

                        if (
                            rows.rows.length === 0
                        ) {
                            throw new Error(
                                "Bahan tidak ditemukan."
                            );
                        }

                        const oldStock =
                            Number(
                                rows.rows[0]
                                    .current_stock
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
                            SET current_stock = $1
                            WHERE id = $2
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
                            VALUES
                            (
                                $1,
                                'adjustment',
                                $2,
                                $3,
                                'manual',
                                $4,
                                $5
                            )
                            `,
                            [
                                id,
                                quantity,
                                newStock,
                                id,
                                notes
                            ]
                        );

                        return newStock;
                    }
                );

            res.json({
                ok: true,
                stock: result
            });
        } catch (error) {
            console.error(error);

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal menyesuaikan stok."
            });
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
            const purchases =
                await query(`
                    SELECT
                        p.*,
                        s.name AS supplier_name
                    FROM purchases p
                    LEFT JOIN suppliers s
                        ON s.id = p.supplier_id
                    ORDER BY
                        p.id DESC
                `);

            for (
                const purchase
                of purchases
            ) {
                purchase.items =
                    await query(
                        `
                        SELECT
                            pi.*,
                            i.name AS ingredient_name,
                            i.unit
                        FROM purchase_items pi
                        LEFT JOIN ingredients i
                            ON i.id =
                               pi.ingredient_id
                        WHERE pi.purchase_id = $1
                        ORDER BY pi.id ASC
                        `,
                        [
                            purchase.id
                        ]
                    );
            }

            res.json(purchases);
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Gagal mengambil pembelian."
            });
        }
    }
);

app.post(
    "/api/admin/purchases",
    auth,
    async (req, res) => {
        try {
            const result =
                await transaction(
                    async (conn) => {
                        const {
                            supplier_id,
                            purchase_date,
                            invoice_number,
                            notes,
                            items
                        } = req.body;

                        if (
                            !Array.isArray(
                                items
                            ) ||
                            items.length === 0
                        ) {
                            throw new Error(
                                "Item pembelian kosong."
                            );
                        }

                        const cleanItems = [];

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
                                !Number.isFinite(
                                    quantity
                                ) ||
                                quantity <= 0 ||
                                !Number.isFinite(
                                    unitCost
                                ) ||
                                unitCost < 0
                            ) {
                                continue;
                            }

                            cleanItems.push({
                                ingredientId,
                                quantity,
                                unitCost,
                                totalCost:
                                    quantity *
                                    unitCost
                            });
                        }

                        if (
                            cleanItems.length === 0
                        ) {
                            throw new Error(
                                "Item pembelian tidak valid."
                            );
                        }

                        const subtotal =
                            cleanItems.reduce(
                                (
                                    sum,
                                    item
                                ) =>
                                    sum +
                                    item.totalCost,
                                0
                            );

                        const purchaseResult =
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
                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3,
                                    $4,
                                    $5,
                                    'completed'
                                )
                                RETURNING id
                                `,
                                [
                                    supplier_id
                                        ? Number(
                                            supplier_id
                                        )
                                        : null,

                                    purchase_date ||
                                        new Date(),

                                    String(
                                        invoice_number ||
                                        ""
                                    ).trim(),

                                    subtotal,

                                    String(
                                        notes || ""
                                    ).trim()
                                ]
                            );

                        const purchaseId =
                            purchaseResult.rows[0]
                                .id;

                        for (
                            const item
                            of cleanItems
                        ) {
                            const ingredientResult =
                                await conn.query(
                                    `
                                    SELECT
                                        current_stock,
                                        average_cost
                                    FROM ingredients
                                    WHERE id = $1
                                    FOR UPDATE
                                    `,
                                    [
                                        item.ingredientId
                                    ]
                                );

                            if (
                                ingredientResult
                                    .rows.length === 0
                            ) {
                                throw new Error(
                                    "Bahan pembelian tidak ditemukan."
                                );
                            }

                            const oldStock =
                                Number(
                                    ingredientResult
                                        .rows[0]
                                        .current_stock
                                );

                            const oldCost =
                                Number(
                                    ingredientResult
                                        .rows[0]
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
                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3,
                                    $4,
                                    $5
                                )
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
                                    current_stock = $1,
                                    average_cost = $2
                                WHERE id = $3
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
                                VALUES
                                (
                                    $1,
                                    'purchase',
                                    $2,
                                    $3,
                                    'purchase',
                                    $4,
                                    $5
                                )
                                `,
                                [
                                    item.ingredientId,
                                    item.quantity,
                                    newStock,
                                    purchaseId,
                                    "Pembelian bahan"
                                ]
                            );
                        }

                        return {
                            purchaseId,
                            subtotal
                        };
                    }
                );

            res.json({
                ok: true,
                purchase_id:
                    result.purchaseId,
                subtotal:
                    result.subtotal
            });
        } catch (error) {
            console.error(error);

            res.status(400).json({
                error:
                    error.message ||
                    "Gagal menyimpan pembelian."
            });
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
            const recipes =
                await query(`
                    SELECT
                        r.*,
                        m.name AS menu_name
                    FROM recipes r
                    LEFT JOIN menu m
                        ON m.id = r.menu_id
                    ORDER BY r.id ASC
                `);

            for (
                const recipe
                of recipes
            ) {
                const items =
                    await query(
                        `
                        SELECT
                            ri.*,
                            i.name AS ingredient_name,
                            i.unit,
                            i.average_cost
                        FROM recipe_items ri
                        JOIN ingredients i
                            ON i.id =
                               ri.ingredient_id
                        WHERE
                            ri.recipe_id = $1
                        ORDER BY ri.id ASC
                        `,
                        [
                            recipe.id
                        ]
                    );

                recipe.items = items;

                recipe.hpp =
                    items.reduce(
                        (
                            sum,
                            item
                        ) =>
                            sum +
                            Number(
                                item.quantity
                            ) *
                            Number(
                                item.average_cost
                            ),
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
        try {
            const recipeId =
                await transaction(
                    async (conn) => {
                        const menuId =
                            Number(
                                req.body.menu_id
                            );

                        const notes =
                            String(
                                req.body.notes ||
                                ""
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
                            )
                        ) {
                            throw new Error(
                                "Menu resep tidak valid."
                            );
                        }

                        if (
                            items.length === 0
                        ) {
                            throw new Error(
                                "Resep belum memiliki bahan."
                            );
                        }

                        const menu =
                            await conn.query(
                                `
                                SELECT id
                                FROM menu
                                WHERE id = $1
                                LIMIT 1
                                `,
                                [menuId]
                            );

                        if (
                            menu.rows.length === 0
                        ) {
                            throw new Error(
                                "Menu tidak ditemukan."
                            );
                        }

                        let recipeId;

                        const existing =
                            await conn.query(
                                `
                                SELECT id
                                FROM recipes
                                WHERE menu_id = $1
                                LIMIT 1
                                `,
                                [menuId]
                            );

                        if (
                            existing.rows.length > 0
                        ) {
                            recipeId =
                                existing.rows[0]
                                    .id;

                            await conn.query(
                                `
                                UPDATE recipes
                                SET
                                    notes = $1,
                                    is_active = TRUE
                                WHERE id = $2
                                `,
                                [
                                    notes,
                                    recipeId
                                ]
                            );

                            await conn.query(
                                `
                                DELETE FROM recipe_items
                                WHERE recipe_id = $1
                                `,
                                [recipeId]
                            );
                        } else {
                            const result =
                                await conn.query(
                                    `
                                    INSERT INTO recipes
                                    (
                                        menu_id,
                                        notes,
                                        is_active
                                    )
                                    VALUES
                                    (
                                        $1,
                                        $2,
                                        TRUE
                                    )
                                    RETURNING id
                                    `,
                                    [
                                        menuId,
                                        notes
                                    ]
                                );

                            recipeId =
                                result.rows[0]
                                    .id;
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
                                !Number.isFinite(
                                    quantity
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
                                VALUES
                                (
                                    $1,
                                    $2,
                                    $3
                                )
                                `,
                                [
                                    recipeId,
                                    ingredientId,
                                    quantity
                                ]
                            );
                        }

                        return recipeId;
                    }
                );

            res.json({
                ok: true,
                recipe_id:
                    recipeId
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    error.message ||
                    "Gagal menyimpan resep."
            });
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
            await transaction(
                async (conn) => {
                    const id =
                        Number(
                            req.params.id
                        );

                    await conn.query(
                        `
                        DELETE FROM recipe_items
                        WHERE recipe_id = $1
                        `,
                        [id]
                    );

                    await conn.query(
                        `
                        DELETE FROM recipes
                        WHERE id = $1
                        `,
                        [id]
                    );
                }
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
            const rows =
                await query(`
                    SELECT
                        sm.*,
                        i.name AS ingredient_name,
                        i.unit
                    FROM stock_movements sm
                    LEFT JOIN ingredients i
                        ON i.id =
                           sm.ingredient_id
                    ORDER BY sm.id DESC
                    LIMIT 200
                `);

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
            const rows =
                await query(`
                    SELECT *
                    FROM ingredients
                    WHERE
                        is_active = TRUE
                    AND
                        current_stock <= minimum_stock
                    ORDER BY current_stock ASC
                `);

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
            const menus =
                await query(`
                    SELECT
                        id,
                        name,
                        category,
                        price
                    FROM menu
                    ORDER BY name ASC
                `);

            const result = [];

            for (
                const menu
                of menus
            ) {
                const rows =
                    await query(
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
                            ON ri.recipe_id =
                               r.id
                        LEFT JOIN ingredients i
                            ON i.id =
                               ri.ingredient_id
                        WHERE
                            r.menu_id = $1
                        AND
                            r.is_active = TRUE
                        `,
                        [menu.id]
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

                    price,

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
                            ) *
                            100
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
            const rows =
                await query(`
                    SELECT *
                    FROM operational_expenses
                    ORDER BY
                        expense_date DESC,
                        id DESC
                `);

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
                Number(amount);

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

            const result =
                await execute(
                    `
                    INSERT INTO operational_expenses
                    (
                        expense_date,
                        category,
                        description,
                        amount,
                        notes
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5
                    )
                    RETURNING id
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
                    result.rows[0].id
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
            await execute(
                `
                DELETE FROM operational_expenses
                WHERE id = $1
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
            const salesRows =
                await query(`
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
                        created_at::date =
                        CURRENT_DATE
                `);

            const hppRows =
                await query(`
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
                        o.created_at::date =
                        CURRENT_DATE
                    AND
                        o.status != 'dibatalkan'
                `);

            const expenseRows =
                await query(`
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        ) AS total
                    FROM operational_expenses
                    WHERE
                        expense_date::date =
                        CURRENT_DATE
                `);

            const sales =
                salesRows[0];

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
                    hppRows[0].total || 0
                );

            const expenses =
                Number(
                    expenseRows[0].total || 0
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
            const salesRows =
                await query(`
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
                        created_at::date =
                        CURRENT_DATE
                `);

            const hppRows =
                await query(`
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
                        o.created_at::date =
                        CURRENT_DATE
                    AND
                        o.status != 'dibatalkan'
                `);

            const expenseRows =
                await query(`
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        ) AS total
                    FROM operational_expenses
                    WHERE
                        expense_date::date =
                        CURRENT_DATE
                `);

            const top =
                await query(`
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
                        o.created_at::date =
                        CURRENT_DATE
                    AND
                        o.status != 'dibatalkan'
                    GROUP BY
                        oi.menu_id,
                        oi.menu_name
                    ORDER BY
                        qty DESC
                    LIMIT 10
                `);

            const revenue =
                Number(
                    salesRows[0].revenue ||
                    0
                );

            const paid =
                Number(
                    salesRows[0].paid ||
                    0
                );

            const totalHpp =
                Number(
                    hppRows[0].total ||
                    0
                );

            const expenses =
                Number(
                    expenseRows[0].total ||
                    0
                );

            res.json({
                orders:
                    Number(
                        salesRows[0].orders ||
                        0
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
// KASIR
// ======================================================

app.get(
    "/kasir",
    (req, res) => {
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
                database:
                    "connected"
            });
        } catch (error) {
            console.error(
                "HEALTH ERROR:",
                error
            );

            res.status(500).json({
                ok: false,
                database:
                    "disconnected"
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
    const ready = await setupDatabase();

    if (!ready) {
        console.error(
            "Server dihentikan karena database gagal."
        );

        process.exit(1);
    }

    const server = app.listen(
        PORT,
        "0.0.0.0",
        function () {
            console.log("");

            console.log(
                "===================================="
            );

            console.log(
                "       QURES RIVERSIDE"
            );

            console.log(
                "===================================="
            );

            console.log(
                `Server berjalan di port ${PORT}`
            );

            console.log(
                "Database : PostgreSQL / Neon"
            );

            console.log(
                "Inventory: ON"
            );

            console.log(
                "Recipe   : ON"
            );

            console.log(
                "HPP      : ON"
            );

            console.log(
                "Session  : PostgreSQL"
            );

            console.log(
                "===================================="
            );
        }
    );

    const shutdown = async (signal) => {
        console.log(
            `${signal} diterima. Menutup server...`
        );

        server.close(
            async () => {
                try {
                    await pool.end();

                    console.log(
                        "Database pool ditutup."
                    );

                    process.exit(0);
                } catch (error) {
                    console.error(error);

                    process.exit(1);
                }
            }
        );
    };

    process.on(
        "SIGTERM",
        () => shutdown("SIGTERM")
    );

    process.on(
        "SIGINT",
        () => shutdown("SIGINT")
    );
}

if (require.main === module) {
    start();
}

module.exports = app;