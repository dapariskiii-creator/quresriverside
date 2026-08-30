const rupiah = (number) => {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(number);
};

const escapeHtml = (text) => {
    return String(text).replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[char];
    });
};

async function checkLogin() {
    const response = await fetch("/api/me");
    const data = await response.json();

    if (data.logged_in) {
        document.getElementById("login").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");

        await loadOrders();
        await loadMenu();
        await loadReport();
    } else {
        document.getElementById("login").classList.remove("hidden");
    }
}

document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const loginError = document.getElementById("loginError");
    const username = document.getElementById("user").value.trim();
    const password = document.getElementById("pass").value;

    loginError.textContent = "";

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            loginError.textContent = data.error || "Username atau password salah.";
            return;
        }

        // Setelah login berhasil, langsung tampilkan dashboard kasir.
        await checkLogin();
    } catch (error) {
        console.error(error);
        loginError.textContent = "Server tidak dapat dihubungi.";
    }
});

async function logout() {
    await fetch("/api/logout", {
        method: "POST"
    });

    window.location.reload();
}

function showTab(tabId, button) {
    const sections = ["orders", "menu", "report"];

    sections.forEach((sectionId) => {
        document.getElementById(sectionId).classList.toggle(
            "hidden",
            sectionId !== tabId
        );
    });

    document.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.remove("active");
    });

    button.classList.add("active");

    if (tabId === "orders") {
        loadOrders();
    }

    if (tabId === "menu") {
        loadMenu();
    }

    if (tabId === "report") {
        loadReport();
    }
}

async function loadOrders() {
    const response = await fetch("/api/orders");

    if (response.status === 401) {
        window.location.reload();
        return;
    }

    const orders = await response.json();

    const newOrders = orders.filter((order) => order.status === "baru");
    const processingOrders = orders.filter(
        (order) => order.status === "diproses"
    );
    const completedOrders = orders.filter(
        (order) => order.status === "selesai"
    );

    document.getElementById("n").textContent = newOrders.length;
    document.getElementById("p").textContent = processingOrders.length;
    document.getElementById("d").textContent = completedOrders.length;

    const revenue = completedOrders.reduce(
        (total, order) => total + Number(order.total),
        0
    );

    document.getElementById("rev").textContent = rupiah(revenue);

    const orderList = document.getElementById("orderList");

    if (orders.length === 0) {
        orderList.innerHTML = `
            <div class="order empty-order">
                <h2>Belum ada pesanan</h2>
                <p>
                    Kalau pelanggan sudah checkout dari website,
                    pesanan akan muncul otomatis di halaman ini.
                </p>
            </div>
        `;
        return;
    }

    orderList.innerHTML = orders.map((order) => {
        const itemHtml = order.items.map((item) => {
            return `
                <div class="item">
                    <span>
                        ${item.qty} × ${escapeHtml(item.menu_name)}
                    </span>
                    <b>${rupiah(item.subtotal)}</b>
                </div>
            `;
        }).join("");

        let actionHtml = "";

        if (order.status === "baru") {
            actionHtml += `
                <button
                    class="primary"
                    onclick="updateOrder(${order.id}, { status: 'diproses' })"
                >
                    Terima & Proses
                </button>
            `;
        }

        if (order.status === "diproses") {
            actionHtml += `
                <button
                    class="primary"
                    onclick="updateOrder(${order.id}, { status: 'selesai' })"
                >
                    Tandai Selesai
                </button>
            `;
        }

        if (
            order.payment_status !== "dibayar" &&
            order.status !== "dibatalkan"
        ) {
            actionHtml += `
                <button
                    onclick="updateOrder(${order.id}, { payment_status: 'dibayar' })"
                >
                    ✓ Sudah Bayar
                </button>
            `;
        }

        if (
            order.status !== "selesai" &&
            order.status !== "dibatalkan"
        ) {
            actionHtml += `
                <button
                    class="danger"
                    onclick="updateOrder(${order.id}, { status: 'dibatalkan' })"
                >
                    Batalkan
                </button>
            `;
        }

        if (
            order.status === "selesai" ||
            order.status === "dibatalkan"
        ) {
            actionHtml += `
                <button onclick="deleteOrder(${order.id})">
                    Hapus
                </button>
            `;
        }

        const paymentLabel =
            order.payment_status === "dibayar"
                ? "SUDAH BAYAR"
                : "BELUM BAYAR";

        const tableLabel = order.table_number
            ? `Meja ${escapeHtml(order.table_number)}`
            : "Take away";

        return `
            <article class="order">
                <div class="oh">
                    <div>
                        <b class="oid">ORDER #${order.id}</b>
                        <div class="muted">
                            ${new Date(order.created_at).toLocaleString("id-ID")}
                        </div>
                    </div>

                    <b>${order.status.toUpperCase()}</b>
                </div>

                <p>
                    <b>${escapeHtml(order.customer_name)}</b>
                    <span class="muted">
                        • ${tableLabel}
                        • ${paymentLabel}
                    </span>
                </p>

                <div class="order-items">
                    ${itemHtml}
                </div>

                <div class="total">
                    <span>Total</span>
                    <b>${rupiah(order.total)}</b>
                </div>

                <div class="actions">
                    ${actionHtml}
                </div>
            </article>
        `;
    }).join("");
}

