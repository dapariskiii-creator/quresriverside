// ======================================================
// QURES RIVERSIDE - KASIR.JS
// FULL VERSION
// TANPA NOMOR PESANAN
// Identitas pesanan = NAMA + NOMOR MEJA
// ======================================================

"use strict";


// ======================================================
// GLOBAL STATE
// ======================================================

let orders = [];
let menus = [];
let ingredients = [];
let suppliers = [];
let purchases = [];
let recipes = [];
let hppData = [];
let expenses = [];

let currentMenuId = null;
let currentIngredientId = null;
let currentSupplierId = null;
let currentRecipeId = null;

let purchaseItems = [];
let recipeItems = [];

let isSubmittingOrder = false;


// ======================================================
// HELPER
// ======================================================

function $(id) {
    return document.getElementById(id);
}


function rupiah(value) {

    const number =
        Number(value) || 0;

    return new Intl.NumberFormat(
        "id-ID",
        {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0
        }
    ).format(number);
}


function numberFormat(value) {

    return new Intl.NumberFormat(
        "id-ID",
        {
            maximumFractionDigits: 3
        }
    ).format(
        Number(value) || 0
    );
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatDate(value) {

    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHtml(value);
    }

    return date.toLocaleString(
        "id-ID",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );
}


function localDateTimeValue() {

    const now = new Date();

    const offset =
        now.getTimezoneOffset();

    const local =
        new Date(
            now.getTime() -
            offset * 60000
        );

    return local
        .toISOString()
        .slice(0, 16);
}


function showError(error) {

    console.error(error);

    alert(
        error?.message ||
        String(error) ||
        "Terjadi kesalahan."
    );
}


async function api(
    url,
    options = {}
) {

    const config = {
        ...options,
        headers: {
            ...(options.body instanceof FormData
                ? {}
                : {
                    "Content-Type":
                        "application/json"
                }),
            ...(options.headers || {})
        }
    };

    const response =
        await fetch(
            url,
            config
        );

    let data = null;

    try {
        data =
            await response.json();
    } catch (_) {
        data = {};
    }

    if (
        response.status === 401
    ) {

        showLogin();

        throw new Error(
            data.error ||
            "Sesi login sudah berakhir."
        );
    }

    if (!response.ok) {

        throw new Error(
            data.error ||
            "Permintaan gagal."
        );
    }

    return data;
}


// ======================================================
// LOGIN
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        bindForms();

        await checkLogin();
    }
);


async function checkLogin() {

    try {

        const data =
            await api(
                "/api/me"
            );

        if (
            data.logged_in
        ) {

            showApp();

            await initialLoad();

        } else {

            showLogin();
        }

    } catch (error) {

        console.error(
            "CHECK LOGIN:",
            error
        );

        showLogin();
    }
}


function showLogin() {

    $("login")?.classList.remove(
        "hidden"
    );

    $("app")?.classList.add(
        "hidden"
    );
}


function showApp() {

    $("login")?.classList.add(
        "hidden"
    );

    $("app")?.classList.remove(
        "hidden"
    );
}


async function login(
    username,
    password
) {

    const data =
        await api(
            "/api/login",
            {
                method: "POST",

                body:
                    JSON.stringify({
                        username,
                        password
                    })
            }
        );

    if (data.ok) {

        showApp();

        await initialLoad();
    }
}


async function logout() {

    try {

        await api(
            "/api/logout",
            {
                method: "POST"
            }
        );

    } catch (error) {

        console.error(error);

    } finally {

        showLogin();
    }
}


// ======================================================
// FORM BINDING
// ======================================================

function bindForms() {

    // LOGIN
    $("loginForm")?.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            const username =
                String(
                    $("user")?.value || ""
                ).trim();

            const password =
                String(
                    $("pass")?.value || ""
                );

            const errorBox =
                $("loginError");

            if (errorBox) {
                errorBox.textContent = "";
            }

            try {

                await login(
                    username,
                    password
                );

            } catch (error) {

                if (errorBox) {

                    errorBox.textContent =
                        error.message;

                } else {

                    alert(
                        error.message
                    );
                }
            }
        }
    );


    // MENU
    $("menuForm")?.addEventListener(
        "submit",
        saveMenu
    );


    // INGREDIENT
    $("ingredientForm")?.addEventListener(
        "submit",
        saveIngredient
    );


    // SUPPLIER
    $("supplierForm")?.addEventListener(
        "submit",
        saveSupplier
    );


    // PURCHASE
    $("purchaseForm")?.addEventListener(
        "submit",
        savePurchase
    );


    // RECIPE
    $("recipeForm")?.addEventListener(
        "submit",
        saveRecipe
    );


    // EXPENSE
    $("expenseForm")?.addEventListener(
        "submit",
        saveExpense
    );
}


// ======================================================
// INITIAL LOAD
// ======================================================

async function initialLoad() {

    try {

        await Promise.all([
            loadOrders(),
            loadMenus(),
            loadIngredients(),
            loadSuppliers(),
            loadPurchases(),
            loadRecipes(),
            loadHpp(),
            loadExpenses(),
            loadReport()
        ]);

    } catch (error) {

        console.error(
            "INITIAL LOAD:",
            error
        );
    }
}


// ======================================================
// TAB
// ======================================================

function showTab(
    tabId,
    button
) {

    const sections =
        [
            "orders",
            "menu",
            "ingredients",
            "suppliers",
            "purchases",
            "recipes",
            "hpp",
            "expenses",
            "report"
        ];

    sections.forEach(
        function (id) {

            const section =
                $(id);

            if (!section) {
                return;
            }

            if (id === tabId) {

                section.classList.remove(
                    "hidden"
                );

            } else {

                section.classList.add(
                    "hidden"
                );
            }
        }
    );


    document
        .querySelectorAll(".tab")
        .forEach(
            function (tab) {

                tab.classList.remove(
                    "active"
                );
            }
        );


    if (button) {

        button.classList.add(
            "active"
        );
    }


    // Refresh data ketika tab dibuka

    if (tabId === "orders") {
        loadOrders();
    }

    if (tabId === "menu") {
        loadMenus();
    }

    if (tabId === "ingredients") {
        loadIngredients();
    }

    if (tabId === "suppliers") {
        loadSuppliers();
    }

    if (tabId === "purchases") {
        loadPurchases();
    }

    if (tabId === "recipes") {
        loadRecipes();
    }

    if (tabId === "hpp") {
        loadHpp();
    }

    if (tabId === "expenses") {
        loadExpenses();
    }

    if (tabId === "report") {
        loadReport();
    }
}


// ======================================================
// ORDERS
// ======================================================

async function loadOrders() {

    try {

        orders =
            await api(
                "/api/orders"
            );

        renderOrders();

        updateStats();

    } catch (error) {

        console.error(
            "LOAD ORDERS:",
            error
        );
    }
}


