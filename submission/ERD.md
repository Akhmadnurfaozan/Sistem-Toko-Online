# ERD - Sistem Toko Online

Diagram di bawah ditulis dengan Mermaid (otomatis tampil di GitHub dan VS Code lewat ekstensi *Markdown Preview Mermaid Support*). Skema SQL lengkap: [`../schema.sql`](../schema.sql).

```mermaid
erDiagram
    users ||--o| user_profiles : "1:1 punya profil"
    users ||--o{ orders : "1:N membuat"
    users ||--o{ reviews : "1:N menulis"
    categories ||--o{ products : "1:N memiliki"
    products ||--o{ reviews : "1:N diulas"
    orders ||--|{ order_items : "1:N berisi"
    products ||--o{ order_items : "1:N dipesan"

    users {
        int id PK
        varchar username UK
        varchar email UK
        varchar password_hash
        varchar role "customer | admin"
        timestamp created_at
    }
    user_profiles {
        int id PK
        int user_id FK, UK
        varchar full_name
        varchar phone
        text address
        varchar city
        varchar postal_code
        date birth_date
    }
    categories {
        int id PK
        varchar name UK
        text description
    }
    products {
        int id PK
        int category_id FK
        varchar name
        text description
        numeric price
        int stock
        timestamp created_at
    }
    orders {
        int id PK
        int user_id FK
        timestamp order_date
        varchar status "pending | paid | shipped | completed | cancelled"
        text shipping_address
        numeric total_amount
    }
    order_items {
        int order_id PK, FK
        int product_id PK, FK
        int quantity
        numeric unit_price
    }
    reviews {
        int id PK
        int user_id FK
        int product_id FK
        smallint rating "1-5"
        text comment
        timestamp created_at
    }
```

| Relasi | Tipe | Aturan hapus |
|---|---|---|
| users - user_profiles | 1:1 (`user_id` UNIQUE) | CASCADE |
| users - orders | 1:N | RESTRICT (user dengan order tidak bisa dihapus) |
| categories - products | 1:N | RESTRICT |
| orders - products (via order_items) | N:N (PK gabungan `order_id, product_id`) | order CASCADE, product RESTRICT |
| users/products - reviews | 1:N, unik per (user, produk) | CASCADE |