async function updateOrder(orderId, changes) {
    const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(changes)
    });

    if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Gagal memperbarui pesanan.");
        return;
    }

    await loadOrders();
    await loadReport();
}

async function deleteOrder(orderId) {
    if (!confirm("Hapus pesanan ini dari dashboard?")) {
        return;
    }

    await fetch(`/api/orders/${orderId}`, {
        method: "DELETE"
    });

    await loadOrders();
}

async function loadMenu() {
    const response = await fetch("/api/admin/menu");

    if (response.status === 401) {
        window.location.reload();
        return;
    }

    const menus = await response.json();
    const menuList = document.getElementById("menuList");

    menuList.innerHTML = menus.map((menu) => {
        const activeLabel = menu.active ? "Aktif" : "Nonaktif";

        return `
            <article class="menu-item">
                <div class="menu-image">
                    ${
                        menu.image_url
                            ? `<img src="${escapeHtml(menu.image_url)}" alt="${escapeHtml(menu.name)}">`
                            : `<span>☕</span>`
                    }
                </div>

                <h3>${escapeHtml(menu.name)}</h3>

                <p>
                    Kategori: ${escapeHtml(menu.category)}
                    <br>
                    Status: ${activeLabel}
                    <br>
                    Stok: ${menu.stock}
                </p>

                <b>${rupiah(menu.price)}</b>

                <div class="actions">
                    <button onclick='editMenu(${JSON.stringify(menu)})'>
                        Edit
                    </button>

                    ${
                        menu.active
                            ? `<button class="danger" onclick="removeMenu(${menu.id})">Nonaktifkan</button>`
                            : ""
                    }
                </div>
            </article>
        `;
    }).join("");
}

function openMenu(menu = {}) {
    document.getElementById("mid").value = menu.id || "";
    document.getElementById("mn").value = menu.name || "";
    document.getElementById("mc").value = menu.category || "minuman";
    document.getElementById("mp").value = menu.price || 0;
    document.getElementById("ms").value =
        menu.stock === undefined ? 0 : menu.stock;
    document.getElementById("md").value = menu.description || "";
    document.getElementById("mi").value = menu.image_url || "";

    document.getElementById("menuModal").classList.remove("hidden");
}

function closeMenu() {
    document.getElementById("menuModal").classList.add("hidden");
}

function editMenu(menu) {
    openMenu(menu);
}

document.getElementById("menuForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const menuId = document.getElementById("mid").value;

    const menuData = {
        name: document.getElementById("mn").value.trim(),
        category: document.getElementById("mc").value,
        price: Number(document.getElementById("mp").value),
        stock: Number(document.getElementById("ms").value),
        description: document.getElementById("md").value.trim(),
        image_url: document.getElementById("mi").value.trim(),
        active: true
    };

    const url = menuId
        ? `/api/admin/menu/${menuId}`
        : "/api/admin/menu";

    const method = menuId ? "PUT" : "POST";

    const response = await fetch(url, {
        method: method,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(menuData)
    });

    if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Gagal menyimpan menu.");
        return;
    }

    closeMenu();
    await loadMenu();
});

async function removeMenu(menuId) {
    if (!confirm("Nonaktifkan menu ini?")) {
        return;
    }

    await fetch(`/api/admin/menu/${menuId}`, {
        method: "DELETE"
    });

    await loadMenu();
}

async function loadReport() {
    const response = await fetch("/api/admin/report");

    if (!response.ok) {
        return;
    }

    const report = await response.json();

    const topMenuHtml = report.top.length
        ? report.top.map((item) => {
            return `
                <div class="toprow">
                    <span>
                        ${escapeHtml(item.menu_name)}
                        × ${item.qty}
                    </span>
                    <b>${rupiah(item.revenue)}</b>
                </div>
            `;
        }).join("")
        : `<p class="muted">Belum ada penjualan hari ini.</p>`;

    document.getElementById("reportBox").innerHTML = `
        <div class="report-grid">
            <div class="report">
                <small>OMZET HARI INI</small>
                <h2>${rupiah(report.revenue)}</h2>
            </div>

            <div class="report">
                <small>SUDAH DIBAYAR</small>
                <h2>${rupiah(report.paid)}</h2>
            </div>
        </div>

        <br>

        <div class="report">
            <b>Menu Terlaris Hari Ini</b>
            ${topMenuHtml}
        </div>
    `;
}

// Refresh pesanan setiap 5 detik.
// Jadi kasir tidak perlu menekan refresh terus.
setInterval(() => {
    const app = document.getElementById("app");

    if (!app.classList.contains("hidden")) {
        loadOrders();
    }
}, 5000);

checkLogin();