function renderOrders() {

    const container =
        $("orderList");

    if (!container) {
        return;
    }


    if (!orders.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada pesanan.
            </div>
            `;

        return;
    }


    const sorted =
        [...orders].sort(
            function (a, b) {

                return (
                    Number(b.id) -
                    Number(a.id)
                );
            }
        );


    container.innerHTML =
        sorted.map(
            renderOrderCard
        ).join("");
}


function renderOrderCard(
    order
) {

    const status =
        String(
            order.status || "baru"
        );


    const payment =
        String(
            order.payment_status ||
            "belum_bayar"
        );


    const customer =
        escapeHtml(
            order.customer_name ||
            "-"
        );


    const table =
        order.table_number
            ? `Meja ${escapeHtml(
                order.table_number
            )}`
            : "Take away";


    const statusText = {

        baru:
            "Pesanan Baru",

        diproses:
            "Sedang Diproses",

        selesai:
            "Selesai",

        dibatalkan:
            "Dibatalkan"
    }[status] || status;


    const paymentText =
        payment === "dibayar"
            ? "Sudah Bayar"
            : "Belum Bayar";


    const items =
        Array.isArray(
            order.items
        )
            ? order.items
            : [];


    const itemHtml =
        items.map(
            function (item) {

                return `
                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            gap:12px;
                            padding:6px 0;
                        "
                    >
                        <span>
                            ${escapeHtml(
                                item.menu_name
                            )}
                            ×
                            ${Number(
                                item.qty
                            )}
                        </span>

                        <b>
                            ${rupiah(
                                item.subtotal
                            )}
                        </b>
                    </div>
                `;
            }
        ).join("");


    let actions = "";


    if (
        status === "baru"
    ) {

        actions += `
            <button
                type="button"
                onclick="updateOrder(
                    ${Number(order.id)},
                    'diproses'
                )"
            >
                Terima & Proses
            </button>
        `;
    }


    if (
        status === "diproses"
    ) {

        actions += `
            <button
                type="button"
                onclick="updateOrder(
                    ${Number(order.id)},
                    'selesai'
                )"
            >
                Tandai Selesai
            </button>
        `;
    }


    if (
        payment === "belum_bayar" &&
        status !== "dibatalkan"
    ) {

        actions += `
            <button
                type="button"
                onclick="markPaid(
                    ${Number(order.id)}
                )"
            >
                Sudah Bayar
            </button>
        `;
    }


    if (
        status !== "selesai" &&
        status !== "dibatalkan"
    ) {

        actions += `
            <button
                type="button"
                onclick="cancelOrder(
                    ${Number(order.id)}
                )"
            >
                Batalkan
            </button>
        `;
    }


    if (
        status === "selesai" ||
        status === "dibatalkan"
    ) {

        actions += `
            <button
                type="button"
                onclick="deleteOrder(
                    ${Number(order.id)}
                )"
            >
                Hapus
            </button>
        `;
    }


    return `
        <article
            class="order-card"
            data-order-id="${Number(order.id)}"
        >

            <div class="order-head">

                <div>

                    <h3>
                        ${customer}
                    </h3>

                    <small>
                        ${formatDate(
                            order.created_at
                        )}
                    </small>

                </div>

                <span class="badge">
                    ${escapeHtml(
                        statusText
                    )}
                </span>

            </div>


            <div
                style="
                    margin:10px 0;
                    padding:10px;
                    border-radius:10px;
                    background:#f5f5f5;
                "
            >

                <b>
                    ${customer}
                </b>

                <br>

                ${table}

                <br>

                <small>
                    ${escapeHtml(
                        paymentText
                    )}
                </small>

            </div>


            <div class="order-items">

                ${itemHtml}

            </div>


            <div class="total">

                <span>
                    Total
                </span>

                <b>
                    ${rupiah(
                        order.total
                    )}
                </b>

            </div>


            <div
                class="actions"
                style="
                    display:flex;
                    flex-wrap:wrap;
                    gap:8px;
                    margin-top:15px;
                "
            >

                ${actions}

            </div>

        </article>
    `;
}


async function updateOrder(
    orderId,
    status
) {

    try {

        await api(
            `/api/orders/${orderId}`,
            {
                method: "PATCH",

                body:
                    JSON.stringify({
                        status
                    })
            }
        );

        await loadOrders();

        await loadReport();

    } catch (error) {

        showError(error);
    }
}


async function markPaid(
    orderId
) {

    try {

        await api(
            `/api/orders/${orderId}`,
            {
                method: "PATCH",

                body:
                    JSON.stringify({
                        payment_status:
                            "dibayar"
                    })
            }
        );

        await loadOrders();

        await loadReport();

    } catch (error) {

        showError(error);
    }
}


async function cancelOrder(
    orderId
) {

    const yes =
        confirm(
            "Batalkan pesanan ini?\n\nStok menu dan bahan baku akan dikembalikan."
        );

    if (!yes) {
        return;
    }


    try {

        await api(
            `/api/orders/${orderId}`,
            {
                method: "PATCH",

                body:
                    JSON.stringify({
                        status:
                            "dibatalkan"
                    })
            }
        );

        await Promise.all([
            loadOrders(),
            loadMenus(),
            loadIngredients(),
            loadReport()
        ]);

        alert(
            "Pesanan dibatalkan dan stok dikembalikan."
        );

    } catch (error) {

        showError(error);
    }
}


async function deleteOrder(
    orderId
) {

    const yes =
        confirm(
            "Hapus pesanan ini dari database?"
        );

    if (!yes) {
        return;
    }


    try {

        await api(
            `/api/orders/${orderId}`,
            {
                method: "DELETE"
            }
        );

        await loadOrders();

    } catch (error) {

        showError(error);
    }
}


// ======================================================
// STATISTICS
// ======================================================

function updateStats() {

    const newOrders =
        orders.filter(
            o =>
                o.status === "baru"
        ).length;


    const processing =
        orders.filter(
            o =>
                o.status === "diproses"
        ).length;


    const completed =
        orders.filter(
            o =>
                o.status === "selesai"
        ).length;


    const revenue =
        orders.reduce(
            function (
                total,
                order
            ) {

                if (
                    order.status ===
                    "dibatalkan"
                ) {
                    return total;
                }

                return (
                    total +
                    Number(
                        order.total || 0
                    )
                );
            },
            0
        );


    if ($("n")) {
        $("n").textContent =
            newOrders;
    }

    if ($("p")) {
        $("p").textContent =
            processing;
    }

    if ($("d")) {
        $("d").textContent =
            completed;
    }

    if ($("rev")) {
        $("rev").textContent =
            rupiah(revenue);
    }
}


// ======================================================
// MENU
// ======================================================

async function loadMenus() {

    try {

        menus =
            await api(
                "/api/admin/menu"
            );

        renderMenus();

        fillMenuSelects();

    } catch (error) {

        console.error(
            "LOAD MENUS:",
            error
        );
    }
}


function renderMenus() {

    const container =
        $("menuList");

    if (!container) {
        return;
    }


    if (!menus.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada menu.
            </div>
            `;

        return;
    }


    container.innerHTML =
        menus.map(
            function (menu) {

                const image =
                    menu.image_url
                        ? `
                            <img
                                src="${escapeHtml(
                                    menu.image_url
                                )}"
                                alt="${escapeHtml(
                                    menu.name
                                )}"
                                style="
                                    width:100%;
                                    height:180px;
                                    object-fit:cover;
                                    border-radius:12px;
                                "
                            >
                        `
                        : `
                            <div
                                style="
                                    height:180px;
                                    display:flex;
                                    align-items:center;
                                    justify-content:center;
                                    background:#eee;
                                    border-radius:12px;
                                "
                            >
                                Tidak ada foto
                            </div>
                        `;


                return `
                    <article class="menu-card">

                        ${image}

                        <div
                            style="
                                padding-top:10px;
                            "
                        >

                            <small>
                                ${escapeHtml(
                                    menu.category
                                )}
                            </small>

                            <h3>
                                ${escapeHtml(
                                    menu.name
                                )}
                            </h3>

                            <b>
                                ${rupiah(
                                    menu.price
                                )}
                            </b>

                            <p>
                                Stok:
                                <strong>
                                    ${Number(
                                        menu.stock
                                    )}
                                </strong>
                            </p>

                            <p>
                                ${escapeHtml(
                                    menu.description || ""
                                )}
                            </p>

                            <div
                                class="actions"
                                style="
                                    display:flex;
                                    gap:8px;
                                    flex-wrap:wrap;
                                "
                            >

                                <button
                                    type="button"
                                    onclick="openMenu(
                                        ${Number(menu.id)}
                                    )"
                                >
                                    Edit
                                </button>

                                ${
                                    Number(menu.active) === 1
                                        ? `
                                            <button
                                                type="button"
                                                onclick="deactivateMenu(
                                                    ${Number(menu.id)}
                                                )"
                                            >
                                                Nonaktifkan
                                            </button>
                                        `
                                        : `
                                            <button
                                                type="button"
                                                onclick="activateMenu(
                                                    ${Number(menu.id)}
                                                )"
                                            >
                                                Aktifkan
                                            </button>
                                        `
                                }

                            </div>

                        </div>

                    </article>
                `;
            }
        ).join("");
}


