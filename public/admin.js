const form = document.getElementById("menuForm");
const menuList = document.getElementById("menuList");

const menuId = document.getElementById("menuId");
const nameInput = document.getElementById("name");
const categoryInput = document.getElementById("category");
const priceInput = document.getElementById("price");
const stockInput = document.getElementById("stock");
const descriptionInput = document.getElementById("description");
const imageInput = document.getElementById("image_url");

const formTitle = document.getElementById("formTitle");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");

const rupiah = (number) => {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(number);
};


async function checkLogin() {

    const response = await fetch("/api/me");
    const data = await response.json();

    if (!data.logged_in) {
        window.location.href = "/kasir";
        return false;
    }

    return true;
}


async function loadMenu() {

    const loggedIn = await checkLogin();

    if (!loggedIn) return;

    try {

        const response = await fetch("/api/admin/menu");

        if (!response.ok) {
            throw new Error("Gagal mengambil menu.");
        }

        const menu = await response.json();

        if (menu.length === 0) {

            menuList.innerHTML = `
                <div class="empty">
                    Belum ada menu.
                </div>
            `;

            return;
        }

        menuList.innerHTML = menu.map(item => {

            return `
                <div class="menu-item">

                    <div class="menu-image">

                        ${
                            item.image_url
                            ?
                            `<img src="${item.image_url}" alt="${item.name}"
                                onerror="this.style.display='none'">`
                            :
                            `<span>☕</span>`
                        }

                    </div>

                    <div class="menu-info">

                        <div class="menu-name">
                            ${escapeHtml(item.name)}
                        </div>

                        <div class="category">
                            ${escapeHtml(item.category)}
                        </div>

                        <div class="description">
                            ${escapeHtml(item.description || "")}
                        </div>

                        <div class="details">
                            <b>${rupiah(item.price)}</b>
                            <span>Stok: ${item.stock}</span>
                        </div>

                    </div>

                    <div class="menu-actions">

                        <button
                            class="btn edit"
                            onclick="editMenu(${item.id})"
                        >
                            Edit
                        </button>

                        <button
                            class="btn danger"
                            onclick="deleteMenu(${item.id}, '${escapeJs(item.name)}')"
                        >
                            Nonaktifkan
                        </button>

                    </div>

                </div>
            `;

        }).join("");

    } catch (error) {

        menuList.innerHTML = `
            <div class="error">
                ${error.message}
            </div>
        `;
    }
}


async function editMenu(id) {

    const response = await fetch("/api/admin/menu");

    if (!response.ok) {
        alert("Gagal mengambil data menu.");
        return;
    }

    const menu = await response.json();

    const item = menu.find(menuItem => menuItem.id === id);

    if (!item) {
        alert("Menu tidak ditemukan.");
        return;
    }

    menuId.value = item.id;
    nameInput.value = item.name;
    categoryInput.value = item.category;
    priceInput.value = item.price;
    stockInput.value = item.stock;
    descriptionInput.value = item.description || "";
    imageInput.value = item.image_url || "";

    formTitle.textContent = "Edit Menu";
    saveBtn.textContent = "Update Menu";
    cancelBtn.classList.remove("hidden");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


form.addEventListener("submit", async (event) => {

    event.preventDefault();

    const id = menuId.value;

    const data = {
        name: nameInput.value.trim(),
        category: categoryInput.value,
        price: Number(priceInput.value),
        stock: Number(stockInput.value),
        description: descriptionInput.value.trim(),
        image_url: imageInput.value.trim()
    };

    try {

        let response;

        if (id) {

            response = await fetch(`/api/admin/menu/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });

        } else {

            response = await fetch("/api/admin/menu", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });

        }

        const result = await response.json();

        if (!response.ok) {
            alert(result.error || "Gagal menyimpan menu.");
            return;
        }

        alert(
            id
                ? "Menu berhasil diperbarui!"
                : "Menu berhasil ditambahkan!"
        );

        resetForm();
        loadMenu();

    } catch (error) {

        alert("Server tidak dapat dihubungi.");
        console.error(error);

    }

});


async function deleteMenu(id, name) {

    const confirmDelete = confirm(
        `Nonaktifkan menu "${name}"?`
    );

    if (!confirmDelete) return;

    try {

        const response = await fetch(`/api/admin/menu/${id}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Gagal menonaktifkan menu.");
            return;
        }

        alert("Menu berhasil dinonaktifkan.");

        loadMenu();

    } catch (error) {

        alert("Server tidak dapat dihubungi.");
    }
}


cancelBtn.addEventListener("click", () => {
    resetForm();
});


function resetForm() {

    form.reset();

    menuId.value = "";

    formTitle.textContent = "Tambah Menu";
    saveBtn.textContent = "Simpan Menu";

    cancelBtn.classList.add("hidden");
}


document.getElementById("logoutBtn").addEventListener("click", async () => {

    await fetch("/api/logout", {
        method: "POST"
    });

    window.location.href = "/kasir";
});


function escapeHtml(text) {

    return String(text).replace(/[&<>"']/g, char => {

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


function escapeJs(text) {

    return String(text)
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'");
}


loadMenu();