CREATE DATABASE IF NOT EXISTS quresriverside
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE quresriverside;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category ENUM('minuman','snack','makanan') NOT NULL,
  price INT NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  description VARCHAR(255) DEFAULT '',
  image_url TEXT,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  table_number VARCHAR(30) DEFAULT '',
  total INT NOT NULL,
  status ENUM('baru','diproses','selesai','dibatalkan') NOT NULL DEFAULT 'baru',
  payment_status ENUM('belum_bayar','dibayar') NOT NULL DEFAULT 'belum_bayar',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  menu_id INT NOT NULL,
  menu_name VARCHAR(120) NOT NULL,
  price INT NOT NULL,
  qty INT NOT NULL,
  subtotal INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