function openMenu(
    menuId = null
) {

    currentMenuId =
        menuId
            ? Number(menuId)
            : null;


    $("menuForm")?.reset();

    $("mid").value =
        currentMenuId || "";


    $("imagePreview").innerHTML =
        "";


    if (
        currentMenuId
    ) {

        const menu =
            menus.find(
                m =>
                    Number(m.id) ===
                    currentMenuId
            );

        if (!menu) {
            return;
        }

        $("mn").value =
            menu.name || "";

        $("mc").value =
            menu.category || "minuman";

        $("mp").value =
            Number(menu.price) || 0;

        $("ms").value =
            Number(menu.stock) || 0;

        $("md").value =
            menu.description || "";

        $("mi").value =
            menu.image_url || "";


        if (menu.image_url) {

            $("imagePreview").innerHTML =
                `
                <img
                    src="${escapeHtml(
                        menu.image_url
                    )}"
                    alt="Preview"
                    style="
                        max-width:100%;
                        max-height:220px;
                        border-radius:12px;
                    "
                >
                `;
        }

    }


    $("menuModal")?.classList.remove(
        "hidden"
    );
}


function closeMenu() {

    $("menuModal")?.classList.add(
        "hidden"
    );

    currentMenuId =
        null;
}


async function uploadMenuImage() {

    const input =
        $("imageFile");

    if (
        !input ||
        !input.files ||
        !input.files[0]
    ) {

        return null;
    }


    const form =
        new FormData();

    form.append(
        "image",
        input.files[0]
    );


    const data =
        await api(
            "/api/admin/upload",
            {
                method: "POST",
                body: form
            }
        );


    return data.image_url;
}


async function saveMenu(
    event
) {

    event.preventDefault();


    try {

        let imageUrl =
            $("mi")?.value || "";


        if (
            $("imageFile")?.files?.length
        ) {

            imageUrl =
                await uploadMenuImage();
        }


        const payload = {

            name:
                $("mn").value.trim(),

            category:
                $("mc").value,

            price:
                Number(
                    $("mp").value
                ) || 0,

            stock:
                Number(
                    $("ms").value
                ) || 0,

            description:
                $("md").value.trim(),

            image_url:
                imageUrl
        };


        if (!payload.name) {

            alert(
                "Nama menu wajib diisi."
            );

            return;
        }


        if (
            currentMenuId
        ) {

            await api(
                `/api/admin/menu/${currentMenuId}`,
                {
                    method: "PUT",

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );

        } else {

            await api(
                "/api/admin/menu",
                {
                    method: "POST",

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );
        }


        closeMenu();

        await Promise.all([
            loadMenus(),
            loadHpp()
        ]);


        alert(
            "Menu berhasil disimpan."
        );

    } catch (error) {

        showError(error);
    }
}


async function deactivateMenu(
    id
) {

    const yes =
        confirm(
            "Nonaktifkan menu ini?"
        );

    if (!yes) {
        return;
    }


    try {

        await api(
            `/api/admin/menu/${id}`,
            {
                method: "DELETE"
            }
        );

        await loadMenus();

    } catch (error) {

        showError(error);
    }
}


async function activateMenu(
    id
) {

    const menu =
        menus.find(
            m =>
                Number(m.id) ===
                Number(id)
        );

    if (!menu) {
        return;
    }


    try {

        await api(
            `/api/admin/menu/${id}`,
            {
                method: "PUT",

                body:
                    JSON.stringify({
                        name:
                            menu.name,

                        category:
                            menu.category,

                        price:
                            Number(
                                menu.price
                            ),

                        stock:
                            Number(
                                menu.stock
                            ),

                        description:
                            menu.description ||
                            "",

                        image_url:
                            menu.image_url ||
                            "",

                        active:
                            true
                    })
            }
        );


        await loadMenus();

    } catch (error) {

        showError(error);
    }
}


// ======================================================
// INGREDIENTS
// ======================================================

async function loadIngredients() {

    try {

        ingredients =
            await api(
                "/api/admin/ingredients"
            );

        renderIngredients();

        renderLowStock();

        fillIngredientSelects();

    } catch (error) {

        console.error(
            "LOAD INGREDIENTS:",
            error
        );
    }
}


function renderIngredients() {

    const container =
        $("ingredientList");

    if (!container) {
        return;
    }


    if (!ingredients.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada bahan baku.
            </div>
            `;

        return;
    }


    container.innerHTML =
        ingredients.map(
            function (item) {

                const low =
                    Number(
                        item.low_stock
                    ) === 1 ||
                    Number(
                        item.current_stock
                    ) <=
                    Number(
                        item.minimum_stock
                    );


                return `
                    <article
                        class="menu-card"
                    >

                        <small>
                            BAHAN BAKU
                        </small>

                        <h3>
                            ${escapeHtml(
                                item.name
                            )}
                        </h3>

                        <p>
                            Stok:
                            <strong>
                                ${numberFormat(
                                    item.current_stock
                                )}
                                ${escapeHtml(
                                    item.unit
                                )}
                            </strong>
                        </p>

                        <p>
                            Minimum:
                            ${numberFormat(
                                item.minimum_stock
                            )}
                            ${escapeHtml(
                                item.unit
                            )}
                        </p>

                        <p>
                            Harga rata-rata:
                            <strong>
                                ${rupiah(
                                    item.average_cost
                                )}
                            </strong>
                        </p>

                        ${
                            low
                                ? `
                                    <div
                                        style="
                                            padding:8px;
                                            border-radius:8px;
                                            margin:8px 0;
                                        "
                                    >
                                        ⚠️ Stok menipis
                                    </div>
                                `
                                : ""
                        }

                        <div
                            style="
                                display:flex;
                                flex-wrap:wrap;
                                gap:8px;
                                margin-top:10px;
                            "
                        >

                            <button
                                type="button"
                                onclick="openIngredient(
                                    ${Number(item.id)}
                                )"
                            >
                                Edit
                            </button>

                            <button
                                type="button"
                                onclick="adjustIngredient(
                                    ${Number(item.id)}
                                )"
                            >
                                ± Stok
                            </button>

                        </div>

                    </article>
                `;
            }
        ).join("");
}


function renderLowStock() {

    const box =
        $("lowStockBox");

    if (!box) {
        return;
    }


    const low =
        ingredients.filter(
            item =>
                Number(
                    item.current_stock
                ) <=
                Number(
                    item.minimum_stock
                )
        );


    if (!low.length) {

        box.innerHTML =
            `
            <b>
                ✓ Stok aman
            </b>

            <p>
                Tidak ada bahan yang berada
                di bawah batas minimum.
            </p>
            `;

        return;
    }


    box.innerHTML =
        `
        <b>
            ⚠️ ${low.length} bahan perlu diperhatikan
        </b>

        <div
            style="
                margin-top:10px;
            "
        >

            ${low.map(
                item =>
                    `
                    <div
                        style="
                            padding:6px 0;
                        "
                    >
                        ${escapeHtml(
                            item.name
                        )}
                        :
                        <strong>
                            ${numberFormat(
                                item.current_stock
                            )}
                            ${escapeHtml(
                                item.unit
                            )}
                        </strong>
                    </div>
                    `
            ).join("")}

        </div>
        `;
}


function openIngredient(
    id = null
) {

    currentIngredientId =
        id
            ? Number(id)
            : null;


    $("ingredientForm")?.reset();

    $("ingredientId").value =
        currentIngredientId || "";


    $("ingredientStock").value =
        0;

    $("ingredientMinimum").value =
        0;

    $("ingredientCost").value =
        0;


    if (
        currentIngredientId
    ) {

        const item =
            ingredients.find(
                x =>
                    Number(x.id) ===
                    currentIngredientId
            );

        if (!item) {
            return;
        }


        $("ingredientName").value =
            item.name || "";

        $("ingredientUnit").value =
            item.unit || "gram";

        $("ingredientStock").value =
            Number(
                item.current_stock
            ) || 0;

        $("ingredientMinimum").value =
            Number(
                item.minimum_stock
            ) || 0;

        $("ingredientCost").value =
            Number(
                item.average_cost
            ) || 0;

        $("ingredientNotes").value =
            item.notes || "";
    }


    $("ingredientModal")
        ?.classList.remove(
            "hidden"
        );
}


function closeIngredient() {

    $("ingredientModal")
        ?.classList.add(
            "hidden"
        );

    currentIngredientId =
        null;
}


async function saveIngredient(
    event
) {

    event.preventDefault();


    try {

        const name =
            $("ingredientName")
                .value
                .trim();

        const unit =
            $("ingredientUnit")
                .value;


        if (!name) {

            alert(
                "Nama bahan wajib diisi."
            );

            return;
        }


        if (
            currentIngredientId
        ) {

            await api(
                `/api/admin/ingredients/${currentIngredientId}`,
                {
                    method: "PUT",

                    body:
                        JSON.stringify({

                            name,

                            unit,

                            minimum_stock:
                                Number(
                                    $("ingredientMinimum")
                                        .value
                                ) || 0,

                            average_cost:
                                Number(
                                    $("ingredientCost")
                                        .value
                                ) || 0,

                            notes:
                                $("ingredientNotes")
                                    .value
                                    .trim()
                        })
                }
            );

        } else {

            await api(
                "/api/admin/ingredients",
                {
                    method: "POST",

                    body:
                        JSON.stringify({

                            name,

                            unit,

                            current_stock:
                                Number(
                                    $("ingredientStock")
                                        .value
                                ) || 0,

                            minimum_stock:
                                Number(
                                    $("ingredientMinimum")
                                        .value
                                ) || 0,

                            average_cost:
                                Number(
                                    $("ingredientCost")
                                        .value
                                ) || 0,

                            notes:
                                $("ingredientNotes")
                                    .value
                                    .trim()
                        })
                }
            );
        }


        closeIngredient();

        await Promise.all([
            loadIngredients(),
            loadHpp()
        ]);


        alert(
            "Bahan baku berhasil disimpan."
        );

    } catch (error) {

        showError(error);
    }
}


async function adjustIngredient(
    id
) {

    const item =
        ingredients.find(
            x =>
                Number(x.id) ===
                Number(id)
        );

    if (!item) {
        return;
    }


    const input =
        prompt(
            `Stok ${item.name}\n\n` +
            `Stok sekarang: ${item.current_stock} ${item.unit}\n\n` +
            `Masukkan perubahan stok.\n` +
            `Contoh +10 atau -2`
        );


    if (
        input === null
    ) {
        return;
    }


    const quantity =
        Number(
            String(input)
                .replace(",", ".")
        );


    if (
        !Number.isFinite(
            quantity
        ) ||
        quantity === 0
    ) {

        alert(
            "Jumlah stok tidak valid."
        );

        return;
    }


    const notes =
        prompt(
            "Alasan penyesuaian stok:"
        ) ||
        "Penyesuaian stok";


    try {

        await api(
            `/api/admin/ingredients/${id}/adjust`,
            {
                method: "POST",

                body:
                    JSON.stringify({
                        quantity,
                        notes
                    })
            }
        );


        await loadIngredients();


        alert(
            "Stok berhasil diperbarui."
        );

    } catch (error) {

        showError(error);
    }
}


// ======================================================
// SUPPLIER
// ======================================================

async function loadSuppliers() {

    try {

        suppliers =
            await api(
                "/api/admin/suppliers"
            );

        renderSuppliers();

        fillSupplierSelect();

    } catch (error) {

        console.error(
            "LOAD SUPPLIERS:",
            error
        );
    }
}


function renderSuppliers() {

    const container =
        $("supplierList");

    if (!container) {
        return;
    }


    if (!suppliers.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada supplier.
            </div>
            `;

        return;
    }


    container.innerHTML =
        suppliers.map(
            function (supplier) {

                return `
                    <article
                        class="menu-card"
                    >

                        <small>
                            SUPPLIER
                        </small>

                        <h3>
                            ${escapeHtml(
                                supplier.name
                            )}
                        </h3>

                        <p>
                            Kontak:
                            ${escapeHtml(
                                supplier.contact ||
                                "-"
                            )}
                        </p>

                        <p>
                            Alamat:
                            ${escapeHtml(
                                supplier.address ||
                                "-"
                            )}
                        </p>

                        <p>
                            Pembayaran:
                            ${escapeHtml(
                                supplier.payment_terms ||
                                "-"
                            )}
                        </p>

                        <p>
                            ${escapeHtml(
                                supplier.notes ||
                                ""
                            )}
                        </p>

                        <button
                            type="button"
                            onclick="openSupplier(
                                ${Number(
                                    supplier.id
                                )}
                            )"
                        >
                            Edit
                        </button>

                    </article>
                `;
            }
        ).join("");
}


