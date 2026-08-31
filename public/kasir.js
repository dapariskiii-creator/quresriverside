// QURES RIVERSIDE - KASIR.JS
// Versi bersih

// ===============================
// FORMAT RUPIAH
// ===============================

function rupiah(number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(number) || 0);
}


// ===============================
// ESCAPE HTML
// ===============================

function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, function (char) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[char];
    });
}


// ===============================
// CEK LOGIN
// ===============================

async function checkLogin() {
    try {
        const response = await fetch("/api/me");
        const data = await response.json();

        const login = document.getElementById("login");
        const app = document.getElementById("app");

        if (data.logged_in) {
            login.classList.add("hidden");
            app.classList.remove("hidden");

            await loadOrders();
            await loadMenu();
            await loadReport();
        } else {
            login.classList.remove("hidden");
            app.classList.add("hidden");
        }
    } catch (error) {
        console.error("CHECK LOGIN ERROR:", error);
    }
}


// ===============================
// LOGIN
// ===============================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const username = document.getElementById("user").value.trim();
        const password = document.getElementById("pass").value;
        const loginError = document.getElementById("loginError");

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
                loginError.textContent =
                    data.error || "Username atau password salah.";
                return;
            }

            await checkLogin();

        } catch (error) {
            console.error("LOGIN ERROR:", error);
            loginError.textContent = "Server tidak dapat dihubungi.";
        }
    });
}


// ===============================
// LOGOUT
// ===============================

async function logout() {
    try {
        await fetch("/api/logout", {
            method: "POST"
        });
    } catch (error) {
        console.error("LOGOUT ERROR:", error);
    }

    window.location.reload();
}


// ===============================
// TAB
// ===============================

