let menu = [];
let cart = {};

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

async function loadMenu() {
    const response = await fetch("/api/menu");
    menu = await response.json();

    renderMenu("all");
    renderCart();
}

function renderMenu(category) {
    const grid = document.getElementById("grid");

    const filteredMenu =
        category === "all"
            ? menu
            : menu.filter((item) => item.category === category);

    grid.innerHTML = filteredMenu.map((item) => {
        return `
            <article class="card">
                <div class="photo">
                    <img
                        src="${escapeHtml(item.image_url || "")}"
                        alt="${escapeHtml(item.name)}"
                        onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'display:grid;place-items:center;height:100%;font-size:55px;color:#155d2a\\'>☕</div>'"
                    >
                </div>

                <div class="info">
                    <h3>${escapeHtml(item.name)}</h3>

                    <p>${escapeHtml(item.description)}</p>

                    <div class="price">
                        ${rupiah(item.price)}
                    </div>

                    <div class="stock">
                        Stok: ${item.stock}
                    </div>

                    <button
                        class="add"
                        ${item.stock < 1 ? "disabled" : ""}
                        onclick="addToCart(${item.id})"
                    >
                        ${item.stock < 1 ? "Habis" : "+ Tambah Pesanan"}
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function addToCart(menuId) {
    cart[menuId] = (cart[menuId] || 0) + 1;
    renderCart();
}

function changeQuantity(menuId, amount) {
    cart[menuId] = (cart[menuId] || 0) + amount;

    if (cart[menuId] <= 0) {
        delete cart[menuId];
    }

    renderCart();
}

function renderCart() {
    const cartElement = document.getElementById("cart");
    const totalElement = document.getElementById("total");

    const entries = Object.entries(cart);

    if (entries.length === 0) {
        cartElement.innerHTML = `
            <p style="color:#718076">
                Belum ada pesanan. Pilih menu di atas ☕
            </p>
        `;

        totalElement.textContent = rupiah(0);
        return;
    }

    let total = 0;

    cartElement.innerHTML = entries.map(([id, quantity]) => {
        const item = menu.find((menuItem) => menuItem.id == id);

        if (!item) {
            return "";
        }

        const subtotal = item.price * quantity;
        total += subtotal;

        return `
            <div class="cart-row">
                <b>${escapeHtml(item.name)}</b>

                <div class="qty">
                    <button onclick="changeQuantity(${id}, -1)">−</button>
                    ${quantity}
                    <button onclick="changeQuantity(${id}, 1)">+</button>
                </div>

                <b>${rupiah(subtotal)}</b>
            </div>
        `;
    }).join("");

    totalElement.textContent = rupiah(total);
}

document.querySelectorAll(".filters button").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".filters button").forEach((item) => {
            item.classList.remove("active");
        });

        button.classList.add("active");
        renderMenu(button.dataset.cat);
    });
});

document.getElementById("checkoutBtn").addEventListener("click", () => {
    if (Object.keys(cart).length === 0) {
        alert("Pilih menu dulu.");
        return;
    }

    const summary = document.getElementById("summary");

    summary.innerHTML = Object.entries(cart).map(([id, quantity]) => {
        const item = menu.find((menuItem) => menuItem.id == id);

        return `
            ${quantity} × ${escapeHtml(item.name)}
            — <b>${rupiah(item.price * quantity)}</b>
        `;
    }).join("<br>") + `
        <hr>
        <b>Total ${document.getElementById("total").textContent}</b>
    `;

    document.getElementById("modal").classList.remove("hidden");
});

document.getElementById("close").addEventListener("click", () => {
    document.getElementById("modal").classList.add("hidden");
});

document.getElementById("form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const items = Object.entries(cart).map(([menuId, quantity]) => {
        return {
            menu_id: Number(menuId),
            qty: quantity
        };
    });

    const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            customer_name: document.getElementById("customer").value,
            table_number: document.getElementById("table").value,
            items: items
        })
    });

    const data = await response.json();

    if (!response.ok) {
        alert(data.error || "Pesanan gagal.");
        return;
    }

    document.getElementById("form").classList.add("hidden");
    document.getElementById("success").classList.remove("hidden");

    document.getElementById("success").innerHTML = `
        <b>Pesanan #${data.order_id} berhasil!</b>
        <br>
        Total: ${rupiah(data.total)}
        <br>
        Pesanan sudah masuk ke kasir.
    `;

    cart = {};
    renderCart();
    await loadMenu();
});

loadMenu();