function openSupplier(
    id = null
) {

    currentSupplierId =
        id
            ? Number(id)
            : null;


    $("supplierForm")?.reset();

    $("supplierId").value =
        currentSupplierId || "";


    if (
        currentSupplierId
    ) {

        const supplier =
            suppliers.find(
                x =>
                    Number(x.id) ===
                    currentSupplierId
            );

        if (!supplier) {
            return;
        }


        $("supplierName").value =
            supplier.name || "";

        $("supplierContact").value =
            supplier.contact || "";

        $("supplierAddress").value =
            supplier.address || "";

        $("supplierPaymentTerms").value =
            supplier.payment_terms || "";

        $("supplierNotes").value =
            supplier.notes || "";
    }


    $("supplierModal")
        ?.classList.remove(
            "hidden"
        );
}


function closeSupplier() {

    $("supplierModal")
        ?.classList.add(
            "hidden"
        );

    currentSupplierId =
        null;
}


async function saveSupplier(
    event
) {

    event.preventDefault();


    try {

        const payload = {

            name:
                $("supplierName")
                    .value
                    .trim(),

            contact:
                $("supplierContact")
                    .value
                    .trim(),

            address:
                $("supplierAddress")
                    .value
                    .trim(),

            payment_terms:
                $("supplierPaymentTerms")
                    .value
                    .trim(),

            notes:
                $("supplierNotes")
                    .value
                    .trim()
        };


        if (!payload.name) {

            alert(
                "Nama supplier wajib diisi."
            );

            return;
        }


        if (
            currentSupplierId
        ) {

            await api(
                `/api/admin/suppliers/${currentSupplierId}`,
                {
                    method: "PUT",

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );

        } else {

            await api(
                "/api/admin/suppliers",
                {
                    method: "POST",

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );
        }


        closeSupplier();

        await loadSuppliers();


        alert(
            "Supplier berhasil disimpan."
        );

    } catch (error) {

        showError(error);
    }
}


// ======================================================
// PURCHASES
// ======================================================

async function loadPurchases() {

    try {

        purchases =
            await api(
                "/api/admin/purchases"
            );

        renderPurchases();

    } catch (error) {

        console.error(
            "LOAD PURCHASES:",
            error
        );
    }
}


function renderPurchases() {

    const container =
        $("purchaseList");

    if (!container) {
        return;
    }


    if (!purchases.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada pembelian bahan.
            </div>
            `;

        return;
    }


    container.innerHTML =
        purchases.map(
            function (purchase) {

                const items =
                    Array.isArray(
                        purchase.items
                    )
                        ? purchase.items
                        : [];


                return `
                    <article
                        class="order-card"
                        style="margin-bottom:15px;"
                    >

                        <div
                            class="order-head"
                        >

                            <div>

                                <h3>
                                    Pembelian
                                </h3>

                                <small>
                                    ${formatDate(
                                        purchase.purchase_date
                                    )}
                                </small>

                            </div>

                            <span class="badge">
                                ${escapeHtml(
                                    purchase.status
                                )}
                            </span>

                        </div>


                        <p>
                            Supplier:
                            <strong>
                                ${escapeHtml(
                                    purchase.supplier_name ||
                                    "-"
                                )}
                            </strong>
                        </p>


                        <p>
                            Invoice:
                            ${escapeHtml(
                                purchase.invoice_number ||
                                "-"
                            )}
                        </p>


                        <div
                            style="
                                margin:10px 0;
                            "
                        >

                            ${items.map(
                                item =>
                                    `
                                    <div
                                        style="
                                            display:flex;
                                            justify-content:space-between;
                                            gap:10px;
                                            padding:6px 0;
                                            border-bottom:1px solid #eee;
                                        "
                                    >

                                        <span>
                                            ${escapeHtml(
                                                item.ingredient_name
                                            )}
                                            ×
                                            ${numberFormat(
                                                item.quantity
                                            )}
                                            ${escapeHtml(
                                                item.unit
                                            )}
                                        </span>

                                        <b>
                                            ${rupiah(
                                                item.total_cost
                                            )}
                                        </b>

                                    </div>
                                    `
                            ).join("")}

                        </div>


                        <div class="total">

                            <span>
                                Total
                            </span>

                            <b>
                                ${rupiah(
                                    purchase.subtotal
                                )}
                            </b>

                        </div>

                    </article>
                `;
            }
        ).join("");
}


function openPurchase() {

    $("purchaseForm")?.reset();

    purchaseItems = [];


    $("purchaseDate").value =
        localDateTimeValue();


    fillSupplierSelect();

    fillIngredientSelects();


    addPurchaseItem();


    renderPurchaseItems();


    $("purchaseModal")
        ?.classList.remove(
            "hidden"
        );
}


function closePurchase() {

    $("purchaseModal")
        ?.classList.add(
            "hidden"
        );

    purchaseItems = [];
}


function addPurchaseItem() {

    purchaseItems.push({

        ingredient_id: "",

        quantity: 1,

        unit_cost: 0
    });


    renderPurchaseItems();
}


function removePurchaseItem(
    index
) {

    purchaseItems.splice(
        index,
        1
    );


    if (
        purchaseItems.length === 0
    ) {

        purchaseItems.push({
            ingredient_id: "",
            quantity: 1,
            unit_cost: 0
        });
    }


    renderPurchaseItems();
}


function renderPurchaseItems() {

    const container =
        $("purchaseItems");

    if (!container) {
        return;
    }


    container.innerHTML =
        purchaseItems.map(
            function (
                item,
                index
            ) {

                const ingredientOptions =
                    ingredients
                        .filter(
                            x =>
                                Number(
                                    x.is_active
                                ) === 1
                        )
                        .map(
                            ingredient =>
                                `
                                <option
                                    value="${Number(
                                        ingredient.id
                                    )}"
                                    ${
                                        Number(
                                            item.ingredient_id
                                        ) ===
                                        Number(
                                            ingredient.id
                                        )
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    ${escapeHtml(
                                        ingredient.name
                                    )}
                                    (${escapeHtml(
                                        ingredient.unit
                                    )})
                                </option>
                                `
                        )
                        .join("");


                const total =
                    Number(
                        item.quantity
                    ) *
                    Number(
                        item.unit_cost
                    );


                return `
                    <div
                        style="
                            border:1px solid #ddd;
                            border-radius:12px;
                            padding:12px;
                            margin:10px 0;
                        "
                    >

                        <label>
                            Bahan

                            <select
                                onchange="purchaseItemChange(
                                    ${index},
                                    'ingredient_id',
                                    this.value
                                )"
                            >

                                <option value="">
                                    Pilih bahan
                                </option>

                                ${ingredientOptions}

                            </select>

                        </label>


                        <label>
                            Jumlah

                            <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value="${Number(
                                    item.quantity
                                )}"
                                onchange="purchaseItemChange(
                                    ${index},
                                    'quantity',
                                    this.value
                                )"
                            >

                        </label>


                        <label>
                            Harga / Satuan

                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value="${Number(
                                    item.unit_cost
                                )}"
                                onchange="purchaseItemChange(
                                    ${index},
                                    'unit_cost',
                                    this.value
                                )"
                            >

                        </label>


                        <p>
                            Total:
                            <strong>
                                ${rupiah(
                                    total
                                )}
                            </strong>
                        </p>


                        <button
                            type="button"
                            onclick="removePurchaseItem(
                                ${index}
                            )"
                        >
                            Hapus
                        </button>

                    </div>
                `;
            }
        ).join("");


    updatePurchaseTotal();
}


function purchaseItemChange(
    index,
    field,
    value
) {

    if (
        !purchaseItems[index]
    ) {
        return;
    }


    if (
        field ===
        "ingredient_id"
    ) {

        purchaseItems[index]
            .ingredient_id =
            Number(value) || "";

    } else {

        purchaseItems[index][field] =
            Number(value) || 0;
    }


    renderPurchaseItems();
}


function updatePurchaseTotal() {

    const total =
        purchaseItems.reduce(
            function (
                sum,
                item
            ) {

                return (
                    sum +
                    (
                        Number(
                            item.quantity
                        ) *
                        Number(
                            item.unit_cost
                        )
                    )
                );
            },
            0
        );


    if ($("purchaseTotal")) {

        $("purchaseTotal")
            .textContent =
            rupiah(total);
    }
}


async function savePurchase(
    event
) {

    event.preventDefault();


    try {

        const cleanItems =
            purchaseItems
                .filter(
                    item =>
                        Number.isInteger(
                            Number(
                                item.ingredient_id
                            )
                        ) &&
                        Number(
                            item.ingredient_id
                        ) > 0 &&
                        Number(
                            item.quantity
                        ) > 0
                )
                .map(
                    item => ({
                        ingredient_id:
                            Number(
                                item.ingredient_id
                            ),

                        quantity:
                            Number(
                                item.quantity
                            ),

                        unit_cost:
                            Number(
                                item.unit_cost
                            ) || 0
                    })
                );


        if (
            cleanItems.length === 0
        ) {

            alert(
                "Tambahkan minimal satu bahan."
            );

            return;
        }


        await api(
            "/api/admin/purchases",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        supplier_id:
                            $("purchaseSupplier")
                                .value
                                ? Number(
                                    $("purchaseSupplier")
                                        .value
                                )
                                : null,

                        purchase_date:
                            $("purchaseDate")
                                .value ||
                            null,

                        invoice_number:
                            $("purchaseInvoice")
                                .value
                                .trim(),

                        notes:
                            $("purchaseNotes")
                                .value
                                .trim(),

                        items:
                            cleanItems
                    })
            }
        );


        closePurchase();


        await Promise.all([
            loadPurchases(),
            loadIngredients(),
            loadHpp()
        ]);


        alert(
            "Pembelian berhasil disimpan.\nStok bahan otomatis bertambah."
        );

    } catch (error) {

        showError(error);
    }
}


// ======================================================
// RECIPES
// ======================================================

async function loadRecipes() {

    try {

        recipes =
            await api(
                "/api/admin/recipes"
            );

        renderRecipes();

        fillMenuSelects();

    } catch (error) {

        console.error(
            "LOAD RECIPES:",
            error
        );
    }
}


function renderRecipes() {

    const container =
        $("recipeList");

    if (!container) {
        return;
    }


    if (!recipes.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada resep.
            </div>
            `;

        return;
    }


    container.innerHTML =
        recipes.map(
            function (recipe) {

                const items =
                    Array.isArray(
                        recipe.items
                    )
                        ? recipe.items
                        : [];


                return `
                    <article
                        class="order-card"
                        style="margin-bottom:15px;"
                    >

                        <div class="order-head">

                            <div>

                                <h3>
                                    ${escapeHtml(
                                        recipe.menu_name ||
                                        "-"
                                    )}
                                </h3>

                                <small>
                                    Harga jual:
                                    ${rupiah(
                                        recipe.price
                                    )}
                                </small>

                            </div>

                            <span class="badge">
                                HPP
                                ${rupiah(
                                    recipe.hpp
                                )}
                            </span>

                        </div>


                        <div
                            style="
                                margin:10px 0;
                            "
                        >

                            ${items.map(
                                item =>
                                    `
                                    <div
                                        style="
                                            display:flex;
                                            justify-content:space-between;
                                            gap:10px;
                                            padding:6px 0;
                                            border-bottom:1px solid #eee;
                                        "
                                    >

                                        <span>
                                            ${escapeHtml(
                                                item.ingredient_name
                                            )}
                                            —
                                            ${numberFormat(
                                                item.quantity
                                            )}
                                            ${escapeHtml(
                                                item.unit
                                            )}
                                        </span>

                                        <b>
                                            ${rupiah(
                                                Number(
                                                    item.quantity
                                                ) *
                                                Number(
                                                    item.average_cost
                                                )
                                            )}
                                        </b>

                                    </div>
                                    `
                            ).join("")}

                        </div>


                        <p>
                            ${escapeHtml(
                                recipe.notes || ""
                            )}
                        </p>


                        <div
                            style="
                                display:flex;
                                gap:8px;
                                flex-wrap:wrap;
                            "
                        >

                            <button
                                type="button"
                                onclick="openRecipe(
                                    ${Number(
                                        recipe.id
                                    )}
                                )"
                            >
                                Edit
                            </button>

                            <button
                                type="button"
                                onclick="deleteRecipe(
                                    ${Number(
                                        recipe.id
                                    )}
                                )"
                            >
                                Hapus
                            </button>

                        </div>

                    </article>
                `;
            }
        ).join("");
}