function showTab(tabId, button) {
    const sections = [
        "orders",
        "menu",
        "report"
    ];

    sections.forEach(function (sectionId) {
        const section = document.getElementById(sectionId);

        if (!section) {
            return;
        }

        section.classList.toggle(
            "hidden",
            sectionId !== tabId
        );
    });

    document.querySelectorAll(".tab").forEach(function (tab) {
        tab.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    }

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


// ===============================
// LOAD PESANAN
// ===============================

async function loadOrders() {
    try {
        const response = await fetch("/api/orders");

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        const orders = await response.json();

        if (!Array.isArray(orders)) {
            console.error("DATA PESANAN:", orders);
            return;
        }

        const newOrders = orders.filter(function (order) {
            return order.status === "baru";
        });

        const processingOrders = orders.filter(function (order) {
            return order.status === "diproses";
        });

        const completedOrders = orders.filter(function (order) {
            return order.status === "selesai";
        });

        const n = document.getElementById("n");
        const p = document.getElementById("p");
        const d = document.getElementById("d");
        const rev = document.getElementById("rev");
        const orderList = document.getElementById("orderList");

        if (n) {
            n.textContent = newOrders.length;
        }

        if (p) {
            p.textContent = processingOrders.length;
        }

        if (d) {
            d.textContent = completedOrders.length;
        }

        const revenue = completedOrders.reduce(function (total, order) {
            return total + Number(order.total || 0);
        }, 0);

        if (rev) {
            rev.textContent = rupiah(revenue);
        }

        if (!orderList) {
            return;
        }

        if (orders.length === 0) {
            orderList.innerHTML = `
                <div class="order empty-order">
                    <h2>Belum ada pesanan</h2>
                    <p>
                        Kalau pelanggan sudah checkout,
                        pesanan akan muncul otomatis di sini.
                    </p>
                </div>
            `;

            return;
        }

        orderList.innerHTML = orders.map(function (order) {

            const items = Array.isArray(order.items)
                ? order.items
                : [];

            const itemHtml = items.map(function (item) {
                return `
                    <div class="item">
                        <span>
                            ${Number(item.qty)} x
                            ${escapeHtml(item.menu_name)}
                        </span>

                        <b>
                            ${rupiah(item.subtotal)}
                        </b>
                    </div>
                `;
            }).join("");

            let actionHtml = "";

            if (order.status === "baru") {
                actionHtml += `
                    <button
                        class="primary"
                        onclick="updateOrder(${Number(order.id)}, 'diproses')"
                    >
                        Terima & Proses
                    </button>
                `;
            }

            if (order.status === "diproses") {
                actionHtml += `
                    <button
                        class="primary"
                        onclick="updateOrder(${Number(order.id)}, 'selesai')"
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
                        onclick="markAsPaid(${Number(order.id)})"
                    >
                        Sudah Bayar
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
                        onclick="cancelOrder(${Number(order.id)})"
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
                    <button
                        onclick="deleteOrder(${Number(order.id)})"
                    >
                        Hapus
                    </button>
                `;
            }

            const paymentLabel =
                order.payment_status === "dibayar"
                    ? "SUDAH BAYAR"
                    : "BELUM BAYAR";

            const tableLabel =
                order.table_number
                    ? "Meja " + escapeHtml(order.table_number)
                    : "Take away";

            return `
                <article class="order">

                    <div class="oh">
                        <div>
                            <b class="oid">
                                ORDER #${Number(order.id)}
                            </b>

                            <div class="muted">
                                ${new Date(
                                    order.created_at
                                ).toLocaleString("id-ID")}
                            </div>
                        </div>

                        <b>
                            ${escapeHtml(
                                String(order.status || "").toUpperCase()
                            )}
                        </b>
                    </div>

                    <p>
                        <b>
                            ${escapeHtml(order.customer_name || "")}
                        </b>

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

                        <b>
                            ${rupiah(order.total)}
                        </b>
                    </div>

                    <div class="actions">
                        ${actionHtml}
                    </div>

                </article>
            `;
        }).join("");

    } catch (error) {
        console.error("LOAD ORDERS ERROR:", error);
    }
}


// ===============================
// UPDATE STATUS PESANAN
// ===============================

async function updateOrder(orderId, status) {
    try {
        const response = await fetch(
            `/api/orders/${orderId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    status: status
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Gagal memperbarui pesanan."
            );

            return;
        }

        await loadOrders();
        await loadReport();

    } catch (error) {
        console.error("UPDATE ORDER ERROR:", error);
        alert("Server tidak dapat dihubungi.");
    }
}


// ===============================
// SUDAH BAYAR
// ===============================

async function markAsPaid(orderId) {
    try {
        const response = await fetch(
            `/api/orders/${orderId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    payment_status: "dibayar"
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Gagal mengubah pembayaran."
            );

            return;
        }

        await loadOrders();
        await loadReport();

    } catch (error) {
        console.error("PAYMENT ERROR:", error);
        alert("Server tidak dapat dihubungi.");
    }
}


// ===============================
// BATALKAN PESANAN
// ===============================

async function cancelOrder(orderId) {
    const yakin = confirm(
        "Yakin ingin membatalkan pesanan ini?"
    );

    if (!yakin) {
        return;
    }

    try {
        const response = await fetch(
            `/api/orders/${orderId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    status: "dibatalkan"
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Gagal membatalkan pesanan."
            );

            return;
        }

        await loadOrders();

    } catch (error) {
        console.error("CANCEL ORDER ERROR:", error);
        alert("Server tidak dapat dihubungi.");
    }
}


// ===============================
// HAPUS PESANAN
// ===============================

async function deleteOrder(orderId) {
    const yakin = confirm(
        "Hapus pesanan ini dari dashboard?"
    );

    if (!yakin) {
        return;
    }

    try {
        const response = await fetch(
            `/api/orders/${orderId}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            alert(
                data.error ||
                "Gagal menghapus pesanan."
            );

            return;
        }

        await loadOrders();

    } catch (error) {
        console.error("DELETE ORDER ERROR:", error);
        alert("Server tidak dapat dihubungi.");
    }
}


// ===============================
// LOAD MENU
// ===============================

async function loadMenu() {
    try {
        const response = await fetch("/api/admin/menu");

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        const menus = await response.json();

        const menuList = document.getElementById("menuList");

        if (!menuList) {
            return;
        }

        if (!Array.isArray(menus)) {
            menuList.innerHTML =
                "<p>Gagal mengambil menu.</p>";

            return;
        }

        if (menus.length === 0) {
            menuList.innerHTML =
                "<p>Belum ada menu.</p>";

            return;
        }

        menuList.innerHTML = menus.map(function (menu) {

            let imageHtml = `
                <span>☕</span>
            `;

            if (menu.image_url) {
                imageHtml = `
                    <img
                        src="${escapeHtml(menu.image_url)}"
                        alt="${escapeHtml(menu.name)}"
                        onerror="this.style.display='none'"
                    >
                `;
            }

            const status =
                Number(menu.active)
                    ? "Aktif"
                    : "Nonaktif";

            return `
                <article class="menu-item">

                    <div class="menu-image">
                        ${imageHtml}
                    </div>

                    <h3>
                        ${escapeHtml(menu.name)}
                    </h3>

                    <p>
                        Kategori:
                        ${escapeHtml(menu.category)}

                        <br>

                        Status:
                        ${status}

                        <br>

                        Stok:
                        ${Number(menu.stock)}
                    </p>

                    <b>
                        ${rupiah(menu.price)}
                    </b>

                    <div class="actions">

                        <button
                            onclick="editMenuById(${Number(menu.id)})"
                        >
                            Edit
                        </button>

                        ${
                            Number(menu.active)
                                ? `
                                    <button
                                        class="danger"
                                        onclick="removeMenu(${Number(menu.id)})"
                                    >
                                        Nonaktifkan
                                    </button>
                                `
                                : ""
                        }

                    </div>

                </article>
            `;
        }).join("");

    } catch (error) {
        console.error("LOAD MENU ERROR:", error);
    }
}


// ===============================
// EDIT MENU
// ===============================

async function editMenuById(menuId) {
    try {
        const response = await fetch("/api/admin/menu");

        if (!response.ok) {
            alert("Gagal mengambil data menu.");
            return;
        }

        const menus = await response.json();

        const menu = menus.find(function (item) {
            return Number(item.id) === Number(menuId);
        });

        if (!menu) {
            alert("Menu tidak ditemukan.");
            return;
        }

        openMenu(menu);

    } catch (error) {
        console.error("EDIT MENU ERROR:", error);
        alert("Gagal mengambil data menu.");
    }
}


// ===============================
// BUKA MODAL MENU
// ===============================

function openMenu(menu) {

    menu = menu || {};

    document.getElementById("mid").value =
        menu.id || "";

    document.getElementById("mn").value =
        menu.name || "";

    document.getElementById("mc").value =
        menu.category || "minuman";

    document.getElementById("mp").value =
        menu.price || 0;

    document.getElementById("ms").value =
        menu.stock !== undefined
            ? menu.stock
            : 0;

    document.getElementById("md").value =
        menu.description || "";

    document.getElementById("mi").value =
        menu.image_url || "";

    const imageFile =
        document.getElementById("imageFile");

    if (imageFile) {
        imageFile.value = "";
    }

    showImagePreview(
        menu.image_url || ""
    );

    document
        .getElementById("menuModal")
        .classList.remove("hidden");
}


// ===============================
// TUTUP MODAL
// ===============================

function closeMenu() {
    document
        .getElementById("menuModal")
        .classList.add("hidden");
}


// ===============================
// PREVIEW FOTO
// ===============================

function showImagePreview(url) {
    const preview =
        document.getElementById("imagePreview");

    if (!preview) {
        return;
    }

    if (!url) {
        preview.innerHTML = "";
        return;
    }

    preview.innerHTML = `
        <img
            src="${escapeHtml(url)}"
            alt="Preview"
            style="
                width: 180px;
                height: 180px;
                object-fit: cover;
                border-radius: 12px;
            "
        >
    `;
}


// ===============================
// PILIH FOTO
// ===============================

const imageFileInput =
    document.getElementById("imageFile");

if (imageFileInput) {

    imageFileInput.addEventListener(
        "change",
        function () {

            const file = this.files[0];

            if (!file) {
                return;
            }

            if (!file.type.startsWith("image/")) {
                alert("File harus berupa gambar.");
                this.value = "";
                return;
            }

            if (file.size > 5 * 1024 * 1024) {
                alert("Ukuran foto maksimal 5 MB.");
                this.value = "";
                return;
            }

            const reader = new FileReader();

            reader.onload = function (event) {

                const preview =
                    document.getElementById(
                        "imagePreview"
                    );

                if (!preview) {
                    return;
                }

                preview.innerHTML = `
                    <img
                        src="${event.target.result}"
                        alt="Preview"
                        style="
                            width: 180px;
                            height: 180px;
                            object-fit: cover;
                            border-radius: 12px;
                        "
                    >
                `;
            };

            reader.readAsDataURL(file);
        }
    );
}


// ===============================
// UPLOAD FOTO
// ===============================

async function uploadImage(file) {

    const formData = new FormData();

    formData.append("image", file);

    const response = await fetch(
        "/api/admin/upload",
        {
            method: "POST",
            body: formData
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error ||
            "Upload foto gagal."
        );
    }

    return data.image_url;
}


// ===============================
// SIMPAN MENU
// ===============================

const menuForm =
    document.getElementById("menuForm");

if (menuForm) {

    menuForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            const saveButton =
                this.querySelector(
                    'button[type="submit"]'
                );

            const menuId =
                document.getElementById("mid").value;

            const imageFile =
                document.getElementById(
                    "imageFile"
                ).files[0];

            const imageInput =
                document.getElementById("mi");

            try {

                saveButton.disabled = true;

                saveButton.textContent =
                    imageFile
                        ? "Upload foto..."
                        : "Menyimpan...";

                if (imageFile) {

                    const imageUrl =
                        await uploadImage(
                            imageFile
                        );

                    imageInput.value =
                        imageUrl;
                }

                const menuData = {

                    name:
                        document
                            .getElementById("mn")
                            .value
                            .trim(),

                    category:
                        document
                            .getElementById("mc")
                            .value,

                    price:
                        Number(
                            document
                                .getElementById("mp")
                                .value
                        ),

                    stock:
                        Number(
                            document
                                .getElementById("ms")
                                .value
                        ),

                    description:
                        document
                            .getElementById("md")
                            .value
                            .trim(),

                    image_url:
                        imageInput.value.trim(),

                    active: true
                };

                if (!menuData.name) {
                    alert("Nama menu wajib diisi.");
                    return;
                }

                const url =
                    menuId
                        ? `/api/admin/menu/${menuId}`
                        : "/api/admin/menu";

                const method =
                    menuId
                        ? "PUT"
                        : "POST";

                saveButton.textContent =
                    "Menyimpan...";

                const response =
                    await fetch(
                        url,
                        {
                            method: method,
                            headers: {
                                "Content-Type":
                                    "application/json"
                            },
                            body:
                                JSON.stringify(
                                    menuData
                                )
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    alert(
                        data.error ||
                        "Gagal menyimpan menu."
                    );

                    return;
                }

                closeMenu();

                await loadMenu();

                alert(
                    menuId
                        ? "Menu berhasil diperbarui!"
                        : "Menu berhasil ditambahkan!"
                );

            } catch (error) {

                console.error(
                    "SAVE MENU ERROR:",
                    error
                );

                alert(
                    error.message ||
                    "Gagal menyimpan menu."
                );

            } finally {

                saveButton.disabled = false;
                saveButton.textContent = "Simpan";
            }
        }
    );
}


// ===============================
// NONAKTIFKAN MENU
// ===============================

async function removeMenu(menuId) {

    const yakin =
        confirm(
            "Nonaktifkan menu ini?"
        );

    if (!yakin) {
        return;
    }

    try {

        const response =
            await fetch(
                `/api/admin/menu/${menuId}`,
                {
                    method: "DELETE"
                }
            );

        const data =
            await response.json();

        if (!response.ok) {

            alert(
                data.error ||
                "Gagal menonaktifkan menu."
            );

            return;
        }

        await loadMenu();

    } catch (error) {

        console.error(
            "REMOVE MENU ERROR:",
            error
        );

        alert(
            "Server tidak dapat dihubungi."
        );
    }
}


// ===============================
// LOAD LAPORAN
// ===============================

async function loadReport() {

    try {

        const response =
            await fetch(
                "/api/admin/report"
            );

        if (response.status === 401) {
            window.location.reload();
            return;
        }

        if (!response.ok) {
            return;
        }

        const report =
            await response.json();

        const reportBox =
            document.getElementById(
                "reportBox"
            );

        if (!reportBox) {
            return;
        }

        const top =
            Array.isArray(report.top)
                ? report.top
                : [];

        let topMenuHtml = "";

        if (top.length > 0) {

            topMenuHtml = top.map(function (item) {

                return `
                    <div class="toprow">

                        <span>
                            ${escapeHtml(
                                item.menu_name
                            )}

                            x ${Number(item.qty)}
                        </span>

                        <b>
                            ${rupiah(
                                item.revenue
                            )}
                        </b>

                    </div>
                `;

            }).join("");

        } else {

            topMenuHtml = `
                <p class="muted">
                    Belum ada penjualan hari ini.
                </p>
            `;
        }

        reportBox.innerHTML = `

            <div class="report-grid">

                <div class="report">

                    <small>
                        OMZET HARI INI
                    </small>

                    <h2>
                        ${rupiah(report.revenue)}
                    </h2>

                </div>

                <div class="report">

                    <small>
                        SUDAH DIBAYAR
                    </small>

                    <h2>
                        ${rupiah(report.paid)}
                    </h2>

                </div>

            </div>

            <br>

            <div class="report">

                <b>
                    Menu Terlaris Hari Ini
                </b>

                ${topMenuHtml}

            </div>
        `;

    } catch (error) {

        console.error(
            "LOAD REPORT ERROR:",
            error
        );
    }
}


// ===============================
// AUTO REFRESH
// ===============================

setInterval(function () {

    const app =
        document.getElementById("app");

    if (
        app &&
        !app.classList.contains("hidden")
    ) {
        loadOrders();
    }

}, 5000);


// ===============================
// MULAI
// ===============================

checkLogin();