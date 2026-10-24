-- =====================================================================
-- Project Akhir : Sistem Toko Online (E-Commerce)
-- Database      : PostgreSQL
-- Jumlah tabel  : 7 (users, user_profiles, categories, products,
--                    orders, order_items, reviews)
--
-- Relasi:
--   1:1 -> users          <-> user_profiles
--   1:N -> users          ->  orders
--   1:N -> categories     ->  products
--   N:N -> orders         <-> products   (lewat tabel order_items)
--   1:N -> users/products ->  reviews
-- =====================================================================

-- Hapus tabel lama (urutan dari tabel anak ke tabel induk)
DROP TABLE IF EXISTS reviews        CASCADE;
DROP TABLE IF EXISTS order_items    CASCADE;
DROP TABLE IF EXISTS orders         CASCADE;
DROP TABLE IF EXISTS products       CASCADE;
DROP TABLE IF EXISTS categories     CASCADE;
DROP TABLE IF EXISTS user_profiles  CASCADE;
DROP TABLE IF EXISTS users          CASCADE;

-- ---------------------------------------------------------------------
-- 1. USERS : data akun pengguna
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL        PRIMARY KEY,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    email         VARCHAR(100)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    role          VARCHAR(20)   NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer', 'admin')),
    created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. USER_PROFILES : detail profil pengguna
--    Relasi 1:1 dengan users (user_id bersifat UNIQUE)
-- ---------------------------------------------------------------------
CREATE TABLE user_profiles (
    id          SERIAL        PRIMARY KEY,
    user_id     INT           NOT NULL UNIQUE,
    full_name   VARCHAR(100)  NOT NULL,
    phone       VARCHAR(20),
    address     TEXT,
    city        VARCHAR(50),
    postal_code VARCHAR(10),
    birth_date  DATE,
    CONSTRAINT fk_profile_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 3. CATEGORIES : kategori produk
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    id          SERIAL        PRIMARY KEY,
    name        VARCHAR(100)  NOT NULL UNIQUE,
    description TEXT
);

-- ---------------------------------------------------------------------
-- 4. PRODUCTS : data produk
--    Relasi 1:N -> satu kategori memiliki banyak produk
-- ---------------------------------------------------------------------
CREATE TABLE products (
    id          SERIAL         PRIMARY KEY,
    category_id INT            NOT NULL,
    name        VARCHAR(150)   NOT NULL,
    description TEXT,
    price       NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
    stock       INT            NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id) REFERENCES categories (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 5. ORDERS : data pesanan
--    Relasi 1:N -> satu user dapat memiliki banyak pesanan
-- ---------------------------------------------------------------------
CREATE TABLE orders (
    id               SERIAL         PRIMARY KEY,
    user_id          INT            NOT NULL,
    order_date       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status           VARCHAR(20)    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'shipped', 'completed', 'cancelled')),
    shipping_address TEXT           NOT NULL,
    total_amount     NUMERIC(14,2)  NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    CONSTRAINT fk_order_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 6. ORDER_ITEMS : detail isi pesanan (tabel penghubung)
--    Relasi N:N antara orders dan products
--    (satu pesanan berisi banyak produk, satu produk bisa ada
--     di banyak pesanan)
-- ---------------------------------------------------------------------
CREATE TABLE order_items (
    order_id   INT            NOT NULL,
    product_id INT            NOT NULL,
    quantity   INT            NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2)  NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (order_id, product_id),
    CONSTRAINT fk_item_order
        FOREIGN KEY (order_id) REFERENCES orders (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_item_product
        FOREIGN KEY (product_id) REFERENCES products (id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------
-- 7. REVIEWS : ulasan produk dari pengguna
--    Relasi 1:N dari users dan 1:N dari products
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
    id         SERIAL     PRIMARY KEY,
    user_id    INT        NOT NULL,
    product_id INT        NOT NULL,
    rating     SMALLINT   NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_review_product
        FOREIGN KEY (product_id) REFERENCES products (id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_review_user_product UNIQUE (user_id, product_id)
);

-- ---------------------------------------------------------------------
-- INDEX : mempercepat pencarian pada kolom foreign key
-- ---------------------------------------------------------------------
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_orders_user       ON orders (user_id);
CREATE INDEX idx_items_product     ON order_items (product_id);
CREATE INDEX idx_reviews_product   ON reviews (product_id);

-- ---------------------------------------------------------------------
-- DATA CONTOH (opsional, untuk menguji relasi)
-- ---------------------------------------------------------------------
INSERT INTO users (username, email, password_hash, role) VALUES
    ('budi',  'budi@example.com',  'hash_budi',  'customer'),
    ('siti',  'siti@example.com',  'hash_siti',  'customer'),
    ('admin', 'admin@example.com', 'hash_admin', 'admin');

INSERT INTO user_profiles (user_id, full_name, phone, address, city, postal_code) VALUES
    (1, 'Budi Santoso', '081234567890', 'Jl. Merdeka No. 10', 'Jakarta', '10110'),
    (2, 'Siti Aminah',  '081298765432', 'Jl. Sudirman No. 5',  'Bandung', '40111');

INSERT INTO categories (name, description) VALUES
    ('Elektronik', 'Perangkat elektronik dan aksesoris'),
    ('Fashion',    'Pakaian dan aksesoris');

INSERT INTO products (category_id, name, description, price, stock) VALUES
    (1, 'Headphone Bluetooth', 'Headphone nirkabel',  350000, 50),
    (1, 'Power Bank 10000mAh', 'Power bank portabel', 180000, 100),
    (2, 'Kaos Polos',          'Kaos katun',           75000, 200);

INSERT INTO orders (user_id, status, shipping_address, total_amount) VALUES
    (1, 'paid', 'Jl. Merdeka No. 10, Jakarta', 605000);

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (1, 1, 1, 350000),
    (1, 2, 1, 180000),
    (1, 3, 1,  75000);

INSERT INTO reviews (user_id, product_id, rating, comment) VALUES
    (1, 1, 5, 'Suara bagus, baterai awet.');