function openRecipe(
    id = null
) {

    currentRecipeId =
        id
            ? Number(id)
            : null;


    $("recipeForm")?.reset();

    $("recipeId").value =
        currentRecipeId || "";


    recipeItems = [];


    fillMenuSelects();

    fillIngredientSelects();


    if (
        currentRecipeId
    ) {

        const recipe =
            recipes.find(
                x =>
                    Number(x.id) ===
                    currentRecipeId
            );

        if (!recipe) {
            return;
        }


        $("recipeMenu").value =
            String(
                recipe.menu_id
            );


        $("recipeNotes").value =
            recipe.notes || "";


        recipeItems =
            Array.isArray(
                recipe.items
            )
                ? recipe.items.map(
                    item => ({
                        ingredient_id:
                            Number(
                                item.ingredient_id
                            ),

                        quantity:
                            Number(
                                item.quantity
                            )
                    })
                )
                : [];
    }


    if (
        recipeItems.length === 0
    ) {

        recipeItems.push({
            ingredient_id: "",
            quantity: 1
        });
    }


    renderRecipeItems();


    $("recipeModal")
        ?.classList.remove(
            "hidden"
        );
}


function closeRecipe() {

    $("recipeModal")
        ?.classList.add(
            "hidden"
        );

    currentRecipeId =
        null;

    recipeItems = [];
}


