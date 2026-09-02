let menu = [];
let cart = {};
let isSubmittingOrder = false;

function rupiah(number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(number) || 0);
}

function escapeHtml(text) {
    return String(text || "").replace(/[&<>"']/g, function (char) {
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

async function loadMenu() {
    try {
        const response = await fetch("/api/menu");

        if (!response.ok) {
            throw new Error("Gagal mengambil menu.");
        }

        menu = await response.json();

        renderMenu(getActiveCategory());
        renderCart();
        updateFloatingCart();

    } catch (error) {
        console.error("LOAD MENU ERROR:", error);

        const grid = document.getElementById("grid");

        if (grid) {
            grid.innerHTML = `
                <p style="padding:20px;">
                    Menu gagal dimuat. Silakan refresh halaman.
                </p>
            `;
        }
    }
}

function getActiveCategory() {
    const activeButton = document.querySelector(
        ".filters button.active"
    );

    return activeButton
        ? activeButton.dataset.cat
        : "all";
}

function getCartQuantity(menuId) {
    return Number(cart[menuId] || 0);
}

function getRemainingStock(item) {
    const stock = Number(item.stock || 0);
    const ordered = getCartQuantity(item.id);

    return Math.max(0, stock - ordered);
}

function renderMenu(category) {
    const grid = document.getElementById("grid");

    if (!grid) {
        return;
    }

    const filteredMenu =
        category === "all"
            ? menu
            : menu.filter(function (item) {
                return item.category === category;
            });

    if (filteredMenu.length === 0) {
        grid.innerHTML = `
            <p style="padding:20px;color:#718076;">
                Belum ada menu.
            </p>
        `;

        return;
    }

    grid.innerHTML = filteredMenu.map(function (item) {

        const quantity = getCartQuantity(item.id);
        const remaining = getRemainingStock(item);

        let imageHtml = "";

        if (item.image_url) {
            imageHtml = `
                <img
                    src="${escapeHtml(item.image_url)}"
                    alt="${escapeHtml(item.name)}"
                    class="menu-image"
                    onerror="this.style.display='none';"
                >
            `;
        } else {
            imageHtml = `
                <div class="no-image">
                    ☕
                </div>
            `;
        }

        let buttonHtml = "";

        if (quantity > 0) {
            buttonHtml = `
                <div class="product-qty">

                    <button
                        type="button"
                        onclick="changeQuantity(${Number(item.id)}, -1)"
                    >
                        −
                    </button>

                    <strong>
                        ${quantity}
                    </strong>

                    <button
                        type="button"
                        onclick="changeQuantity(${Number(item.id)}, 1)"
                        ${remaining <= 0 ? "disabled" : ""}
                    >
                        +
                    </button>

                </div>
            `;
        } else {
            buttonHtml = `
                <button
                    type="button"
                    class="add"
                    onclick="addToCart(${Number(item.id)})"
                    ${remaining <= 0 ? "disabled" : ""}
                >
                    ${remaining <= 0 ? "Habis" : "+ Tambah Pesanan"}
                </button>
            `;
        }

        return `
            <article class="card">

                <div class="photo">
                    ${imageHtml}
                </div>

                <div class="info">

                    <h3>
                        ${escapeHtml(item.name)}
                    </h3>

                    <p>
                        ${escapeHtml(item.description)}
                    </p>

                    <div class="price">
                        ${rupiah(item.price)}
                    </div>

                    <div class="stock">
                        Stok: ${remaining}
                    </div>

                    ${buttonHtml}

                </div>

            </article>
        `;
    }).join("");
}

function addToCart(menuId) {
    const item = menu.find(function (menuItem) {
        return Number(menuItem.id) === Number(menuId);
    });

    if (!item) {
        return;
    }

    const currentQuantity = getCartQuantity(menuId);
    const stock = Number(item.stock || 0);

    if (currentQuantity >= stock) {
        alert("Stok menu ini sudah habis.");
        return;
    }

    cart[menuId] = currentQuantity + 1;

    renderMenu(getActiveCategory());
    renderCart();
    updateFloatingCart();
}

function changeQuantity(menuId, amount) {
    const item = menu.find(function (menuItem) {
        return Number(menuItem.id) === Number(menuId);
    });

    if (!item) {
        return;
    }

    const currentQuantity = getCartQuantity(menuId);
    const newQuantity = currentQuantity + Number(amount);

    if (newQuantity <= 0) {
        delete cart[menuId];
    } else if (newQuantity <= Number(item.stock)) {
        cart[menuId] = newQuantity;
    } else {
        alert("Jumlah melebihi stok.");
        return;
    }

    renderMenu(getActiveCategory());
    renderCart();
    updateFloatingCart();
}

function calculateTotal() {
    let total = 0;

    Object.entries(cart).forEach(function (entry) {

        const id = entry[0];
        const quantity = Number(entry[1]);

        const item = menu.find(function (menuItem) {
            return Number(menuItem.id) === Number(id);
        });

        if (item) {
            total += Number(item.price) * quantity;
        }
    });

    return total;
}

function getTotalItems() {
    let total = 0;

    Object.values(cart).forEach(function (quantity) {
        total += Number(quantity);
    });

    return total;
}

function renderCart() {
    const cartElement = document.getElementById("cart");
    const totalElement = document.getElementById("total");

    if (!cartElement || !totalElement) {
        return;
    }

    const entries = Object.entries(cart);

    if (entries.length === 0) {

        cartElement.innerHTML = `
            <p style="color:#718076;">
                Belum ada pesanan. Pilih menu di atas ☕
            </p>
        `;

        totalElement.textContent = rupiah(0);

        return;
    }

    cartElement.innerHTML = entries.map(function (entry) {

        const id = entry[0];
        const quantity = Number(entry[1]);

        const item = menu.find(function (menuItem) {
            return Number(menuItem.id) === Number(id);
        });

        if (!item) {
            return "";
        }

        const subtotal =
            Number(item.price) * quantity;

        const remaining =
            getRemainingStock(item);

        return `
            <div class="cart-row">

                <b>
                    ${escapeHtml(item.name)}
                </b>

                <div class="qty">

                    <button
                        type="button"
                        onclick="changeQuantity(${Number(id)}, -1)"
                    >
                        −
                    </button>

                    <span>
                        ${quantity}
                    </span>

                    <button
                        type="button"
                        onclick="changeQuantity(${Number(id)}, 1)"
                        ${remaining <= 0 ? "disabled" : ""}
                    >
                        +
                    </button>

                </div>

                <b>
                    ${rupiah(subtotal)}
                </b>

            </div>
        `;
    }).join("");

    totalElement.textContent =
        rupiah(calculateTotal());
}

function updateFloatingCart() {
    let floatingCart =
        document.getElementById("floatingCart");

    const itemCount =
        getTotalItems();

    const total =
        calculateTotal();

    if (itemCount === 0) {

        if (floatingCart) {
            floatingCart.remove();
        }

        return;
    }

    if (!floatingCart) {

        floatingCart =
            document.createElement("div");

        floatingCart.id =
            "floatingCart";

        document.body.appendChild(
            floatingCart
        );
    }

    floatingCart.innerHTML = `
        <div class="floating-cart-info">

            <div class="floating-cart-icon">
                🛒
            </div>

            <div>
                <strong>
                    ${itemCount} item
                </strong>

                <small>
                    ${rupiah(total)}
                </small>
            </div>

        </div>

        <button
            type="button"
            class="floating-checkout"
            onclick="openCheckout()"
        >
            Kirim ke Kasir
        </button>
    `;
}

function openCheckout() {
    if (getTotalItems() === 0) {
        alert("Pilih menu dulu.");
        return;
    }

    const summary =
        document.getElementById("summary");

    const modal =
        document.getElementById("modal");

    if (!summary || !modal) {
        return;
    }

    summary.innerHTML =
        Object.entries(cart).map(function (entry) {

            const id = entry[0];
            const quantity = Number(entry[1]);

            const item = menu.find(function (menuItem) {
                return Number(menuItem.id) === Number(id);
            });

            if (!item) {
                return "";
            }

            return `
                ${quantity} ×
                ${escapeHtml(item.name)}
                —
                <b>
                    ${rupiah(
                        Number(item.price) * quantity
                    )}
                </b>
            `;
        }).join("<br>") +
        `
            <hr>
            <b>
                Total ${rupiah(calculateTotal())}
            </b>
        `;

    modal.classList.remove("hidden");
}

function closeCheckout() {
    const modal =
        document.getElementById("modal");

    if (modal) {
        modal.classList.add("hidden");
    }
}

document
    .querySelectorAll(".filters button")
    .forEach(function (button) {

        button.addEventListener("click", function () {

            document
                .querySelectorAll(".filters button")
                .forEach(function (item) {
                    item.classList.remove("active");
                });

            button.classList.add("active");

            renderMenu(
                button.dataset.cat
            );
        });
    });

const checkoutButton =
    document.getElementById("checkoutBtn");

if (checkoutButton) {
    checkoutButton.addEventListener(
        "click",
        openCheckout
    );
}

const closeButton =
    document.getElementById("close");

if (closeButton) {
    closeButton.addEventListener(
        "click",
        closeCheckout
    );
}

const form =
    document.getElementById("form");

if (form) {

    form.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            if (isSubmittingOrder) {
                return;
            }

            if (getTotalItems() === 0) {
                alert("Pilih menu dulu.");
                return;
            }

            const customerInput =
                document.getElementById("customer");

            const tableInput =
                document.getElementById("table");

            const customer =
                customerInput.value.trim();

            const table =
                tableInput.value.trim();

            if (!customer) {
                alert("Nama pelanggan wajib diisi.");
                customerInput.focus();
                return;
            }

            if (!table) {
                alert("Nomor meja wajib diisi.");
                tableInput.focus();
                return;
            }

            const items =
                Object.entries(cart).map(
                    function (entry) {
                        return {
                            menu_id:
                                Number(entry[0]),

                            qty:
                                Number(entry[1])
                        };
                    }
                );

            isSubmittingOrder = true;

            const submitButton =
                form.querySelector(
                    'button[type="submit"]'
                );

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent =
                    "Mengirim...";
            }

            try {

                const response =
                    await fetch(
                        "/api/orders",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                customer_name:
                                    customer,

                                table_number:
                                    table,

                                items:
                                    items
                            })
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error ||
                        "Pesanan gagal."
                    );
                }

                form.classList.add("hidden");

                const success =
                    document.getElementById(
                        "success"
                    );

                if (success) {

                    success.classList.remove(
                        "hidden"
                    );

                    success.innerHTML = `
                        <b>
                            Pesanan berhasil dikirim!
                        </b>

                        <br><br>

                        Nama:
                        ${escapeHtml(customer)}

                        <br>

                        Meja:
                        ${escapeHtml(table)}

                        <br><br>

                        Total:
                        ${rupiah(data.total)}

                        <br><br>

                        Pesanan sudah masuk ke kasir.
                    `;
                }

                cart = {};

                renderCart();
                updateFloatingCart();

                await loadMenu();

            } catch (error) {

                console.error(
                    "ORDER ERROR:",
                    error
                );

                alert(
                    error.message ||
                    "Pesanan gagal."
                );

                isSubmittingOrder = false;

                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent =
                        "Kirim ke Kasir";
                }
            }
        }
    );
}

loadMenu();