function addRecipeItem() {

    recipeItems.push({
        ingredient_id: "",
        quantity: 1
    });


    renderRecipeItems();
}


function removeRecipeItem(
    index
) {

    recipeItems.splice(
        index,
        1
    );


    if (
        recipeItems.length === 0
    ) {

        recipeItems.push({
            ingredient_id: "",
            quantity: 1
        });
    }


    renderRecipeItems();
}


function renderRecipeItems() {

    const container =
        $("recipeItems");

    if (!container) {
        return;
    }


    container.innerHTML =
        recipeItems.map(
            function (
                item,
                index
            ) {

                const options =
                    ingredients
                        .filter(
                            x =>
                                Number(
                                    x.is_active
                                ) === 1
                        )
                        .map(
                            ingredient =>
                                `
                                <option
                                    value="${Number(
                                        ingredient.id
                                    )}"
                                    ${
                                        Number(
                                            item.ingredient_id
                                        ) ===
                                        Number(
                                            ingredient.id
                                        )
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    ${escapeHtml(
                                        ingredient.name
                                    )}
                                    (${escapeHtml(
                                        ingredient.unit
                                    )})
                                </option>
                                `
                        )
                        .join("");


                const selected =
                    ingredients.find(
                        x =>
                            Number(x.id) ===
                            Number(
                                item.ingredient_id
                            )
                    );


                const cost =
                    selected
                        ? Number(
                            selected.average_cost
                        )
                        : 0;


                const hpp =
                    Number(
                        item.quantity
                    ) *
                    cost;


                return `
                    <div
                        style="
                            border:1px solid #ddd;
                            border-radius:12px;
                            padding:12px;
                            margin:10px 0;
                        "
                    >

                        <label>
                            Bahan

                            <select
                                onchange="recipeItemChange(
                                    ${index},
                                    'ingredient_id',
                                    this.value
                                )"
                            >

                                <option value="">
                                    Pilih bahan
                                </option>

                                ${options}

                            </select>

                        </label>


                        <label>
                            Jumlah per menu

                            <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value="${Number(
                                    item.quantity
                                )}"
                                onchange="recipeItemChange(
                                    ${index},
                                    'quantity',
                                    this.value
                                )"
                            >

                        </label>


                        <p>
                            HPP bahan:
                            <strong>
                                ${rupiah(hpp)}
                            </strong>
                        </p>


                        <button
                            type="button"
                            onclick="removeRecipeItem(
                                ${index}
                            )"
                        >
                            Hapus
                        </button>

                    </div>
                `;
            }
        ).join("");


    updateRecipeHpp();
}


function recipeItemChange(
    index,
    field,
    value
) {

    if (
        !recipeItems[index]
    ) {
        return;
    }


    if (
        field ===
        "ingredient_id"
    ) {

        recipeItems[index]
            .ingredient_id =
            Number(value) || "";

    } else {

        recipeItems[index][field] =
            Number(value) || 0;
    }


    renderRecipeItems();
}


function updateRecipeHpp() {

    const hpp =
        recipeItems.reduce(
            function (
                total,
                item
            ) {

                const ingredient =
                    ingredients.find(
                        x =>
                            Number(x.id) ===
                            Number(
                                item.ingredient_id
                            )
                    );


                if (!ingredient) {
                    return total;
                }


                return (
                    total +
                    (
                        Number(
                            item.quantity
                        ) *
                        Number(
                            ingredient.average_cost
                        )
                    )
                );
            },
            0
        );


    if ($("recipeHpp")) {

        $("recipeHpp")
            .textContent =
            rupiah(hpp);
    }
}


async function saveRecipe(
    event
) {

    event.preventDefault();


    try {

        const menuId =
            Number(
                $("recipeMenu")
                    .value
            );


        const cleanItems =
            recipeItems
                .filter(
                    item =>
                        Number.isInteger(
                            Number(
                                item.ingredient_id
                            )
                        ) &&
                        Number(
                            item.ingredient_id
                        ) > 0 &&
                        Number(
                            item.quantity
                        ) > 0
                )
                .map(
                    item => ({
                        ingredient_id:
                            Number(
                                item.ingredient_id
                            ),

                        quantity:
                            Number(
                                item.quantity
                            )
                    })
                );


        if (
            !Number.isInteger(
                menuId
            ) ||
            menuId <= 0
        ) {

            alert(
                "Pilih menu."
            );

            return;
        }


        if (
            cleanItems.length === 0
        ) {

            alert(
                "Tambahkan minimal satu bahan."
            );

            return;
        }


        await api(
            "/api/admin/recipes",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        menu_id:
                            menuId,

                        notes:
                            $("recipeNotes")
                                .value
                                .trim(),

                        items:
                            cleanItems
                    })
            }
        );


        closeRecipe();


        await Promise.all([
            loadRecipes(),
            loadHpp()
        ]);


        alert(
            "Resep berhasil disimpan."
        );

    } catch (error) {

        showError(error);
    }
}


async function deleteRecipe(
    id
) {

    const yes =
        confirm(
            "Hapus resep ini?"
        );

    if (!yes) {
        return;
    }


    try {

        await api(
            `/api/admin/recipes/${id}`,
            {
                method: "DELETE"
            }
        );


        await Promise.all([
            loadRecipes(),
            loadHpp()
        ]);


    } catch (error) {

        showError(error);
    }
}


// ======================================================
// HPP
// ======================================================

async function loadHpp() {

    try {

        hppData =
            await api(
                "/api/admin/hpp"
            );

        renderHpp();

    } catch (error) {

        console.error(
            "LOAD HPP:",
            error
        );
    }
}


function renderHpp() {

    const container =
        $("hppList");

    if (!container) {
        return;
    }


    if (!hppData.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada data HPP.
            </div>
            `;

        return;
    }


    container.innerHTML =
        `
        <div
            style="
                overflow-x:auto;
            "
        >

            <table
                style="
                    width:100%;
                    border-collapse:collapse;
                "
            >

                <thead>

                    <tr>

                        <th
                            style="
                                text-align:left;
                                padding:10px;
                            "
                        >
                            Menu
                        </th>

                        <th
                            style="
                                text-align:right;
                                padding:10px;
                            "
                        >
                            Harga Jual
                        </th>

                        <th
                            style="
                                text-align:right;
                                padding:10px;
                            "
                        >
                            HPP
                        </th>

                        <th
                            style="
                                text-align:right;
                                padding:10px;
                            "
                        >
                            Laba Kotor
                        </th>

                        <th
                            style="
                                text-align:right;
                                padding:10px;
                            "
                        >
                            Margin
                        </th>

                    </tr>

                </thead>

                <tbody>

                    ${hppData.map(
                        item =>
                            `
                            <tr>

                                <td
                                    style="
                                        padding:10px;
                                    "
                                >
                                    <b>
                                        ${escapeHtml(
                                            item.name
                                        )}
                                    </b>

                                    <br>

                                    <small>
                                        ${escapeHtml(
                                            item.category
                                        )}
                                    </small>
                                </td>

                                <td
                                    style="
                                        text-align:right;
                                        padding:10px;
                                    "
                                >
                                    ${rupiah(
                                        item.price
                                    )}
                                </td>

                                <td
                                    style="
                                        text-align:right;
                                        padding:10px;
                                    "
                                >
                                    ${rupiah(
                                        item.hpp
                                    )}
                                </td>

                                <td
                                    style="
                                        text-align:right;
                                        padding:10px;
                                    "
                                >
                                    ${rupiah(
                                        item.gross_profit
                                    )}
                                </td>

                                <td
                                    style="
                                        text-align:right;
                                        padding:10px;
                                    "
                                >
                                    ${Number(
                                        item.margin_percent
                                    ).toFixed(1)}
                                    %
                                </td>

                            </tr>
                            `
                    ).join("")}

                </tbody>

            </table>

        </div>
        `;
}


// ======================================================
// EXPENSES
// ======================================================

async function loadExpenses() {

    try {

        expenses =
            await api(
                "/api/admin/expenses"
            );

        renderExpenses();

    } catch (error) {

        console.error(
            "LOAD EXPENSES:",
            error
        );
    }
}


function renderExpenses() {

    const container =
        $("expenseList");

    if (!container) {
        return;
    }


    const summary =
        $("expenseSummary");


    const total =
        expenses.reduce(
            function (
                sum,
                item
            ) {

                return (
                    sum +
                    Number(
                        item.amount
                    )
                );
            },
            0
        );


    if (summary) {

        const categoryTotals =
            {};


        expenses.forEach(
            function (item) {

                const category =
                    item.category ||
                    "Lainnya";


                categoryTotals[category] =
                    (
                        categoryTotals[
                            category
                        ] || 0
                    ) +
                    Number(
                        item.amount
                    );
            }
        );


        summary.innerHTML =
            `
            <div>

                <small>
                    TOTAL BIAYA
                </small>

                <h2>
                    ${rupiah(total)}
                </h2>

            </div>

            ${Object.entries(
                categoryTotals
            ).map(
                function (
                    [
                        category,
                        amount
                    ]
                ) {

                    return `
                        <div>

                            <small>
                                ${escapeHtml(
                                    category
                                )}
                            </small>

                            <b>
                                ${rupiah(
                                    amount
                                )}
                            </b>

                        </div>
                    `;
                }
            ).join("")}
            `;
    }


    if (!expenses.length) {

        container.innerHTML =
            `
            <div class="empty">
                Belum ada biaya operasional.
            </div>
            `;

        return;
    }


    container.innerHTML =
        expenses.map(
            function (expense) {

                return `
                    <article
                        class="order-card"
                        style="margin-bottom:12px;"
                    >

                        <div class="order-head">

                            <div>

                                <h3>
                                    ${escapeHtml(
                                        expense.description ||
                                        expense.category
                                    )}
                                </h3>

                                <small>
                                    ${formatDate(
                                        expense.expense_date
                                    )}
                                </small>

                            </div>

                            <b>
                                ${rupiah(
                                    expense.amount
                                )}
                            </b>

                        </div>


                        <p>
                            Kategori:
                            ${escapeHtml(
                                expense.category
                            )}
                        </p>


                        <p>
                            ${escapeHtml(
                                expense.notes ||
                                ""
                            )}
                        </p>


                        <button
                            type="button"
                            onclick="deleteExpense(
                                ${Number(
                                    expense.id
                                )}
                            )"
                        >
                            Hapus
                        </button>

                    </article>
                `;
            }
        ).join("");
}


function openExpense() {

    $("expenseForm")?.reset();

    $("expenseDate").value =
        localDateTimeValue();


    $("expenseModal")
        ?.classList.remove(
            "hidden"
        );
}


function closeExpense() {

    $("expenseModal")
        ?.classList.add(
            "hidden"
        );
}


async function saveExpense(
    event
) {

    event.preventDefault();


    try {

        const amount =
            Number(
                $("expenseAmount")
                    .value
            );


        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            alert(
                "Jumlah biaya tidak valid."
            );

            return;
        }


        await api(
            "/api/admin/expenses",
            {
                method: "POST",

                body:
                    JSON.stringify({

                        expense_date:
                            $("expenseDate")
                                .value ||
                            null,

                        category:
                            $("expenseCategory")
                                .value,

                        description:
                            $("expenseDescription")
                                .value
                                .trim(),

                        amount,

                        notes:
                            $("expenseNotes")
                                .value
                                .trim()
                    })
            }
        );


        closeExpense();


        await loadExpenses();

        await loadReport();


        alert(
            "Biaya operasional berhasil disimpan."
        );

    } catch (error) {

        showError(error);
    }
}


async function deleteExpense(
    id
) {

    const yes =
        confirm(
            "Hapus biaya operasional ini?"
        );

    if (!yes) {
        return;
    }


    try {

        await api(
            `/api/admin/expenses/${id}`,
            {
                method: "DELETE"
            }
        );


        await loadExpenses();

        await loadReport();

    } catch (error) {

        showError(error);
    }
}


// ======================================================
// REPORT
// ======================================================

async function loadReport() {

    try {

        const data =
            await api(
                "/api/admin/report"
            );

        renderReport(
            data
        );

    } catch (error) {

        console.error(
            "LOAD REPORT:",
            error
        );
    }
}


function renderReport(
    data
) {

    const container =
        $("reportBox");

    if (!container) {
        return;
    }


    const revenue =
        Number(
            data.revenue
        ) || 0;


    const paid =
        Number(
            data.paid
        ) || 0;


    const hpp =
        Number(
            data.hpp
        ) || 0;


    const gross =
        Number(
            data.gross_profit
        ) || 0;


    const expensesTotal =
        Number(
            data.expenses
        ) || 0;


    const net =
        Number(
            data.net_profit
        ) || 0;


    const top =
        Array.isArray(
            data.top
        )
            ? data.top
            : [];


    container.innerHTML =
        `

        <div
            class="report-grid"
        >

            <div>

                <small>
                    PESANAN HARI INI
                </small>

                <h2>
                    ${Number(
                        data.orders || 0
                    )}
                </h2>

            </div>


            <div>

                <small>
                    OMZET
                </small>

                <h2>
                    ${rupiah(
                        revenue
                    )}
                </h2>

            </div>


            <div>

                <small>
                    SUDAH DIBAYAR
                </small>

                <h2>
                    ${rupiah(
                        paid
                    )}
                </h2>

            </div>


            <div>

                <small>
                    HPP
                </small>

                <h2>
                    ${rupiah(
                        hpp
                    )}
                </h2>

            </div>


            <div>

                <small>
                    LABA KOTOR
                </small>

                <h2>
                    ${rupiah(
                        gross
                    )}
                </h2>

            </div>


            <div>

                <small>
                    BIAYA OPERASIONAL
                </small>

                <h2>
                    ${rupiah(
                        expensesTotal
                    )}
                </h2>

            </div>


            <div>

                <small>
                    LABA BERSIH
                </small>

                <h2>
                    ${rupiah(
                        net
                    )}
                </h2>

            </div>

        </div>


        <br>


        <div
            class="report"
        >

            <h2>
                Menu Terlaris Hari Ini
            </h2>


            ${
                top.length
                    ? `
                        <div
                            style="
                                overflow-x:auto;
                            "
                        >

                            <table
                                style="
                                    width:100%;
                                    border-collapse:collapse;
                                "
                            >

                                <thead>

                                    <tr>

                                        <th
                                            style="
                                                text-align:left;
                                                padding:10px;
                                            "
                                        >
                                            Menu
                                        </th>

                                        <th
                                            style="
                                                text-align:right;
                                                padding:10px;
                                            "
                                        >
                                            Qty
                                        </th>

                                        <th
                                            style="
                                                text-align:right;
                                                padding:10px;
                                            "
                                        >
                                            Omzet
                                        </th>

                                        <th
                                            style="
                                                text-align:right;
                                                padding:10px;
                                            "
                                        >
                                            HPP
                                        </th>

                                    </tr>

                                </thead>

                                <tbody>

                                    ${top.map(
                                        item =>
                                            `
                                            <tr>

                                                <td
                                                    style="
                                                        padding:10px;
                                                    "
                                                >
                                                    ${escapeHtml(
                                                        item.menu_name
                                                    )}
                                                </td>

                                                <td
                                                    style="
                                                        text-align:right;
                                                        padding:10px;
                                                    "
                                                >
                                                    ${Number(
                                                        item.qty
                                                    )}
                                                </td>

                                                <td
                                                    style="
                                                        text-align:right;
                                                        padding:10px;
                                                    "
                                                >
                                                    ${rupiah(
                                                        item.revenue
                                                    )}
                                                </td>

                                                <td
                                                    style="
                                                        text-align:right;
                                                        padding:10px;
                                                    "
                                                >
                                                    ${rupiah(
                                                        item.hpp
                                                    )}
                                                </td>

                                            </tr>
                                            `
                                    ).join("")}

                                </tbody>

                            </table>

                        </div>
                    `
                    : `
                        <p>
                            Belum ada penjualan hari ini.
                        </p>
                    `
            }

        </div>

        `;
}


// ======================================================
// SELECT OPTIONS
// ======================================================

function fillSupplierSelect() {

    const select =
        $("purchaseSupplier");

    if (!select) {
        return;
    }


    const current =
        select.value;


    select.innerHTML =
        `
        <option value="">
            Tanpa Supplier
        </option>

        ${
            suppliers
                .filter(
                    supplier =>
                        Number(
                            supplier.is_active
                        ) === 1
                )
                .map(
                    supplier =>
                        `
                        <option
                            value="${Number(
                                supplier.id
                            )}"
                        >
                            ${escapeHtml(
                                supplier.name
                            )}
                        </option>
                        `
                )
                .join("")
        }
        `;


    if (current) {

        select.value =
            current;
    }
}


function fillIngredientSelects() {

    // Select resep/pembelian dirender
    // secara dinamis.

    // Fungsi ini dipakai sebagai
    // sinkronisasi data saja.

    return;
}


function fillMenuSelects() {

    const select =
        $("recipeMenu");

    if (!select) {
        return;
    }


    const current =
        select.value;


    select.innerHTML =
        `
        <option value="">
            Pilih Menu
        </option>

        ${
            menus
                .filter(
                    menu =>
                        Number(
                            menu.active
                        ) === 1
                )
                .map(
                    menu =>
                        `
                        <option
                            value="${Number(
                                menu.id
                            )}"
                        >
                            ${escapeHtml(
                                menu.name
                            )}
                        </option>
                        `
                )
                .join("")
        }
        `;


    if (current) {

        select.value =
            current;
    }
}


// ======================================================
// AUTO REFRESH PESANAN
// ======================================================

setInterval(
    async function () {

        const app =
            $("app");

        if (
            !app ||
            app.classList.contains(
                "hidden"
            )
        ) {
            return;
        }


        try {

            await loadOrders();

        } catch (error) {

            console.error(
                "AUTO REFRESH:",
                error
            );
        }

    },
    15000
);


// ======================================================
// CLOSE MODAL WHEN CLICK OUTSIDE
// ======================================================

document.addEventListener(
    "click",
    function (event) {

        const modals =
            document.querySelectorAll(
                ".modal"
            );


        modals.forEach(
            function (modal) {

                if (
                    event.target ===
                    modal
                ) {

                    modal.classList.add(
                        "hidden"
                    );
                }
            }
        );
    }
);


// ======================================================
// ESCAPE KEY CLOSE MODAL
// ======================================================

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key !==
            "Escape"
        ) {
            return;
        }


        document
            .querySelectorAll(
                ".modal"
            )
            .forEach(
                function (modal) {

                    modal.classList.add(
                        "hidden"
                    );
                }
            );
    }
);


// ======================================================
// EXPORT GLOBAL FUNCTIONS
// Supaya onclick="" di HTML bisa menjalankan fungsi
// ======================================================

window.showTab =
    showTab;

window.logout =
    logout;

window.loadOrders =
    loadOrders;

window.updateOrder =
    updateOrder;

window.markPaid =
    markPaid;

window.cancelOrder =
    cancelOrder;

window.deleteOrder =
    deleteOrder;

window.openMenu =
    openMenu;

window.closeMenu =
    closeMenu;

window.deactivateMenu =
    deactivateMenu;

window.activateMenu =
    activateMenu;

window.loadMenus =
    loadMenus;

window.openIngredient =
    openIngredient;

window.closeIngredient =
    closeIngredient;

window.loadIngredients =
    loadIngredients;

window.adjustIngredient =
    adjustIngredient;

window.openSupplier =
    openSupplier;

window.closeSupplier =
    closeSupplier;

window.loadSuppliers =
    loadSuppliers;

window.openPurchase =
    openPurchase;

window.closePurchase =
    closePurchase;

window.addPurchaseItem =
    addPurchaseItem;

window.removePurchaseItem =
    removePurchaseItem;

window.purchaseItemChange =
    purchaseItemChange;

window.loadPurchases =
    loadPurchases;

window.openRecipe =
    openRecipe;

window.closeRecipe =
    closeRecipe;

window.addRecipeItem =
    addRecipeItem;

window.removeRecipeItem =
    removeRecipeItem;

window.recipeItemChange =
    recipeItemChange;

window.loadRecipes =
    loadRecipes;

window.deleteRecipe =
    deleteRecipe;

window.loadHpp =
    loadHpp;

window.openExpense =
    openExpense;

window.closeExpense =
    closeExpense;

window.loadExpenses =
    loadExpenses;

window.deleteExpense =
    deleteExpense;

window.loadReport =
    loadReport;